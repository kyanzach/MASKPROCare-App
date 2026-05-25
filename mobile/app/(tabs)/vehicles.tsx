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
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import AlertBanner from '@/components/ui/AlertBanner';
import ConfirmModal from '@/components/ui/ConfirmModal';
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

export default function VehiclesScreen() {
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadVehicles();
  }, []);

  const triggerAlert = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
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
      triggerAlert('error', 'Permission to access media library is required.');
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
    } catch (err) {
      console.error('Photo upload failed:', err);
      throw new Error('Failed to upload photo');
    }
  };

  const handleCardPhotoUpload = async (vehicleId: number) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      triggerAlert('error', 'Permission to access media library is required.');
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
        triggerAlert('success', 'Vehicle photo updated successfully!');
        loadVehicles();
      } catch (err: any) {
        triggerAlert('error', err.message || 'Failed to upload photo.');
      } finally {
        setUploadingId(null);
      }
    }
  };

  const handleSubmit = async () => {
    if (!form.make || !form.model) {
      setError('Make and Model are required.');
      return;
    }
    
    // Validate registration date format if provided
    if (form.registration_date) {
      const parts = form.registration_date.split('-');
      if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) {
        setError('Date must be in YYYY-MM-DD format.');
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
        triggerAlert('success', 'Vehicle updated successfully!');
      } else {
        const res = await client.post('/vehicles/create', form);
        vehicleId = res.data?.data?.vehicle?.id;
        triggerAlert('success', 'Vehicle added successfully!');
      }

      if (modalPhotoUri && vehicleId) {
        await uploadPhoto(vehicleId, modalPhotoUri);
      }

      setShowModal(false);
      loadVehicles();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save vehicle.');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await client.post('/vehicles/delete', { id: deleteConfirm.id });
      triggerAlert('success', 'Vehicle deleted successfully!');
      setDeleteConfirm(null);
      loadVehicles();
    } catch (err: any) {
      triggerAlert('error', err.response?.data?.message || 'Failed to delete vehicle.');
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Vehicles</Text>
          <TouchableOpacity style={styles.addButton} onPress={openAdd} activeOpacity={0.8}>
            <LinearGradient
              colors={['#4f46e5', '#6366f1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButtonGradient}
            >
              <FontAwesome name="plus" size={12} color="#ffffff" style={styles.addIcon} />
              <Text style={styles.addButtonText}>Add Vehicle</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Alerts */}
        <AlertBanner message={success} type="success" onDismiss={() => setSuccess('')} autoDismissMs={4000} />
        <AlertBanner message={error} type="error" onDismiss={() => setError('')} autoDismissMs={5000} />

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
                  <TouchableOpacity
                    style={styles.photoContainer}
                    onPress={() => handleCardPhotoUpload(v.id)}
                    disabled={uploadingId === v.id}
                  >
                    {uploadingId === v.id ? (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text style={styles.uploadText}>Uploading...</Text>
                      </View>
                    ) : photoUrl ? (
                      <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <FontAwesome name="car" size={32} color="#cbd5e1" />
                        <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
                      </View>
                    )}
                  </TouchableOpacity>

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
              {error ? (
                <AlertBanner message={error} type="error" onDismiss={() => setError('')} />
              ) : null}

              {/* Photo Selector */}
              <TouchableOpacity style={styles.modalPhotoSelector} onPress={handlePickImage}>
                {modalPhotoUri ? (
                  <Image source={{ uri: modalPhotoUri }} style={styles.modalPhoto} resizeMode="cover" />
                ) : editVehicle?.photo ? (
                  <Image source={{ uri: getPhotoUrl(editVehicle.photo) || '' }} style={styles.modalPhoto} resizeMode="cover" />
                ) : (
                  <View style={styles.modalPhotoPlaceholder}>
                    <FontAwesome name="camera" size={24} color="#6b7280" />
                    <Text style={styles.modalPhotoText}>Select Vehicle Photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Input fields */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Make *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Toyota, Honda"
                  value={form.make}
                  onChangeText={(val) => setForm({ ...form, make: val })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Model *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Vios, Civic, Fortuner"
                  value={form.model}
                  onChangeText={(val) => setForm({ ...form, model: val })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Plate Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. ABC 1234 / GE1234"
                  autoCapitalize="characters"
                  value={form.plate_no}
                  onChangeText={(val) => setForm({ ...form, plate_no: val })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Color</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. White, Black, Red"
                  value={form.color}
                  onChangeText={(val) => setForm({ ...form, color: val })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Registration Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="YYYY-MM-DD (e.g. 2024-05-25)"
                  value={form.registration_date}
                  onChangeText={(val) => setForm({ ...form, registration_date: val })}
                />
                <Text style={styles.inputHelper}>
                  Used to notify you about annual LTO registration renewals.
                </Text>
              </View>

              {/* Action buttons inside form */}
              <View style={styles.modalActions}>
                {editVehicle ? (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleDeleteFromModal}
                    disabled={saving}
                  >
                    <FontAwesome name="trash" size={14} color="#ef4444" style={styles.actionBtnIcon} />
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.saveButton, { flex: editVehicle ? 2 : 1 }]}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Vehicle</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    height: 160,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
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
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  inputHelper: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnIcon: {
    marginRight: 6,
  },
});
