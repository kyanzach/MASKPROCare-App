import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  StatusBar,
  RefreshControl,
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'moderation' | 'impersonate'>('dashboard');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Dashboard state
  const [dashData, setDashData] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Moderation state
  const [modFilter, setModFilter] = useState<'pending' | 'sos' | 'approved' | 'rejected'>('pending');
  const [modPosts, setModPosts] = useState<any[]>([]);
  const [modCounts, setModCounts] = useState<any>({ pending: 0, active_sos: 0, approved: 0, rejected: 0, total: 0 });
  const [modLoading, setModLoading] = useState(false);
  const [modActionLoading, setModActionLoading] = useState<string | null>(null);

  // Impersonation state
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
  const [toastMsg, setToastMsg] = useState('');

  const searchTimeoutRef = useRef<any>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  useEffect(() => {
    let isMounted = true;
    const verifyAdmin = async () => {
      try {
        const res = await client.get('/admin/check');
        if (isMounted) {
          if (res.data?.data?.isAdmin) {
            setIsAdmin(true);
            loadDashboard();
            loadModerationPosts('pending');
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

  const loadDashboard = async () => {
    setDashLoading(true);
    try {
      const res = await client.get('/admin/dashboard');
      if (res.data?.success) {
        setDashData(res.data.data);
      }
    } catch (err) {
      console.error('[Admin] Dashboard load error:', err);
    } finally {
      setDashLoading(false);
    }
  };

  const loadModerationPosts = async (filterVal = modFilter) => {
    setModLoading(true);
    try {
      const res = await client.get(`/admin/community/posts?filter=${encodeURIComponent(filterVal)}`);
      if (res.data?.success) {
        setModPosts(res.data.data.posts || []);
        setModCounts(res.data.data.counts || { pending: 0, active_sos: 0, approved: 0, rejected: 0, total: 0 });
      }
    } catch (err) {
      console.error('[Admin] Moderation load error:', err);
    } finally {
      setModLoading(false);
    }
  };

  const handleModerate = async (postId: number, action: string) => {
    setModActionLoading(`${postId}:${action}`);
    try {
      const res = await client.post('/admin/community/moderate', { post_id: postId, action });
      if (res.data?.success) {
        showToast(res.data.message || 'Updated');
        loadModerationPosts(modFilter);
        loadDashboard();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Moderation failed');
    } finally {
      setModActionLoading(null);
    }
  };

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
        showToast(res.data?.message || 'Failed to impersonate customer');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Impersonation request failed');
    } finally {
      setImpersonating(false);
    }
  };

  const handleExitAdmin = async () => {
    await logout();
    router.replace('/login');
  };

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    try {
      const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  if (isAdmin === false) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <FontAwesome name="lock" size={48} color="#ef4444" />
        <Text style={styles.deniedTitle}>Admin Access Required</Text>
        <Text style={styles.deniedSubtitle}>
          Your account does not have admin permissions.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={handleExitAdmin}>
          <Text style={styles.backButtonText}>Return to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const kpis = dashData?.kpis || {};
  const platforms = dashData?.platforms || [];
  const authMethods = dashData?.auth_methods || {};
  const activeUsers = dashData?.active_users || [];

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
              Analytics, Moderation & Impersonate
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.backToAppButton}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.7}
          >
            <FontAwesome name="arrow-left" size={12} color="#60a5fa" />
            <Text style={styles.backToAppText} numberOfLines={1}>App</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exitAdminButton}
            onPress={handleExitAdmin}
            activeOpacity={0.7}
          >
            <FontAwesome name="sign-out" size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3-Tab Segmented Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'dashboard' && styles.tabBtnActive]}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.8}
        >
          <FontAwesome name="bar-chart" size={12} color={activeTab === 'dashboard' ? '#fbbf24' : '#94a3b8'} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabBtnText, activeTab === 'dashboard' && styles.tabBtnTextActive]}>
            Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'moderation' && styles.tabBtnActive]}
          onPress={() => setActiveTab('moderation')}
          activeOpacity={0.8}
        >
          <FontAwesome name="shield" size={12} color={activeTab === 'moderation' ? '#fbbf24' : '#94a3b8'} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabBtnText, activeTab === 'moderation' && styles.tabBtnTextActive]}>
            Moderation {modCounts.pending > 0 ? `(${modCounts.pending})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'impersonate' && styles.tabBtnActive]}
          onPress={() => setActiveTab('impersonate')}
          activeOpacity={0.8}
        >
          <FontAwesome name="user-secret" size={12} color={activeTab === 'impersonate' ? '#fbbf24' : '#94a3b8'} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabBtnText, activeTab === 'impersonate' && styles.tabBtnTextActive]}>
            Impersonate
          </Text>
        </TouchableOpacity>
      </View>

      {toastMsg ? (
        <View style={styles.errorToast}>
          <FontAwesome name="info-circle" size={15} color="#fbbf24" />
          <Text style={styles.errorToastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* ═══════════════ TAB 1: DASHBOARD & ANALYTICS ═══════════════ */}
      {activeTab === 'dashboard' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl refreshing={dashLoading} onRefresh={loadDashboard} tintColor="#f59e0b" />
          }
        >
          {/* KPI Grid */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Customers</Text>
              <Text style={styles.kpiValue}>{(kpis.total_customers || 0).toLocaleString()}</Text>
              <Text style={styles.kpiSub}>{(kpis.total_vehicles || 0).toLocaleString()} vehicles</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Active App Users</Text>
              <Text style={[styles.kpiValue, { color: '#34d399' }]}>{kpis.active_app_users || 0}</Text>
              <Text style={styles.kpiSub}>{kpis.total_sessions || 0} sessions</Text>
            </View>
            <TouchableOpacity
              style={[styles.kpiCard, kpis.pending_moderation_count > 0 && { borderColor: '#f59e0b' }]}
              onPress={() => { setModFilter('pending'); setActiveTab('moderation'); }}
            >
              <Text style={styles.kpiLabel}>Pending Approval</Text>
              <Text style={[styles.kpiValue, { color: '#fbbf24' }]}>{kpis.pending_moderation_count || 0}</Text>
              <Text style={styles.kpiSub}>Tap to moderate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kpiCard, kpis.active_sos_count > 0 && { borderColor: '#ef4444' }]}
              onPress={() => { setModFilter('sos'); setActiveTab('moderation'); }}
            >
              <Text style={styles.kpiLabel}>Active S.O.S.</Text>
              <Text style={[styles.kpiValue, { color: '#f87171' }]}>{kpis.active_sos_count || 0}</Text>
              <Text style={styles.kpiSub}>Roadside alerts</Text>
            </TouchableOpacity>
          </View>

          {/* Platform Breakdown */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Platform Breakdown (Web, Android, iOS)</Text>
            {platforms.map((p: any) => {
              const icon = p.platform === 'android' ? 'android' : p.platform === 'ios' ? 'apple' : 'globe';
              const color = p.platform === 'android' ? '#34d399' : p.platform === 'ios' ? '#e2e8f0' : '#60a5fa';
              return (
                <View key={p.platform} style={styles.platformRow}>
                  <View style={[styles.platformIconBox, { borderColor: color }]}>
                    <FontAwesome name={icon as any} size={16} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.platformTitle}>{p.label}</Text>
                      <Text style={[styles.platformShare, { color }]}>{p.share_pct || 0}%</Text>
                    </View>
                    <Text style={styles.platformMeta}>
                      {p.unique_users} users • {p.total_sessions} sessions • {p.total_api_hits} hits
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Auth Funnel */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Authentication & Login Methods</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={styles.authMiniBox}>
                <Text style={styles.authMiniValue}>{authMethods.magic_link?.links_opened || 0}</Text>
                <Text style={styles.authMiniLabel}>Magic Links</Text>
              </View>
              <View style={styles.authMiniBox}>
                <Text style={styles.authMiniValue}>{authMethods.otp?.verified_logins || 0}</Text>
                <Text style={styles.authMiniLabel}>SMS OTP</Text>
              </View>
              <View style={styles.authMiniBox}>
                <Text style={styles.authMiniValue}>{authMethods.ai_verification?.verified_logins || 0}</Text>
                <Text style={styles.authMiniLabel}>AI Logins</Text>
              </View>
            </View>
          </View>

          {/* Who Uses the App */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Who Uses the App (Recent Active Users)</Text>
            {activeUsers.map((u: any) => (
              <View key={u.telemetry_id} style={styles.activeUserRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.activeUserName}>{u.full_name}</Text>
                  <Text style={styles.activeUserSub}>
                    {u.platform?.toUpperCase()} • {u.device_label || u.app_type} • {timeAgo(u.last_seen_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.miniImpBtn}
                  onPress={() => handleImpersonatePress(u.customer_id, u.full_name)}
                >
                  <Text style={styles.miniImpBtnText}>Login as</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ═══════════════ TAB 2: COMMUNITY MODERATION ═══════════════ */}
      {activeTab === 'moderation' && (
        <View style={{ flex: 1 }}>
          <View style={styles.filterRow}>
            {(['pending', 'sos', 'approved', 'rejected'] as const).map((f) => {
              const active = modFilter === f;
              const label =
                f === 'pending'
                  ? `Pending (${modCounts.pending || 0})`
                  : f === 'sos'
                  ? `S.O.S. (${modCounts.active_sos || 0})`
                  : f === 'approved'
                  ? `Approved (${modCounts.approved || 0})`
                  : `Rejected`;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                  onPress={() => { setModFilter(f); loadModerationPosts(f); }}
                >
                  <Text numberOfLines={1} style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {modLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#f59e0b" />
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={modPosts}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <FontAwesome name="check-circle" size={40} color="#10b981" />
                  <Text style={styles.emptyText}>No posts in this moderation queue</Text>
                </View>
              }
              renderItem={({ item: post }) => {
                const isSos = post.type === 'sos';
                const isPending = post.moderation_status === 'pending';
                const isApproved = post.is_approved === 1 && post.moderation_status === 'approved';
                return (
                  <View style={[styles.customerCard, isPending && { borderColor: '#f59e0b' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: isSos ? '#f87171' : '#60a5fa' }}>
                        {isSos ? 'MASKPRO S.O.S.' : 'MAINTENANCE DISCUSSION'}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isPending ? '#fbbf24' : '#34d399' }}>
                        {isPending ? 'Pending Approval' : isApproved ? 'Approved' : 'Rejected'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 4 }}>{post.title}</Text>
                    <Text style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                      By {post.author_name} ({post.author_mobile || 'N/A'}) • {timeAgo(post.created_at)}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 19, marginBottom: 12 }}>{post.body}</Text>

                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {(!isApproved || isPending) && (
                        <TouchableOpacity
                          style={[styles.modBtn, { backgroundColor: '#10b981' }]}
                          disabled={!!modActionLoading}
                          onPress={() => handleModerate(post.id, 'approve')}
                        >
                          <FontAwesome name="check" size={12} color="#fff" />
                          <Text style={styles.modBtnText}>Approve</Text>
                        </TouchableOpacity>
                      )}
                      {post.moderation_status !== 'rejected' && (
                        <TouchableOpacity
                          style={[styles.modBtn, { backgroundColor: '#b45309' }]}
                          disabled={!!modActionLoading}
                          onPress={() => handleModerate(post.id, 'reject')}
                        >
                          <FontAwesome name="eye-slash" size={12} color="#fff" />
                          <Text style={styles.modBtnText}>Reject</Text>
                        </TouchableOpacity>
                      )}
                      {isSos && post.status === 'open' && (
                        <TouchableOpacity
                          style={[styles.modBtn, { backgroundColor: '#2563eb' }]}
                          disabled={!!modActionLoading}
                          onPress={() => handleModerate(post.id, 'resolve')}
                        >
                          <FontAwesome name="check-circle" size={12} color="#fff" />
                          <Text style={styles.modBtnText}>Resolve</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.modBtn, { backgroundColor: '#7f1d1d' }]}
                        disabled={!!modActionLoading}
                        onPress={() => handleModerate(post.id, 'delete')}
                      >
                        <FontAwesome name="trash" size={12} color="#fca5a5" />
                        <Text style={[styles.modBtnText, { color: '#fca5a5' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ═══════════════ TAB 3: CUSTOMER IMPERSONATION ═══════════════ */}
      {activeTab === 'impersonate' && (
        <View style={{ flex: 1 }}>
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

          {loading && !refreshing && customers.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#f59e0b" />
              <Text style={styles.loadingText}>Loading directory...</Text>
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={customers}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 60 }]}
              showsVerticalScrollIndicator={true}
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
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>
                      <View style={styles.customerInfo}>
                        <Text style={styles.customerName} numberOfLines={1}>
                          {item.full_name || 'Unnamed Customer'}
                        </Text>
                        <Text style={styles.customerMobile}>{item.mobile_number || '—'}</Text>
                      </View>
                      <View style={styles.bookingChip}>
                        <Text style={styles.bookingChipText}>
                          {item.booking_count} {item.booking_count === 1 ? 'booking' : 'bookings'}
                        </Text>
                      </View>
                    </View>

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
        </View>
      )}

      {/* Impersonation Confirmation Modal */}
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
              View MASKPRO Care as{' '}
              <Text style={styles.modalBoldName}>
                {confirmModal?.customerName || 'this customer'}
              </Text>
              .
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
                    <Text style={styles.confirmModalText}>Login as</Text>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backToAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  backToAppText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
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
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  tabBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#fbbf24',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
  },
  kpiLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  kpiValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  kpiSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.4)',
  },
  platformIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  platformTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  platformShare: {
    fontSize: 12,
    fontWeight: '800',
  },
  platformMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  authMiniBox: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
  },
  authMiniValue: {
    color: '#34d399',
    fontSize: 18,
    fontWeight: '800',
  },
  authMiniLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
  activeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.4)',
  },
  activeUserName: {
    color: '#f8fafc',
    fontSize: 13.5,
    fontWeight: '700',
  },
  activeUserSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  miniImpBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  miniImpBtnText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#f59e0b',
  },
  filterPillText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#fbbf24',
  },
  modBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
