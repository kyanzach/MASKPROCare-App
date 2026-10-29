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
  Image,
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
import AlertPromptModal, { AlertType } from '@/components/ui/AlertPromptModal';
import CalendarPicker from '@/components/ui/CalendarPicker';
import CounterDatePicker, { formatCounterDate } from '@/components/ui/CounterDatePicker';
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
  customer_vehicle_id?: number;
  vehicle_id?: number;
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
  rejection_reason?: string;
  cancellation_reason?: string;
  offered_date?: string;
  counter_date?: string | null;
  offer_status?: 'offered' | 'accepted' | 'declined' | 'countered' | null;
  customer_offer_reply?: string;
  vehicle_photo?: string;
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
      const preVehicleId = params.vehicle_id ? String(params.vehicle_id) : '';
      const preService = params.service ? String(params.service) : '';
      openBookingModal(preVehicleId, preService);
      router.setParams({ openBooking: undefined, vehicle_id: undefined, service: undefined } as any);
    }
  }, [params.openBooking, params.vehicle_id, params.service, loading]);

  // Prompt modal state
  const [promptModal, setPromptModal] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'error',
    title: '',
    message: '',
  });

  const showPrompt = (type: AlertType, title: string, message: string) => {
    setPromptModal({ visible: true, type, title, message });
  };

  // Responding to date offers
  const [respondingOffer, setRespondingOffer] = useState(false);
  const [declineModal, setDeclineModal] = useState<{
    visible: boolean;
    item: BookingItem | null;
    reason: string;
    counterDate: string;
    mode: 'decline' | 'propose';
  }>({
    visible: false,
    item: null,
    reason: '',
    counterDate: '',
    mode: 'decline',
  });
  const closeDeclineModal = () =>
    setDeclineModal({ visible: false, item: null, reason: '', counterDate: '', mode: 'decline' });

  // Photo Lightbox modal
  const [viewingPhoto, setViewingPhoto] = useState<{
    url: string;
    title: string;
    plate: string;
  } | null>(null);

  const getPhotoUrl = (photoPath?: string) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    const baseURL = client.defaults.baseURL || 'https://care.maskpro.ph/api';
    const rootBase = baseURL.replace(/\/api\/?$/, '');
    return `${rootBase}/${photoPath}`;
  };

  const handleAcceptOffer = async (requestId: number) => {
    setRespondingOffer(true);
    try {
      await client.post('/bookings/respond-offer', {
        request_id: requestId,
        action: 'accept',
      });
      showPrompt('success', 'Booking Confirmed! 🎉', 'You approved the agreed schedule. Your booking is now confirmed!');
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to accept date.';
      showPrompt('error', 'Action Failed', msg);
    } finally {
      setRespondingOffer(false);
    }
  };

  const handleDeclineSubmit = async () => {
    if (!declineModal.item) return;
    const reason = declineModal.reason.trim();
    const counterDate = declineModal.counterDate.trim();
    if (declineModal.mode === 'propose' && !counterDate) {
      showPrompt('warning', 'Pick a Date', 'Please choose your preferred date and time.');
      return;
    }
    if (!reason && !counterDate) {
      showPrompt('warning', 'Input Required', 'Please provide a reason or pick your preferred date.');
      return;
    }
    setRespondingOffer(true);
    try {
      await client.post('/bookings/respond-offer', {
        request_id: declineModal.item.id,
        action: 'decline',
        reply_reason: reason || 'Customer requested reschedule',
        counter_date: counterDate || undefined,
      });
      closeDeclineModal();
      showPrompt(
        'success',
        counterDate ? 'Preferred Date Sent 📅' : 'Response Sent',
        counterDate
          ? `We received your preferred schedule (${formatCounterDate(counterDate.replace(' ', 'T'))}). Our branch will call you to finalize it.`
          : 'Your response has been sent to our branch agent.'
      );
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to submit response.';
      showPrompt('error', 'Action Failed', msg);
    } finally {
      setRespondingOffer(false);
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
          vehicle_photo: b.vehicle_photo,
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
          rejection_reason: r.rejection_reason,
          cancellation_reason: r.cancellation_reason,
          offered_date: r.offered_date,
          offer_status: r.offer_status,
          customer_offer_reply: r.customer_offer_reply,
          vehicle_photo: r.vehicle_photo,
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

  const openBookingModal = (preselectVehicleId: any = '', preselectService: any = '') => {
    const vId = typeof preselectVehicleId === 'string' || typeof preselectVehicleId === 'number'
      ? String(preselectVehicleId)
      : '';
    const sRaw = typeof preselectService === 'string' ? preselectService : '';
    const sType = (sRaw === 'NanoFix' || sRaw === 'Nano Fix (Maintenance)')
      ? 'Nano Fix (Maintenance)'
      : sRaw;
    setError('');
    setBookingForm({ vehicle_id: vId, service_type: sType, booking_date: '', notes: '' });
    setAvailableDates([]);
    setCalendarMonth(new Date());
    setShowBookingModal(true);
    if (sType) {
      loadAvailability(sType);
    }
  };

  const handleBookingSubmit = async () => {
    if (!bookingForm.vehicle_id) {
      showPrompt('warning', 'Vehicle Required', 'Please select a vehicle from your registered vehicles.');
      return;
    }
    if (!bookingForm.service_type) {
      showPrompt('warning', 'Service Required', 'Please select a service for your booking.');
      return;
    }
    if (!bookingForm.booking_date) {
      showPrompt('warning', 'Date Required', 'Please pick an available date on the calendar.');
      return;
    }

    // Proactive client-side double entry gating
    const isDuplicate = unifiedList.some((b: BookingItem) => {
      if (b.status === 'cancelled' || b.status === 'rejected') return false;
      const bDate = (b.booking_date || '').slice(0, 10);
      const bVehicleId = b.customer_vehicle_id || (b as any).vehicle_id;
      return String(bVehicleId) === String(bookingForm.vehicle_id) && bDate === bookingForm.booking_date;
    });

    if (isDuplicate) {
      showPrompt('warning', 'Booking Already Exists', 'You already have an active booking or pending request for this vehicle on this date.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await client.post('/bookings/create', { ...bookingForm, booking_time: '08:00' });
      setShowBookingModal(false);
      showPrompt('success', 'Booking Request Submitted!', 'Your request has been received and is pending branch confirmation.');
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to submit booking. Please try again.';
      const isConflict = err.response?.status === 409;
      showPrompt(isConflict ? 'warning' : 'error', isConflict ? 'Booking Already Exists' : 'Booking Request Failed', msg);
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
      showPrompt('warning', 'Reason Required', 'Please select or enter a cancellation reason.');
      return;
    }
    setCancelling(true);
    setError('');
    try {
      if (cancelTarget.type === 'request') {
        await client.post('/bookings/cancel', { type: 'request', request_id: cancelTarget.id, reason });
        setCancelTarget(null);
        showPrompt('success', 'Request Cancelled', 'Your booking request has been cancelled.');
      } else {
        const res = await client.post('/bookings/cancel', { type: 'booking', booking_id: cancelTarget.id, reason });
        setCancelTarget(null);
        showPrompt('success', 'Cancellation Requested', res.data?.message || 'Pending branch review and SMS confirmation.');
      }
      loadData();
    } catch (err: any) {
      showPrompt('error', 'Cancellation Failed', err.response?.data?.message || 'Failed to submit cancellation request.');
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
      showPrompt('warning', 'Date Required', 'Please select a new preferred date.');
      return;
    }
    if (!reason) {
      showPrompt('warning', 'Reason Required', 'Please select or enter a reason for rescheduling.');
      return;
    }
    setEditing(true);
    setError('');
    try {
      await client.post('/bookings/edit-request', { request_id: editTarget.id, new_date: editDate, reason });
      setEditTarget(null);
      showPrompt('success', 'Request Rescheduled', 'Your booking request has been updated successfully.');
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to update booking.';
      const isConflict = err.response?.status === 409;
      showPrompt(isConflict ? 'warning' : 'error', isConflict ? 'Reschedule Conflict' : 'Update Failed', msg);
    } finally {
      setEditing(false);
    }
  };

  const canCancel = (item: BookingItem) => {
    if (item.type === 'request') return item.status === 'pending';
    if (item.status === 'cancel_requested') return false;
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


        {/* Booking Cards List */}
        {unifiedList.length > 0 ? (
          <View style={styles.listContainer}>
            {unifiedList.map((item) => {
              const isRejected = item.status === 'rejected';
              const isNegotiating = item.status === 'negotiating';
              const isWaitlisted = item.status === 'waitlisted';
              const isCancelled = item.status === 'cancelled';
              const opacity = isCancelled ? 0.65 : 1;
              const photoUrl = getPhotoUrl(item.vehicle_photo);
              const hasOffer = !!item.offered_date;
              const isOfferPending = (isRejected || isNegotiating) && hasOffer && (!item.offer_status || item.offer_status === 'offered');
              const isOfferAccepted = item.offer_status === 'accepted';
              const isOfferDeclined = item.offer_status === 'declined';
              const isOfferCountered = item.offer_status === 'countered';
              const canPropose = item.type === 'request' && (isRejected || isNegotiating) && !isOfferPending;

              return (
                <View
                  key={`${item.type}-${item.id}`}
                  style={[
                    styles.bookingCard,
                    { opacity },
                    isRejected && styles.rejectedBookingCard,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.cardDate, isRejected && styles.rejectedDateText]}>
                        {item.dateStr}
                      </Text>
                      <Text style={styles.cardTime}>{item.timeStr}</Text>
                    </View>
                    {isNegotiating || isWaitlisted ? (
                      <View style={styles.badgeStack}>
                        <StatusBadge status="pending" />
                        <View style={[styles.subBadge, isWaitlisted ? styles.subBadgeWaitlist : styles.subBadgeNegotiating]}>
                          <FontAwesome
                            name={isWaitlisted ? 'hourglass-half' : 'comments'}
                            size={9}
                            color={isWaitlisted ? '#b45309' : '#6d28d9'}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={[styles.subBadgeText, { color: isWaitlisted ? '#b45309' : '#6d28d9' }]}>
                            {isWaitlisted ? 'Waitlisted' : 'Negotiating'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <StatusBadge status={item.status} />
                    )}
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.vehicleDetailsRow}>
                      {photoUrl ? (
                        <TouchableOpacity
                          onPress={() =>
                            setViewingPhoto({
                              url: photoUrl,
                              title: `${item.make} ${item.model}`,
                              plate: item.plate_no,
                            })
                          }
                          activeOpacity={0.8}
                          style={styles.cardVehicleThumbWrap}
                        >
                          <Image source={{ uri: photoUrl }} style={styles.cardVehicleThumb} resizeMode="cover" />
                          <View style={styles.cardThumbIcon}>
                            <FontAwesome name="search-plus" size={9} color="#ffffff" />
                          </View>
                        </TouchableOpacity>
                      ) : null}

                      <View style={{ flex: 1 }}>
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
                    </View>
                  </View>

                  {/* Rejection Reason Box */}
                  {isRejected && item.rejection_reason ? (
                    <View style={styles.cardRejectionBox}>
                      <View style={styles.cardRejectionHeader}>
                        <FontAwesome name="exclamation-circle" size={12} color="#dc2626" style={{ marginRight: 5 }} />
                        <Text style={styles.cardRejectionTitle}>Branch Reason for Rejection:</Text>
                      </View>
                      <Text style={styles.cardRejectionText}>{item.rejection_reason}</Text>
                    </View>
                  ) : null}

                  {/* Alternative Date Offered Box */}
                  {hasOffer ? (
                    <View style={styles.cardOfferContainer}>
                      <View style={styles.cardOfferHeader}>
                        <View style={styles.cardOfferIcon}>
                          <FontAwesome name="calendar-check-o" size={13} color="#4338ca" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardOfferLabel}>
                            {isNegotiating ? 'Agreed Schedule Proposed:' : 'Alternative Date Offered:'}
                          </Text>
                          <Text style={styles.cardOfferDate}>
                            {new Date(item.offered_date!).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}{' '}
                            at{' '}
                            {new Date(item.offered_date!).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </Text>
                        </View>
                      </View>

                      {isOfferPending ? (
                        <View style={styles.cardOfferActions}>
                          <TouchableOpacity
                            style={styles.cardAcceptBtn}
                            onPress={() => handleAcceptOffer(item.id)}
                            disabled={respondingOffer}
                            activeOpacity={0.8}
                          >
                            {respondingOffer ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <>
                                <FontAwesome name="check" size={12} color="#ffffff" style={{ marginRight: 6 }} />
                                <Text style={styles.cardAcceptBtnText}>Accept Date</Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.cardDeclineBtn}
                            onPress={() => setDeclineModal({ visible: true, item, reason: '', counterDate: '', mode: 'decline' })}
                            disabled={respondingOffer}
                            activeOpacity={0.8}
                          >
                            <FontAwesome name="times" size={12} color="#dc2626" style={{ marginRight: 6 }} />
                            <Text style={styles.cardDeclineBtnText}>Decline / Propose</Text>
                          </TouchableOpacity>
                        </View>
                      ) : isOfferAccepted ? (
                        <View style={styles.cardOfferAcceptedBanner}>
                          <FontAwesome name="check-circle" size={13} color="#15803d" style={{ marginRight: 6 }} />
                          <Text style={styles.cardOfferAcceptedText}>
                            You accepted this alternative date. Awaiting confirmation.
                          </Text>
                        </View>
                      ) : isOfferCountered ? (
                        <View style={styles.cardOfferAcceptedBanner}>
                          <FontAwesome name="exchange" size={13} color="#4338ca" style={{ marginRight: 6 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardOfferAcceptedText, { color: '#4338ca' }]}>
                              You suggested a different schedule (see below).
                            </Text>
                            {item.customer_offer_reply ? (
                              <Text style={styles.cardOfferReplyText}>Note: "{item.customer_offer_reply}"</Text>
                            ) : null}
                          </View>
                        </View>
                      ) : isOfferDeclined ? (
                        <View style={styles.cardOfferDeclinedBanner}>
                          <FontAwesome name="times-circle" size={13} color="#b91c1c" style={{ marginRight: 6 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardOfferDeclinedText}>
                              You declined this date offer.
                            </Text>
                            {item.customer_offer_reply ? (
                              <Text style={styles.cardOfferReplyText}>
                                Reason: "{item.customer_offer_reply}"
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Negotiation panel: client's preferred date / waitlist status / propose action */}
                  {item.type === 'request' && (item.counter_date || isWaitlisted || canPropose) ? (
                    <View style={[styles.negotiationPanel, isWaitlisted && styles.negotiationPanelWaitlist]}>
                      {item.counter_date ? (
                        <View style={styles.cardOfferHeader}>
                          <View style={[styles.cardOfferIcon, { backgroundColor: isWaitlisted ? '#fef3c7' : '#ede9fe' }]}>
                            <FontAwesome
                              name={isWaitlisted ? 'hourglass-half' : 'calendar-plus-o'}
                              size={13}
                              color={isWaitlisted ? '#b45309' : '#6d28d9'}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardOfferLabel, { color: isWaitlisted ? '#92400e' : '#5b21b6' }]}>
                              Your Preferred Date:
                            </Text>
                            <Text style={[styles.cardOfferDate, { color: isWaitlisted ? '#b45309' : '#6d28d9' }]}>
                              {formatCounterDate(item.counter_date)}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      <Text style={styles.negotiationHint}>
                        {isWaitlisted
                          ? "You're on the waitlist. We'll call you as soon as a slot opens for your preferred date."
                          : item.counter_date
                          ? 'Our branch will call you to check availability and finalize your schedule.'
                          : 'None of the offered dates work? Pick your preferred date and our branch will call you.'}
                      </Text>

                      {canPropose ? (
                        <TouchableOpacity
                          style={styles.proposeBtn}
                          onPress={() =>
                            setDeclineModal({
                              visible: true,
                              item,
                              reason: '',
                              counterDate: '',
                              mode: 'propose',
                            })
                          }
                          disabled={respondingOffer}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                        >
                          <FontAwesome name="calendar" size={12} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.proposeBtnText}>
                            {item.counter_date ? 'Change Preferred Date' : 'Propose a Preferred Date'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}

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
                              {v.make} {v.model} — {v.plate_no || 'No plate (Update in My Vehicle)'}
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
                        router.push('/(tabs)/vehicles');
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
                  disabled={submitting}
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

        {/* Modal-level Alert Prompt Overlay */}
        <AlertPromptModal
          visible={promptModal.visible}
          type={promptModal.type}
          title={promptModal.title}
          message={promptModal.message}
          onConfirm={() => setPromptModal((prev) => ({ ...prev, visible: false }))}
          asOverlay
        />
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

        {/* Modal-level Alert Prompt Overlay */}
        <AlertPromptModal
          visible={promptModal.visible}
          type={promptModal.type}
          title={promptModal.title}
          message={promptModal.message}
          onConfirm={() => setPromptModal((prev) => ({ ...prev, visible: false }))}
          asOverlay
        />
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

        {/* Modal-level Alert Prompt Overlay */}
        <AlertPromptModal
          visible={promptModal.visible}
          type={promptModal.type}
          title={promptModal.title}
          message={promptModal.message}
          onConfirm={() => setPromptModal((prev) => ({ ...prev, visible: false }))}
          asOverlay
        />
      </Modal>

      {/* DECLINE OFFER MODAL PROMPT */}
      <Modal
        visible={declineModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeDeclineModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.promptModalOverlay}
        >
          <View style={styles.promptModalCard}>
            <View style={styles.promptModalHeader}>
              <View style={[styles.promptIconCircle, declineModal.mode === 'propose' && { backgroundColor: '#ede9fe' }]}>
                <FontAwesome
                  name={declineModal.mode === 'propose' ? 'calendar-plus-o' : 'calendar-times-o'}
                  size={18}
                  color={declineModal.mode === 'propose' ? '#6d28d9' : '#dc2626'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promptModalTitle}>
                  {declineModal.mode === 'propose' ? 'Propose a Preferred Date' : 'Decline or Propose New Date'}
                </Text>
                <Text style={styles.promptModalSubtitle}>
                  {declineModal.mode === 'propose'
                    ? 'Our branch will call you to finalize'
                    : declineModal.item?.offered_date
                    ? `Offered: ${formatCounterDate(declineModal.item.offered_date)}`
                    : ''}
                </Text>
              </View>
            </View>

            <Text style={[styles.promptInstructionText, { marginBottom: 6, fontWeight: '700', color: '#374151' }]}>
              {declineModal.mode === 'propose' ? 'Your Preferred Date & Time:' : 'Suggest Preferred Date & Time (Optional):'}
            </Text>
            <CounterDatePicker
              value={declineModal.counterDate}
              onChange={(v) => setDeclineModal((prev) => ({ ...prev, counterDate: v }))}
            />

            <Text style={[styles.promptInstructionText, { marginTop: 12 }]}>
              {declineModal.mode === 'propose' ? 'Note for the branch (optional):' : "Why doesn't the offered schedule work?"}
            </Text>
            <TextInput
              style={[styles.promptInput, { marginBottom: 12 }]}
              placeholder="e.g. Schedule conflict, out of town..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={2}
              value={declineModal.reason}
              onChangeText={(text) => setDeclineModal((prev) => ({ ...prev, reason: text }))}
            />

            <View style={styles.promptModalActions}>
              <TouchableOpacity
                style={styles.promptCancelBtn}
                onPress={closeDeclineModal}
                disabled={respondingOffer}
              >
                <Text style={styles.promptCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.promptConfirmBtn, declineModal.counterDate.trim() && { backgroundColor: '#4f46e5' }]}
                onPress={handleDeclineSubmit}
                disabled={respondingOffer}
              >
                {respondingOffer ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.promptConfirmBtnText}>
                    {declineModal.counterDate.trim() ? 'Send Preferred Date' : 'Submit & Decline'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PHOTO LIGHTBOX MODAL */}
      <Modal
        visible={!!viewingPhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={styles.lightboxCard}>
            <View style={styles.lightboxHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lightboxTitle} numberOfLines={1}>
                  {viewingPhoto?.title}
                </Text>
                <Text style={styles.lightboxSubtitle}>{viewingPhoto?.plate}</Text>
              </View>
              <TouchableOpacity
                style={styles.lightboxCloseBtn}
                onPress={() => setViewingPhoto(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <FontAwesome name="times" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.lightboxImageWrap}>
              {viewingPhoto?.url && (
                <Image
                  source={{ uri: viewingPhoto.url }}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                />
              )}
            </View>

            <View style={styles.lightboxFooter}>
              <TouchableOpacity
                style={styles.lightboxCloseBarBtn}
                onPress={() => setViewingPhoto(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.lightboxCloseBarText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ALERT PROMPT MODAL */}
      <AlertPromptModal
        visible={promptModal.visible}
        type={promptModal.type}
        title={promptModal.title}
        message={promptModal.message}
        onConfirm={() => setPromptModal((prev) => ({ ...prev, visible: false }))}
      />
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
  cancelRequestedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  cancelRequestedBannerText: {
    fontSize: 12,
    color: '#92400e',
    flex: 1,
    lineHeight: 16,
  },

  // ─── Negotiation badges & panel ───
  badgeStack: {
    alignItems: 'flex-end',
    gap: 4,
  },
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  subBadgeNegotiating: {
    backgroundColor: '#f5f3ff',
    borderColor: '#c4b5fd',
  },
  subBadgeWaitlist: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  subBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  negotiationPanel: {
    backgroundColor: '#faf5ff',
    borderColor: '#ddd6fe',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  negotiationPanelWaitlist: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  negotiationHint: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 17,
    marginTop: 8,
  },
  proposeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6d28d9',
    minHeight: 44,
    borderRadius: 10,
    marginTop: 10,
  },
  proposeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Rejection & Offer Card Additions ───
  rejectedBookingCard: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
    backgroundColor: '#fff8f8',
  },
  rejectedDateText: {
    color: '#991b1b',
  },
  vehicleDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardVehicleThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#e2e8f0',
  },
  cardVehicleThumb: {
    width: '100%',
    height: '100%',
  },
  cardThumbIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    padding: 2,
  },
  cardRejectionBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  cardRejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardRejectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
  },
  cardRejectionText: {
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 16,
  },
  cardOfferContainer: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  cardOfferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardOfferIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardOfferLabel: {
    fontSize: 11,
    color: '#1e40af',
    fontWeight: '600',
  },
  cardOfferDate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1d4ed8',
    marginTop: 1,
  },
  cardOfferActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
  },
  cardAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    borderRadius: 8,
  },
  cardAcceptBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardDeclineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    borderRadius: 8,
  },
  cardDeclineBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  cardOfferAcceptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  cardOfferAcceptedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d',
    flex: 1,
  },
  cardOfferDeclinedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  cardOfferDeclinedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
  },
  cardOfferReplyText: {
    fontSize: 11,
    color: '#7f1d1d',
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Prompt Modal (Decline)
  promptModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  promptModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  promptModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  promptIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  promptModalSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  promptInstructionText: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 12,
    lineHeight: 18,
  },
  promptInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#f9fafb',
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 16,
  },
  promptModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  promptCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  promptCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  promptConfirmBtn: {
    flex: 1.4,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptConfirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Photo Lightbox
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  lightboxCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  lightboxTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  lightboxSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  lightboxCloseBtn: {
    padding: 6,
  },
  lightboxImageWrap: {
    width: '100%',
    height: 300,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxFooter: {
    padding: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
  },
  lightboxCloseBarBtn: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  lightboxCloseBarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
