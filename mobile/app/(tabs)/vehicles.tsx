import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import AlertBanner from '@/components/ui/AlertBanner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AlertPromptModal, { AlertType } from '@/components/ui/AlertPromptModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

const COLOR_MAP: Record<string, string> = {
  'red': '#dc2626', 'blue': '#2563eb', 'black': '#1f2937', 'white': '#e5e7eb',
  'silver': '#9ca3af', 'gray': '#6b7280', 'grey': '#6b7280', 'green': '#16a34a',
  'yellow': '#eab308', 'orange': '#ea580c', 'brown': '#92400e', 'gold': '#d97706',
  'maroon': '#7f1d1d', 'beige': '#d4c5a9', 'ivory': '#fffff0', 'cream': '#fffdd0',
  'blackish red': '#5c1a1a', 'midnight blue': '#1e3a5f', 'pearl white': '#f5f5f0',
  'wine red': '#722f37', 'dark blue': '#1e3a8a', 'light blue': '#93c5fd',
  'sky blue': '#38bdf8', 'navy blue': '#1e40af',
};

function getColorHex(colorName: string) {
  if (!colorName) return '#94a3b8';
  const key = colorName.toLowerCase().trim();
  return COLOR_MAP[key] || '#94a3b8';
}

function getNextRenewal(registrationDate: string) {
  if (!registrationDate) return null;
  const regDate = new Date(registrationDate + 'T00:00');
  if (isNaN(regDate.getTime())) return null;
  const now = new Date();
  const firstRenewal = new Date(regDate);
  firstRenewal.setFullYear(firstRenewal.getFullYear() + 3);

  if (now < firstRenewal) {
    return firstRenewal;
  }
  const yearsPastFirst = Math.floor((now.getTime() - firstRenewal.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const nextRenewal = new Date(firstRenewal);
  nextRenewal.setFullYear(nextRenewal.getFullYear() + yearsPastFirst + 1);
  return nextRenewal;
}

function getRenewalStatus(registrationDate: string) {
  const next = getNextRenewal(registrationDate);
  if (!next) return null;
  const now = new Date();
  const diffDays = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const formatOptions = { month: 'short' as const, year: 'numeric' as const };

  if (diffDays < 0) {
    return {
      label: 'LTO Registration Overdue',
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fca5a5',
      icon: 'exclamation-circle' as const,
    };
  }
  if (diffDays <= 30) {
    return {
      label: `LTO Registration — Renew in ${diffDays}d`,
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fcd34d',
      icon: 'clock-o' as const,
    };
  }
  if (diffDays <= 90) {
    return {
      label: `LTO Registration — Due ${next.toLocaleDateString('en-US', formatOptions)}`,
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
      icon: 'calendar-check-o' as const,
    };
  }
  return {
    label: `LTO Registration valid until ${next.toLocaleDateString('en-US', formatOptions)}`,
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icon: 'check-circle' as const,
  };
}

interface Vehicle {
  id: number;
  make: string;
  model: string;
  plate_no: string;
  color: string;
  registration_date: string;
  registration_expiry?: string;
  photo?: string;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://care.maskpro.ph/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDisplayDate(ymd: string) {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11) return ymd;
  return `${SHORT_MONTHS[m]} ${d}, ${y}`;
}

function toYMD(year: number, monthIndex: number, day: number) {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export default function VehiclesScreen() {
  const router = useRouter();
  const { vehicle_id } = useLocalSearchParams<{ vehicle_id?: string }>();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Alert system
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    make: '',
    model: '',
    plate_no: '',
    color: '',
    registration_date: '',
  });

  // Photo states for modal
  const [modalPhotoUri, setModalPhotoUri] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  // Hotel/Flight-Style Interactive Calendar Picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showYearMonthJump, setShowYearMonthJump] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  const openDatePicker = () => {
    const existing = form.registration_date;
    if (existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) {
      const [y, m] = existing.split('-').map((n) => parseInt(n, 10));
      if (!isNaN(y) && !isNaN(m)) {
        setCalYear(y);
        setCalMonth(m - 1);
      }
    } else {
      const now = new Date();
      setCalYear(now.getFullYear());
      setCalMonth(now.getMonth());
    }
    setShowYearMonthJump(false);
    setShowDatePicker(true);
  };

  const stepCalendarMonth = (delta: number) => {
    let nextMonth = calMonth + delta;
    let nextYear = calYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setCalMonth(nextMonth);
    setCalYear(nextYear);
  };

  const selectCalendarDay = (day: number) => {
    const ymd = toYMD(calYear, calMonth, day);
    setForm((prev) => ({ ...prev, registration_date: ymd }));
    setShowDatePicker(false);
  };

  const loadVehicles = async () => {
    try {
      const res = await client.get('/vehicles/list');
      setVehicles(res.data.data?.vehicles || []);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    if (vehicle_id && vehicles.length > 0) {
      const target = vehicles.find((v) => String(v.id) === String(vehicle_id));
      if (target) {
        openEdit(target);
        router.setParams({ vehicle_id: '' });
      }
    }
  }, [vehicle_id, vehicles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadVehicles();
  }, []);

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

  const [viewingPhoto, setViewingPhoto] = useState<{
    url: string;
    title: string;
    plate: string;
  } | null>(null);

  const showPrompt = (type: AlertType, title: string, message: string) => {
    setPromptModal({ visible: true, type, title, message });
  };

  const openAdd = () => {
    setEditVehicle(null);
    setForm({ make: '', model: '', plate_no: '', color: '', registration_date: '' });
    setModalPhotoUri(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v);
    setForm({
      make: v.make || '',
      model: v.model || '',
      plate_no: v.plate_no || '',
      color: v.color || '',
      registration_date: v.registration_date || v.registration_expiry || '',
    });
    setModalPhotoUri(null);
    setError('');
    setShowModal(true);
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showPrompt('warning', 'Permission Required', 'Photo library access is needed to select a vehicle photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setModalPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (vehicleId: number, uri: string) => {
    try {
      const formData = new FormData();
      formData.append('vehicle_id', String(vehicleId));
      
      const uriParts = uri.split('/');
      const fileName = uriParts[uriParts.length - 1] || 'photo.jpg';
      
      formData.append('photo', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: fileName,
        type: 'image/jpeg',
      } as any);

      await client.post('/vehicles/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (err: any) {
      const serverMsg = err.response?.data?.message || 'Unable to upload photo. Please ensure file is valid.';
      throw new Error(serverMsg);
    }
  };

  const handleCardPhotoUpload = async (vehicleId: number) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showPrompt('warning', 'Permission Required', 'Photo library access is needed to select a vehicle photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setUploadingId(vehicleId);
      try {
        await uploadPhoto(vehicleId, result.assets[0].uri);
        showPrompt('success', 'Photo Updated', 'Your vehicle photo has been updated successfully!');
        loadVehicles();
      } catch (err: any) {
        showPrompt('error', 'Upload Failed', err.message || 'We could not upload your vehicle photo. Please try again.');
      } finally {
        setUploadingId(null);
      }
    }
  };

  const handleSubmit = async () => {
    if (!form.make || !form.model) {
      showPrompt('warning', 'Missing Details', 'Please enter both Vehicle Make and Model.');
      return;
    }
    
    // Validate registration date format if provided
    if (form.registration_date) {
      const parts = form.registration_date.split('-');
      if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) {
        showPrompt('warning', 'Invalid Date', 'Registration date must be in YYYY-MM-DD format.');
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      let vehicleId;
      if (editVehicle) {
        await client.post('/vehicles/update', { id: editVehicle.id, ...form });
        vehicleId = editVehicle.id;
        showPrompt('success', 'Vehicle Updated', 'Vehicle details updated successfully!');
      } else {
        const res = await client.post('/vehicles/create', form);
        vehicleId = res.data?.data?.vehicle?.id;
        showPrompt('success', 'Vehicle Added', 'New vehicle added to your garage successfully!');
      }

      if (modalPhotoUri && vehicleId) {
        await uploadPhoto(vehicleId, modalPhotoUri);
      }

      setShowModal(false);
      loadVehicles();
    } catch (err: any) {
      showPrompt('error', 'Unable to Save', err.response?.data?.message || 'Failed to save vehicle details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await client.post('/vehicles/delete', { id: deleteConfirm.id });
      showPrompt('success', 'Vehicle Deleted', 'The vehicle was removed from your garage.');
      setDeleteConfirm(null);
      loadVehicles();
    } catch (err: any) {
      showPrompt('error', 'Delete Failed', err.response?.data?.message || 'Failed to delete vehicle.');
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteFromModal = () => {
    if (!editVehicle) return;
    setShowModal(false);
    setDeleteConfirm(editVehicle);
  };

  const getPhotoUrl = (photoPath?: string) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    
    // In our client interceptors, we use API_BASE which has '/api'.
    // The photo path is relative to the root care.maskpro.ph website.
    // Let's strip '/api' if we need to get to the raw root path
    const rootBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
    return `${rootBase}/${photoPath}`;
  };

  if (loading) {
    return <LoadingSpinner message="Loading vehicles..." />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Vehicles</Text>
          <TouchableOpacity style={styles.addButton} onPress={openAdd} activeOpacity={0.8}>
            <LinearGradient
              colors={['#2563eb', '#1d4ed8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButtonGradient}
            >
              <FontAwesome name="plus" size={12} color="#ffffff" style={styles.addIcon} />
              <Text style={styles.addButtonText}>Add Vehicle</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>


        {/* Vehicle list */}
        {vehicles.length > 0 ? (
          <View style={styles.listContainer}>
            {vehicles.map((v) => {
              const photoUrl = getPhotoUrl(v.photo);
              const renewalInfo = getRenewalStatus(v.registration_date);
              const hexColor = getColorHex(v.color);
              const isWhiteColor = v.color?.toLowerCase().includes('white') || v.color?.toLowerCase() === 'ivory';

              return (
                <View key={v.id} style={styles.vehicleCard}>
                  {/* Photo area */}
                  <View style={styles.photoContainer}>
                    {uploadingId === v.id ? (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text style={styles.uploadText}>Uploading...</Text>
                      </View>
                    ) : photoUrl ? (
                      <>
                        <TouchableOpacity
                          style={styles.photoTouchArea}
                          activeOpacity={0.9}
                          onPress={() => openEdit(v)}
                        >
                          <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
                        </TouchableOpacity>

                        {/* Camera change button */}
                        <TouchableOpacity
                          style={styles.photoChangeBtn}
                          activeOpacity={0.8}
                          onPress={() => handleCardPhotoUpload(v.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <FontAwesome name="camera" size={12} color="#ffffff" />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.photoTouchArea}
                        activeOpacity={0.8}
                        onPress={() => handleCardPhotoUpload(v.id)}
                      >
                        <View style={styles.photoPlaceholder}>
                          <FontAwesome name="car" size={32} color="#cbd5e1" />
                          <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Body Info */}
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.vehicleName}>
                          {v.make} {v.model}
                        </Text>
                        <Text style={styles.plateText}>{v.plate_no || 'No Plate Number'}</Text>
                      </View>
                      
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(v)}>
                        <FontAwesome name="pencil" size={14} color="#6b7280" />
                      </TouchableOpacity>
                    </View>

                    {/* Metadata tags */}
                    <View style={styles.metaContainer}>
                      {v.color ? (
                        <View style={styles.colorTag}>
                          <View
                            style={[
                              styles.colorDot,
                              { backgroundColor: hexColor },
                              isWhiteColor && styles.whiteColorDotBorder,
                            ]}
                          />
                          <Text style={styles.metaTagText}>{v.color}</Text>
                        </View>
                      ) : null}

                      {v.registration_date ? (
                        <View style={styles.dateTag}>
                          <FontAwesome name="calendar" size={12} color="#6b7280" style={styles.tagIcon} />
                          <Text style={styles.metaTagText}>Registered: {v.registration_date}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* LTO Renewal Banner */}
                    {renewalInfo ? (
                      <View
                        style={[
                          styles.renewalBanner,
                          {
                            backgroundColor: renewalInfo.bg,
                            borderColor: renewalInfo.border,
                          },
                        ]}
                      >
                        <FontAwesome name={renewalInfo.icon} size={14} color={renewalInfo.color} style={styles.renewalIcon} />
                        <Text style={[styles.renewalLabel, { color: renewalInfo.color }]}>
                          {renewalInfo.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="car"
            title="No vehicles registered"
            description="Add your first vehicle to start scheduling bookings and tracking maintenance."
            actionText="Add Vehicle"
            onAction={openAdd}
          />
        )}
      </ScrollView>

      {/* ADD/EDIT MODAL */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <FontAwesome name="times" size={18} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">

              {/* Photo Selector */}
              <TouchableOpacity style={styles.modalPhotoSelector} onPress={handlePickImage} activeOpacity={0.85}>
                {modalPhotoUri ? (
                  <>
                    <Image source={{ uri: modalPhotoUri }} style={styles.modalPhoto} resizeMode="cover" />
                    <View style={styles.modalPhotoChangeBadge}>
                      <FontAwesome name="camera" size={10} color="#ffffff" />
                      <Text style={styles.modalPhotoChangeText}>Change</Text>
                    </View>
                  </>
                ) : editVehicle?.photo ? (
                  <>
                    <Image source={{ uri: getPhotoUrl(editVehicle.photo) || '' }} style={styles.modalPhoto} resizeMode="cover" />
                    <View style={styles.modalPhotoChangeBadge}>
                      <FontAwesome name="camera" size={10} color="#ffffff" />
                      <Text style={styles.modalPhotoChangeText}>Change</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.modalPhotoPlaceholder}>
                    <FontAwesome name="camera" size={26} color="#94a3b8" />
                    <Text style={styles.modalPhotoText}>
                      {editVehicle ? 'Tap to change photo' : 'Tap to add a photo'}
                    </Text>
                    <Text style={styles.modalPhotoSubtext}>JPEG, PNG, or WebP</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Input fields */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Make *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Toyota"
                  placeholderTextColor="#9ca3af"
                  value={form.make}
                  onChangeText={(val) => setForm({ ...form, make: val })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Model *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Innova"
                  placeholderTextColor="#9ca3af"
                  value={form.model}
                  onChangeText={(val) => setForm({ ...form, model: val })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Plate Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. ABC 1234"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="characters"
                  value={form.plate_no}
                  onChangeText={(val) => setForm({ ...form, plate_no: val })}
                />
              </View>

              {/* Full-width Color Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Color</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. White"
                  placeholderTextColor="#9ca3af"
                  value={form.color}
                  onChangeText={(val) => setForm({ ...form, color: val })}
                />
              </View>

              {/* Highlighted Value-Added Feature Guide Box (Placed ABOVE the Registration Date input) */}
              <View style={styles.ltoFootnoteBox}>
                <View style={styles.ltoFootnoteHeaderRow}>
                  <View style={styles.ltoFootnoteTitleWrap}>
                    <FontAwesome name="bell" size={13} color="#2563eb" style={{ marginRight: 6 }} />
                    <Text style={styles.ltoFootnoteTitle} numberOfLines={1} adjustsFontSizeToFit>
                      Complimentary LTO Renewal Reminder
                    </Text>
                  </View>
                  <View style={styles.ltoFreeSmsPill}>
                    <FontAwesome name="envelope-o" size={10} color="#1d4ed8" style={{ marginRight: 4 }} />
                    <Text style={styles.ltoFreeSmsPillText} numberOfLines={1}>Free Auto-SMS</Text>
                  </View>
                </View>
                <Text style={styles.ltoFootnoteText}>
                  Enter your vehicle's registration date below and we'll automatically calculate your next renewal — the first 3 years are free in the Philippines, then it's annual. We'll send you an automatic <Text style={{ fontWeight: '700', color: '#334155' }}>SMS & app reminder</Text> before it's due.
                </Text>
              </View>

              {/* Full-width Vehicle Registration Date Input (Placed at the very last) */}
              <View style={[styles.inputGroup, { marginBottom: 16 }]}>
                <Text style={styles.inputLabel} numberOfLines={1}>
                  Vehicle Registration Date
                </Text>
                <TouchableOpacity
                  style={[
                    styles.datePickerTrigger,
                    form.registration_date ? styles.datePickerTriggerActive : null,
                  ]}
                  onPress={openDatePicker}
                  activeOpacity={0.75}
                >
                  <FontAwesome
                    name="calendar"
                    size={13}
                    color={form.registration_date ? '#2563eb' : '#64748b'}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.datePickerTriggerText,
                      !form.registration_date && styles.datePickerPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {form.registration_date ? formatDisplayDate(form.registration_date) : 'Select registration date'}
                  </Text>
                  {form.registration_date ? (
                    <TouchableOpacity
                      onPress={() => setForm({ ...form, registration_date: '' })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginLeft: 4 }}
                    >
                      <FontAwesome name="times-circle" size={15} color="#94a3b8" />
                    </TouchableOpacity>
                  ) : (
                    <FontAwesome name="chevron-down" size={11} color="#94a3b8" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Footer Actions (Matches Web: Delete Vehicle on left, Cancel + Update/Add Vehicle on right) */}
              <View style={styles.modalFooterBar}>
                {editVehicle ? (
                  <TouchableOpacity
                    style={styles.deleteLinkBtn}
                    onPress={handleDeleteFromModal}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name="trash-o" size={13} color="#ef4444" style={{ marginRight: 5 }} />
                    <Text style={styles.deleteLinkText} numberOfLines={1}>Delete Vehicle</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}

                <View style={styles.modalRightBtns}>
                  <TouchableOpacity
                    style={styles.cancelOutlineBtn}
                    onPress={() => setShowModal(false)}
                    disabled={saving}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.cancelOutlineText} numberOfLines={1}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.savePrimaryBtn}
                    onPress={handleSubmit}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.savePrimaryText} numberOfLines={1}>
                        {editVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* HOTEL / FLIGHT-STYLE INTERACTIVE CALENDAR DATE PICKER OVERLAY */}
        {showDatePicker && (() => {
          const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
          const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
          const today = new Date();
          const todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());
          const currentYear = today.getFullYear();
          const years: number[] = [];
          for (let y = currentYear + 1; y >= currentYear - 25; y--) {
            years.push(y);
          }

          const cells: (number | null)[] = [];
          for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);

          return (
            <View style={styles.calOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setShowDatePicker(false)}
              />
              <View style={styles.calSheet}>
                {/* Booking-style top summary banner */}
                <View style={styles.calTopSummary}>
                  <View>
                    <Text style={styles.calTopLabel}>Vehicle Registration Date</Text>
                    <Text style={styles.calTopSelected}>
                      {form.registration_date
                        ? formatDisplayDate(form.registration_date)
                        : 'Tap a date below'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.calCloseCircle}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <FontAwesome name="times" size={15} color="#475569" />
                  </TouchableOpacity>
                </View>

                {/* Month & Year Navigation Bar */}
                <View style={styles.calNavRow}>
                  <TouchableOpacity
                    style={styles.calNavArrow}
                    onPress={() => stepCalendarMonth(-1)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name="chevron-left" size={13} color="#1e293b" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.calMonthYearPill}
                    onPress={() => setShowYearMonthJump(!showYearMonthJump)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.calMonthYearText}>
                      {MONTH_NAMES[calMonth]} {calYear}
                    </Text>
                    <FontAwesome
                      name={showYearMonthJump ? 'chevron-up' : 'chevron-down'}
                      size={11}
                      color="#2563eb"
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.calNavArrow}
                    onPress={() => stepCalendarMonth(1)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name="chevron-right" size={13} color="#1e293b" />
                  </TouchableOpacity>
                </View>

                {showYearMonthJump ? (
                  <View style={styles.calJumpContainer}>
                    <Text style={styles.calJumpSectionLabel}>Select Month</Text>
                    <View style={styles.calMonthGrid}>
                      {SHORT_MONTHS.map((mName, idx) => {
                        const active = idx === calMonth;
                        return (
                          <TouchableOpacity
                            key={mName}
                            style={[styles.calMonthChip, active && styles.calMonthChipActive]}
                            onPress={() => setCalMonth(idx)}
                          >
                            <Text style={[styles.calMonthChipText, active && styles.calMonthChipTextActive]}>
                              {mName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.calJumpSectionLabel, { marginTop: 12 }]}>Select Year</Text>
                    <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                      <View style={styles.calYearGrid}>
                        {years.map((yr) => {
                          const active = yr === calYear;
                          return (
                            <TouchableOpacity
                              key={yr}
                              style={[styles.calYearChip, active && styles.calYearChipActive]}
                              onPress={() => {
                                setCalYear(yr);
                                setShowYearMonthJump(false);
                              }}
                            >
                              <Text style={[styles.calYearChipText, active && styles.calYearChipTextActive]}>
                                {yr}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ) : (
                  <>
                    {/* Day of week headers */}
                    <View style={styles.calWeekRow}>
                      {DAY_HEADERS.map((dh) => (
                        <View key={dh} style={styles.calWeekCell}>
                          <Text style={styles.calWeekText}>{dh}</Text>
                        </View>
                      ))}
                    </View>

                    {/* 7-column day cells */}
                    <View style={styles.calDaysGrid}>
                      {cells.map((day, idx) => {
                        if (day === null) {
                          return <View key={`empty-${idx}`} style={styles.calDayCell} />;
                        }
                        const cellYMD = toYMD(calYear, calMonth, day);
                        const isSelected = form.registration_date === cellYMD;
                        const isToday = todayYMD === cellYMD;

                        return (
                          <TouchableOpacity
                            key={cellYMD}
                            style={styles.calDayCell}
                            onPress={() => selectCalendarDay(day)}
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.calDayPill,
                                isToday && !isSelected && styles.calDayPillToday,
                                isSelected && styles.calDayPillSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.calDayText,
                                  isToday && !isSelected && styles.calDayTextToday,
                                  isSelected && styles.calDayTextSelected,
                                ]}
                              >
                                {day}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Calendar Footer: Quick Today & Clear */}
                <View style={styles.calFooter}>
                  <TouchableOpacity
                    style={styles.calFooterSecondaryBtn}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, registration_date: '' }));
                      setShowDatePicker(false);
                    }}
                  >
                    <Text style={styles.calFooterSecondaryText}>Clear</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.calFooterTodayBtn}
                      onPress={() => {
                        const now = new Date();
                        const ymd = toYMD(now.getFullYear(), now.getMonth(), now.getDate());
                        setForm((prev) => ({ ...prev, registration_date: ymd }));
                        setShowDatePicker(false);
                      }}
                    >
                      <Text style={styles.calFooterTodayText}>Today</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.calFooterDoneBtn}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.calFooterDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}

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

      {/* DELETE CONFIRM MODAL */}
      <ConfirmModal
        visible={deleteConfirm !== null}
        title="Delete Vehicle"
        message={`Are you sure you want to remove ${deleteConfirm?.make} ${deleteConfirm?.model}? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="#ef4444"
        onConfirm={onDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={deleting}
      />

      {/* FULL VEHICLE PHOTO LIGHTBOX MODAL */}
      <Modal
        visible={!!viewingPhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={styles.lightboxCard}>
            {/* Header */}
            <View style={styles.lightboxHeader}>
              <View style={styles.lightboxTitleWrap}>
                <FontAwesome name="car" size={16} color="#6366f1" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lightboxTitle} numberOfLines={1}>
                    {viewingPhoto?.title}
                  </Text>
                  <Text style={styles.lightboxSubtitle}>{viewingPhoto?.plate}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.lightboxCloseBtn}
                onPress={() => setViewingPhoto(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <FontAwesome name="times" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Photo Body */}
            <View style={styles.lightboxImageWrap}>
              {viewingPhoto?.url && (
                <Image
                  source={{ uri: viewingPhoto.url }}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                />
              )}
            </View>

            {/* Footer */}
            <View style={styles.lightboxFooter}>
              <TouchableOpacity
                style={styles.lightboxCloseBarBtn}
                onPress={() => setViewingPhoto(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.lightboxCloseBarText}>Close Full View</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    gap: 16,
  },
  vehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 2,
  },
  photoContainer: {
    height: 150,
    backgroundColor: '#f1f5f9',
    width: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    fontWeight: '500',
  },
  cardBody: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  plateText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
    marginTop: 2,
  },
  editBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  colorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  whiteColorDotBorder: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  dateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  tagIcon: {
    marginRight: 6,
  },
  metaTagText: {
    fontSize: 11,
    color: '#4b5563',
    fontWeight: '600',
  },
  renewalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  renewalIcon: {
    marginRight: 8,
  },
  renewalLabel: {
    fontSize: 12,
    fontWeight: '600',
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
    maxHeight: '85%',
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
  modalPhotoSelector: {
    height: 145,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  modalPhoto: {
    width: '100%',
    height: '100%',
  },
  modalPhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPhotoText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 8,
  },
  modalPhotoSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  modalPhotoChangeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  modalPhotoChangeText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  colHalf: {
    flex: 1,
  },
  datePickerTrigger: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 11,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  datePickerTriggerActive: {
    borderColor: '#93c5fd',
    backgroundColor: '#f8fafc',
  },
  datePickerTriggerText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#111827',
  },
  datePickerPlaceholder: {
    color: '#9ca3af',
    fontWeight: '400',
  },
  ltoFootnoteBox: {
    marginTop: 2,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
  },
  ltoFootnoteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  ltoFootnoteTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ltoFootnoteTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  ltoFreeSmsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ltoFreeSmsPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  ltoFootnoteText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  modalFooterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    marginTop: 4,
  },
  deleteLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
  },
  deleteLinkText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  modalRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelOutlineBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelOutlineText: {
    color: '#374151',
    fontSize: 13.5,
    fontWeight: '600',
  },
  savePrimaryBtn: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 124,
  },
  savePrimaryText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  calOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    zIndex: 50,
  },
  calSheet: {
    width: '100%',
    maxWidth: 370,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  calTopSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  calTopLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 2,
  },
  calTopSelected: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  calCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calNavArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthYearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  calMonthYearText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calWeekCell: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  calWeekText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  calDayPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayPillToday: {
    borderWidth: 1.5,
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  calDayPillSelected: {
    backgroundColor: '#2563eb',
  },
  calDayText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1e293b',
  },
  calDayTextToday: {
    color: '#2563eb',
    fontWeight: '700',
  },
  calDayTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  calJumpContainer: {
    paddingVertical: 6,
  },
  calJumpSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
  },
  calMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  calMonthChip: {
    width: '23%',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  calMonthChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  calMonthChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  calMonthChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  calYearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  calYearChip: {
    width: '23%',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  calYearChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  calYearChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  calYearChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  calFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  calFooterSecondaryBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  calFooterSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  calFooterTodayBtn: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  calFooterTodayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  calFooterDoneBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  calFooterDoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  photoTouchArea: {
    width: '100%',
    height: '100%',
  },
  photoExpandBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  photoExpandText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  photoChangeBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#2563eb',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  lightboxCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  lightboxTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  lightboxTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  lightboxSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  lightboxCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImageWrap: {
    width: '100%',
    height: 320,
    backgroundColor: '#050811',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxFooter: {
    padding: 14,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  lightboxCloseBarBtn: {
    backgroundColor: '#334155',
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseBarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
