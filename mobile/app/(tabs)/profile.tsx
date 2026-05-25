import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import AlertBanner from '@/components/ui/AlertBanner';
import PDF417Barcode from '@/components/ui/PDF417Barcode';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentProps<typeof FontAwesome>['name']; colors: [string, string] }> = {
  coating: { label: 'Nano Ceramic Coating', icon: 'shield', colors: ['#3b82f6', '#6366f1'] },
  tint:    { label: 'Nano Ceramic Tint',    icon: 'sun-o', colors: ['#0ea5e9', '#38bdf8'] },
  ppf:     { label: 'Paint Protection Film', icon: 'fire', colors: ['#ef4444', '#f97316'] },
  wash:    { label: 'Care Wash',             icon: 'star', colors: ['#10b981', '#34d399'] },
  gift:    { label: 'Gift Card',             icon: 'gift', colors: ['#8b5cf6', '#a78bfa'] },
  other:   { label: 'Other',                 icon: 'file-text-o', colors: ['#64748b', '#94a3b8'] },
};

const CATEGORY_ORDER = ['coating', 'tint', 'ppf', 'wash', 'gift', 'other'];

function getCounterLabel(category: string) {
  switch (category) {
    case 'coating':
    case 'ppf':
      return 'Credits Used';
    case 'tint':
      return 'Earned Points';
    default:
      return 'Visits Used';
  }
}

function getStampLabel(category: string) {
  switch (category) {
    case 'coating':
      return 'Maintenance Credits';
    default:
      return 'Stamp Progress';
  }
}

function getEmptyLabel(category: string) {
  switch (category) {
    case 'tint':
      return 'No points recorded yet';
    default:
      return 'No visits recorded yet';
  }
}

interface ProfileData {
  id: number;
  full_name: string;
  email: string;
  address: string;
  mobile_number: string;
  preferred_branch?: string;
  birthday?: string;
  profile_photo?: string | null;
}

interface LoyaltyCard {
  id: number;
  category: string;
  service: string;
  tier: string;
  expiresAt: string | null;
  visitsUsed: number;
  visitsTotal: number;
  stampsTotal?: number;
  rewardsUnused: number;
  bonusBalance: number;
  vehicle?: string;
  branch?: string;
  qrLink?: string;
  installLink?: string;
  shortLink?: string;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://care.maskpro.ph/api';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'loyalty'>('profile');

  // Profile data
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [stats, setStats] = useState({ vehicles: 0, bookings: 0, completed: 0 });

  // Profile Form state
  const [form, setForm] = useState({ full_name: '', email: '', address: '' });

  // Loyalty Card data
  const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>([]);
  const [loyaltyGrouped, setLoyaltyGrouped] = useState<Record<string, LoyaltyCard[]>>({});
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null);

  // Alerts
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const triggerAlert = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
  };

  const loadProfile = async () => {
    try {
      const [profileRes, statsRes] = await Promise.all([
        client.get('/profile/get'),
        client.get('/dashboard/stats'),
      ]);
      const p = profileRes.data?.data?.customer || profileRes.data?.data;
      setProfile(p);
      setForm({
        full_name: p?.full_name || '',
        email: p?.email || '',
        address: p?.address || '',
      });

      const profileStats = profileRes.data?.data?.stats;
      const dashStats = statsRes.data?.data?.stats;
      setStats({
        vehicles: profileStats?.total_vehicles ?? dashStats?.total_vehicles ?? 0,
        bookings: profileStats?.total_bookings ?? (dashStats?.upcoming_bookings ?? 0) + (dashStats?.completed_services ?? 0),
        completed: profileStats?.completed_services ?? dashStats?.completed_services ?? 0,
      });
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadLoyaltyCards = async () => {
    setLoyaltyLoading(true);
    try {
      const res = await client.get('/loyalty/cards');
      if (res.data?.success) {
        setLoyaltyCards(res.data?.data?.cards || []);
        setLoyaltyGrouped(res.data?.data?.grouped || {});
      } else {
        setLoyaltyCards([]);
        setLoyaltyGrouped({});
      }
    } catch (err) {
      console.error('Failed to load loyalty cards:', err);
      setLoyaltyCards([]);
      setLoyaltyGrouped({});
    } finally {
      setLoyaltyLoading(false);
      setLoyaltyLoaded(true);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Lazy load loyalty cards when switching tabs
  useEffect(() => {
    if (activeTab === 'loyalty' && !loyaltyLoaded) {
      loadLoyaltyCards();
    }
  }, [activeTab, loyaltyLoaded]);

  const handleSaveProfile = async () => {
    if (!form.full_name) {
      setError('Full Name is required.');
      return;
    }
    setSavingProfile(true);
    setError('');
    try {
      await client.put('/profile/update', form);
      triggerAlert('success', 'Profile updated successfully!');
      setEditing(false);
      loadProfile();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePhotoUpload = async () => {
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
      setProfilePhotoUploading(true);
      setError('');
      try {
        const uri = result.assets[0].uri;
        const formData = new FormData();
        const uriParts = uri.split('/');
        const fileName = uriParts[uriParts.length - 1] || 'photo.jpg';

        formData.append('photo', {
          uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
          name: fileName,
          type: 'image/jpeg',
        } as any);

        const res = await client.post('/profile/photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data?.success) {
          triggerAlert('success', 'Profile photo updated!');
          loadProfile();
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to upload photo.');
      } finally {
        setProfilePhotoUploading(false);
      }
    }
  };

  const handlePhotoRemove = async () => {
    setProfilePhotoUploading(true);
    setError('');
    try {
      await client.delete('/profile/photo');
      triggerAlert('success', 'Profile photo removed.');
      loadProfile();
    } catch (err) {
      setError('Failed to remove photo.');
    } finally {
      setProfilePhotoUploading(false);
    }
  };

  const getPhotoUrl = (photoPath?: string | null) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    
    const rootBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
    return `${rootBase}/${photoPath}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No expiry';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const isExpired = (dateStr: string | null) => {
    if (!dateStr) return false;
    try {
      return new Date(dateStr) < new Date();
    } catch {
      return false;
    }
  };

  const handleOpenLink = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch((err) => console.error('Failed to open link:', err));
  };

  const renderStampsGrid = (card: LoyaltyCard, catMeta: typeof CATEGORY_META[string]) => {
    const total = card.visitsTotal || card.stampsTotal || 0;
    const used = card.visitsUsed || 0;
    if (total <= 0) return null;

    return (
      <View style={styles.stampsContainer}>
        <Text style={styles.stampsLabel}>{getStampLabel(card.category)}</Text>
        <View style={styles.stampsGrid}>
          {Array.from({ length: total }, (_, i) => {
            const isUsed = i < used;
            let bgColors: [string, string];
            let iconColor: string;
            let opacity = 1;

            if (card.category === 'coating' || card.category === 'ppf') {
              bgColors = isUsed ? ['#e2e8f0', '#cbd5e1'] : catMeta.colors;
              iconColor = isUsed ? '#94a3b8' : '#ffffff';
              opacity = isUsed ? 0.5 : 1;
            } else {
              bgColors = isUsed ? catMeta.colors : ['#f1f5f9', '#e2e8f0'];
              iconColor = isUsed ? '#ffffff' : '#cbd5e1';
            }

            return (
              <LinearGradient
                key={i}
                colors={bgColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.stampCell, { opacity }]}
              >
                <FontAwesome name={catMeta.icon} size={14} color={iconColor} />
              </LinearGradient>
            );
          })}
        </View>
      </View>
    );
  };

  if (loadingProfile) {
    return <LoadingSpinner message="Loading profile..." />;
  }

  const initials = (profile?.full_name || 'User')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.container}>
      {/* Segmented Control Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
          onPress={() => setActiveTab('profile')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'profile' && styles.tabButtonTextActive]}>
            Profile
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'loyalty' && styles.tabButtonActive]}
          onPress={() => setActiveTab('loyalty')}
        >
          <View style={styles.loyaltyTabTitle}>
            <Text style={[styles.tabButtonText, activeTab === 'loyalty' && styles.tabButtonTextActive]}>
              Loyalty Cards
            </Text>
            {loyaltyCards.length > 0 ? (
              <View style={styles.loyaltyBadge}>
                <Text style={styles.loyaltyBadgeText}>{loyaltyCards.length}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Success/Error Alerts */}
        <AlertBanner message={success} type="success" onDismiss={() => setSuccess('')} autoDismissMs={3000} />
        <AlertBanner message={error} type="error" onDismiss={() => setError('')} autoDismissMs={4000} />

        {activeTab === 'profile' ? (
          /* ================= PROFILE TAB ================= */
          <View style={styles.profileTabContent}>
            {/* User Card */}
            <View style={styles.userCard}>
              <View style={styles.avatarWrapper}>
                {profilePhotoUploading ? (
                  <View style={styles.avatarLoading}>
                    <ActivityIndicator size="small" color="#4f46e5" />
                  </View>
                ) : getPhotoUrl(profile?.profile_photo) ? (
                  <Image source={{ uri: getPhotoUrl(profile?.profile_photo) || '' }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarInitials}>
                    <Text style={styles.avatarInitialsText}>{initials}</Text>
                  </View>
                )}
                
                <TouchableOpacity style={styles.avatarEditBtn} onPress={handlePhotoUpload}>
                  <FontAwesome name="camera" size={12} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {profile?.profile_photo ? (
                <TouchableOpacity style={styles.removePhotoBtn} onPress={handlePhotoRemove}>
                  <Text style={styles.removePhotoBtnText}>Remove Photo</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.profileName}>{profile?.full_name}</Text>
              <Text style={styles.profileMobile}>{profile?.mobile_number}</Text>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>{stats.vehicles}</Text>
                <Text style={styles.statsLabel}>Vehicles</Text>
              </View>
              <View style={styles.verticalDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>{stats.bookings}</Text>
                <Text style={styles.statsLabel}>Bookings</Text>
              </View>
              <View style={styles.verticalDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>{stats.completed}</Text>
                <Text style={styles.statsLabel}>Completed</Text>
              </View>
            </View>

            {/* Profile Info Details */}
            {editing ? (
              <View style={styles.detailsCard}>
                <Text style={styles.detailsHeader}>Edit Personal Info</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.full_name}
                    onChangeText={(val) => setForm({ ...form, full_name: val })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.email}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={(val) => setForm({ ...form, email: val })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Address</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.address}
                    onChangeText={(val) => setForm({ ...form, address: val })}
                  />
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={styles.cancelFormBtn}
                    onPress={() => setEditing(false)}
                    disabled={savingProfile}
                  >
                    <Text style={styles.cancelFormBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveFormBtn}
                    onPress={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveFormBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.detailsCard}>
                <View style={styles.detailsHeaderRow}>
                  <Text style={styles.detailsHeader}>Account Details</Text>
                  <TouchableOpacity style={styles.editDetailsBtn} onPress={() => setEditing(true)}>
                    <FontAwesome name="pencil" size={14} color="#4f46e5" style={styles.editBtnIcon} />
                    <Text style={styles.editDetailsBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.infoField}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profile?.email || 'Not specified'}</Text>
                </View>

                <View style={styles.infoField}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{profile?.address || 'Not specified'}</Text>
                </View>

                <View style={styles.infoField}>
                  <Text style={styles.infoLabel}>Preferred Branch</Text>
                  <Text style={styles.infoValue}>{profile?.preferred_branch || 'Not set'}</Text>
                </View>

                <View style={styles.infoField}>
                  <Text style={styles.infoLabel}>Birthday</Text>
                  <Text style={styles.infoValue}>{profile?.birthday || 'Not specified'}</Text>
                </View>
              </View>
            )}

            {/* Logout button */}
            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <FontAwesome name="sign-out" size={16} color="#ef4444" style={styles.logoutIcon} />
              <Text style={styles.logoutBtnText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ================= LOYALTY TAB ================= */
          <View style={styles.loyaltyTabContent}>
            {loyaltyLoading ? (
              <ActivityIndicator size="large" color="#4f46e5" style={styles.loyaltyLoader} />
            ) : loyaltyCards.length > 0 ? (
              <View style={styles.cardsContainer}>
                {CATEGORY_ORDER.map((category) => {
                  const catCards = loyaltyGrouped[category];
                  if (!catCards || catCards.length === 0) return null;

                  return catCards.map((card) => {
                    const catMeta = CATEGORY_META[card.category] || CATEGORY_META.other;
                    const expired = isExpired(card.expiresAt);

                    return (
                      <TouchableOpacity
                        key={card.id}
                        style={[styles.loyaltyCard, expired && styles.loyaltyCardExpired]}
                        onPress={() => setSelectedCard(card)}
                        activeOpacity={0.9}
                      >
                        {/* Header */}
                        <LinearGradient
                          colors={catMeta.colors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.cardHeaderBg}
                        >
                          <View style={styles.cardHeaderLeft}>
                            <Text style={styles.cardServiceLabel}>{card.service}</Text>
                            <Text style={styles.cardTierLabel}>{card.tier}</Text>
                          </View>
                          <View style={styles.cardHeaderIcon}>
                            <FontAwesome name={catMeta.icon} size={22} color="#ffffff" />
                          </View>
                        </LinearGradient>

                        {/* Body */}
                        <View style={styles.loyaltyCardBody}>
                          <View style={styles.cardCounterRow}>
                            <View>
                              <Text style={styles.counterLabel}>{getCounterLabel(card.category)}</Text>
                              <Text style={styles.counterValue}>
                                {card.visitsUsed}
                                {card.visitsTotal > 0 ? (
                                  <Text style={styles.counterMax}> out of {card.visitsTotal}</Text>
                                ) : null}
                              </Text>
                            </View>
                            
                            {card.rewardsUnused > 0 ? (
                              <View style={styles.rewardsBadge}>
                                <FontAwesome name="gift" size={12} color="#ffffff" style={styles.giftIcon} />
                                <Text style={styles.rewardsBadgeText}>
                                  {card.rewardsUnused} Reward{card.rewardsUnused > 1 ? 's' : ''}
                                </Text>
                              </View>
                            ) : null}

                            {(card.category === 'coating' || (card.category === 'ppf' && card.tier === 'Maintenance Membership')) && card.bonusBalance > 0 ? (
                              <View style={styles.pointsBadge}>
                                <Text style={styles.pointsLabel}>Earned Points</Text>
                                <Text style={styles.pointsValue}>{card.bonusBalance}</Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Stamps */}
                          {card.visitsTotal > 0 ? renderStampsGrid(card, catMeta) : null}

                          {/* Empty Visited message */}
                          {card.visitsUsed === 0 ? (
                            <View style={styles.emptyCardMessage}>
                              <FontAwesome name="tag" size={16} color="#94a3b8" />
                              <Text style={styles.emptyCardMessageText}>{getEmptyLabel(card.category)}</Text>
                            </View>
                          ) : null}

                          {/* Expiry line */}
                          {card.expiresAt ? (
                            <Text style={[styles.expiryText, expired && styles.expiryTextExpired]}>
                              {expired ? 'Expired' : 'Expires'}: {formatDate(card.expiresAt)}
                            </Text>
                          ) : null}

                          {/* Small Barcode and card metadata */}
                          <View style={styles.barcodeWrapper}>
                            <PDF417Barcode text={String(card.id)} height={8} />
                            <Text style={styles.cardIdFooter}>Card #{card.id}</Text>
                            <View style={styles.tapHint}>
                              <FontAwesome name="hand-o-up" size={12} color="#cbd5e1" style={styles.tapIcon} />
                              <Text style={styles.tapHintText}>Tap to view details & wallet links</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  });
                })}
              </View>
            ) : (
              <EmptyState
                icon="credit-card"
                title="No loyalty cards yet"
                description="Your loyalty and warranty cards will show up here after service completion."
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* CARD DETAIL POPUP MODAL */}
      <Modal visible={selectedCard !== null} transparent animationType="fade" onRequestClose={() => setSelectedCard(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedCard ? (
              <View>
                {/* Header */}
                <LinearGradient
                  colors={CATEGORY_META[selectedCard.category]?.colors || CATEGORY_META.other.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalHeaderBg}
                >
                  <View style={styles.modalHeaderMeta}>
                    <Text style={styles.modalCardCategory}>Warranty & Maintenance Card</Text>
                    <Text style={styles.modalCardTitle}>{selectedCard.service}</Text>
                    <Text style={styles.modalCardSubtitle}>{selectedCard.tier}</Text>
                  </View>
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedCard(null)}>
                    <FontAwesome name="times" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </LinearGradient>

                <ScrollView contentContainerStyle={styles.modalBody}>
                  {/* Big Barcode */}
                  <View style={styles.modalBarcodeSection}>
                    <PDF417Barcode text={String(selectedCard.id)} scale={3} height={12} />
                    <Text style={styles.modalBarcodeId}>Card #{selectedCard.id}</Text>
                  </View>

                  {/* Detail Grid */}
                  <View style={styles.modalGrid}>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Vehicle</Text>
                      <Text style={styles.gridValue}>{selectedCard.vehicle || 'N/A'}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Branch</Text>
                      <Text style={styles.gridValue}>{selectedCard.branch || 'N/A'}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>{getCounterLabel(selectedCard.category)}</Text>
                      <Text style={styles.gridValue}>
                        {selectedCard.visitsUsed}
                        {selectedCard.visitsTotal > 0 ? ` / ${selectedCard.visitsTotal}` : ''}
                      </Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.gridLabel}>Expiry Date</Text>
                      <Text style={styles.gridValue}>{formatDate(selectedCard.expiresAt)}</Text>
                    </View>
                  </View>

                  {/* Terms & Conditions */}
                  <View style={styles.termsCard}>
                    <Text style={styles.termsTitle}>Terms of Use</Text>
                    <View style={styles.termsList}>
                      <Text style={styles.termItem}>1. This card contains free maintenance stamps/visits that come with your package. One stamp can be claimed every six months until your warranty ends.</Text>
                      <Text style={styles.termItem}>2. Earn (25) points every time you redeem a stamp/visit. Once your points reach (100), you qualify for an extra free (1) stamp/visit.</Text>
                      <Text style={styles.termItem}>3. Cards, stamps/visits, and points cannot be traded, returned, replaced, or converted into cash.</Text>
                      <Text style={styles.termItem}>4. Each card is issued for a specific customer and their vehicle and cannot be transferred or combined with other cards.</Text>
                      <Text style={styles.termItem}>5. MaskPro holds the right to deny services if deemed necessary.</Text>
                    </View>
                  </View>

                  {/* QR Code / Install links */}
                  {selectedCard.qrLink || selectedCard.installLink || selectedCard.shortLink ? (
                    <View style={styles.walletCard}>
                      <Text style={styles.walletTitle}>Install Wallet Card</Text>
                      {selectedCard.qrLink ? (
                        <Image source={{ uri: selectedCard.qrLink }} style={styles.walletQr} />
                      ) : null}
                      {selectedCard.installLink ? (
                        <TouchableOpacity
                          style={styles.walletLinkBtn}
                          onPress={() => handleOpenLink(selectedCard.installLink || '')}
                        >
                          <Text style={styles.walletLinkBtnText}>Download Wallet Pass</Text>
                        </TouchableOpacity>
                      ) : null}
                      {selectedCard.shortLink ? (
                        <TouchableOpacity
                          style={styles.walletLinkBtnOutline}
                          onPress={() => handleOpenLink(selectedCard.shortLink || '')}
                        >
                          <Text style={styles.walletLinkBtnOutlineText}>Open Short Link</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#f3f4f6',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabButtonTextActive: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  loyaltyTabTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loyaltyBadge: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileTabContent: {
    gap: 16,
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarLoading: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialsText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4f46e5',
  },
  avatarEditBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4f46e5',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  removePhotoBtn: {
    marginBottom: 8,
  },
  removePhotoBtnText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  profileMobile: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  statsLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  verticalDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#f3f4f6',
  },
  detailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailsHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  editDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editBtnIcon: {
    marginRight: 4,
  },
  editDetailsBtnText: {
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: '600',
  },
  infoField: {
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
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
    height: 42,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelFormBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  cancelFormBtnText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '600',
  },
  saveFormBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#4f46e5',
    minWidth: 60,
    alignItems: 'center',
  },
  saveFormBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fde2e2',
    borderRadius: 12,
    height: 46,
    marginTop: 8,
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  loyaltyTabContent: {
    gap: 16,
  },
  loyaltyLoader: {
    marginTop: 40,
  },
  cardsContainer: {
    gap: 20,
  },
  loyaltyCard: {
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
  loyaltyCardExpired: {
    opacity: 0.65,
    borderColor: '#fca5a5',
  },
  cardHeaderBg: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardServiceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTierLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  cardHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyCardBody: {
    padding: 16,
  },
  cardCounterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  counterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  counterValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 2,
  },
  counterMax: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  rewardsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  giftIcon: {
    marginRight: 4,
  },
  rewardsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  pointsBadge: {
    alignItems: 'flex-end',
  },
  pointsLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  pointsValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10b981',
  },
  stampsContainer: {
    marginBottom: 16,
  },
  stampsLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 8,
  },
  stampsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stampCell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 12,
  },
  emptyCardMessageText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  expiryText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 12,
  },
  expiryTextExpired: {
    color: '#ef4444',
  },
  barcodeWrapper: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
    alignItems: 'center',
  },
  cardIdFooter: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  tapIcon: {
    marginTop: 1,
  },
  tapHintText: {
    fontSize: 10,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderBg: {
    padding: 20,
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderMeta: {
    paddingRight: 24,
  },
  modalCardCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
  },
  modalCardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  modalBarcodeSection: {
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 16,
  },
  modalBarcodeId: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 6,
  },
  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    rowGap: 12,
  },
  gridCell: {
    width: '50%',
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  termsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  termsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  termsList: {
    gap: 6,
  },
  termItem: {
    fontSize: 10.5,
    color: '#64748b',
    lineHeight: 15,
  },
  walletCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  walletTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 12,
  },
  walletQr: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  walletLinkBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  walletLinkBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  walletLinkBtnOutline: {
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
  },
  walletLinkBtnOutlineText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '700',
  },
});
