import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import AlertBanner from '@/components/ui/AlertBanner';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CalendarPicker from '@/components/ui/CalendarPicker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

const SERVICE_LABEL_MAP: Record<string, string> = {
  'Nano Ceramic Coating': 'Nano Ceramic Coating',
  'Nano Ceramic Tint': 'Nano Ceramic Tint',
  'PPF': 'Paint Protection Film (PPF)',
  'Paint Protection Film': 'Paint Protection Film (PPF)',
  'Auto Paint & Repair': 'Auto Paint & Repair',
  'Go & Clean': 'Detailing',
  'Nano Fix (Maintenance)': 'Maintenance (NanoFix)',
  'NanoFix': 'Maintenance (NanoFix)',
};

const getServiceLabel = (dbName: string) => SERVICE_LABEL_MAP[dbName] || dbName || 'N/A';

const CANCEL_REASONS = [
  'Schedule conflict',
  'Vehicle issue',
  'Service no longer needed',
  'Found another provider',
  'Financial reasons',
  'Others',
];

const EDIT_REASONS = [
  'Schedule conflict',
  'Vehicle not available',
  'Change of plans',
  'Others',
];

interface BookingItem {
  id: number;
  booking_id?: number;
  request_id?: number;
  type: 'booking' | 'request';
  booking_date: string;
  latest_service: string;
  service_names?: string;
  status: string;
  make: string;
  model: string;
  plate_no: string;
  dateStr: string;
  timeStr: string;
  dateObj: Date;
  service: string;
}

interface Vehicle {
  id: number;
  make: string;
  model: string;
  plate_no: string;
}

interface ServiceType {
  api_name: string;
  label: string;
}

interface DateInfo {
  date: string;
  available: boolean;
  status: 'full' | 'limited' | 'available';
  capacity?: number;
  booked?: number;
}

export default function BookingsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Alerts
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Modals visibility
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingItem | null>(null);
  const [editTarget, setEditTarget] = useState<BookingItem | null>(null);

  // New Booking Form
  const [bookingForm, setBookingForm] = useState({
    vehicle_id: '',
    service_type: '',
    booking_date: '',
    notes: '',
  });
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);

  // Cancel Booking Form
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonCustom, setCancelReasonCustom] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Edit Booking Form
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editReasonCustom, setEditReasonCustom] = useState('');
  const [editCalendarMonth, setEditCalendarMonth] = useState(new Date());
  const [editAvailableDates, setEditAvailableDates] = useState<DateInfo[]>([]);
  const [editLoadingDates, setEditLoadingDates] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadData = async () => {
    try {
      const [bookingsRes, vehiclesRes, servicesRes] = await Promise.all([
        client.get('/bookings/list'),
        client.get('/vehicles/list'),
        client.get('/services/list'),
      ]);
      setBookings(bookingsRes.data?.data?.bookings || []);
      setRequests(bookingsRes.data?.data?.requests || []);
      setVehicles(vehiclesRes.data?.data?.vehicles || []);
      setServiceTypes(servicesRes.data?.data?.service_types || []);
    } catch (err) {
      console.error('Failed to load bookings data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  // Watch for parameters from index dashboard screen
  useEffect(() => {
    if (params.openBooking === 'true' && !loading) {
      openBookingModal();
    }
  }, [params.openBooking, loading]);

  const triggerAlert = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
  };

  // Unified list: merges requests + bookings, sorted date desc
  const unifiedList = useMemo<BookingItem[]>(() => {
    const list: BookingItem[] = [
      ...bookings.map((b) => {
        const d = new Date(b.booking_date);
        return {
          ...b,
          id: b.booking_id,
          type: 'booking' as const,
          status: b.status,
          service: getServiceLabel(b.latest_service),
          dateObj: d,
          dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          timeStr: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        };
      }),
      ...requests.map((r) => {
        const d = new Date(r.booking_date);
        return {
          ...r,
          id: r.request_id,
          type: 'request' as const,
          status: r.status,
          service: getServiceLabel(r.latest_service || r.service_names),
          dateObj: d,
          dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          timeStr: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        };
      }),
    ];

    list.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    return list;
  }, [bookings, requests]);

  // Load calendar availability
  const loadAvailability = async (serviceType: string) => {
    setLoadingDates(true);
    try {
      const res = await client.get('/bookings/availability', {
        params: { action: 'get_available_dates', service_type: serviceType },
      });
      setAvailableDates(res.data?.data?.dates || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDates(false);
    }
  };

  const handleServiceChange = (service: string) => {
    setBookingForm({ ...bookingForm, service_type: service, booking_date: '' });
    if (service) loadAvailability(service);
  };

  const handleDateSelect = (dateStr: string) => {
    setBookingForm({ ...bookingForm, booking_date: dateStr });
  };

  const openBookingModal = () => {
    setError('');
    setBookingForm({ vehicle_id: '', service_type: '', booking_date: '', notes: '' });
    setAvailableDates([]);
    setCalendarMonth(new Date());
    setShowBookingModal(true);
  };

  const handleBookingSubmit = async () => {
    if (!bookingForm.vehicle_id || !bookingForm.service_type || !bookingForm.booking_date) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await client.post('/bookings/create', { ...bookingForm, booking_time: '08:00' });
      triggerAlert('success', 'Booking request submitted! Your request is pending approval.');
      setShowBookingModal(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit booking.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel flow
  const openCancelModal = (item: BookingItem) => {
    setCancelTarget(item);
    setCancelReason('');
    setCancelReasonCustom('');
    setError('');
  };

  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason === 'Others' ? cancelReasonCustom.trim() : cancelReason;
    if (!reason) {
      setError('Please select or enter a reason.');
      return;
    }
    setCancelling(true);
    setError('');
    try {
      if (cancelTarget.type === 'request') {
        await client.post('/bookings/cancel', { type: 'request', request_id: cancelTarget.id, reason });
      } else {
        await client.post('/bookings/cancel', { type: 'booking', booking_id: cancelTarget.id, reason });
      }
      triggerAlert('success', 'Booking cancelled successfully.');
      setCancelTarget(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  };

  // Edit flow
  const openEditModal = (item: BookingItem) => {
    setEditTarget(item);
    setEditDate('');
    setEditReason('');
    setEditReasonCustom('');
    setEditCalendarMonth(new Date());
    setEditAvailableDates([]);
    setError('');
    loadEditAvailability(item.latest_service || item.service_names || '');
  };

  const loadEditAvailability = async (serviceType: string) => {
    setEditLoadingDates(true);
    try {
      const res = await client.get('/bookings/availability', {
        params: { action: 'get_available_dates', service_type: serviceType },
      });
      setEditAvailableDates(res.data?.data?.dates || []);
    } catch (err) {
      console.error(err);
    } finally {
      setEditLoadingDates(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editTarget) return;
    const reason = editReason === 'Others' ? editReasonCustom.trim() : editReason;
    if (!editDate) {
      setError('Please select a new date.');
      return;
    }
    if (!reason) {
      setError('Please select or enter a reason.');
      return;
    }
    setEditing(true);
    setError('');
    try {
      await client.post('/bookings/edit-request', { request_id: editTarget.id, new_date: editDate, reason });
      triggerAlert('success', 'Booking request updated successfully.');
      setEditTarget(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update booking.');
    } finally {
      setEditing(false);
    }
  };

  const canCancel = (item: BookingItem) => {
    if (item.type === 'request') return item.status === 'pending';
    return item.status === 'scheduled';
  };

  const canEdit = (item: BookingItem) => {
    return item.type === 'request' && item.status === 'pending';
  };

  if (loading) {
    return <LoadingSpinner message="Loading bookings..." />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Bookings</Text>
          <TouchableOpacity style={styles.addButton} onPress={openBookingModal} activeOpacity={0.8}>
            <LinearGradient
              colors={['#4f46e5', '#6366f1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButtonGradient}
            >
              <FontAwesome name="calendar-plus-o" size={12} color="#ffffff" style={styles.addIcon} />
              <Text style={styles.addButtonText}>New Booking</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Alerts */}
        <AlertBanner message={success} type="success" onDismiss={() => setSuccess('')} autoDismissMs={4000} />
        <AlertBanner message={error} type="error" onDismiss={() => setError('')} autoDismissMs={5000} />

        {/* Booking Cards List */}
        {unifiedList.length > 0 ? (
          <View style={styles.listContainer}>
            {unifiedList.map((item) => {
              const opacity = item.status === 'cancelled' || item.status === 'rejected' ? 0.65 : 1;
              return (
                <View key={`${item.type}-${item.id}`} style={[styles.bookingCard, { opacity }]}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardDate}>{item.dateStr}</Text>
                      <Text style={styles.cardTime}>{item.timeStr}</Text>
                    </View>
                    <StatusBadge status={item.status} />
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.detailRow}>
                      <FontAwesome name="car" size={12} color="#6b7280" style={styles.detailIcon} />
                      <Text style={styles.detailText}>
                        {item.make} {item.model} {item.plate_no ? `— ${item.plate_no}` : ''}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <FontAwesome name="wrench" size={12} color="#6b7280" style={styles.detailIcon} />
                      <Text style={styles.detailText}>{item.service}</Text>
                    </View>
                  </View>

                  {/* Actions footer */}
                  {canEdit(item) || canCancel(item) ? (
                    <View style={styles.cardActions}>
                      {canEdit(item) ? (
                        <TouchableOpacity
                          style={styles.actionButtonOutline}
                          onPress={() => openEditModal(item)}
                        >
                          <FontAwesome name="pencil" size={12} color="#4f46e5" style={styles.actionBtnIcon} />
                          <Text style={styles.actionButtonOutlineText}>Edit Date</Text>
                        </TouchableOpacity>
                      ) : null}

                      {canCancel(item) ? (
                        <TouchableOpacity
                          style={styles.actionButtonDanger}
                          onPress={() => openCancelModal(item)}
                        >
                          <FontAwesome name="times" size={12} color="#ef4444" style={styles.actionBtnIcon} />
                          <Text style={styles.actionButtonDangerText}>Cancel</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="calendar"
            title="No bookings yet"
            description="Book your first service appointment with our professionals."
            actionText="New Booking"
            onAction={openBookingModal}
          />
        )}
      </ScrollView>

      {/* NEW BOOKING MODAL */}
      <Modal visible={showBookingModal} transparent animationType="slide" onRequestClose={() => setShowBookingModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Booking</Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)} style={styles.closeBtn}>
                <FontAwesome name="times" size={18} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {error ? (
                <AlertBanner message={error} type="error" onDismiss={() => setError('')} />
              ) : null}

              {/* Vehicle Select */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Select Vehicle *</Text>
                {vehicles.length > 0 ? (
                  <View style={styles.pickerWrapper}>
                    <ScrollView horizontal={false} nestedScrollEnabled style={styles.dropdownScroll}>
                      {vehicles.map((v) => {
                        const isSelected = bookingForm.vehicle_id === String(v.id);
                        return (
                          <TouchableOpacity
                            key={v.id}
                            style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                            onPress={() => setBookingForm({ ...bookingForm, vehicle_id: String(v.id) })}
                          >
                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                              {v.make} {v.model} {v.plate_no ? `— ${v.plate_no}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : (
                  <View style={styles.noVehiclesContainer}>
                    <Text style={styles.noVehiclesText}>
                      No vehicles found. Add a vehicle first to make a booking.
                    </Text>
                    <TouchableOpacity
                      style={styles.noVehiclesBtn}
                      onPress={() => {
                        setShowBookingModal(false);
                        router.push('/vehicles');
                      }}
                    >
                      <Text style={styles.noVehiclesBtnText}>Add Vehicle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Service Select */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Select Service *</Text>
                <View style={styles.pickerWrapper}>
                  <ScrollView horizontal={false} nestedScrollEnabled style={styles.dropdownScroll}>
                    {serviceTypes.map((s) => {
                      const isSelected = bookingForm.service_type === s.api_name;
                      return (
                        <TouchableOpacity
                          key={s.api_name}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                          onPress={() => handleServiceChange(s.api_name)}
                        >
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Calendar picker */}
              {bookingForm.service_type ? (
                <View style={styles.calendarGroup}>
                  <Text style={styles.inputLabel}>Select Date *</Text>
                  <CalendarPicker
                    selectedDate={bookingForm.booking_date}
                    onSelectDate={handleDateSelect}
                    availableDates={availableDates}
                    loadingDates={loadingDates}
                    calendarMonth={calendarMonth}
                    setCalendarMonth={setCalendarMonth}
                  />
                </View>
              ) : null}

              {/* Notes */}
              {bookingForm.booking_date ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Notes (Optional)</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Any special requests or details..."
                    multiline
                    numberOfLines={3}
                    value={bookingForm.notes}
                    onChangeText={(val) => setBookingForm({ ...bookingForm, notes: val })}
                  />
                </View>
              ) : null}

              {/* Submit Summary */}
              {bookingForm.vehicle_id && bookingForm.service_type && bookingForm.booking_date ? (
                <View style={styles.summaryContainer}>
                  <Text style={styles.summaryTitle}>Booking Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Vehicle:</Text>
                    <Text style={styles.summaryValue}>
                      {
                        vehicles.find((v) => String(v.id) === bookingForm.vehicle_id)?.make
                      }{' '}
                      {vehicles.find((v) => String(v.id) === bookingForm.vehicle_id)?.model}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Service:</Text>
                    <Text style={styles.summaryValue}>{getServiceLabel(bookingForm.service_type)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Date:</Text>
                    <Text style={styles.summaryValue}>
                      {new Date(bookingForm.booking_date + 'T00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleBookingSubmit}
                  disabled={
                    submitting ||
                    !bookingForm.vehicle_id ||
                    !bookingForm.service_type ||
                    !bookingForm.booking_date
                  }
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit Request</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT BOOKING MODAL */}
      <Modal visible={editTarget !== null} transparent animationType="slide" onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Date Change</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.closeBtn}>
                <FontAwesome name="times" size={18} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {error ? (
                <AlertBanner message={error} type="error" onDismiss={() => setError('')} />
              ) : null}

              {editTarget ? (
                <View style={styles.editCardInfo}>
                  <Text style={styles.editCardTitle}>
                    Rescheduling booking for {editTarget.make} {editTarget.model}
                  </Text>
                  <Text style={styles.editCardMeta}>
                    Current Date: {editTarget.dateStr} — {editTarget.service}
                  </Text>
                </View>
              ) : null}

              {/* Calendar Picker for Edit */}
              <View style={styles.calendarGroup}>
                <Text style={styles.inputLabel}>Choose New Date *</Text>
                <CalendarPicker
                  selectedDate={editDate}
                  onSelectDate={(d) => setEditDate(d)}
                  availableDates={editAvailableDates}
                  loadingDates={editLoadingDates}
                  calendarMonth={editCalendarMonth}
                  setCalendarMonth={setEditCalendarMonth}
                />
              </View>

              {/* Reschedule Reason */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reason for date change *</Text>
                <View style={styles.pickerWrapper}>
                  <ScrollView horizontal={false} nestedScrollEnabled style={styles.dropdownScrollMini}>
                    {EDIT_REASONS.map((r) => {
                      const isSelected = editReason === r;
                      return (
                        <TouchableOpacity
                          key={r}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                          onPress={() => setEditReason(r)}
                        >
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                            {r}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {editReason === 'Others' ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Specify Reason *</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Enter reason details..."
                    value={editReasonCustom}
                    onChangeText={setEditReasonCustom}
                  />
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleEditSubmit}
                  disabled={editing || !editDate || !editReason || (editReason === 'Others' && !editReasonCustom.trim())}
                >
                  {editing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Request Change</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CANCEL BOOKING MODAL */}
      <Modal visible={cancelTarget !== null} transparent animationType="slide" onRequestClose={() => setCancelTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#ef4444' }]}>Cancel Booking</Text>
              <TouchableOpacity onPress={() => setCancelTarget(null)} style={styles.closeBtn}>
                <FontAwesome name="times" size={18} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {error ? (
                <AlertBanner message={error} type="error" onDismiss={() => setError('')} />
              ) : null}

              {cancelTarget ? (
                <View style={styles.cancelCardInfo}>
                  <FontAwesome name="exclamation-triangle" size={32} color="#ef4444" style={styles.cancelWarnIcon} />
                  <Text style={styles.cancelCardTitle}>
                    Cancel booking for {cancelTarget.make} {cancelTarget.model}?
                  </Text>
                  <Text style={styles.cancelCardMeta}>
                    {cancelTarget.dateStr} — {cancelTarget.service}
                  </Text>
                </View>
              ) : null}

              {/* Cancel Reason */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reason for cancellation *</Text>
                <View style={styles.pickerWrapper}>
                  <ScrollView horizontal={false} nestedScrollEnabled style={styles.dropdownScrollMini}>
                    {CANCEL_REASONS.map((r) => {
                      const isSelected = cancelReason === r;
                      return (
                        <TouchableOpacity
                          key={r}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                          onPress={() => setCancelReason(r)}
                        >
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                            {r}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {cancelReason === 'Others' ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Specify Reason *</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Enter details..."
                    value={cancelReasonCustom}
                    onChangeText={setCancelReasonCustom}
                  />
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelSubmitButton}
                  onPress={handleCancelSubmit}
                  disabled={cancelling || !cancelReason || (cancelReason === 'Others' && !cancelReasonCustom.trim())}
                >
                  {cancelling ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.cancelSubmitButtonText}>Confirm Cancellation</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  addButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  addButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addIcon: {
    marginRight: 6,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  listContainer: {
    gap: 12,
  },
  bookingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardDate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cardTime: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  cardBody: {
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: 8,
    width: 14,
  },
  detailText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  actionButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonOutlineText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  actionButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonDangerText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  actionBtnIcon: {
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  dropdownScroll: {
    maxHeight: 140,
  },
  dropdownScrollMini: {
    maxHeight: 120,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownItemSelected: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: '#2563eb',
    fontWeight: '700',
  },
  noVehiclesContainer: {
    padding: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
  },
  noVehiclesText: {
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    fontWeight: '500',
  },
  noVehiclesBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  noVehiclesBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarGroup: {
    marginBottom: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  summaryContainer: {
    padding: 16,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  modalActions: {
    marginTop: 12,
  },
  submitButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  editCardInfo: {
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  editCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  editCardMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  cancelCardInfo: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
  },
  cancelWarnIcon: {
    marginBottom: 12,
  },
  cancelCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  cancelCardMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'center',
  },
  cancelSubmitButton: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSubmitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
