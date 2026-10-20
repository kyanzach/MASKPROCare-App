import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';

interface CustomerItem {
  id: number;
  full_name: string;
  mobile_number: string;
  email?: string;
  branch_id?: number;
  booking_count: number;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminPanelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, startImpersonation, logout } = useAuth();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 30,
    totalPages: 1,
  });

  const [confirmModal, setConfirmModal] = useState<{
    customerId: number;
    customerName: string;
  } | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [errorToast, setErrorToast] = useState('');

  const searchTimeoutRef = useRef<any>(null);

  // Check admin authorization on mount
  useEffect(() => {
    let isMounted = true;
    const verifyAdmin = async () => {
      try {
        const res = await client.get('/admin/check');
        if (isMounted) {
          if (res.data?.data?.isAdmin) {
            setIsAdmin(true);
            loadCustomers(1, '');
          } else {
            setIsAdmin(false);
          }
        }
      } catch {
        if (isMounted) setIsAdmin(false);
      }
    };

    verifyAdmin();
    return () => {
      isMounted = false;
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const loadCustomers = async (p = 1, q = '', isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await client.get(
        `/admin/customers?page=${p}&limit=30&search=${encodeURIComponent(q)}`
      );
      if (res.data?.success) {
        setCustomers(res.data.data.customers || []);
        setPagination(res.data.data.pagination);
        setPage(p);
      }
    } catch (err: any) {
      console.error('[Admin] Load customers error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadCustomers(1, text);
    }, 350);
  };

  const handleClearSearch = () => {
    setSearch('');
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    loadCustomers(1, '');
  };

  const handleImpersonatePress = (customerId: number, customerName: string) => {
    if (impersonating) return;
    setConfirmModal({ customerId, customerName });
  };

  const confirmImpersonate = async () => {
    if (!confirmModal) return;
    const { customerId, customerName } = confirmModal;
    setImpersonating(true);

    try {
      const res = await client.post('/admin/impersonate', { customer_id: customerId });
      if (res.data?.success) {
        const { token, customer, impersonatedBy } = res.data.data;
        const currentAdminToken =
          (await SecureStore.getItemAsync('admin_token')) ||
          (await SecureStore.getItemAsync('mpc_token')) ||
          '';

        await startImpersonation(token, customer, {
          originalToken: currentAdminToken,
          originalCustomer: JSON.stringify(user || {}),
          impersonatedBy: impersonatedBy || 'Admin',
          customerName: customer.full_name || customerName,
        });

        setConfirmModal(null);
      } else {
        setErrorToast(res.data?.message || 'Failed to impersonate customer');
        setTimeout(() => setErrorToast(''), 3500);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Impersonation request failed';
      setErrorToast(msg);
      setTimeout(() => setErrorToast(''), 3500);
    } finally {
      setImpersonating(false);
    }
  };

  const handleExitAdmin = async () => {
    await logout();
    router.replace('/login');
  };

  if (isAdmin === false) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <FontAwesome name="lock" size={48} color="#ef4444" />
        <Text style={styles.deniedTitle}>Admin Access Required</Text>
        <Text style={styles.deniedSubtitle}>
          Your account does not have admin permissions to view this directory.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={handleExitAdmin}>
          <Text style={styles.backButtonText}>Return to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerBadge}>
            <FontAwesome name="shield" size={16} color="#f59e0b" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSubtitle}>
              {pagination.total} customer{pagination.total === 1 ? '' : 's'} registered
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.exitAdminButton}
          onPress={handleExitAdmin}
          activeOpacity={0.7}
        >
          <FontAwesome name="sign-out" size={15} color="#94a3b8" />
          <Text style={styles.exitAdminText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Error Toast */}
      {errorToast ? (
        <View style={styles.errorToast}>
          <FontAwesome name="exclamation-circle" size={16} color="#ef4444" />
          <Text style={styles.errorToastText}>{errorToast}</Text>
        </View>
      ) : null}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <FontAwesome name="search" size={15} color="#64748b" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Search by name or mobile number..."
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={handleClearSearch} style={styles.clearSearchBtn}>
            <FontAwesome name="times-circle" size={16} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Customer Directory List */}
      {loading && !refreshing && customers.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>Loading directory...</Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => loadCustomers(1, search, true)}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FontAwesome name="users" size={42} color="#334155" />
              <Text style={styles.emptyText}>No customers found matching search</Text>
            </View>
          }
          renderItem={({ item }) => {
            const initials = item.full_name
              ? item.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
              : 'CU';

            return (
              <View style={styles.customerCard}>
                <View style={styles.cardHeaderRow}>
                  {/* Avatar Initials */}
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  {/* Customer Info */}
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {item.full_name || 'Unnamed Customer'}
                    </Text>
                    <Text style={styles.customerMobile}>{item.mobile_number || '—'}</Text>
                    {item.email ? (
                      <Text style={styles.customerEmail} numberOfLines={1}>
                        {item.email}
                      </Text>
                    ) : null}
                  </View>

                  {/* Booking count chip */}
                  <View style={styles.bookingChip}>
                    <Text style={styles.bookingChipText}>
                      {item.booking_count} {item.booking_count === 1 ? 'booking' : 'bookings'}
                    </Text>
                  </View>
                </View>

                {/* Impersonate Button */}
                <TouchableOpacity
                  style={styles.impersonateBtn}
                  onPress={() => handleImpersonatePress(item.id, item.full_name)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#f59e0b', '#fbbf24']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.impersonateGradient}
                  >
                    <FontAwesome name="eye" size={13} color="#78350f" />
                    <Text style={styles.impersonateText}>Impersonate</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Impersonation Confirmation Modal (No native alert/confirm per Rule 14) */}
      <Modal
        visible={!!confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!impersonating) setConfirmModal(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <FontAwesome name="user-secret" size={26} color="#78350f" />
            </View>

            <Text style={styles.modalTitle}>Impersonate Customer</Text>
            <Text style={styles.modalDescription}>
              You will view and interact with the app as{' '}
              <Text style={styles.modalBoldName}>
                {confirmModal?.customerName || 'this customer'}
              </Text>
              . You can exit anytime via the top banner.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setConfirmModal(null)}
                disabled={impersonating}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmModalBtn}
                onPress={confirmImpersonate}
                disabled={impersonating}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#f59e0b', '#fbbf24']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmModalGradient}
                >
                  {impersonating ? (
                    <ActivityIndicator size="small" color="#78350f" />
                  ) : (
                    <Text style={styles.confirmModalText}>Start Impersonating</Text>
                  )}
                </LinearGradient>
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
    backgroundColor: '#0f172a',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.6)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  exitAdminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.4)',
  },
  exitAdminText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  errorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#450a0a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorToastText: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 48,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    height: '100%',
  },
  clearSearchBtn: {
    padding: 6,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 15,
  },
  customerCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginRight: 12,
  },
  avatarText: {
    color: '#60a5fa',
    fontSize: 15,
    fontWeight: '700',
  },
  customerInfo: {
    flex: 1,
    marginRight: 8,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  customerMobile: {
    fontSize: 13,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  customerEmail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  bookingChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bookingChipText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '600',
  },
  impersonateBtn: {
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
  },
  impersonateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  impersonateText: {
    color: '#78350f',
    fontSize: 13,
    fontWeight: '700',
  },
  deniedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 6,
  },
  deniedSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1e293b',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#fbbf24',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  modalBoldName: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelModalText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmModalBtn: {
    flex: 1.4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmModalGradient: {
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalText: {
    color: '#78350f',
    fontSize: 14,
    fontWeight: '700',
  },
});
