import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import VehicleIcon, { getVehicleConfig } from '@/components/ui/VehicleIcon';
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
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [statsRes, vehiclesRes, bookingsRes] = await Promise.all([
        client.get('/dashboard/stats'),
        client.get('/vehicles/list'),
        client.get('/bookings/list'),
      ]);
      setStats(statsRes.data?.data?.stats || null);
      setVehicles(vehiclesRes.data?.data?.vehicles || []);
      setBookings(bookingsRes.data?.data?.bookings || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
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

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  const firstName = user?.full_name ? user.full_name.split(' ')[0] : 'there';
  const upcomingBookings = bookings.filter(b => b.status === 'Scheduled' || new Date(b.booking_date) >= new Date());

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
          onPress={() => router.push('/bookings?openBooking=true')}
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
          <Text style={styles.statsValue}>{stats?.pending_requests ?? 0}</Text>
          <Text style={styles.statsLabel}>Pending</Text>
        </View>
      </View>

      {/* Upcoming Appointments */}
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
              const vehicleConfig = getVehicleConfig(booking.make, booking.model);
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
                    <VehicleIcon make={booking.make} model={booking.model} size={36} />
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
            onAction={() => router.push('/bookings')}
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
              return (
                <View key={vehicle.id} style={styles.vehicleCardItem}>
                  <View style={styles.vehicleCardHeader}>
                    <VehicleIcon make={vehicle.make} model={vehicle.model} size={40} />
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
                      onPress={() => router.push('/vehicles')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.vehicleCardBtnOutlineText}>Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.vehicleCardBtnGradient}
                      onPress={() => router.push('/bookings?openBooking=true')}
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
            title="No vehicles registered"
            description="Add your first vehicle to start managing maintenance schedules."
            actionText="Add Vehicle"
            onAction={() => router.push('/vehicles')}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  bookButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bookIcon: {
    marginRight: 6,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  statsLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  countBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  countBadgeText: {
    color: '#1e40af',
    fontSize: 11,
    fontWeight: '700',
  },
  appointmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 16,
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
    flexDirection: 'column',
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
});
