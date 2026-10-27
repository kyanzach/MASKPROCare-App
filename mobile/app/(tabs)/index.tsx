import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import VehicleIcon, { getVehicleConfig } from '@/components/ui/VehicleIcon';
import AlertPromptModal, { AlertType } from '@/components/ui/AlertPromptModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

// Maps raw DB service names → friendly display labels
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

interface Booking {
  booking_id: number;
  booking_date: string;
  latest_service: string;
  formatted_services?: string;
  make: string;
  model: string;
  plate_no: string;
  status: string;
  vehicle_photo?: string;
}

interface BookingRequest {
  request_id: number;
  booking_date: string;
  latest_service: string;
  service_names?: string;
  notes?: string;
  branch_id?: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'negotiating';
  rejection_reason?: string;
  cancellation_reason?: string;
  offered_date?: string;
  offer_status?: 'offered' | 'accepted' | 'declined' | 'countered';
  customer_offer_reply?: string;
  time_added: string;
  make: string;
  model: string;
  plate_no: string;
  vehicle_photo?: string;
}

interface Stats {
  total_vehicles: number;
  vehicles_needing_service: number;
  upcoming_bookings: number;
  pending_requests: number;
}

interface Vehicle {
  id: number;
  make: string;
  model: string;
  plate_no: string;
  photo?: string;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingOffer, setRespondingOffer] = useState(false);

  // Decline Offer Modal
  const [declineModal, setDeclineModal] = useState<{
    visible: boolean;
    request: BookingRequest | null;
    reason: string;
    counterDate: string;
  }>({
    visible: false,
    request: null,
    reason: '',
    counterDate: '',
  });

  // Prompt Alert Modal
  const [promptModal, setPromptModal] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Photo Lightbox Modal
  const [viewingPhoto, setViewingPhoto] = useState<{
    url: string;
    title: string;
    plate: string;
  } | null>(null);

  const showPrompt = (type: AlertType, title: string, message: string) => {
    setPromptModal({ visible: true, type, title, message });
  };

  const getPhotoUrl = (photoPath?: string) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    const baseURL = client.defaults.baseURL || 'https://care.maskpro.ph/api';
    const rootBase = baseURL.replace(/\/api\/?$/, '');
    return `${rootBase}/${photoPath}`;
  };

  const loadData = async () => {
    if (!user) return;
    try {
      const [statsRes, vehiclesRes, bookingsRes] = await Promise.all([
        client.get('/dashboard/stats'),
        client.get('/vehicles/list'),
        client.get('/bookings/list'),
      ]);
      setStats(statsRes.data?.data?.stats || null);
      setVehicles(vehiclesRes.data?.data?.vehicles || []);
      setBookings(bookingsRes.data?.data?.bookings || []);
      const reqList: BookingRequest[] =
        bookingsRes.data?.data?.requests || statsRes.data?.data?.pending_requests || [];
      setRequests(reqList);
    } catch (err: any) {
      if (err?.response?.status !== 401) {
        console.error('Dashboard load error:', err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const handleAcceptOffer = async (requestId: number) => {
    setRespondingOffer(true);
    try {
      await client.post('/bookings/respond-offer', {
        request_id: requestId,
        action: 'accept',
      });
      showPrompt(
        'success',
        'Booking Confirmed! 🎉',
        'You approved the agreed schedule. Your booking is now confirmed!'
      );
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to accept alternative date.';
      showPrompt('error', 'Action Failed', msg);
    } finally {
      setRespondingOffer(false);
    }
  };

  const openDeclineModal = (req: BookingRequest) => {
    setDeclineModal({
      visible: true,
      request: req,
      reason: '',
      counterDate: '',
    });
  };

  const handleDeclineSubmit = async () => {
    if (!declineModal.request) return;
    const reason = declineModal.reason.trim();
    const counterDate = declineModal.counterDate.trim();
    if (!reason && !counterDate) {
      showPrompt('warning', 'Input Required', 'Please provide a reason or suggest your preferred alternative date.');
      return;
    }

    setRespondingOffer(true);
    try {
      await client.post('/bookings/respond-offer', {
        request_id: declineModal.request.request_id,
        action: 'decline',
        reply_reason: reason || 'Customer requested reschedule',
        counter_date: counterDate || undefined,
      });
      setDeclineModal({ visible: false, request: null, reason: '', counterDate: '' });
      showPrompt(
        'success',
        counterDate ? 'New Date Proposed 📅' : 'Response Sent',
        counterDate
          ? 'Your preferred date has been submitted. Our branch agent will review and confirm.'
          : 'Your response and reason have been submitted to the branch agent for review.'
      );
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to submit response.';
      showPrompt('error', 'Action Failed', msg);
    } finally {
      setRespondingOffer(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  const firstName = user?.full_name?.trim() ? user.full_name.trim().split(' ')[0] : 'there';
  const upcomingBookings = bookings.filter(
    (b) => b.status === 'Scheduled' || new Date(b.booking_date) >= new Date()
  );

  // Pending appointments: recently requested pending approval + rejected requests needing response or attention
  const pendingAppointments = requests.filter(
    (r) =>
      r.status === 'pending' ||
      (r.status === 'rejected' && (!!r.offered_date || !!r.rejection_reason))
  );

  // Live count for pending widget
  const pendingCount =
    stats?.pending_requests ??
    requests.filter(
      (r) => r.status === 'pending' || (r.status === 'rejected' && r.offer_status === 'offered')
    ).length;

  const formatBookingDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatBookingTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  const renderPendingCard = (req: BookingRequest) => {
    const isRejected = req.status === 'rejected';
    const isNegotiating = req.status === 'negotiating';
    const photoUrl = getPhotoUrl(req.vehicle_photo);
    const hasOffer = !!req.offered_date;
    const isOfferPending =
      (isRejected || isNegotiating) && hasOffer && (!req.offer_status || req.offer_status === 'offered');
    const isOfferAccepted = req.offer_status === 'accepted';
    const isOfferDeclined = req.offer_status === 'declined';
    const isOfferCountered = req.offer_status === 'countered';

    return (
      <View
        key={`req-${req.request_id}`}
        style={[
          styles.pendingCardItem,
          isRejected && styles.rejectedCardItem,
        ]}
      >
        {/* Card Header: Date & Status Badge */}
        <View style={styles.pendingCardHeader}>
          <View style={styles.dateTimeContainer}>
            <Text style={[styles.appointmentDate, isRejected && styles.rejectedDateText]}>
              {formatBookingDate(req.booking_date)}
            </Text>
            <Text style={styles.appointmentTime}>{formatBookingTime(req.booking_date)}</Text>
          </View>
          <View
            style={[
              styles.pendingStatusBadge,
              isNegotiating
                ? { backgroundColor: '#ede9fe', borderColor: '#a78bfa' }
                : isRejected
                ? styles.rejectedBadgeBg
                : styles.pendingBadgeBg,
            ]}
          >
            <FontAwesome
              name={isNegotiating ? 'handshake-o' : isRejected ? 'times-circle' : 'hourglass-half'}
              size={11}
              color={isNegotiating ? '#6d28d9' : isRejected ? '#b91c1c' : '#b45309'}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.pendingStatusText,
                { color: isNegotiating ? '#6d28d9' : isRejected ? '#b91c1c' : '#b45309' },
              ]}
            >
              {isNegotiating ? 'Negotiating' : isRejected ? 'Declined by Branch' : 'Pending Approval'}
            </Text>
          </View>
        </View>

        {/* Vehicle & Service Info */}
        <View style={styles.appointmentBody}>
          {photoUrl ? (
            <TouchableOpacity
              onPress={() =>
                setViewingPhoto({
                  url: photoUrl,
                  title: `${req.make} ${req.model}`,
                  plate: req.plate_no,
                })
              }
              activeOpacity={0.8}
              style={styles.vehicleThumbContainer}
            >
              <Image source={{ uri: photoUrl }} style={styles.vehicleThumb} resizeMode="cover" />
              <View style={styles.thumbExpandIcon}>
                <FontAwesome name="search-plus" size={10} color="#ffffff" />
              </View>
            </TouchableOpacity>
          ) : (
            <VehicleIcon make={req.make} model={req.model} size={38} />
          )}

          <View style={styles.appointmentDetails}>
            <View style={styles.vehicleTitleRow}>
              <Text style={styles.vehicleName}>
                {req.make} {req.model}
              </Text>
            </View>
            <Text style={styles.vehiclePlate}>{req.plate_no}</Text>
            <Text style={styles.serviceText}>
              {req.service_names || getServiceLabel(req.latest_service)}
            </Text>
          </View>
        </View>

        {/* If Rejected: Prominent Red Box with Reason */}
        {isRejected && req.rejection_reason ? (
          <View style={styles.rejectionReasonBox}>
            <View style={styles.rejectionReasonHeader}>
              <FontAwesome name="exclamation-circle" size={13} color="#dc2626" style={{ marginRight: 6 }} />
              <Text style={styles.rejectionReasonTitle}>Reason for Rejection:</Text>
            </View>
            <Text style={styles.rejectionReasonText}>{req.rejection_reason}</Text>
          </View>
        ) : null}

        {/* If Alternative Date Offered */}
        {hasOffer ? (
          <View style={styles.offerContainer}>
            <View style={styles.offerHeaderRow}>
              <View style={styles.offerIconBadge}>
                <FontAwesome name="calendar-check-o" size={14} color="#4338ca" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerLabel}>Alternative Date Offered:</Text>
                <Text style={styles.offerDateText}>
                  {formatBookingDate(req.offered_date!)} at {formatBookingTime(req.offered_date!)}
                </Text>
              </View>
            </View>

            {/* Offer Decision Actions / Badges */}
            {isOfferPending ? (
              <View style={styles.offerActionsRow}>
                <TouchableOpacity
                  style={styles.acceptOfferBtn}
                  onPress={() => handleAcceptOffer(req.request_id)}
                  disabled={respondingOffer}
                  activeOpacity={0.8}
                >
                  {respondingOffer ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <FontAwesome name="check" size={12} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.acceptOfferBtnText}>Accept Date</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.declineOfferBtn}
                  onPress={() => openDeclineModal(req)}
                  disabled={respondingOffer}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="exchange" size={12} color="#dc2626" style={{ marginRight: 6 }} />
                  <Text style={styles.declineOfferBtnText}>Decline / Counter</Text>
                </TouchableOpacity>
              </View>
            ) : isOfferCountered ? (
              <View style={[styles.offerStatusBannerDeclined, { backgroundColor: '#f5f3ff', borderColor: '#c4b5fd' }]}>
                <FontAwesome name="hourglass-half" size={14} color="#6d28d9" style={{ marginRight: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.offerStatusBannerDeclinedText, { color: '#5b21b6', fontWeight: '700' }]}>
                    Counter proposal submitted.
                  </Text>
                  {req.offered_date ? (
                    <Text style={{ fontSize: 11, color: '#6d28d9', marginTop: 2 }}>
                      You proposed: {req.offered_date}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>
                    Branch is reviewing your preferred schedule.
                  </Text>
                </View>
              </View>
            ) : isOfferAccepted ? (
              <View style={styles.offerStatusBannerAccepted}>
                <FontAwesome name="check-circle" size={14} color="#15803d" style={{ marginRight: 6 }} />
                <Text style={styles.offerStatusBannerAcceptedText}>
                  You accepted this agreed date. Processing booking.
                </Text>
              </View>
            ) : isOfferDeclined ? (
              <View style={styles.offerStatusBannerDeclined}>
                <FontAwesome name="times-circle" size={14} color="#b91c1c" style={{ marginRight: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerStatusBannerDeclinedText}>
                    You declined this date offer.
                  </Text>
                  {req.customer_offer_reply ? (
                    <Text style={styles.offerReplyReasonText}>
                      Reason: "{req.customer_offer_reply}"
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Card Footer Note */}
        <View style={styles.pendingCardFooter}>
          <Text style={styles.pendingSubmittedText}>
            Submitted on {formatBookingDate(req.time_added)}
          </Text>
          <Text style={styles.requestIdText}>#{req.request_id}</Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
      }
    >
      {/* Welcome Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.nameText}>{firstName}! 👋</Text>
        </View>
        <TouchableOpacity
          style={styles.bookButton}
          onPress={() => router.push('/(tabs)/bookings?openBooking=true' as any)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4f46e5', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bookButtonGradient}
          >
            <FontAwesome name="calendar-plus-o" size={14} color="#ffffff" style={styles.bookIcon} />
            <Text style={styles.bookButtonText}>Book Now</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Stats Cards Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsCard}>
          <View style={styles.statsIconWrapper}>
            <View style={[styles.statsIcon, { backgroundColor: '#eff6ff' }]}>
              <FontAwesome name="car" size={18} color="#2563eb" />
            </View>
          </View>
          <Text style={styles.statsValue}>{stats?.total_vehicles ?? vehicles.length}</Text>
          <Text style={styles.statsLabel}>Total Vehicles</Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsIconWrapper}>
            <View style={[styles.statsIcon, { backgroundColor: '#fffbeb' }]}>
              <FontAwesome name="wrench" size={18} color="#d97706" />
            </View>
          </View>
          <Text style={styles.statsValue}>{stats?.vehicles_needing_service ?? 0}</Text>
          <Text style={styles.statsLabel}>Needs Service</Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsIconWrapper}>
            <View style={[styles.statsIcon, { backgroundColor: '#ecfdf5' }]}>
              <FontAwesome name="calendar" size={18} color="#059669" />
            </View>
          </View>
          <Text style={styles.statsValue}>{stats?.upcoming_bookings ?? upcomingBookings.length}</Text>
          <Text style={styles.statsLabel}>Upcoming</Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsIconWrapper}>
            <View style={[styles.statsIcon, { backgroundColor: '#fef2f2' }]}>
              <FontAwesome name="hourglass-half" size={18} color="#dc2626" />
            </View>
          </View>
          <Text style={styles.statsValue}>{pendingCount}</Text>
          <Text style={styles.statsLabel}>Pending</Text>
        </View>
      </View>

      {/* ─── Pending Appointments Section (Top of Upcoming) ─── */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pending Appointments</Text>
          <View
            style={[
              styles.countBadge,
              { backgroundColor: pendingAppointments.length > 0 ? '#fef3c7' : '#f3f4f6' },
            ]}
          >
            <Text
              style={[
                styles.countBadgeText,
                { color: pendingAppointments.length > 0 ? '#b45309' : '#6b7280' },
              ]}
            >
              {pendingAppointments.length}
            </Text>
          </View>
        </View>

        {pendingAppointments.length > 0 ? (
          <View style={styles.pendingCardsContainer}>
            {pendingAppointments.map((req) => renderPendingCard(req))}
          </View>
        ) : (
          <View style={styles.noPendingBox}>
            <FontAwesome name="clock-o" size={24} color="#9ca3af" style={{ marginBottom: 6 }} />
            <Text style={styles.noPendingTitle}>No pending booking requests</Text>
            <Text style={styles.noPendingSubtitle}>
              New appointments you request will appear here while waiting for branch confirmation.
            </Text>
          </View>
        )}
      </View>

      {/* ─── Upcoming Approved Appointments ─── */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{upcomingBookings.length}</Text>
          </View>
        </View>

        {upcomingBookings.length > 0 ? (
          <View style={styles.appointmentCard}>
            {upcomingBookings.slice(0, 5).map((booking, index) => {
              const photoUrl = getPhotoUrl(booking.vehicle_photo);
              return (
                <View
                  key={booking.booking_id || index}
                  style={[
                    styles.appointmentItem,
                    index === upcomingBookings.slice(0, 5).length - 1 && styles.noBorder,
                  ]}
                >
                  <View style={styles.appointmentHeader}>
                    <View style={styles.dateTimeContainer}>
                      <Text style={styles.appointmentDate}>{formatBookingDate(booking.booking_date)}</Text>
                      <Text style={styles.appointmentTime}>{formatBookingTime(booking.booking_date)}</Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>Scheduled</Text>
                    </View>
                  </View>

                  <View style={styles.appointmentBody}>
                    {photoUrl ? (
                      <TouchableOpacity
                        onPress={() =>
                          setViewingPhoto({
                            url: photoUrl,
                            title: `${booking.make} ${booking.model}`,
                            plate: booking.plate_no,
                          })
                        }
                        activeOpacity={0.8}
                        style={styles.vehicleThumbContainer}
                      >
                        <Image source={{ uri: photoUrl }} style={styles.vehicleThumb} resizeMode="cover" />
                        <View style={styles.thumbExpandIcon}>
                          <FontAwesome name="search-plus" size={10} color="#ffffff" />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <VehicleIcon make={booking.make} model={booking.model} size={36} />
                    )}
                    <View style={styles.appointmentDetails}>
                      <Text style={styles.vehicleName}>
                        {booking.make} {booking.model}
                      </Text>
                      <Text style={styles.vehiclePlate}>{booking.plate_no}</Text>
                      <Text style={styles.serviceText}>
                        {booking.formatted_services || getServiceLabel(booking.latest_service)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="calendar"
            title="No upcoming appointments"
            description="Schedule your next service appointment to keep your vehicles in top condition."
            actionText="Schedule Appointment"
            onAction={() => router.push('/(tabs)/bookings')}
          />
        )}
      </View>

      {/* My Vehicles Section */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Vehicles</Text>
        </View>

        {vehicles.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vehiclesScroll}
          >
            {vehicles.slice(0, 5).map((vehicle) => {
              const photoUrl = getPhotoUrl(vehicle.photo);
              return (
                <View key={vehicle.id} style={styles.vehicleCardItem}>
                  <View style={styles.vehicleCardHeader}>
                    {photoUrl ? (
                      <TouchableOpacity
                        onPress={() =>
                          setViewingPhoto({
                            url: photoUrl,
                            title: `${vehicle.make} ${vehicle.model}`,
                            plate: vehicle.plate_no,
                          })
                        }
                        activeOpacity={0.8}
                        style={styles.vehicleThumbContainer}
                      >
                        <Image source={{ uri: photoUrl }} style={styles.vehicleThumb} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : (
                      <VehicleIcon make={vehicle.make} model={vehicle.model} size={40} />
                    )}
                    <View style={styles.vehicleCardMeta}>
                      <Text style={styles.vehicleCardName} numberOfLines={1}>
                        {vehicle.make} {vehicle.model}
                      </Text>
                      <Text style={styles.vehicleCardPlate}>{vehicle.plate_no}</Text>
                    </View>
                  </View>
                  <View style={styles.vehicleCardActions}>
                    <TouchableOpacity
                      style={styles.vehicleCardBtnOutline}
                      onPress={() => router.push('/(tabs)/vehicles')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.vehicleCardBtnOutlineText}>Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.vehicleCardBtnGradient}
                      onPress={() => router.push('/(tabs)/bookings?openBooking=true' as any)}
                      activeOpacity={0.7}
                    >
                      <LinearGradient
                        colors={['#4f46e5', '#6366f1']}
                        style={styles.vehicleCardBtnGradientBg}
                      >
                        <Text style={styles.vehicleCardBtnGradientText}>Service</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <EmptyState
            icon="car"
            title="No vehicles found"
            description="Add your first vehicle to start tracking services and booking appointments."
            actionText="Add Vehicle"
            onAction={() => router.push('/(tabs)/vehicles')}
          />
        )}
      </View>

      {/* Decline Alternative Date Reason Modal Prompt */}
      <Modal
        visible={declineModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeclineModal({ visible: false, request: null, reason: '', counterDate: '' })}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.declineModalCard}>
            <View style={styles.declineModalHeader}>
              <View style={styles.declineIconCircle}>
                <FontAwesome name="times" size={18} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.declineModalTitle}>Decline Proposed Date</Text>
                <Text style={styles.declineModalSubtitle}>
                  Offered: {declineModal.request?.offered_date ? formatBookingDate(declineModal.request.offered_date) : ''}
                </Text>
              </View>
            </View>

            <Text style={styles.declineInstructionText}>
              Please state why this date does not work for you, or suggest an alternative:
            </Text>

            <TextInput
              style={styles.declineInput}
              placeholder="Reason (e.g. Schedule conflict, out of town...)"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={2}
              value={declineModal.reason}
              onChangeText={(text) => setDeclineModal((prev) => ({ ...prev, reason: text }))}
            />

            <Text style={[styles.declineInstructionText, { marginTop: 8, marginBottom: 4, fontWeight: '700', color: '#374151' }]}>
              Suggest Preferred Date & Time (Optional):
            </Text>
            <TextInput
              style={[styles.declineInput, { height: 42, textAlignVertical: 'center', marginBottom: 12 }]}
              placeholder="e.g. Next Saturday Nov 5 at 10:00 AM"
              placeholderTextColor="#9ca3af"
              value={declineModal.counterDate}
              onChangeText={(text) => setDeclineModal((prev) => ({ ...prev, counterDate: text }))}
            />

            <View style={styles.declineModalActions}>
              <TouchableOpacity
                style={styles.cancelDeclineBtn}
                onPress={() => setDeclineModal({ visible: false, request: null, reason: '', counterDate: '' })}
                disabled={respondingOffer}
              >
                <Text style={styles.cancelDeclineBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeclineBtn, declineModal.counterDate?.trim() ? { backgroundColor: '#4f46e5' } : null]}
                onPress={handleDeclineSubmit}
                disabled={respondingOffer}
              >
                {respondingOffer ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmDeclineBtnText}>
                    {declineModal.counterDate?.trim() ? 'Propose New Date' : 'Submit & Decline'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Vehicle Photo Lightbox Modal */}
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

      {/* Alert Prompt Modal Dialog */}
      <AlertPromptModal
        visible={promptModal.visible}
        type={promptModal.type}
        title={promptModal.title}
        message={promptModal.message}
        onConfirm={() => setPromptModal((prev) => ({ ...prev, visible: false }))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  nameText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  bookButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  bookIcon: {
    marginRight: 2,
  },
  bookButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statsCard: {
    width: (Dimensions.get('window').width - 44) / 2,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statsIconWrapper: {
    marginBottom: 12,
  },
  statsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  statsLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  countBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
  },

  // ─── Pending Appointments Styles ───
  pendingCardsContainer: {
    gap: 12,
  },
  pendingCardItem: {
    backgroundColor: '#fffdf5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rejectedCardItem: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
    backgroundColor: '#fff8f8',
  },
  pendingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rejectedDateText: {
    color: '#991b1b',
  },
  pendingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pendingBadgeBg: {
    backgroundColor: '#fef3c7',
  },
  rejectedBadgeBg: {
    backgroundColor: '#fee2e2',
  },
  pendingStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Rejection Reason Box
  rejectionReasonBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  rejectionReasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rejectionReasonTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
  },
  rejectionReasonText: {
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 16,
  },

  // Date Offer Box
  offerContainer: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  offerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerLabel: {
    fontSize: 11,
    color: '#1e40af',
    fontWeight: '600',
  },
  offerDateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1d4ed8',
    marginTop: 2,
  },
  offerActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
  },
  acceptOfferBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptOfferBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  declineOfferBtn: {
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
  declineOfferBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  offerStatusBannerAccepted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  offerStatusBannerAcceptedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803d',
    flex: 1,
  },
  offerStatusBannerDeclined: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  offerStatusBannerDeclinedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
  },
  offerReplyReasonText: {
    fontSize: 11,
    color: '#7f1d1d',
    marginTop: 2,
    fontStyle: 'italic',
  },
  pendingCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  pendingSubmittedText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  requestIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },

  noPendingBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  noPendingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  noPendingSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 2,
    maxWidth: 280,
  },

  // ─── Vehicle Thumbnail with Expand ───
  vehicleThumbContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#e2e8f0',
  },
  vehicleThumb: {
    width: '100%',
    height: '100%',
  },
  thumbExpandIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    padding: 2,
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ─── Upcoming Card Styles ───
  appointmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  appointmentItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 16,
    marginBottom: 16,
  },
  noBorder: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    marginBottom: 0,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dateTimeContainer: {
    flex: 1,
  },
  appointmentDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  appointmentTime: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#d1fae5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    color: '#065f46',
    fontSize: 11,
    fontWeight: '600',
  },
  appointmentBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appointmentDetails: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  vehiclePlate: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  serviceText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '500',
    marginTop: 4,
  },

  // Vehicles Horizontal List
  vehiclesScroll: {
    gap: 12,
    paddingBottom: 4,
  },
  vehicleCardItem: {
    width: 220,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  vehicleCardMeta: {
    flex: 1,
  },
  vehicleCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  vehicleCardPlate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  vehicleCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  vehicleCardBtnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardBtnOutlineText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  vehicleCardBtnGradient: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  vehicleCardBtnGradientBg: {
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardBtnGradientText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },

  // ─── Decline Reason Modal ───
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  declineModalCard: {
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
  declineModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  declineIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  declineModalSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  declineInstructionText: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 12,
    lineHeight: 18,
  },
  declineInput: {
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
  declineModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelDeclineBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  cancelDeclineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  confirmDeclineBtn: {
    flex: 1.4,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeclineBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ─── Photo Lightbox Modal ───
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
