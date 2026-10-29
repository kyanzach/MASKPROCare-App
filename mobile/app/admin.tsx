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

  // Pagination, Search, Sort & Lazy-Prefetch state for Who Uses the App (10/page) & Magic Link Security (5/page)
  const [activeUsersPage, setActiveUsersPage] = useState(1);
  const [secLogPage, setSecLogPage] = useState(1);
  const [secLogFilter, setSecLogFilter] = useState<'all' | 'blocked' | 'authorized' | 'bot'>('all');
  const [secSearch, setSecSearch] = useState('');
  const [secSort, setSecSort] = useState<'newest' | 'most_attempts' | 'customer_az' | 'ip_az' | 'oldest'>('newest');
  const activeLimitRef = useRef<number>(20);
  const secLimitRef = useRef<number>(15);
  const secSearchRef = useRef<string>('');
  const secSortRef = useRef<string>('newest');

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
  const modFilterRef = useRef<'pending' | 'sos' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    modFilterRef.current = modFilter;
  }, [modFilter]);

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
            loadDashboard(false);
            loadModerationPosts('pending', false);
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

  // Real-time background polling every 5s so moderation queue & usage analytics update automatically
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      loadDashboard(true);
      loadModerationPosts(modFilterRef.current, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const loadDashboard = async (silent = false, customActiveLimit?: number, customSecLimit?: number) => {
    if (!silent) setDashLoading(true);
    try {
      const aLim = customActiveLimit || activeLimitRef.current;
      const sLim = customSecLimit || secLimitRef.current;
      const sSearch = encodeURIComponent(secSearchRef.current || '');
      const sSort = encodeURIComponent(secSortRef.current || 'newest');
      const res = await client.get(`/admin/dashboard?users_limit=${aLim}&sec_limit=${sLim}&sec_search=${sSearch}&sec_sort=${sSort}`);
      if (res.data?.success) {
        setDashData(res.data.data);
      }
    } catch {
      // silent background error handling
    } finally {
      if (!silent) setDashLoading(false);
    }
  };

  const handleSecSearchChange = (val: string) => {
    setSecSearch(val);
    secSearchRef.current = val;
    setSecLogPage(1);
    if (val.trim()) {
      secLimitRef.current = Math.max(secLimitRef.current, 50);
    }
    loadDashboard(true, activeLimitRef.current, secLimitRef.current);
  };

  const handleSecSortChange = (nextSort: 'newest' | 'most_attempts' | 'customer_az' | 'ip_az' | 'oldest') => {
    setSecSort(nextSort);
    secSortRef.current = nextSort;
    setSecLogPage(1);
    loadDashboard(true, activeLimitRef.current, secLimitRef.current);
  };

  const handleActivePageChange = (nextPage: number) => {
    setActiveUsersPage(nextPage);
    const needed = (nextPage + 2) * 10;
    if (needed > activeLimitRef.current) {
      activeLimitRef.current = needed;
      loadDashboard(true, activeLimitRef.current, secLimitRef.current);
    }
  };

  const handleSecPageChange = (nextPage: number) => {
    setSecLogPage(nextPage);
    const needed = (nextPage + 2) * 5;
    if (needed > secLimitRef.current) {
      secLimitRef.current = needed;
      loadDashboard(true, activeLimitRef.current, secLimitRef.current);
    }
  };

  const handleSecFilterChange = (nextFilter: 'all' | 'blocked' | 'authorized' | 'bot') => {
    setSecLogFilter(nextFilter);
    setSecLogPage(1);
    if (nextFilter !== 'all' && secLimitRef.current < 40) {
      secLimitRef.current = 40;
      loadDashboard(true, activeLimitRef.current, secLimitRef.current);
    }
  };

  const loadModerationPosts = async (filterVal = modFilter, silent = false) => {
    if (!silent) setModLoading(true);
    try {
      const res = await client.get(`/admin/community/posts?filter=${encodeURIComponent(filterVal)}`);
      if (res.data?.success) {
        setModPosts(res.data.data.posts || []);
        setModCounts(res.data.data.counts || { pending: 0, active_sos: 0, approved: 0, rejected: 0, total: 0 });
      }
    } catch {
      // silent background error handling
    } finally {
      if (!silent) setModLoading(false);
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

  const handleSecurityAction = async (payload: any) => {
    try {
      const res = await client.post('/admin/security/action', payload);
      if (res.data?.success) {
        showToast(res.data.message || 'Security action applied');
        loadDashboard(true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Security action failed');
    }
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
  const securityOverview = dashData?.security_overview || {};
  const magicSecurityLogs = dashData?.magic_security_logs || [];
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
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Admin Panel</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
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
          {/* KPI Grid — Focused strictly on App Access (Web vs Native iOS/Android) & Moderation */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Customers</Text>
              <Text style={styles.kpiValue}>{(kpis.total_customers || 0).toLocaleString()}</Text>
              <Text style={styles.kpiSub}>Registered in Unify</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Active App Users</Text>
              <Text style={[styles.kpiValue, { color: '#34d399' }]}>{kpis.active_app_users || 0}</Text>
              <Text style={styles.kpiSub}>{kpis.total_sessions || 0} total sessions</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Web App Users</Text>
              <Text style={[styles.kpiValue, { color: '#60a5fa' }]}>{kpis.web_users || 0}</Text>
              <Text style={styles.kpiSub}>Browser Access</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Native App Users</Text>
              <Text style={[styles.kpiValue, { color: '#38bdf8' }]}>{kpis.native_users || 0}</Text>
              <Text style={styles.kpiSub}>
                iOS ({kpis.ios_users || 0}) • Android ({kpis.android_users || 0})
              </Text>
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
                <Text style={styles.authMiniValue}>{authMethods.magic_link?.total_clicks || 0}</Text>
                <Text style={styles.authMiniLabel}>Magic Clicks</Text>
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

          {/* 2nd to Last: Who Uses the App (10 per page + Lazy Prefetch) */}
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Who Uses the App (Recent Active Users)</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#60a5fa' }}>
                10 / page
              </Text>
            </View>
            {(() => {
              const ACTIVE_PER_PAGE = 10;
              const totalActive = Number(dashData?.active_users_total) || activeUsers.length;
              const totalActivePages = Math.max(1, Math.ceil(totalActive / ACTIVE_PER_PAGE));
              const safeActivePage = Math.min(activeUsersPage, totalActivePages);
              const pagedActive = activeUsers.slice(
                (safeActivePage - 1) * ACTIVE_PER_PAGE,
                safeActivePage * ACTIVE_PER_PAGE
              );

              if (activeUsers.length === 0) {
                return <Text style={{ color: '#94a3b8', fontSize: 13 }}>No active user sessions yet.</Text>;
              }

              return (
                <>
                  {pagedActive.map((u: any) => (
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
                        <Text numberOfLines={1} style={styles.miniImpBtnText}>Login as</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Pagination Footer Bar (10 per page) */}
                  <View style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(148, 163, 184, 0.16)',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: '600' }}>
                      Showing {(safeActivePage - 1) * ACTIVE_PER_PAGE + 1}–{Math.min(safeActivePage * ACTIVE_PER_PAGE, totalActive)} of {totalActive}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        disabled={safeActivePage <= 1}
                        onPress={() => handleActivePageChange(safeActivePage - 1)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: safeActivePage <= 1 ? '#1e293b' : '#334155',
                          backgroundColor: safeActivePage <= 1 ? '#0f172a' : '#1e293b',
                          opacity: safeActivePage <= 1 ? 0.5 : 1,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', color: '#e2e8f0' }}>Prev</Text>
                      </TouchableOpacity>

                      {Array.from({ length: totalActivePages }, (_, idx) => idx + 1).slice(0, 5).map((pNum) => {
                        const isCurr = safeActivePage === pNum;
                        return (
                          <TouchableOpacity
                            key={pNum}
                            onPress={() => handleActivePageChange(pNum)}
                            style={{
                              minWidth: 28,
                              height: 28,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              borderColor: isCurr ? '#f59e0b' : '#334155',
                              backgroundColor: isCurr ? 'rgba(245, 158, 11, 0.2)' : '#1e293b',
                            }}
                          >
                            <Text style={{ fontSize: 11.5, fontWeight: '800', color: isCurr ? '#fbbf24' : '#cbd5e1' }}>
                              {pNum}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}

                      <TouchableOpacity
                        disabled={safeActivePage >= totalActivePages}
                        onPress={() => handleActivePageChange(safeActivePage + 1)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: safeActivePage >= totalActivePages ? '#1e293b' : '#334155',
                          backgroundColor: safeActivePage >= totalActivePages ? '#0f172a' : '#1e293b',
                          opacity: safeActivePage >= totalActivePages ? 0.5 : 1,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', color: '#e2e8f0' }}>Next</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              );
            })()}
          </View>

          {/* Last Widget: Magic Link Security & Intrusion Audit Log (5 per page + Lazy Prefetch) */}
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Magic Link Security & Intrusion Log</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#f87171' }}>
                Blocked: {securityOverview.blocked_attempts || 0}
              </Text>
            </View>

            {/* Filter Pills on Mobile */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {([
                { key: 'all', label: `All (${securityOverview.total_all_events ?? magicSecurityLogs.length})` },
                { key: 'blocked', label: `Blocked (${securityOverview.total_intrusion_events ?? 0})` },
                { key: 'authorized', label: `Opens (${securityOverview.total_authorized_events ?? 0})` },
                { key: 'bot', label: `Bots (${securityOverview.total_bot_events ?? 0})` },
              ] as const).map((f) => {
                const active = secLogFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => handleSecFilterChange(f.key)}
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? '#f59e0b' : '#334155',
                      backgroundColor: active ? 'rgba(245, 158, 11, 0.18)' : '#0f172a',
                    }}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: active ? '#fbbf24' : '#94a3b8' }}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Search Input & Sort Pills for Troubleshooting */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155',
              borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8,
            }}>
              <FontAwesome name="search" size={13} color="#94a3b8" />
              <TextInput
                value={secSearch}
                onChangeText={handleSecSearchChange}
                placeholder="Search name, mobile, #ID, vehicle, device, IP..."
                placeholderTextColor="#64748b"
                style={{ flex: 1, fontSize: 12, color: '#f8fafc', paddingVertical: 0 }}
              />
              {secSearch.length > 0 && (
                <TouchableOpacity onPress={() => handleSecSearchChange('')}>
                  <FontAwesome name="times-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {([
                { key: 'newest', label: 'Sort: Newest' },
                { key: 'most_attempts', label: 'Most Attempts' },
                { key: 'customer_az', label: 'Name A–Z' },
                { key: 'ip_az', label: 'IP Address' },
                { key: 'oldest', label: 'Oldest' },
              ] as const).map((s) => {
                const active = secSort === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => handleSecSortChange(s.key)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: active ? '#38bdf8' : '#1e293b',
                      backgroundColor: active ? 'rgba(56, 189, 248, 0.16)' : '#0f172a',
                    }}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '700', color: active ? '#38bdf8' : '#64748b' }}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {(() => {
              const qLower = secSearch.trim().toLowerCase();
              const qIdClean = qLower.replace(/^#/, '');

              const filteredSecLogs = magicSecurityLogs
                .filter((log: any) => {
                  const isIntr = log.event_type !== 'first_bind' && log.event_type !== 'authorized_access' && log.event_type !== 'preview_bot_ignored';
                  if (secLogFilter === 'blocked' && !isIntr) return false;
                  if (secLogFilter === 'authorized' && log.event_type !== 'first_bind' && log.event_type !== 'authorized_access') return false;
                  if (secLogFilter === 'bot' && log.event_type !== 'preview_bot_ignored') return false;

                  if (!qLower) return true;
                  const blob = [
                    log.customer_name,
                    log.customer_mobile,
                    log.customer_id ? `#${log.customer_id} ${log.customer_id}` : '',
                    log.id ? `#${log.id} ${log.id}` : '',
                    log.vehicle_make,
                    log.vehicle_model,
                    log.vehicle_plate,
                    log.slug,
                    log.request_url,
                    log.attempted_platform,
                    log.bound_platform,
                    log.browser_detail,
                    log.os_detail,
                    log.device_fingerprint,
                    log.ip_address,
                    log.location,
                    log.server_code,
                    log.user_agent,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                  return blob.includes(qLower) || (qIdClean !== '' && blob.includes(qIdClean));
                })
                .sort((a: any, b: any) => {
                  if (secSort === 'oldest') {
                    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                  }
                  if (secSort === 'most_attempts') {
                    const diffDev = Number(b.device_attempt_count || 0) - Number(a.device_attempt_count || 0);
                    if (diffDev !== 0) return diffDev;
                    return Number(b.ip_attempt_count || 0) - Number(a.ip_attempt_count || 0);
                  }
                  if (secSort === 'customer_az') {
                    return String(a.customer_name || 'ZZZZ').localeCompare(String(b.customer_name || 'ZZZZ'));
                  }
                  if (secSort === 'ip_az') {
                    return String(a.ip_address || '').localeCompare(String(b.ip_address || ''));
                  }
                  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                });

              const SEC_PER_PAGE = 5;
              const totalFilteredCount = qLower
                ? filteredSecLogs.length
                : secLogFilter === 'all'
                ? Number(securityOverview.total_all_events || filteredSecLogs.length)
                : secLogFilter === 'blocked'
                ? Number(securityOverview.total_intrusion_events || filteredSecLogs.length)
                : secLogFilter === 'authorized'
                ? Number(securityOverview.total_authorized_events || filteredSecLogs.length)
                : Number(securityOverview.total_bot_events || filteredSecLogs.length);
              const totalSecPages = Math.max(1, Math.ceil(totalFilteredCount / SEC_PER_PAGE));
              const safeSecPage = Math.min(secLogPage, totalSecPages);
              const pagedSecLogs = filteredSecLogs.slice(
                (safeSecPage - 1) * SEC_PER_PAGE,
                safeSecPage * SEC_PER_PAGE
              );

              if (filteredSecLogs.length === 0) {
                return <Text style={{ color: '#94a3b8', fontSize: 13 }}>No security events match this filter.</Text>;
              }

              return (
                <>
                  {pagedSecLogs.map((log: any) => {
                    const isIntrusion = log.event_type !== 'first_bind' && log.event_type !== 'authorized_access' && log.event_type !== 'preview_bot_ignored';
                    const isDeviceBlocked = Number(log.is_device_blocked) > 0;
                    const isIpBlocked = Number(log.is_ip_blocked) > 0;
                    return (
                      <View key={log.id} style={[styles.activeUserRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                          <Text style={styles.activeUserName}>
                            {log.customer_name || 'Unknown Target'} (/m/{log.slug})
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isIntrusion ? '#f87171' : '#34d399' }}>
                            {isIntrusion ? `HTTP ${log.http_status || 403} Blocked` : `HTTP ${log.http_status || 200} Bound`}
                          </Text>
                        </View>
                        <Text style={styles.activeUserSub}>
                          Attempted: {log.attempted_platform || 'Unknown'} {log.bound_platform ? `• Locked: ${log.bound_platform}` : ''}
                        </Text>
                        {log.browser_detail ? (
                          <Text style={styles.activeUserSub}>
                            {log.browser_detail} • {log.os_detail || ''}
                          </Text>
                        ) : null}
                        <Text style={styles.activeUserSub}>
                          IP: {log.ip_address} • {log.location || 'PH'} • {timeAgo(log.created_at)}
                        </Text>
                        {isIntrusion && (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <TouchableOpacity
                              style={[styles.miniImpBtn, { borderColor: isDeviceBlocked ? '#10b981' : '#f59e0b' }]}
                              onPress={() => handleSecurityAction({
                                action: isDeviceBlocked ? 'unblock_device' : 'block_device',
                                log_id: log.id,
                                device_fingerprint: log.device_fingerprint,
                                device_token_hash: log.device_token_hash,
                                device_label: log.attempted_platform,
                                ip_address: log.ip_address,
                                user_agent: log.user_agent,
                              })}
                            >
                              <Text numberOfLines={1} style={[styles.miniImpBtnText, isDeviceBlocked && { color: '#34d399' }]}>
                                {isDeviceBlocked ? 'Unblock Device' : `Block Device (${log.device_attempt_count}/10)`}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.miniImpBtn, { borderColor: isIpBlocked ? '#10b981' : '#ef4444' }]}
                              onPress={() => handleSecurityAction({
                                action: isIpBlocked ? 'unblock_ip' : 'block_ip',
                                log_id: log.id,
                                ip_address: log.ip_address,
                              })}
                            >
                              <Text numberOfLines={1} style={[styles.miniImpBtnText, { color: isIpBlocked ? '#34d399' : '#f87171' }]}>
                                {isIpBlocked ? 'Unblock IP' : `Block IP (${log.ip_attempt_count}/100)`}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Pagination Footer Bar (5 per page) */}
                  <View style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(148, 163, 184, 0.16)',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: '600' }}>
                      Showing {(safeSecPage - 1) * SEC_PER_PAGE + 1}–{Math.min(safeSecPage * SEC_PER_PAGE, totalFilteredCount)} of {totalFilteredCount} (5/page)
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        disabled={safeSecPage <= 1}
                        onPress={() => handleSecPageChange(safeSecPage - 1)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: safeSecPage <= 1 ? '#1e293b' : '#334155',
                          backgroundColor: safeSecPage <= 1 ? '#0f172a' : '#1e293b',
                          opacity: safeSecPage <= 1 ? 0.5 : 1,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', color: '#e2e8f0' }}>Prev</Text>
                      </TouchableOpacity>

                      {Array.from({ length: totalSecPages }, (_, idx) => idx + 1).slice(0, 5).map((pNum) => {
                        const isCurr = safeSecPage === pNum;
                        return (
                          <TouchableOpacity
                            key={pNum}
                            onPress={() => handleSecPageChange(pNum)}
                            style={{
                              minWidth: 28,
                              height: 28,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              borderColor: isCurr ? '#f59e0b' : '#334155',
                              backgroundColor: isCurr ? 'rgba(245, 158, 11, 0.2)' : '#1e293b',
                            }}
                          >
                            <Text style={{ fontSize: 11.5, fontWeight: '800', color: isCurr ? '#fbbf24' : '#cbd5e1' }}>
                              {pNum}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}

                      <TouchableOpacity
                        disabled={safeSecPage >= totalSecPages}
                        onPress={() => handleSecPageChange(safeSecPage + 1)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: safeSecPage >= totalSecPages ? '#1e293b' : '#334155',
                          backgroundColor: safeSecPage >= totalSecPages ? '#0f172a' : '#1e293b',
                          opacity: safeSecPage >= totalSecPages ? 0.5 : 1,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', color: '#e2e8f0' }}>Next</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              );
            })()}
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
    gap: 10,
    flex: 1,
    marginRight: 8,
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
