/**
 * AdminPanel — 3-Tab Admin Suite:
 *   1. Overview & Analytics (Platform breakdown: Web, Android, iOS, Login funnel, Active users log)
 *   2. Community Moderation (Facebook-Group style approval queue for Maintenance Discussions + S.O.S. management)
 *   3. Customer Impersonation (Searchable directory with 1-click Login As)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'dashboard';
  const [activeTab, setActiveTab] = useState(
    ['dashboard', 'moderation', 'impersonate'].includes(initialTab) ? initialTab : 'dashboard'
  );

  // Admin status
  const [isAdmin, setIsAdmin] = useState(null); // null = loading
  const [toast, setToast] = useState(null);

  // Tab 1: Dashboard & Analytics state
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Tab 2: Community Moderation state
  const [modFilter, setModFilter] = useState('pending');
  const [modPosts, setModPosts] = useState([]);
  const [modCounts, setModCounts] = useState({ pending: 0, active_sos: 0, approved: 0, rejected: 0, total: 0 });
  const [modLoading, setModLoading] = useState(false);
  const [modActionLoading, setModActionLoading] = useState(null);

  // Tab 3: Customer Impersonation state
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState(null);
  const [smsPreviewModal, setSmsPreviewModal] = useState(null);
  const [journeyModal, setJourneyModal] = useState(null);
  const [hoveredConversionRowId, setHoveredConversionRowId] = useState(null);
  const [impersonating, setImpersonating] = useState(false);
  const [secActionLoading, setSecActionLoading] = useState(null);
  const [secLogFilter, setSecLogFilter] = useState('all');
  const [secSearch, setSecSearch] = useState('');
  const [secSort, setSecSort] = useState('newest');
  const [secPage, setSecPage] = useState(1);
  const [secLimit, setSecLimit] = useState(10); // Prefetch 2 pages (5 per page = 10 items) initially
  const manilaTodayInit = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [smsFilter, setSmsFilter] = useState('all'); // 'all' | 'engaged' | 'sent' | 'opened' | 'unopened' | 'failed'
  const [smsDatePreset, setSmsDatePreset] = useState('today'); // 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'all_time' | 'custom'
  const [smsDateFrom, setSmsDateFrom] = useState(manilaTodayInit);
  const [smsDateTo, setSmsDateTo] = useState(manilaTodayInit);
  const [smsDatePickerOpen, setSmsDatePickerOpen] = useState(false);
  const [smsCalMonth, setSmsCalMonth] = useState(() => {
    const [y, m] = manilaTodayInit.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [smsPickingStep, setSmsPickingStep] = useState('from'); // 'from' | 'to'
  const [smsSearch, setSmsSearch] = useState('');
  const [smsSort, setSmsSort] = useState('newest');
  const [smsPage, setSmsPage] = useState(1);
  const [smsLimit, setSmsLimit] = useState(500); // Prefetch full tracker dataset (8 per page)
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(20); // Prefetch 2 pages (10 per page = 20 items) initially
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date());

  // Care Card Wallet (BoomerangMe) Installed Clients state
  const [walletData, setWalletData] = useState({
    summary: {
      total_active_cards: 0,
      total_installed: 0,
      install_rate_pct: 0,
      apple_wallet_count: 0,
      google_pay_count: 0,
      pwa_wallet_count: 0,
      android_web_count: 0,
      not_installed_count: 0,
      coating_installed_count: 0,
      tint_installed_count: 0,
      ppf_installed_count: 0,
      unique_installed_clients: 0,
      last_synced_at: null,
    },
    cards: [],
    pagination: { page: 1, limit: 8, total: 0, totalPages: 1 },
  });
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSyncing, setWalletSyncing] = useState(false);
  const [walletFilter, setWalletFilter] = useState('all_installed'); // 'all_installed' | 'apple' | 'android_all' | 'google_pay' | 'pwa' | 'not_installed'
  const [walletTier, setWalletTier] = useState('all'); // 'all' | 'coating' | 'diamond' | 'gold' | 'silver' | 'tint' | 'ppf'
  const [walletBranch, setWalletBranch] = useState('all');
  const [walletSearch, setWalletSearch] = useState('');
  const [walletSort, setWalletSort] = useState('recent_installed');
  const [walletPage, setWalletPage] = useState(1);
  const walletSearchTimeoutRef = useRef(null);
  const modFilterRef = useRef('pending');
  const dashParamsRef = useRef({
    secLimit: 10, secFilter: 'all', secSearch: '', secSort: 'newest',
    smsLimit: 500, smsFilter: 'all', smsSearch: '', smsSort: 'newest',
    smsFrom: manilaTodayInit, smsTo: manilaTodayInit,
    usersLimit: 20,
  });

  useEffect(() => {
    modFilterRef.current = modFilter;
  }, [modFilter]);

  useEffect(() => {
    dashParamsRef.current = {
      secLimit, secFilter: secLogFilter, secSearch, secSort,
      smsLimit, smsFilter, smsSearch, smsSort,
      smsFrom: smsDatePreset === 'all_time' ? '' : smsDateFrom,
      smsTo: smsDatePreset === 'all_time' ? '' : smsDateTo,
      usersLimit,
    };
  }, [secLimit, secLogFilter, secSearch, secSort, smsLimit, smsFilter, smsSearch, smsSort, smsDatePreset, smsDateFrom, smsDateTo, usersLimit]);

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Sync URL ?tab= changes
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['dashboard', 'moderation', 'impersonate'].includes(t) && t !== activeTab) {
      setActiveTab(t);
    }
  }, [searchParams]);

  // Check admin status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/check');
        if (res.data.data?.isAdmin) {
          setIsAdmin(true);
          loadDashboard(false);
          loadWalletCards({ page: 1 }, false);
          loadModerationPosts('pending', false);
          loadCustomers(1, '');
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  // Real-time background polling every 5s (skips when browser tab is hidden to save server resources)
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadDashboard(true);
      loadModerationPosts(modFilterRef.current, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const loadDashboard = async (silent = false, customParams = null) => {
    if (!silent) setDashLoading(true);
    try {
      const p = customParams || dashParamsRef.current;
      const res = await api.get(
        `/admin/dashboard?sec_limit=${p.secLimit}&sec_filter=${encodeURIComponent(p.secFilter)}&sec_search=${encodeURIComponent(p.secSearch || '')}&sec_sort=${encodeURIComponent(p.secSort || 'newest')}&sms_limit=${p.smsLimit || 500}&sms_filter=${encodeURIComponent(p.smsFilter || 'all')}&sms_search=${encodeURIComponent(p.smsSearch || '')}&sms_sort=${encodeURIComponent(p.smsSort || 'newest')}&sms_from=${encodeURIComponent(p.smsFrom || '')}&sms_to=${encodeURIComponent(p.smsTo || '')}&users_limit=${p.usersLimit}`
      );
      if (res.data.success) {
        setDashData(res.data.data);
        setLastSyncedAt(new Date());
      }
    } catch {
      // silent background handling
    } finally {
      if (!silent) setDashLoading(false);
    }
  };

  const loadWalletCards = async (overrides = {}, silent = false) => {
    if (!silent) setWalletLoading(true);
    try {
      const nextPage = overrides.page ?? walletPage;
      const nextFilter = overrides.filter ?? walletFilter;
      const nextTier = overrides.tier ?? walletTier;
      const nextBranch = overrides.branch ?? walletBranch;
      const nextSearch = overrides.search ?? walletSearch;
      const nextSort = overrides.sort ?? walletSort;
      const res = await api.get(
        `/admin/wallet-cards?page=${nextPage}&limit=8&filter=${encodeURIComponent(nextFilter)}&tier=${encodeURIComponent(nextTier)}&branch=${encodeURIComponent(nextBranch)}&search=${encodeURIComponent(nextSearch)}&sort=${encodeURIComponent(nextSort)}`
      );
      if (res.data?.success && res.data?.data) {
        setWalletData(res.data.data);
      }
    } catch (err) {
      console.error('[Admin] Load wallet cards error:', err);
    } finally {
      if (!silent) setWalletLoading(false);
    }
  };

  const handleSyncWalletCards = async (full = false) => {
    if (walletSyncing) return;
    setWalletSyncing(true);
    try {
      const res = await api.post('/admin/wallet-cards/sync', { full });
      if (res.data?.success) {
        showToast(res.data.message || 'BoomerangMe wallet cards synced');
        await loadWalletCards({ page: 1 }, false);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to sync BoomerangMe cards', 'error');
    } finally {
      setWalletSyncing(false);
    }
  };

  // Helper to compute YYYY-MM-DD in Asia/Manila for date presets
  const getManilaDateRangeForPreset = (presetKey) => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const [y, m, d] = todayStr.split('-').map(Number);
    const fmt = (dt) => {
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };
    if (presetKey === 'today') {
      return { from: todayStr, to: todayStr };
    }
    if (presetKey === 'yesterday') {
      const yest = new Date(y, m - 1, d - 1);
      return { from: fmt(yest), to: fmt(yest) };
    }
    if (presetKey === 'last_7_days') {
      const start = new Date(y, m - 1, d - 6);
      return { from: fmt(start), to: todayStr };
    }
    if (presetKey === 'last_30_days') {
      const start = new Date(y, m - 1, d - 29);
      return { from: fmt(start), to: todayStr };
    }
    if (presetKey === 'this_month') {
      const start = new Date(y, m - 1, 1);
      return { from: fmt(start), to: todayStr };
    }
    if (presetKey === 'last_month') {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m - 1, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    return { from: '', to: '' }; // 'all_time'
  };

  const handleSmsDatePresetChange = (presetKey) => {
    setSmsDatePreset(presetKey);
    setSmsPage(1);
    setSmsPickingStep('from');
    const range = getManilaDateRangeForPreset(presetKey);
    setSmsDateFrom(range.from);
    setSmsDateTo(range.to);
    if (range.from) {
      const [ry, rm] = range.from.split('-').map(Number);
      setSmsCalMonth({ year: ry, month: rm - 1 });
    }
    const neededLimit = Math.max(smsLimit, 500);
    setSmsLimit(neededLimit);
    const updated = {
      ...dashParamsRef.current,
      smsFrom: range.from,
      smsTo: range.to,
      smsLimit: neededLimit,
    };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSmsCustomDateApply = (fromStr, toStr, closePopover = false) => {
    const cleanFrom = fromStr && toStr && fromStr > toStr ? toStr : fromStr;
    const cleanTo = fromStr && toStr && fromStr > toStr ? fromStr : toStr;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const nextPreset = (cleanFrom === todayStr && cleanTo === todayStr) ? 'today' : 'custom';
    setSmsDatePreset(nextPreset);
    setSmsDateFrom(cleanFrom);
    setSmsDateTo(cleanTo);
    setSmsPage(1);
    if (closePopover) setSmsDatePickerOpen(false);
    const neededLimit = Math.max(smsLimit, 500);
    setSmsLimit(neededLimit);
    const updated = {
      ...dashParamsRef.current,
      smsFrom: cleanFrom,
      smsTo: cleanTo,
      smsLimit: neededLimit,
    };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  // Handlers for Maintenance Reminder SMS & Magic Link Delivery Tracker (8 per page):
  const handleSmsPageChange = (nextPage) => {
    setSmsPage(nextPage);
    const neededLimit = Math.max(500, (nextPage + 2) * 8);
    if (neededLimit > smsLimit) {
      setSmsLimit(neededLimit);
      const updated = { ...dashParamsRef.current, smsLimit: neededLimit };
      dashParamsRef.current = updated;
      loadDashboard(true, updated);
    }
  };

  const handleSmsFilterChange = (nextFilter) => {
    setSmsFilter(nextFilter);
    setSmsPage(1);
    const neededLimit = Math.max(smsLimit, 500);
    setSmsLimit(neededLimit);
    const updated = { ...dashParamsRef.current, smsFilter: nextFilter, smsLimit: neededLimit };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSmsSearchChange = (val) => {
    setSmsSearch(val);
    setSmsPage(1);
    const needed = Math.max(smsLimit, 500);
    setSmsLimit(needed);
    const updated = { ...dashParamsRef.current, smsSearch: val, smsLimit: needed };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSmsSortChange = (nextSort) => {
    setSmsSort(nextSort);
    setSmsPage(1);
    let effectiveFilter = smsFilter;
    if (nextSort === 'failed_first' && ['sent', 'opened', 'engaged', 'unopened'].includes(smsFilter)) {
      effectiveFilter = 'all';
      setSmsFilter('all');
    } else if ((nextSort === 'sent_first' || nextSort === 'opened_first') && smsFilter === 'failed') {
      effectiveFilter = 'all';
      setSmsFilter('all');
    }
    const needed = Math.max(smsLimit, 500);
    setSmsLimit(needed);
    const updated = { ...dashParamsRef.current, smsSort: nextSort, smsFilter: effectiveFilter, smsLimit: needed };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  // Smart lazy-prefetching for Magic Link Security Log (5 per page):
  // When user moves to page 2 (or page N), silently prefetch pages N+1 and N+2 in the background
  const handleSecPageChange = (nextPage) => {
    setSecPage(nextPage);
    const neededLimit = (nextPage + 2) * 5;
    if (neededLimit > secLimit) {
      setSecLimit(neededLimit);
      const updated = { ...dashParamsRef.current, secLimit: neededLimit };
      dashParamsRef.current = updated;
      loadDashboard(true, updated);
    }
  };

  const handleSecFilterChange = (nextFilter) => {
    setSecLogFilter(nextFilter);
    setSecPage(1);
    const updated = { ...dashParamsRef.current, secFilter: nextFilter, secLimit: 10 };
    setSecLimit(10);
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSecSearchChange = (val) => {
    setSecSearch(val);
    setSecPage(1);
    const needed = val.trim() ? Math.max(secLimit, 50) : 10;
    setSecLimit(needed);
    const updated = { ...dashParamsRef.current, secSearch: val, secLimit: needed };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSecSortChange = (nextSort) => {
    setSecSort(nextSort);
    setSecPage(1);
    const updated = { ...dashParamsRef.current, secSort: nextSort };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  // Smart lazy-prefetching for Who Uses the App (10 per page):
  // When user moves to page 2 (or page N), silently prefetch pages N+1 and N+2 in the background
  const handleUsersPageChange = (nextPage) => {
    setUsersPage(nextPage);
    const neededLimit = (nextPage + 2) * 10;
    if (neededLimit > usersLimit) {
      setUsersLimit(neededLimit);
      const updated = { ...dashParamsRef.current, usersLimit: neededLimit };
      dashParamsRef.current = updated;
      loadDashboard(true, updated);
    }
  };

  const loadModerationPosts = async (filterVal = modFilter, silent = false) => {
    if (!silent) setModLoading(true);
    try {
      const res = await api.get(`/admin/community/posts?filter=${encodeURIComponent(filterVal)}`);
      if (res.data.success) {
        setModPosts(res.data.data.posts || []);
        setModCounts(res.data.data.counts || { pending: 0, active_sos: 0, approved: 0, rejected: 0, total: 0 });
      }
    } catch {
      // silent background handling
    } finally {
      if (!silent) setModLoading(false);
    }
  };

  const handleModerate = async (postId, action) => {
    setModActionLoading(`${postId}:${action}`);
    try {
      const res = await api.post('/admin/community/moderate', { post_id: postId, action });
      if (res.data.success) {
        showToast(res.data.message || 'Action completed');
        loadModerationPosts(modFilter);
        loadDashboard();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update post', 'error');
    } finally {
      setModActionLoading(null);
    }
  };

  const handleSecurityAction = async (payload, loadingKey) => {
    setSecActionLoading(loadingKey);
    try {
      const res = await api.post('/admin/security/action', payload);
      if (res.data.success) {
        showToast(res.data.message || 'Security action applied');
        loadDashboard(true);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Security action failed', 'error');
    } finally {
      setSecActionLoading(null);
    }
  };

  const loadCustomers = async (p = 1, q = '') => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/customers?page=${p}&limit=30&search=${encodeURIComponent(q)}`);
      if (res.data.success) {
        setCustomers(res.data.data.customers);
        setPagination(res.data.data.pagination);
        setPage(p);
      }
    } catch (err) {
      console.error('[Admin] Load customers error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback((val) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => loadCustomers(1, val), 400);
    setSearchTimeout(t);
  }, [searchTimeout]);

  const handleImpersonate = (customerId, customerName) => {
    if (impersonating) return;
    setConfirmModal({ customerId, customerName });
  };

  const confirmImpersonate = async () => {
    const { customerId } = confirmModal;
    setConfirmModal(null);
    setImpersonating(true);
    try {
      const res = await api.post('/admin/impersonate', { customer_id: customerId });
      if (res.data.success) {
        const { token, customer, impersonatedBy } = res.data.data;
        localStorage.setItem('impersonation', JSON.stringify({
          originalToken: localStorage.getItem('mpc_token'),
          originalCustomer: localStorage.getItem('mpc_customer'),
          impersonatedBy,
          customerName: customer.full_name,
        }));
        localStorage.setItem('mpc_token', token);
        localStorage.setItem('mpc_customer', JSON.stringify(customer));
        window.location.href = '/';
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message, 'error');
    } finally {
      setImpersonating(false);
    }
  };

  const openCustomerJourney = async (customerId, customerName, rowMeta = null) => {
    if (!customerId) return;
    setJourneyModal({
      loading: true,
      customerId,
      customerName: customerName || `Customer #${customerId}`,
      rowMeta,
      logs: [],
      bookingRequests: [],
      magicLinks: [],
    });
    try {
      const res = await api.get(`/admin/customer-journey/${customerId}`);
      const d = res.data?.data || {};
      setJourneyModal((prev) =>
        prev && prev.customerId === customerId
          ? {
              ...prev,
              loading: false,
              customerName: d.customer?.full_name || prev.customerName,
              customerMobile: d.customer?.mobile_number || rowMeta?.customer_mobile || '',
              logs: d.logs || [],
              bookingRequests: d.booking_requests || [],
              magicLinks: d.magic_links || [],
            }
          : prev
      );
    } catch (err) {
      setJourneyModal((prev) =>
        prev && prev.customerId === customerId ? { ...prev, loading: false } : prev
      );
      showToast(err.response?.data?.message || 'Failed to load customer journey', 'error');
    }
  };

  const getRowBookingConversion = (row) => {
    if (!row) return { status: 'not_booked', label: 'Not Booked', detail: '', channelLabel: 'No Booking Yet' };
    const reqStatus = String(row.booked_request_status || '').toLowerCase();
    const directStatus = String(row.direct_booking_status || '').toLowerCase();
    const hasActiveReq = Boolean(row.booked_request_id && ['pending', 'approved', 'negotiating', 'waitlisted'].includes(reqStatus));
    const hasActiveDirect = Boolean(row.direct_booking_id && directStatus !== 'cancelled');
    const hasCancelledReq = !hasActiveReq && !hasActiveDirect && Boolean(row.booked_request_id && reqStatus === 'cancelled');
    const hasCancelledDirect = !hasActiveReq && !hasActiveDirect && Boolean(row.direct_booking_id && directStatus === 'cancelled');

    const rawDate = row.booked_for_date || row.direct_booking_date || null;
    const formattedDate = rawDate
      ? new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    const rawCreated = row.booked_created_at || row.direct_booking_created_at || null;
    const formattedCreated = rawCreated
      ? new Date(rawCreated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';

    let elapsedAfterSms = '';
    if (rawCreated && row.created_at) {
      const diffMins = Math.max(1, Math.round((new Date(rawCreated).getTime() - new Date(row.created_at).getTime()) / 60000));
      if (diffMins < 60) elapsedAfterSms = `${diffMins}m after SMS`;
      else if (diffMins < 1440) elapsedAfterSms = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m after SMS`;
      else elapsedAfterSms = `${Math.floor(diffMins / 1440)}d ${Math.floor((diffMins % 1440) / 60)}h after SMS`;
    }

    const svc = row.booked_service || row.direct_booking_service || 'Maintenance (NanoFix)';
    const isOpened = Number(row.access_count || 0) > 0;
    const viaApp = Boolean(row.booked_request_id);

    if (hasActiveReq || hasActiveDirect) {
      const isDirectOnly = !hasActiveReq && hasActiveDirect;
      return {
        status: 'booked',
        source: isDirectOnly ? 'branch' : 'app',
        label: isDirectOnly ? 'Booked • Branch' : 'Booked',
        channelLabel: isDirectOnly ? 'Booked via Branch / Call' : 'Booked via Care App',
        channelNote: isDirectOnly
          ? (isOpened ? 'Opened link, then booked via branch staff' : 'Saw SMS reminder & called/messaged branch')
          : 'Submitted directly inside MaskPro Care App',
        service: svc,
        forDate: formattedDate || 'Scheduled',
        bookedAt: formattedCreated,
        elapsedAfterSms,
        refLabel: hasActiveReq
          ? `App Request #${row.booked_request_id}${row.direct_booking_id ? ` • Booking #${row.direct_booking_id}` : ''}`
          : `Unify Booking #${row.direct_booking_id}`,
        statusBadge: hasActiveReq
          ? (reqStatus === 'approved' ? 'Confirmed' : 'Pending Approval')
          : (row.direct_booking_status || 'Scheduled'),
        note: row.direct_booking_notes || '',
        detail: `${svc}${formattedDate ? ` • For ${formattedDate}` : ''}`,
      };
    }

    if (hasCancelledReq || hasCancelledDirect) {
      return {
        status: 'cancelled',
        source: viaApp ? 'app' : 'branch',
        label: 'Booked • Cancelled',
        channelLabel: viaApp ? 'App Booking • Cancelled' : 'Branch Booking • Cancelled',
        channelNote: viaApp ? 'Submitted in Care App, later cancelled' : 'Encoded in Unify, later marked Cancelled',
        service: svc,
        forDate: formattedDate || '—',
        bookedAt: formattedCreated,
        elapsedAfterSms,
        refLabel: viaApp ? `App Request #${row.booked_request_id}` : `Unify Booking #${row.direct_booking_id}`,
        statusBadge: 'Cancelled',
        note: row.booked_cancel_reason || row.direct_booking_notes || '',
        detail: `Booked ${svc}${formattedDate ? ` for ${formattedDate}` : ''} — Cancelled`,
      };
    }

    return {
      status: 'not_booked',
      source: 'none',
      label: 'Not Booked',
      channelLabel: 'Not Booked Yet',
      channelNote: isOpened ? 'Opened magic link, no booking submitted yet' : 'Awaiting magic link click or branch call',
      service: '6-Month NanoFix Maintenance',
      forDate: 'Not scheduled yet',
      bookedAt: '',
      elapsedAfterSms: '',
      refLabel: row.booking_id ? `Source Coating Booking #${row.booking_id}` : '',
      statusBadge: 'Awaiting Booking',
      note: '',
      detail: 'Has not submitted a booking yet',
    };
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Never';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getPlatformBadge = (platform) => {
    if (platform === 'android') {
      return { label: 'Android App', icon: 'bi-android2', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    }
    if (platform === 'ios') {
      return { label: 'iOS App', icon: 'bi-apple', bg: '#f1f5f9', color: '#0f172a', border: '#cbd5e1' };
    }
    return { label: 'Web App', icon: 'bi-globe2', bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' };
  };

  const getFormattedSmsContent = (row) => {
    if (!row) return '';
    if (row.sms_message_sent && String(row.sms_message_sent).trim()) {
      return String(row.sms_message_sent).trim();
    }
    const cleanTitle = String(row.customer_title || '').trim();
    const cleanName = String(row.customer_name || 'Valued Client').trim();
    const toLine = cleanTitle ? `To: ${cleanTitle} ${cleanName}` : `To: ${cleanName}`;
    const vmm = [row.vehicle_make, row.vehicle_model].filter(Boolean).join(' ').trim() || 'Vehicle';
    const careLink = row.short_url || (row.slug ? `maskpro.link/${row.slug}` : '[No magic link — invalid/missing mobile #]');
    return [
      toLine,
      '',
      'Dear Valued Customer,',
      '',
      'Greetings!',
      '',
      `Your ${vmm} is due for 6-Month NanoFix Maintenance.`,
      '',
      "Now it's even easier and faster to book! 1 click to this link will log you in, hassle-free!",
      '',
      'Book via our MaskPro Care app:',
      '',
      careLink,
      '',
      'MaskPro',
      'Always Brand New',
    ].join('\n');
  };

  if (isAdmin === null) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}></div>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Checking admin access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <i className="bi bi-shield-x" style={{ fontSize: '48px', color: '#ef4444' }}></i>
        <h2 style={{ margin: '16px 0 8px', color: '#1e293b', fontSize: '20px', fontWeight: 700 }}>
          Admin Access Required
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
          You don't have admin privileges for this section.
        </p>
        <Link to="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: '14px',
        }}>
          <i className="bi bi-arrow-left"></i> Back to Dashboard
        </Link>
      </div>
    );
  }

  const kpis = dashData?.kpis || {};
  const platforms = dashData?.platforms || [];
  const authMethods = dashData?.auth_methods || {};
  const securityOverview = dashData?.security_overview || {};
  const magicSecurityLogs = dashData?.magic_security_logs || [];
  const smsReminderSummary = dashData?.sms_reminder_summary || {};
  const smsReminderLogs = dashData?.sms_reminder_logs || [];
  const activeUsers = dashData?.active_users || [];

  return (
    <div style={{ maxWidth: '1580px', width: '100%', margin: '0 auto' }}>
      {/* Impersonation Confirmation Modal */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '16px',
        }} onClick={() => setConfirmModal(null)}>
          <div style={{
            background: 'white', borderRadius: '22px', padding: '28px',
            maxWidth: '400px', width: '100%', boxShadow: '0 28px 70px rgba(0,0,0,0.28)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'rgba(245, 158, 11, 0.14)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <i className="bi bi-person-badge" style={{ fontSize: '24px', color: '#d97706' }}></i>
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Impersonate Customer
              </h3>
            </div>
            <p style={{ textAlign: 'center', margin: '0 0 22px', fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
              View MASKPRO Care as <strong style={{ color: '#0f172a' }}>{confirmModal.customerName}</strong>.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, padding: '11px', border: '1px solid #e2e8f0', background: 'white',
                  borderRadius: '10px', fontSize: '14px', fontWeight: 600, color: '#64748b',
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}>Cancel</button>
              <button onClick={confirmImpersonate}
                style={{
                  flex: 1, padding: '11px', border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  borderRadius: '10px', fontSize: '14px', fontWeight: 700, color: '#78350f',
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                <i className="bi bi-box-arrow-in-right"></i> Login as
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivered SMS Content Modal */}
      {smsPreviewModal && (() => {
        const smsText = getFormattedSmsContent(smsPreviewModal);
        const charCount = smsText.length;
        const creditParts = smsPreviewModal.sms_credits || (charCount <= 160 ? 1 : Math.ceil(charCount / 153));
        const isSentModal = smsPreviewModal.sms_status === 'Sent';
        const isFailedModal = smsPreviewModal.sms_status === 'Failed';
        const shortLinkText = smsPreviewModal.short_url || (smsPreviewModal.slug ? `maskpro.link/${smsPreviewModal.slug}` : null);
        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.58)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9999, backdropFilter: 'blur(4px)', padding: '16px',
            }}
            onClick={() => setSmsPreviewModal(null)}
          >
            <div
              style={{
                background: 'white', borderRadius: '20px', width: '100%', maxWidth: '500px',
                boxShadow: '0 28px 70px rgba(0,0,0,0.32)', overflow: 'hidden',
                border: '1px solid #e2e8f0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
                background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '11px',
                    background: isSentModal ? '#dcfce7' : isFailedModal ? '#fef2f2' : '#dbeafe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i
                      className={`bi ${isSentModal ? 'bi-chat-check-fill' : isFailedModal ? 'bi-chat-square-dots-fill' : 'bi-chat-text-fill'}`}
                      style={{ fontSize: '18px', color: isSentModal ? '#15803d' : isFailedModal ? '#dc2626' : '#1d4ed8' }}
                    ></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a' }}>
                      Delivered SMS Message
                    </h3>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '1px' }}>
                      Sender ID: <strong style={{ color: '#0f172a' }}>MASKPRO</strong> • {smsPreviewModal.sms_message_sent ? 'Exact Gateway Payload' : 'Formatted Reminder Text'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSmsPreviewModal(null)}
                  style={{
                    border: 'none', background: '#f1f5f9', color: '#475569',
                    width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                  }}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              {/* Recipient & Delivery Meta */}
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>To: </span>
                    <strong style={{ color: '#0f172a' }}>
                      {[smsPreviewModal.customer_title, smsPreviewModal.customer_name].filter(Boolean).join(' ') || 'Unknown'}
                    </strong>
                    <span style={{ color: '#64748b', fontFamily: 'monospace', marginLeft: '6px' }}>
                      ({smsPreviewModal.customer_mobile || 'No mobile'})
                    </span>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    background: isSentModal ? '#dcfce7' : isFailedModal ? '#fef2f2' : '#f1f5f9',
                    color: isSentModal ? '#15803d' : isFailedModal ? '#dc2626' : '#475569',
                    border: `1px solid ${isSentModal ? '#86efac' : isFailedModal ? '#fecaca' : '#cbd5e1'}`,
                    whiteSpace: 'nowrap',
                  }}>
                    <i className={`bi ${isSentModal ? 'bi-check-circle-fill' : isFailedModal ? 'bi-x-circle-fill' : 'bi-clock-history'}`}></i>
                    {isSentModal ? 'Sent & Delivered' : isFailedModal ? 'Failed (Invalid #)' : 'Scheduled'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '6px', fontSize: '11.5px', color: '#475569' }}>
                  <span>
                    <i className="bi bi-car-front-fill" style={{ color: '#1d4ed8', marginRight: '4px' }}></i>
                    <strong>{[smsPreviewModal.vehicle_make, smsPreviewModal.vehicle_model].filter(Boolean).join(' ') || 'Vehicle'}</strong>
                    {' '}• Booking #{smsPreviewModal.booking_id || '—'} • Reminder #{smsPreviewModal.reminder_id || '—'}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: '#64748b' }}>
                    {smsPreviewModal.created_at ? new Date(smsPreviewModal.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''}
                  </span>
                </div>
              </div>

              {/* SMS Bubble Content */}
              <div style={{ padding: '18px 20px' }}>
                <div style={{
                  background: '#0f172a', color: '#f8fafc', borderRadius: '16px',
                  padding: '16px 18px', fontSize: '13.5px', lineHeight: 1.55,
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  border: '1px solid #1e293b', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                }}>
                  {smsText}
                </div>

                {/* Character & Gateway Reference Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: '8px', marginTop: '10px', fontSize: '11.5px', color: '#64748b',
                }}>
                  <span>
                    <strong>{charCount}</strong> chars • <strong>{creditParts}</strong> SMS credit{creditParts === 1 ? '' : 's'}
                  </span>
                  {smsPreviewModal.itexmo_ref_id ? (
                    <span style={{ fontFamily: 'monospace', color: '#475569' }}>
                      ITEXMO Ref: {smsPreviewModal.itexmo_ref_id}
                    </span>
                  ) : !isSentModal && smsPreviewModal.sms_log_detail ? (
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                      {smsPreviewModal.sms_log_detail.replace(/^.*Reminder ID:\s*\d*:\s*/i, '')}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{
                padding: '12px 20px 16px', borderTop: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap',
              }}>
                {shortLinkText && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(`https://${shortLinkText}`);
                      showToast('Magic link copied');
                    }}
                    style={{
                      padding: '8px 13px', borderRadius: '9px', border: '1px solid #cbd5e1',
                      background: 'white', color: '#1d4ed8', fontSize: '12.5px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    <i className="bi bi-link-45deg"></i> Copy Link
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(smsText);
                    showToast('Full SMS message copied');
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: '9px', border: 'none',
                    background: '#2563eb', color: 'white', fontSize: '12.5px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <i className="bi bi-clipboard-check"></i> Copy SMS Text
                </button>
                <button
                  type="button"
                  onClick={() => setSmsPreviewModal(null)}
                  style={{
                    padding: '8px 14px', borderRadius: '9px', border: '1px solid #e2e8f0',
                    background: '#f8fafc', color: '#475569', fontSize: '12.5px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Customer Exploration Journey Modal */}
      {journeyModal && (() => {
        const logs = journeyModal.logs || [];
        const bReqs = journeyModal.bookingRequests || [];
        const mLinks = journeyModal.magicLinks || [];
        const latestLink = mLinks[0] || journeyModal.rowMeta || {};
        const conv = journeyModal.rowMeta
          ? getRowBookingConversion(journeyModal.rowMeta)
          : (() => {
              const latestReq = bReqs[0];
              if (!latestReq) return { status: 'not_booked', label: 'Not Booked', detail: 'No booking submitted yet' };
              const fDate = latestReq.booking_date
                ? new Date(latestReq.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
              if (['pending', 'approved', 'negotiating', 'waitlisted'].includes(latestReq.status)) {
                return {
                  status: 'booked',
                  label: 'Booked',
                  detail: `${latestReq.latest_service || 'Maintenance'} • For ${fDate}`,
                };
              }
              if (latestReq.status === 'cancelled') {
                return {
                  status: 'cancelled',
                  label: 'Booked • Cancelled',
                  detail: `${latestReq.latest_service || 'Maintenance'} (${fDate}) — Cancelled${latestReq.cancellation_reason ? `: "${latestReq.cancellation_reason}"` : ''}`,
                };
              }
              return { status: 'not_booked', label: 'Not Booked', detail: 'No active booking yet' };
            })();

        const uniquePages = Array.from(new Set(logs.map((l) => l.page_label))).filter(Boolean);

        const getStepVisual = (item) => {
          const et = String(item.event_type || 'page_view');
          const lbl = String(item.page_label || '');
          if (et === 'magic_link') {
            return { icon: 'bi-link-45deg', bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd', badge: 'Smart Link' };
          }
          if (et === 'booking') {
            if (/cancel/i.test(lbl)) {
              return { icon: 'bi-calendar-x-fill', bg: '#fef3c7', color: '#b45309', border: '#fde68a', badge: 'Cancelled' };
            }
            return { icon: 'bi-calendar-check-fill', bg: '#dcfce7', color: '#15803d', border: '#86efac', badge: 'Booked' };
          }
          if (et === 'action') {
            return { icon: 'bi-cursor-fill', bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc', badge: 'Action' };
          }
          if (et === 'auth') {
            return { icon: 'bi-shield-check', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1', badge: 'Login' };
          }
          if (/card|loyalty/i.test(lbl)) {
            return { icon: 'bi-credit-card-2-front-fill', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', badge: 'Care Cards' };
          }
          if (/dashboard/i.test(lbl)) {
            return { icon: 'bi-grid-fill', bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd', badge: 'Dashboard' };
          }
          if (/booking/i.test(lbl)) {
            return { icon: 'bi-calendar-event-fill', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', badge: 'Bookings' };
          }
          if (/vehicle/i.test(lbl)) {
            return { icon: 'bi-car-front-fill', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', badge: 'Vehicles' };
          }
          return { icon: 'bi-compass-fill', bg: '#f8fafc', color: '#334155', border: '#e2e8f0', badge: 'Page View' };
        };

        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.58)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9999, backdropFilter: 'blur(4px)', padding: '16px',
            }}
            onClick={() => setJourneyModal(null)}
          >
            <div
              style={{
                background: 'white', borderRadius: '20px', width: '100%', maxWidth: '640px',
                maxHeight: '88vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 28px 70px rgba(0,0,0,0.32)', overflow: 'hidden',
                border: '1px solid #e2e8f0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
                background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: '#dbeafe', color: '#1d4ed8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px',
                  }}>
                    <i className="bi bi-compass-fill"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      App Exploration Journey
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      <strong>{journeyModal.customerName}</strong>
                      {journeyModal.customerMobile ? ` • ${journeyModal.customerMobile}` : ''}
                      {` • ID #${journeyModal.customerId}`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setJourneyModal(null)}
                  style={{
                    border: 'none', background: '#f1f5f9', color: '#475569',
                    width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
                  }}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              {/* Summary Strip */}
              <div style={{
                padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px',
              }}>
                <div style={{
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px',
                }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b' }}>Conversion Status</div>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '11.5px', fontWeight: 800, padding: '2px 9px', borderRadius: '14px', whiteSpace: 'nowrap',
                      background: conv.status === 'booked' ? '#dcfce7' : conv.status === 'cancelled' ? '#fef3c7' : '#f1f5f9',
                      color: conv.status === 'booked' ? '#15803d' : conv.status === 'cancelled' ? '#b45309' : '#475569',
                      border: `1px solid ${conv.status === 'booked' ? '#86efac' : conv.status === 'cancelled' ? '#fde68a' : '#cbd5e1'}`,
                    }}>
                      <i className={`bi ${conv.status === 'booked' ? 'bi-calendar-check-fill' : conv.status === 'cancelled' ? 'bi-calendar-x-fill' : 'bi-calendar-minus'}`}></i>
                      {conv.label}
                    </span>
                  </div>
                  {conv.detail && (
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', lineHeight: 1.35 }}>
                      {conv.detail}
                    </div>
                  )}
                </div>

                <div style={{
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px',
                }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b' }}>Pages & Actions Recorded</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {logs.length} {logs.length === 1 ? 'Step' : 'Steps'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {uniquePages.length} unique {uniquePages.length === 1 ? 'area' : 'areas'} explored
                  </div>
                </div>

                <div style={{
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px',
                }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b' }}>Device & Network</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
                    {latestLink.bound_platform || logs[logs.length - 1]?.device_label || 'Mobile Browser'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                    IP: {latestLink.bound_ip || logs[logs.length - 1]?.ip_address || '—'}
                  </div>
                </div>
              </div>

              {/* Timeline Body */}
              <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
                {journeyModal.loading ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 10px' }} />
                    Loading exploration timeline...
                  </div>
                ) : logs.length === 0 ? (
                  <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    <i className="bi bi-compass" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}></i>
                    No page activity recorded for this customer yet.
                  </div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: '14px' }}>
                    <div style={{
                      position: 'absolute', left: '27px', top: '14px', bottom: '14px',
                      width: '2px', background: '#e2e8f0',
                    }} />
                    {logs.map((item, idx) => {
                      const vis = getStepVisual(item);
                      const tsStr = item.created_at
                        ? new Date(item.created_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit', second: '2-digit',
                          })
                        : '';
                      return (
                        <div
                          key={item.id || idx}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '12px',
                            marginBottom: idx === logs.length - 1 ? 0 : '14px',
                            position: 'relative', zIndex: 1,
                          }}
                        >
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                            background: vis.bg, color: vis.color, border: `1.5px solid ${vis.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
                            marginTop: '2px',
                          }}>
                            <i className={`bi ${vis.icon}`}></i>
                          </div>
                          <div style={{
                            flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0',
                            borderRadius: '12px', padding: '10px 13px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                                  {item.page_label}
                                </span>
                                <span style={{
                                  fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '10px',
                                  background: vis.bg, color: vis.color, border: `1px solid ${vis.border}`,
                                  whiteSpace: 'nowrap',
                                }}>
                                  {vis.badge}
                                </span>
                                {item.page_path && (
                                  <code style={{
                                    fontSize: '10.5px', color: '#475569', background: 'white',
                                    border: '1px solid #e2e8f0', borderRadius: '5px', padding: '1px 5px',
                                  }}>
                                    {item.page_path}
                                  </code>
                                )}
                              </div>
                              <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                {tsStr}
                              </span>
                            </div>
                            {item.action_detail && (
                              <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px', lineHeight: 1.4 }}>
                                {item.action_detail}
                              </div>
                            )}
                            {(item.device_label || item.ip_address) && (
                              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px' }}>
                                {[item.device_label, item.ip_address ? `IP: ${item.ip_address}` : ''].filter(Boolean).join(' • ')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  onClick={() => {
                    const cId = journeyModal.customerId;
                    const cName = journeyModal.customerName;
                    setJourneyModal(null);
                    handleImpersonate(cId, cName);
                  }}
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)', color: '#b45309',
                    border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '9px',
                    padding: '7px 12px', fontSize: '12px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <i className="bi bi-box-arrow-in-right"></i> Login as {journeyModal.customerName}
                </button>
                <button
                  type="button"
                  onClick={() => setJourneyModal(null)}
                  style={{
                    padding: '7px 16px', borderRadius: '9px', border: '1px solid #cbd5e1',
                    background: 'white', color: '#334155', fontSize: '12.5px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: toast.type === 'error' ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          color: toast.type === 'error' ? '#991b1b' : '#065f46',
          borderRadius: '12px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 600,
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <i className={`bi ${toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill'}`}></i>
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="bi bi-shield-lock-fill" style={{ color: '#f59e0b' }}></i>
            Admin Control Center
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#64748b' }}>
            App analytics, community moderation & customer impersonation
          </p>
        </div>

        <button
          onClick={() => {
            loadDashboard();
            loadModerationPosts(modFilter);
          }}
          style={{
            background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
            padding: '8px 14px', fontSize: '13px', fontWeight: 600, color: '#334155',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          <i className="bi bi-arrow-clockwise"></i> Refresh Data
        </button>
      </div>

      {/* ─── 3-Tab Navigation Bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '24px',
        background: '#f1f5f9', padding: '5px', borderRadius: '14px', width: '100%',
      }}>
        <button
          onClick={() => switchTab('dashboard')}
          style={{
            flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: '10px', border: 'none',
            background: activeTab === 'dashboard' ? 'white' : 'transparent',
            color: activeTab === 'dashboard' ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: activeTab === 'dashboard' ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}
        >
          <i className="bi bi-bar-chart-line-fill" style={{ color: activeTab === 'dashboard' ? '#2563eb' : '#64748b', flexShrink: 0 }}></i>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Dashboard</span>
        </button>

        <button
          onClick={() => switchTab('moderation')}
          style={{
            flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: '10px', border: 'none',
            background: activeTab === 'moderation' ? 'white' : 'transparent',
            color: activeTab === 'moderation' ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: activeTab === 'moderation' ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}
        >
          <i className="bi bi-shield-check" style={{ color: activeTab === 'moderation' ? '#d97706' : '#64748b', flexShrink: 0 }}></i>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Moderation</span>
          {(modCounts.pending > 0 || modCounts.active_sos > 0) && (
            <span style={{
              background: modCounts.pending > 0 ? '#f59e0b' : '#ef4444',
              color: 'white', fontSize: '11px', fontWeight: 800,
              padding: '1px 6px', borderRadius: '20px', flexShrink: 0,
            }}>
              {modCounts.pending > 0 ? modCounts.pending : modCounts.active_sos}
            </span>
          )}
        </button>

        <button
          onClick={() => switchTab('impersonate')}
          style={{
            flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: '10px', border: 'none',
            background: activeTab === 'impersonate' ? 'white' : 'transparent',
            color: activeTab === 'impersonate' ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: activeTab === 'impersonate' ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}
        >
          <i className="bi bi-person-bounding-box" style={{ color: activeTab === 'impersonate' ? '#10b981' : '#64748b', flexShrink: 0 }}></i>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Impersonate</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1: DASHBOARD & USAGE ANALYTICS
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Top KPI Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '14px',
            marginBottom: '24px',
          }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Total Customers</span>
                <i className="bi bi-people-fill" style={{ color: '#2563eb', fontSize: '18px' }}></i>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                {(kpis.total_customers || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                Registered in Unify
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Active App Users</span>
                <i className="bi bi-phone-fill" style={{ color: '#10b981', fontSize: '18px' }}></i>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                  {(kpis.active_app_users || 0).toLocaleString()}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                  background: (kpis.live_online_users || 0) > 0 ? '#dcfce7' : '#f1f5f9',
                  color: (kpis.live_online_users || 0) > 0 ? '#15803d' : '#64748b',
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: (kpis.live_online_users || 0) > 0 ? '#16a34a' : '#94a3b8',
                  }} />
                  {kpis.live_online_users || 0} Online Now
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
                {kpis.active_today_users || 0} active today • {(kpis.total_sessions || 0).toLocaleString()} sessions
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Web vs Native Users</span>
                <i className="bi bi-laptop" style={{ color: '#0284c7', fontSize: '18px' }}></i>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                {kpis.web_users || 0} Web / {kpis.native_users || 0} Native
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                iOS ({kpis.ios_users || 0}) • Android ({kpis.android_users || 0})
              </div>
            </div>

            <div
              onClick={() => { setModFilter('pending'); switchTab('moderation'); }}
              style={{
                background: kpis.pending_moderation_count > 0 ? '#fffbeb' : 'white',
                borderRadius: '16px', padding: '18px', cursor: 'pointer',
                border: kpis.pending_moderation_count > 0 ? '1px solid #fcd34d' : '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>Pending Posts</span>
                <i className="bi bi-shield-exclamation" style={{ color: '#d97706', fontSize: '18px' }}></i>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#92400e' }}>
                {kpis.pending_moderation_count || 0}
              </div>
              <div style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 600, marginTop: '4px' }}>
                Tap to review & approve
              </div>
            </div>

            <div
              onClick={() => { setModFilter('sos'); switchTab('moderation'); }}
              style={{
                background: kpis.active_sos_count > 0 ? '#fef2f2' : 'white',
                borderRadius: '16px', padding: '18px', cursor: 'pointer',
                border: kpis.active_sos_count > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b' }}>Active S.O.S.</span>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#dc2626', fontSize: '18px' }}></i>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#dc2626' }}>
                {kpis.active_sos_count || 0}
              </div>
              <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600, marginTop: '4px' }}>
                Emergency roadside alerts
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Active Care Cards</span>
                <i className="bi bi-credit-card-2-front-fill" style={{ color: '#0284c7', fontSize: '18px' }}></i>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                {(kpis.total_care_cards || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                {kpis.pending_booking_requests || 0} pending app bookings
              </div>
            </div>
          </div>

          {/* Platform Breakdown: Web App vs Android Native vs iOS Native */}
          <div style={{
            background: 'white', borderRadius: '18px', padding: '22px',
            border: '1px solid #e2e8f0', marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-laptop" style={{ color: '#2563eb' }}></i>
                  Platform Usage Breakdown (Web vs Android vs iOS)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Tracks every customer login and session across Web Browser, Android Native, and iOS Native
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {platforms.map((p) => {
                const badge = getPlatformBadge(p.platform);
                return (
                  <div
                    key={p.platform}
                    style={{
                      padding: '18px', borderRadius: '14px',
                      border: `1px solid ${badge.border}`,
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px',
                          background: badge.bg, color: badge.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                        }}>
                          <i className={`bi ${badge.icon}`}></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{p.label}</div>
                          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                            Last active: {formatTimeAgo(p.last_active_at)}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        background: badge.bg, color: badge.color,
                        fontSize: '12px', fontWeight: 800, padding: '3px 10px', borderRadius: '20px',
                      }}>
                        {p.share_pct || 0}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                      <div style={{ width: `${Math.max(p.share_pct || 0, p.unique_users > 0 ? 8 : 0)}%`, height: '100%', background: badge.color, borderRadius: '4px' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#475569' }}>
                      <span><strong style={{ color: '#0f172a' }}>{p.unique_users}</strong> Unique Users</span>
                      <span><strong style={{ color: '#0f172a' }}>{p.total_sessions}</strong> Sessions</span>
                      <span><strong style={{ color: '#0f172a' }}>{p.total_api_hits}</strong> Hits</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Login & Authentication Funnel */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px', marginBottom: '24px',
          }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-link-45deg" style={{ fontSize: '20px' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>1-Click Magic Link Logins</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>SMS Reminder Direct Auto-Login</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '12.5px', flexWrap: 'wrap', gap: '8px' }}>
                <span>Links Sent: <strong>{authMethods.magic_link?.total_sent || 0}</strong></span>
                <span>Opened: <strong style={{ color: '#10b981' }}>{authMethods.magic_link?.links_opened || 0}</strong></span>
                <span>Clicks: <strong>{authMethods.magic_link?.total_clicks || 0}</strong></span>
                <span>Blocked: <strong style={{ color: (authMethods.magic_link?.blocked_attempts || 0) > 0 ? '#dc2626' : '#64748b' }}>{authMethods.magic_link?.blocked_attempts || 0}</strong></span>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-chat-square-dots-fill" style={{ fontSize: '16px' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>SMS OTP Logins</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>Mobile Number OTP Verification</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '13px' }}>
                <span>OTP Sent: <strong>{authMethods.otp?.total_requests || 0}</strong></span>
                <span>Verified: <strong style={{ color: '#10b981' }}>{authMethods.otp?.verified_logins || 0}</strong></span>
                <span>Users: <strong>{authMethods.otp?.unique_users || 0}</strong></span>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-cpu-fill" style={{ fontSize: '16px' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>AI Smart Verification</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>Vehicle Plate & Service History Match</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '13px' }}>
                <span>Attempts: <strong>{authMethods.ai_verification?.total_attempts || 0}</strong></span>
                <span>Verified: <strong style={{ color: '#10b981' }}>{authMethods.ai_verification?.verified_logins || 0}</strong></span>
              </div>
            </div>
          </div>

          {/* ─── FULL-WIDTH WIDGET: Care Card Wallet Installed Clients (Apple Wallet, Google Pay & Android Pass) ─── */}
          {(() => {
            const ws = walletData?.summary || {};
            const wCards = walletData?.cards || [];
            const wPag = walletData?.pagination || { page: 1, limit: 8, total: 0, totalPages: 1 };

            const applyWalletFilter = (nextFilter) => {
              setWalletFilter(nextFilter);
              setWalletPage(1);
              loadWalletCards({ filter: nextFilter, page: 1 });
            };

            const applyWalletTier = (nextTier) => {
              setWalletTier(nextTier);
              setWalletPage(1);
              loadWalletCards({ tier: nextTier, page: 1 });
            };

            const applyWalletBranch = (nextBranch) => {
              setWalletBranch(nextBranch);
              setWalletPage(1);
              loadWalletCards({ branch: nextBranch, page: 1 });
            };

            const applyWalletSort = (nextSort) => {
              setWalletSort(nextSort);
              setWalletPage(1);
              loadWalletCards({ sort: nextSort, page: 1 });
            };

            const applyWalletSearch = (val) => {
              setWalletSearch(val);
              setWalletPage(1);
              if (walletSearchTimeoutRef.current) clearTimeout(walletSearchTimeoutRef.current);
              walletSearchTimeoutRef.current = setTimeout(() => {
                loadWalletCards({ search: val, page: 1 });
              }, 300);
            };

            const applyWalletPage = (nextPage) => {
              const safeP = Math.max(1, Math.min(nextPage, wPag.totalPages || 1));
              setWalletPage(safeP);
              loadWalletCards({ page: safeP }, true);
            };

            const getTierStyle = (templateId, category) => {
              const tid = Number(templateId);
              if (tid === 43203 || tid === 1006938) {
                return { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', icon: 'bi-gem' };
              }
              if (tid === 42605) {
                return { bg: '#fef3c7', color: '#b45309', border: '#fcd34d', icon: 'bi-award-fill' };
              }
              if (tid === 41402) {
                return { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1', icon: 'bi-shield-shaded' };
              }
              if (category === 'tint' || tid === 147644) {
                return { bg: '#ecfeff', color: '#0e7490', border: '#67e8f9', icon: 'bi-brightness-high-fill' };
              }
              if (category === 'ppf' || tid === 318553 || tid === 302979) {
                return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: 'bi-shield-fill-check' };
              }
              return { bg: '#f0fdf4', color: '#15803d', border: '#86efac', icon: 'bi-credit-card-2-front-fill' };
            };

            const getDeviceBadge = (status, device) => {
              if (status !== 'installed') {
                return {
                  label: 'Not Installed Yet',
                  sub: 'Link issued — awaiting wallet install',
                  icon: 'bi-hourglass-split',
                  bg: '#f1f5f9',
                  color: '#64748b',
                  border: '#cbd5e1',
                };
              }
              if (device === 'Apple Wallet') {
                return {
                  label: 'Apple Wallet (iOS)',
                  sub: 'Installed on iPhone Wallet',
                  icon: 'bi-apple',
                  bg: '#0f172a',
                  color: '#ffffff',
                  border: '#0f172a',
                };
              }
              if (device === 'Google Pay') {
                return {
                  label: 'Google Wallet (Android)',
                  sub: 'Installed on Google Pay',
                  icon: 'bi-google',
                  bg: '#dcfce7',
                  color: '#15803d',
                  border: '#86efac',
                };
              }
              return {
                label: 'Android / Web Pass (PWA)',
                sub: 'Installed via Mobile Web Pass',
                icon: 'bi-android2',
                bg: '#e0f2fe',
                color: '#0369a1',
                border: '#7dd3fc',
              };
            };

            return (
              <div style={{
                background: 'white', borderRadius: '18px', overflow: 'hidden',
                border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                marginBottom: '24px',
              }}>
                {/* Header & Summary KPIs */}
                <div style={{
                  padding: '18px 22px', borderBottom: '1px solid #e2e8f0',
                  background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i className="bi bi-wallet2" style={{ color: '#2563eb' }}></i>
                          Care Card Wallet Installed Clients (Apple Wallet & Android)
                        </h3>
                        <span style={{
                          background: '#dcfce7', border: '1px solid #86efac', color: '#15803d',
                          fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
                        }}>
                          {(ws.total_installed || 0).toLocaleString()} Installed / {(ws.total_active_cards || 0).toLocaleString()} Active Cards ({ws.install_rate_pct || 0}%)
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                        Complete directory of clients who installed their MaskPro Care Card in Apple Wallet, Google Wallet, or Android Pass — synced with BoomerangMe API v2 & Unify
                      </p>
                    </div>

                    {/* Top Clickable Platform Summary Badges + Live Sync Button */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => applyWalletFilter(walletFilter === 'apple' ? 'all_installed' : 'apple')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: walletFilter === 'apple' ? '#0f172a' : '#f8fafc',
                          color: walletFilter === 'apple' ? '#ffffff' : '#0f172a',
                          border: '1px solid #0f172a', fontSize: '12px', fontWeight: 700,
                          padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <i className="bi bi-apple"></i>
                        <span>Apple Wallet: {(ws.apple_wallet_count || 0).toLocaleString()}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyWalletFilter(walletFilter === 'google_pay' ? 'all_installed' : 'google_pay')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: walletFilter === 'google_pay' ? '#15803d' : '#dcfce7',
                          color: walletFilter === 'google_pay' ? '#ffffff' : '#15803d',
                          border: '1px solid #86efac', fontSize: '12px', fontWeight: 700,
                          padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <i className="bi bi-google"></i>
                        <span>Google Wallet: {(ws.google_pay_count || 0).toLocaleString()}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyWalletFilter(walletFilter === 'pwa' ? 'all_installed' : 'pwa')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: walletFilter === 'pwa' ? '#0284c7' : '#e0f2fe',
                          color: walletFilter === 'pwa' ? '#ffffff' : '#0369a1',
                          border: '1px solid #7dd3fc', fontSize: '12px', fontWeight: 700,
                          padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <i className="bi bi-android2"></i>
                        <span>Android / PWA Pass: {(ws.pwa_wallet_count || 0).toLocaleString()}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSyncWalletCards(false)}
                        disabled={walletSyncing}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd',
                          fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '20px',
                          whiteSpace: 'nowrap', cursor: walletSyncing ? 'wait' : 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <i className={`bi ${walletSyncing ? 'bi-arrow-repeat' : 'bi-cloud-arrow-down-fill'}`}></i>
                        <span>{walletSyncing ? 'Syncing BoomerangMe...' : 'Sync BoomerangMe'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter Pills + Package Tier + Branch + Search + Sort */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {[
                        { key: 'all_installed', label: `All Installed (${(ws.total_installed || 0).toLocaleString()})`, icon: 'bi-check2-circle' },
                        { key: 'apple', label: `Apple Wallet (${(ws.apple_wallet_count || 0).toLocaleString()})`, icon: 'bi-apple' },
                        { key: 'android_all', label: `All Android / PWA (${(ws.android_web_count || 0).toLocaleString()})`, icon: 'bi-android2' },
                        { key: 'google_pay', label: `Google Wallet (${(ws.google_pay_count || 0).toLocaleString()})`, icon: 'bi-google' },
                        { key: 'pwa', label: `PWA Pass (${(ws.pwa_wallet_count || 0).toLocaleString()})`, icon: 'bi-phone-fill' },
                        { key: 'not_installed', label: `Not Installed (${(ws.not_installed_count || 0).toLocaleString()})`, icon: 'bi-hourglass-split' },
                      ].map((f) => {
                        const isActive = walletFilter === f.key;
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => applyWalletFilter(f.key)}
                            style={{
                              padding: '5px 11px', borderRadius: '16px', fontSize: '11.5px', fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              border: isActive ? '1px solid #2563eb' : '1px solid #e2e8f0',
                              background: isActive ? '#2563eb' : 'white',
                              color: isActive ? 'white' : '#475569',
                            }}
                          >
                            <i className={`bi ${f.icon}`} style={{ fontSize: '11px' }}></i>
                            <span>{f.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Search Input */}
                    <div style={{
                      position: 'relative', display: 'flex', alignItems: 'center',
                      minWidth: '220px', flex: '1 1 220px', maxWidth: '320px',
                    }}>
                      <i className="bi bi-search" style={{
                        position: 'absolute', left: '11px', fontSize: '12.5px', color: '#64748b', pointerEvents: 'none',
                      }}></i>
                      <input
                        type="text"
                        value={walletSearch}
                        onChange={(e) => applyWalletSearch(e.target.value)}
                        placeholder="Search client, mobile, vehicle, plate, card #..."
                        style={{
                          width: '100%', padding: '6px 28px 6px 32px', borderRadius: '10px',
                          border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 500,
                          color: '#0f172a', background: 'white', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      {walletSearch && (
                        <button
                          type="button"
                          onClick={() => applyWalletSearch('')}
                          style={{
                            position: 'absolute', right: '7px', border: 'none', background: 'transparent',
                            color: '#64748b', cursor: 'pointer', fontSize: '13px', padding: '2px 4px',
                          }}
                        >
                          <i className="bi bi-x-circle-fill"></i>
                        </button>
                      )}
                    </div>

                    {/* Package Tier Filter */}
                    <select
                      value={walletTier}
                      onChange={(e) => applyWalletTier(e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: '10px', border: '1px solid #cbd5e1',
                        fontSize: '12px', fontWeight: 700, color: '#0f172a', background: 'white',
                        fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                      }}
                    >
                      <option value="all">All Card Packages</option>
                      <option value="coating">Coating (Silver / Gold / Diamond)</option>
                      <option value="diamond">Diamond Coating (24 Visits)</option>
                      <option value="gold">Gold Coating (14 Visits)</option>
                      <option value="silver">Silver Coating (10 Visits)</option>
                      <option value="tint">Nano Ceramic Tint</option>
                      <option value="ppf">PPF Warranty & Maintenance</option>
                    </select>

                    {/* Branch Filter */}
                    <select
                      value={walletBranch}
                      onChange={(e) => applyWalletBranch(e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: '10px', border: '1px solid #cbd5e1',
                        fontSize: '12px', fontWeight: 700, color: '#0f172a', background: 'white',
                        fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                      }}
                    >
                      <option value="all">All Branches</option>
                      <option value="Davao">Davao</option>
                      <option value="Cagayan">Cagayan De Oro</option>
                      <option value="General Santos">General Santos</option>
                      <option value="Cebu">Cebu</option>
                      <option value="Manila">Manila / Quezon City</option>
                    </select>

                    {/* Sort Dropdown */}
                    <select
                      value={walletSort}
                      onChange={(e) => applyWalletSort(e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: '10px', border: '1px solid #cbd5e1',
                        fontSize: '12px', fontWeight: 700, color: '#0f172a', background: 'white',
                        fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                      }}
                    >
                      <option value="recent_installed">Sort: Recently Installed / Updated</option>
                      <option value="newest_issued">Sort: Newest Card Issued</option>
                      <option value="most_visits_used">Sort: Most Maintenance Visits Used</option>
                      <option value="bonus_points">Sort: Highest Bonus Points</option>
                      <option value="customer_az">Sort: Client Name (A–Z)</option>
                    </select>
                  </div>
                </div>

                {/* Table Body */}
                {walletLoading && wCards.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: '13.5px' }}>
                    Loading installed wallet cards...
                  </div>
                ) : wCards.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
                    No Care Card wallet records match this filter.
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            <th style={{ padding: '11px 16px' }}>Client & Branch</th>
                            <th style={{ padding: '11px 12px' }}>Vehicle & Plate #</th>
                            <th style={{ padding: '11px 12px' }}>Wallet Installed (Device)</th>
                            <th style={{ padding: '11px 12px' }}>Card Package & Serial #</th>
                            <th style={{ padding: '11px 12px' }}>Visits Balance & Warranty</th>
                            <th style={{ padding: '11px 12px' }}>Care App Status</th>
                            <th style={{ padding: '11px 16px', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wCards.map((row) => {
                            const devBadge = getDeviceBadge(row.status, row.device);
                            const tierStyle = getTierStyle(row.template_id, row.category);
                            const hasVisits = Number(row.visits_total || 0) > 0;
                            const usedPct = hasVisits
                              ? Math.min(100, Math.round((Number(row.visits_used || 0) / Number(row.visits_total || 1)) * 100))
                              : 0;
                            const isAppActive = Number(row.app_sessions || 0) > 0;
                            return (
                              <tr key={row.card_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {/* 1. Client & Branch */}
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span>{row.customer_name}</span>
                                    <span style={{
                                      fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '10px',
                                      background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                                    }}>
                                      {row.branch_name}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '11.5px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                    {row.customer_mobile || 'No mobile'} {row.customer_id ? `• ID #${row.customer_id}` : ''}
                                  </div>
                                </td>

                                {/* 2. Vehicle & Plate # */}
                                <td style={{ padding: '12px 12px' }}>
                                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span>
                                      <i className="bi bi-car-front-fill" style={{ marginRight: '5px' }}></i>
                                      {row.vehicle_display}
                                    </span>
                                    {row.plate_display && (
                                      <span style={{
                                        fontSize: '10.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                        background: '#0f172a', color: '#ffffff', fontFamily: 'monospace', whiteSpace: 'nowrap',
                                      }}>
                                        {row.plate_display}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    Booking #{row.booking_id || '—'} • Issued {row.issued_at ? new Date(row.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                  </div>
                                </td>

                                {/* 3. Wallet Installed (Device) */}
                                <td style={{ padding: '12px 12px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700,
                                    background: devBadge.bg, color: devBadge.color, border: `1px solid ${devBadge.border}`,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    <i className={`bi ${devBadge.icon}`}></i>
                                    <span>{devBadge.label}</span>
                                  </span>
                                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px' }}>
                                    {row.updated_at
                                      ? `Updated ${new Date(row.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                      : devBadge.sub}
                                  </div>
                                </td>

                                {/* 4. Card Package & Serial # */}
                                <td style={{ padding: '12px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                      background: tierStyle.bg, color: tierStyle.color, border: `1px solid ${tierStyle.border}`,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      <i className={`bi ${tierStyle.icon}`}></i>
                                      <span>{row.tier_name}</span>
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                    <code style={{
                                      fontSize: '11px', color: '#334155', background: '#f8fafc',
                                      border: '1px solid #e2e8f0', borderRadius: '5px', padding: '1px 6px', fontWeight: 700,
                                    }}>
                                      {row.card_no}
                                    </code>
                                    {row.install_link && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard?.writeText(row.install_link);
                                          showToast(`Copied wallet link for ${row.customer_name}`);
                                        }}
                                        style={{
                                          border: 'none', background: '#e2e8f0', color: '#334155',
                                          borderRadius: '5px', padding: '2px 5px', fontSize: '10.5px', cursor: 'pointer',
                                        }}
                                      >
                                        <i className="bi bi-clipboard"></i>
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* 5. Visits Balance & Warranty */}
                                <td style={{ padding: '12px 12px', minWidth: '175px' }}>
                                  {hasVisits ? (
                                    <div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                                        <span>{row.visits_remaining ?? row.visits_total} / {row.visits_total} Visits Left</span>
                                        <span style={{ fontSize: '10.5px', color: row.visits_used > 0 ? '#0284c7' : '#64748b' }}>
                                          {row.visits_used} Used
                                        </span>
                                      </div>
                                      <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' }}>
                                        <div style={{
                                          width: `${Math.max(usedPct, row.visits_used > 0 ? 10 : 0)}%`,
                                          height: '100%', background: '#0284c7', borderRadius: '4px',
                                        }} />
                                      </div>
                                      <div style={{ fontSize: '10.5px', color: '#64748b', display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                                        <span>
                                          {row.expires_at_resolved
                                            ? `Exp: ${new Date(row.expires_at_resolved).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                                            : 'Active Warranty'}
                                        </span>
                                        {Number(row.bonus_balance || 0) > 0 && (
                                          <strong style={{ color: '#15803d' }}>{row.bonus_balance} pts</strong>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        fontSize: '11px', fontWeight: 700, color: '#0e7490', background: '#ecfeff',
                                        padding: '2px 8px', borderRadius: '10px', border: '1px solid #a5f3fc', whiteSpace: 'nowrap',
                                      }}>
                                        <i className="bi bi-percent"></i>
                                        {row.discount_pct ? `${row.discount_pct}% Member Discount` : 'Active Loyalty Pass'}
                                      </span>
                                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px' }}>
                                        {row.service_name}
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* 6. Care App Status */}
                                <td style={{ padding: '12px 12px' }}>
                                  {isAppActive ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px',
                                        borderRadius: '14px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
                                      }}>
                                        <i className="bi bi-phone-fill"></i>
                                        Used App ({row.app_sessions} sess)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => openCustomerJourney(row.customer_id, row.customer_name, row)}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          background: '#f0f9ff', color: '#0369a1', border: '1px solid #7dd3fc',
                                          padding: '2px 8px', borderRadius: '14px', fontSize: '11px', fontWeight: 700,
                                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        }}
                                      >
                                        <i className="bi bi-compass-fill"></i>
                                        Explore ({row.activity_count || 1})
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>
                                      Wallet Only (No App Login Yet)
                                    </span>
                                  )}
                                </td>

                                {/* 7. Actions */}
                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                    {row.install_link && (
                                      <a
                                        href={row.install_link}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          padding: '5px 9px', borderRadius: '8px', border: '1px solid #cbd5e1',
                                          background: '#f8fafc', color: '#334155', fontSize: '11px', fontWeight: 700,
                                          textDecoration: 'none', whiteSpace: 'nowrap',
                                        }}
                                      >
                                        <i className="bi bi-box-arrow-up-right"></i>
                                        <span>Pass</span>
                                      </a>
                                    )}
                                    {row.customer_id && (
                                      <button
                                        type="button"
                                        onClick={() => handleImpersonate(row.customer_id, row.customer_name)}
                                        style={{
                                          padding: '5px 10px', borderRadius: '8px', border: '1px solid #fde68a',
                                          background: '#fffbeb', color: '#b45309', fontSize: '11px', fontWeight: 700,
                                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        }}
                                      >
                                        <i className="bi bi-box-arrow-in-right" style={{ marginRight: '4px' }}></i>
                                        Login as
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div style={{
                      padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Showing <strong>{((wPag.page - 1) * wPag.limit) + 1}–{Math.min(wPag.page * wPag.limit, wPag.total)}</strong> of <strong>{(wPag.total || 0).toLocaleString()}</strong> Care Card wallet records (8 per page)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={wPag.page <= 1}
                          onClick={() => applyWalletPage(wPag.page - 1)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', border: '1px solid #cbd5e1',
                            background: wPag.page <= 1 ? '#f1f5f9' : 'white',
                            color: wPag.page <= 1 ? '#94a3b8' : '#0f172a',
                            fontSize: '12px', fontWeight: 700, cursor: wPag.page <= 1 ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Prev
                        </button>
                        <span style={{
                          padding: '5px 12px', borderRadius: '8px', background: '#2563eb', color: 'white',
                          fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          Page {wPag.page} of {(wPag.totalPages || 1).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          disabled={wPag.page >= wPag.totalPages}
                          onClick={() => applyWalletPage(wPag.page + 1)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', border: '1px solid #cbd5e1',
                            background: wPag.page >= wPag.totalPages ? '#f1f5f9' : 'white',
                            color: wPag.page >= wPag.totalPages ? '#94a3b8' : '#0f172a',
                            fontSize: '12px', fontWeight: 700, cursor: wPag.page >= wPag.totalPages ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ─── NEW WIDGET: Maintenance Reminder SMS & Magic Link Delivery Tracker (8 per page + Lazy Prefetch) ─── */}
          {(() => {
            const SMS_PER_PAGE = 8;
            const smsQuery = smsSearch.trim().toLowerCase();
            const smsQueryId = smsQuery.replace(/^#/, '');
            const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

            const matchesSearchRow = (r) => {
              if (!smsQuery) return true;
              const blob = [
                r.customer_name,
                r.customer_mobile,
                r.customer_id ? `#${r.customer_id} ${r.customer_id}` : '',
                r.booking_id ? `#${r.booking_id} ${r.booking_id}` : '',
                r.reminder_id ? `#${r.reminder_id} ${r.reminder_id}` : '',
                r.vehicle_make,
                r.vehicle_model,
                r.vehicle_plate,
                r.slug,
                r.short_url,
                r.bound_platform,
                r.bound_ip,
                r.bound_location,
                r.sms_status,
                r.itexmo_ref_id,
                r.sms_log_detail,
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              return blob.includes(smsQuery) || Boolean(smsQueryId && blob.includes(smsQueryId));
            };

            const getRowManilaDate = (r) => {
              if (!r.created_at) return '';
              return new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            };

            const isRowEngaged = (r) =>
              Number(r.access_count || 0) > 0 && Number(r.app_sessions || 0) > 0;

            const isRowBooked = (r) => {
              const conv = getRowBookingConversion(r);
              return conv.status === 'booked' || conv.status === 'cancelled';
            };

            const matchesDateRange = (r) => {
              if (smsDatePreset === 'all_time') return true;
              const rowDate = getRowManilaDate(r);
              if (!rowDate) return false;
              if (smsDateFrom && smsDateTo) {
                return rowDate >= smsDateFrom && rowDate <= smsDateTo;
              }
              if (smsDateFrom) return rowDate >= smsDateFrom;
              if (smsDateTo) return rowDate <= smsDateTo;
              return rowDate === todayDate;
            };

            // 1. All rows within the selected Hotel/Airline Date Range (before status pill filter)
            const dateScopedRows = smsReminderLogs.filter((r) => matchesDateRange(r));
            const scopedTotalCount = dateScopedRows.length;
            const scopedSentCount = dateScopedRows.filter((r) => r.sms_status === 'Sent').length;
            const scopedOpenedCount = dateScopedRows.filter((r) => Number(r.access_count || 0) > 0).length;
            const scopedEngagedCount = dateScopedRows.filter((r) => isRowEngaged(r)).length;
            const scopedBookedCount = dateScopedRows.filter((r) => isRowBooked(r)).length;
            const scopedUnopenedCount = dateScopedRows.filter((r) => Number(r.access_count || 0) <= 0 && r.sms_status === 'Sent').length;
            const scopedFailedCount = dateScopedRows.filter((r) => r.sms_status === 'Failed').length;

            // Global Today vs All-Time engaged counts for the quick 1-click toggle
            const todayEngagedCount = smsReminderLogs.filter((r) => getRowManilaDate(r) === todayDate && isRowEngaged(r)).length;
            const allTimeEngagedCount = smsReminderLogs.filter((r) => isRowEngaged(r)).length;

            // 2. Apply Search + Status Filter Pill + Sort
            const filteredSmsRows = smsReminderLogs
              .filter((r) => {
                if (!matchesSearchRow(r)) return false;
                if (!smsQuery && !matchesDateRange(r)) return false;
                if (smsFilter === 'engaged') return isRowEngaged(r);
                if (smsFilter === 'booked') return isRowBooked(r);
                if (smsFilter === 'sent') return r.sms_status === 'Sent';
                if (smsFilter === 'failed') return r.sms_status === 'Failed';
                if (smsFilter === 'opened') return Number(r.access_count || 0) > 0;
                if (smsFilter === 'unopened') return Number(r.access_count || 0) <= 0 && r.sms_status === 'Sent';
                return true;
              })
              .sort((a, b) => {
                if (smsSort === 'opened_first') {
                  const aEng = isRowEngaged(a) ? 1 : 0;
                  const bEng = isRowEngaged(b) ? 1 : 0;
                  if (bEng !== aEng) return bEng - aEng;
                  const diff = Number(b.access_count || 0) - Number(a.access_count || 0);
                  if (diff !== 0) return diff;
                  return new Date(b.last_accessed_at || b.created_at || 0).getTime() - new Date(a.last_accessed_at || a.created_at || 0).getTime();
                }
                if (smsSort === 'failed_first') {
                  const aFailed = a.sms_status === 'Failed' ? 0 : 1;
                  const bFailed = b.sms_status === 'Failed' ? 0 : 1;
                  if (aFailed !== bFailed) return aFailed - bFailed;
                  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                }
                if (smsSort === 'sent_first') {
                  const aSent = a.sms_status === 'Sent' ? 0 : 1;
                  const bSent = b.sms_status === 'Sent' ? 0 : 1;
                  if (aSent !== bSent) return aSent - bSent;
                  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                }
                if (smsSort === 'customer_az') {
                  return String(a.customer_name || 'ZZZZ').trim().localeCompare(String(b.customer_name || 'ZZZZ').trim());
                }
                if (smsSort === 'oldest') {
                  return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                }
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
              });

            const totalSmsFiltered = filteredSmsRows.length;

            // Dynamic top summary badge figures bound to the active Date Range + Status Filter + Search
            const activeRowsForBadges = smsQuery || smsFilter !== 'all' ? filteredSmsRows : dateScopedRows;
            const badgeDeliveredCount = activeRowsForBadges.filter((r) => r.sms_status === 'Sent').length;
            const badgeEngagedCount = activeRowsForBadges.filter((r) => isRowEngaged(r)).length;
            const badgeBookedCount = activeRowsForBadges.filter((r) => isRowBooked(r)).length;
            const badgeOpenedCount = activeRowsForBadges.filter((r) => Number(r.access_count || 0) > 0).length;
            const badgeFailedCount = activeRowsForBadges.filter((r) => r.sms_status === 'Failed').length;

            const formatShortManilaDate = (ymd) => {
              if (!ymd) return '';
              const [y, m, d] = ymd.split('-').map(Number);
              if (!y || !m || !d) return ymd;
              return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            const presetLabels = {
              today: "Today's 7AM Batch",
              yesterday: 'Yesterday',
              last_7_days: 'Last 7 Days',
              last_30_days: 'Last 30 Days',
              this_month: 'This Month',
              last_month: 'Last Month',
              all_time: 'All Time',
              custom: 'Custom Dates',
            };

            const activePresetLabel = presetLabels[smsDatePreset] || 'Custom Dates';
            const dateRangeSubtitle = smsDatePreset === 'all_time'
              ? 'All Historical + Today'
              : smsDateFrom === smsDateTo
              ? formatShortManilaDate(smsDateFrom)
              : `${formatShortManilaDate(smsDateFrom)} → ${formatShortManilaDate(smsDateTo)}`;

            const headerScopeText = smsQuery
              ? `Search Match (${filteredSmsRows.length}) • ${badgeDeliveredCount} Sent / ${badgeFailedCount} Failed`
              : `${activePresetLabel} (${dateRangeSubtitle}) • ${scopedSentCount} Sent / ${scopedEngagedCount} Logged In / ${scopedFailedCount} Failed`;

            const totalSmsPages = Math.max(1, Math.ceil(totalSmsFiltered / SMS_PER_PAGE));
            const safeSmsPage = Math.min(smsPage, totalSmsPages);
            const pagedSmsRows = filteredSmsRows.slice((safeSmsPage - 1) * SMS_PER_PAGE, safeSmsPage * SMS_PER_PAGE);

            // Build calendar days for the Hotel/Airline Date Picker popover
            const calYear = smsCalMonth.year;
            const calMonthIdx = smsCalMonth.month;
            const firstDayOfWeek = new Date(calYear, calMonthIdx, 1).getDay();
            const daysInCalMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
            const calMonthTitle = new Date(calYear, calMonthIdx, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const calCells = [];
            for (let i = 0; i < firstDayOfWeek; i += 1) calCells.push(null);
            for (let d = 1; d <= daysInCalMonth; d += 1) {
              const ymd = `${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              calCells.push({ day: d, ymd });
            }

            const spanDaysCount = (() => {
              if (smsDatePreset === 'all_time' || !smsDateFrom || !smsDateTo) return null;
              const [fy, fm, fd] = smsDateFrom.split('-').map(Number);
              const [ty, tm, td] = smsDateTo.split('-').map(Number);
              const diff = Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / 86400000) + 1;
              return diff > 0 ? diff : 1;
            })();

            return (
              <div style={{
                background: 'white', borderRadius: '18px', overflow: 'visible',
                border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                marginBottom: '24px',
              }}>
                {/* Header & Summary Badges */}
                <div style={{
                  padding: '18px 22px', borderBottom: '1px solid #e2e8f0',
                  borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i className="bi bi-chat-dots-fill" style={{ color: '#2563eb' }}></i>
                          Maintenance Reminder SMS & Magic Link Delivery Tracker
                        </h3>
                        <span style={{
                          background: '#dbeafe', border: '1px solid #93c5fd', color: '#1d4ed8',
                          fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
                        }}>
                          {headerScopeText}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                        Tracks every 6-Month Maintenance Reminder SMS sent with <code style={{ color: '#1d4ed8', fontWeight: 700 }}>maskpro.link</code> — gateway status, link opens, active app status, bound device & IP (8 per page)
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleSmsFilterChange(smsFilter === 'sent' ? 'all' : 'sent')}
                        title="Click to filter by Delivered SMS in selected date range"
                        style={{
                          background: '#dcfce7', border: smsFilter === 'sent' ? '2px solid #15803d' : '1px solid #86efac', color: '#15803d',
                          fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Delivered: {badgeDeliveredCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmsFilterChange(smsFilter === 'engaged' ? 'all' : 'engaged')}
                        title="Click to filter by clients who clicked magic link, logged in & explored the app"
                        style={{
                          background: '#ecfeff', border: smsFilter === 'engaged' ? '2px solid #0e7490' : '1px solid #67e8f9', color: '#0e7490',
                          fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Logged In & Explored: {badgeEngagedCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmsFilterChange(smsFilter === 'booked' ? 'all' : 'booked')}
                        title="Click to filter by clients who submitted a booking via the app"
                        style={{
                          background: '#f0fdf4', border: smsFilter === 'booked' ? '2px solid #15803d' : '1px solid #86efac', color: '#15803d',
                          fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Booked: {badgeBookedCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmsFilterChange(smsFilter === 'opened' ? 'all' : 'opened')}
                        title="Click to filter by Opened Magic Links in selected date range"
                        style={{
                          background: '#eff6ff', border: smsFilter === 'opened' ? '2px solid #1d4ed8' : '1px solid #bfdbfe', color: '#1d4ed8',
                          fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Opened Link: {badgeOpenedCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmsFilterChange(smsFilter === 'failed' ? 'all' : 'failed')}
                        title="Click to filter by Failed SMS Reminders in selected date range"
                        style={{
                          background: '#fef2f2', border: smsFilter === 'failed' ? '2px solid #dc2626' : '1px solid #fecaca', color: '#dc2626',
                          fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Failed Number: {badgeFailedCount}
                      </button>
                    </div>
                  </div>

                  {/* Filter Pills (Scoped to Date Picker) + Search + Hotel/Airline Date Picker + Sort */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {[
                        {
                          key: 'all',
                          label: smsDatePreset === 'today'
                            ? `Today's 7AM Batch (${scopedTotalCount})`
                            : smsDatePreset === 'all_time'
                            ? `All Reminders (${scopedTotalCount})`
                            : `${activePresetLabel} (${scopedTotalCount})`,
                        },
                        {
                          key: 'engaged',
                          label: `Logged In & Explored (${scopedEngagedCount})`,
                          icon: 'bi-person-check-fill',
                        },
                        {
                          key: 'booked',
                          label: `Booked (${scopedBookedCount})`,
                          icon: 'bi-calendar-check-fill',
                        },
                        { key: 'sent', label: `Sent (${scopedSentCount})` },
                        { key: 'opened', label: `Opened (${scopedOpenedCount})` },
                        { key: 'unopened', label: `Not Opened Yet (${scopedUnopenedCount})` },
                        { key: 'failed', label: `Failed (${scopedFailedCount})` },
                      ].map((f) => {
                        const isActive = smsFilter === f.key;
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => handleSmsFilterChange(f.key)}
                            style={{
                              padding: '5px 11px', borderRadius: '16px', fontSize: '11.5px', fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              border: isActive
                                ? (f.key === 'engaged' ? '1px solid #0891b2' : '1px solid #2563eb')
                                : (f.key === 'engaged' ? '1px solid #a5f3fc' : '1px solid #e2e8f0'),
                              background: isActive
                                ? (f.key === 'engaged' ? '#0891b2' : '#2563eb')
                                : (f.key === 'engaged' ? '#ecfeff' : 'white'),
                              color: isActive
                                ? 'white'
                                : (f.key === 'engaged' ? '#0e7490' : '#475569'),
                            }}
                          >
                            {f.icon && <i className={`bi ${f.icon}`} style={{ fontSize: '11px' }}></i>}
                            {f.label}
                          </button>
                        );
                      })}

                      {/* When 'Logged In & Explored' is active, show 1-click Today vs All Time scope switcher */}
                      {smsFilter === 'engaged' && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', background: '#f1f5f9',
                          border: '1px solid #cbd5e1', borderRadius: '14px', padding: '2px', gap: '2px',
                        }}>
                          <button
                            type="button"
                            onClick={() => handleSmsDatePresetChange('today')}
                            style={{
                              padding: '3px 8px', borderRadius: '11px', fontSize: '10.5px', fontWeight: 800,
                              border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                              background: smsDatePreset === 'today' ? '#0f172a' : 'transparent',
                              color: smsDatePreset === 'today' ? 'white' : '#475569',
                            }}
                          >
                            Only Today ({todayEngagedCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSmsDatePresetChange('all_time')}
                            style={{
                              padding: '3px 8px', borderRadius: '11px', fontSize: '10.5px', fontWeight: 800,
                              border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                              background: smsDatePreset === 'all_time' ? '#0f172a' : 'transparent',
                              color: smsDatePreset === 'all_time' ? 'white' : '#475569',
                            }}
                          >
                            All Time ({allTimeEngagedCount})
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Search Input */}
                    <div style={{
                      position: 'relative', display: 'flex', alignItems: 'center',
                      minWidth: '230px', flex: '1 1 230px', maxWidth: '340px',
                    }}>
                      <i className="bi bi-search" style={{
                        position: 'absolute', left: '11px', fontSize: '12.5px', color: '#64748b', pointerEvents: 'none',
                      }}></i>
                      <input
                        type="text"
                        value={smsSearch}
                        onChange={(e) => handleSmsSearchChange(e.target.value)}
                        placeholder="Search customer, mobile, vehicle, slug, device, IP..."
                        style={{
                          width: '100%', padding: '6px 28px 6px 32px', borderRadius: '10px',
                          border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 500,
                          color: '#0f172a', background: 'white', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      {smsSearch && (
                        <button
                          type="button"
                          onClick={() => handleSmsSearchChange('')}
                          style={{
                            position: 'absolute', right: '7px', border: 'none', background: 'transparent',
                            color: '#64748b', cursor: 'pointer', fontSize: '13px', padding: '2px 4px',
                          }}
                        >
                          <i className="bi bi-x-circle-fill"></i>
                        </button>
                      )}
                    </div>

                    {/* Hotel/Airline-Style Date Range Picker (Placed Next to Sort Dropdown) */}
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setSmsDatePickerOpen((prev) => !prev)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          padding: '5px 12px', borderRadius: '10px',
                          border: smsDatePickerOpen ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: smsDatePickerOpen ? '#eff6ff' : 'white',
                          color: '#0f172a', fontSize: '12px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          boxShadow: smsDatePickerOpen ? '0 0 0 3px rgba(37,99,235,0.12)' : '0 1px 2px rgba(15,23,42,0.04)',
                        }}
                      >
                        <i className="bi bi-calendar-range-fill" style={{ color: '#2563eb', fontSize: '13px' }}></i>
                        <span>{activePresetLabel}</span>
                        <span style={{
                          fontSize: '11px', fontWeight: 600, color: '#1d4ed8',
                          background: '#dbeafe', padding: '1px 7px', borderRadius: '10px',
                        }}>
                          {smsDatePreset === 'all_time'
                            ? 'All Dates'
                            : smsDateFrom === smsDateTo
                            ? formatShortManilaDate(smsDateFrom)
                            : `${formatShortManilaDate(smsDateFrom)} – ${formatShortManilaDate(smsDateTo)}`}
                        </span>
                        <i className={`bi bi-chevron-${smsDatePickerOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', color: '#64748b' }}></i>
                      </button>

                      {smsDatePickerOpen && (
                        <>
                          <div
                            onClick={() => setSmsDatePickerOpen(false)}
                            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                          />
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 999,
                              width: '360px', maxWidth: '92vw', background: 'white',
                              borderRadius: '16px', border: '1px solid #cbd5e1',
                              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
                              padding: '14px',
                            }}
                          >
                            {/* Quick Preset Pills at Top */}
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', marginBottom: '6px' }}>
                                Quick Date Scope
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {[
                                  { key: 'today', label: "Today's 7AM Batch" },
                                  { key: 'yesterday', label: 'Yesterday' },
                                  { key: 'last_7_days', label: 'Last 7 Days' },
                                  { key: 'last_30_days', label: 'Last 30 Days' },
                                  { key: 'this_month', label: 'This Month' },
                                  { key: 'last_month', label: 'Last Month' },
                                  { key: 'all_time', label: 'All Time' },
                                ].map((p) => {
                                  const isSel = smsDatePreset === p.key;
                                  return (
                                    <button
                                      key={p.key}
                                      type="button"
                                      onClick={() => {
                                        handleSmsDatePresetChange(p.key);
                                        setSmsDatePickerOpen(false);
                                      }}
                                      style={{
                                        padding: '4px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        border: isSel ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                        background: isSel ? '#2563eb' : '#f8fafc',
                                        color: isSel ? 'white' : '#334155',
                                      }}
                                    >
                                      {p.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Hotel/Airline Check-In (From) -> Check-Out (To) Cards */}
                            <div style={{
                              display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '6px', alignItems: 'center',
                              background: '#f8fafc', padding: '8px', borderRadius: '12px', border: '1px solid #e2e8f0',
                              marginBottom: '12px',
                            }}>
                              <div
                                onClick={() => setSmsPickingStep('from')}
                                style={{
                                  padding: '6px 8px', borderRadius: '8px', cursor: 'pointer',
                                  background: smsPickingStep === 'from' ? 'white' : 'transparent',
                                  border: smsPickingStep === 'from' ? '1.5px solid #2563eb' : '1px solid transparent',
                                }}
                              >
                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>From Date</div>
                                <input
                                  type="date"
                                  value={smsDateFrom}
                                  max={todayDate}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    const nextTo = smsDateTo && val > smsDateTo ? val : (smsDateTo || val);
                                    handleSmsCustomDateApply(val, nextTo, false);
                                    setSmsPickingStep('to');
                                  }}
                                  style={{
                                    border: 'none', background: 'transparent', fontSize: '11.5px', fontWeight: 800,
                                    color: '#0f172a', fontFamily: 'inherit', width: '100%', outline: 'none', padding: 0,
                                  }}
                                />
                              </div>

                              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>
                                <i className="bi bi-arrow-right"></i>
                                {spanDaysCount && (
                                  <div style={{ fontSize: '9.5px', color: '#2563eb', fontWeight: 800 }}>
                                    {spanDaysCount}d
                                  </div>
                                )}
                              </div>

                              <div
                                onClick={() => setSmsPickingStep('to')}
                                style={{
                                  padding: '6px 8px', borderRadius: '8px', cursor: 'pointer',
                                  background: smsPickingStep === 'to' ? 'white' : 'transparent',
                                  border: smsPickingStep === 'to' ? '1.5px solid #2563eb' : '1px solid transparent',
                                }}
                              >
                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>To Date</div>
                                <input
                                  type="date"
                                  value={smsDateTo}
                                  max={todayDate}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    const nextFrom = smsDateFrom && val < smsDateFrom ? val : (smsDateFrom || val);
                                    handleSmsCustomDateApply(nextFrom, val, false);
                                  }}
                                  style={{
                                    border: 'none', background: 'transparent', fontSize: '11.5px', fontWeight: 800,
                                    color: '#0f172a', fontFamily: 'inherit', width: '100%', outline: 'none', padding: 0,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Interactive Hotel/Airline Calendar Grid */}
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => setSmsCalMonth((prev) => {
                                    const d = new Date(prev.year, prev.month - 1, 1);
                                    return { year: d.getFullYear(), month: d.getMonth() };
                                  })}
                                  style={{
                                    border: '1px solid #e2e8f0', background: 'white', borderRadius: '8px',
                                    width: '28px', height: '28px', cursor: 'pointer', color: '#334155', fontWeight: 800,
                                  }}
                                >
                                  ‹
                                </button>
                                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                                  {calMonthTitle}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSmsCalMonth((prev) => {
                                    const d = new Date(prev.year, prev.month + 1, 1);
                                    return { year: d.getFullYear(), month: d.getMonth() };
                                  })}
                                  style={{
                                    border: '1px solid #e2e8f0', background: 'white', borderRadius: '8px',
                                    width: '28px', height: '28px', cursor: 'pointer', color: '#334155', fontWeight: 800,
                                  }}
                                >
                                  ›
                                </button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', marginBottom: '4px' }}>
                                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dow) => (
                                  <div key={dow} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '2px 0' }}>
                                    {dow}
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                                {calCells.map((cell, idx) => {
                                  if (!cell) return <div key={`empty-${idx}`} style={{ height: '30px' }} />;
                                  const isFuture = cell.ymd > todayDate;
                                  const isStart = smsDatePreset !== 'all_time' && cell.ymd === smsDateFrom;
                                  const isEnd = smsDatePreset !== 'all_time' && cell.ymd === smsDateTo;
                                  const isInRange = smsDatePreset !== 'all_time' && smsDateFrom && smsDateTo && cell.ymd > smsDateFrom && cell.ymd < smsDateTo;
                                  const isSelectedEdge = isStart || isEnd;

                                  return (
                                    <button
                                      key={cell.ymd}
                                      type="button"
                                      disabled={isFuture}
                                      onClick={() => {
                                        if (smsPickingStep === 'from' || !smsDateFrom || (smsDateFrom && smsDateTo && smsDateFrom !== smsDateTo)) {
                                          handleSmsCustomDateApply(cell.ymd, cell.ymd, false);
                                          setSmsPickingStep('to');
                                        } else {
                                          if (cell.ymd < smsDateFrom) {
                                            handleSmsCustomDateApply(cell.ymd, smsDateFrom, false);
                                          } else {
                                            handleSmsCustomDateApply(smsDateFrom, cell.ymd, false);
                                          }
                                          setSmsPickingStep('from');
                                        }
                                      }}
                                      style={{
                                        height: '30px', border: 'none', borderRadius: isSelectedEdge ? '8px' : isInRange ? '4px' : '8px',
                                        fontSize: '11.5px', fontWeight: isSelectedEdge ? 800 : 600,
                                        cursor: isFuture ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                        background: isSelectedEdge
                                          ? '#2563eb'
                                          : isInRange
                                          ? '#dbeafe'
                                          : cell.ymd === todayDate
                                          ? '#f1f5f9'
                                          : 'transparent',
                                        color: isFuture
                                          ? '#cbd5e1'
                                          : isSelectedEdge
                                          ? 'white'
                                          : isInRange
                                          ? '#1d4ed8'
                                          : '#0f172a',
                                      }}
                                    >
                                      {cell.day}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Popover Footer */}
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              paddingTop: '10px', borderTop: '1px solid #e2e8f0', gap: '8px',
                            }}>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSmsDatePresetChange('today');
                                  setSmsDatePickerOpen(false);
                                }}
                                style={{
                                  padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                                  background: 'white', color: '#475569', fontSize: '11.5px', fontWeight: 700,
                                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                }}
                              >
                                Reset to Today 7AM
                              </button>
                              <button
                                type="button"
                                onClick={() => setSmsDatePickerOpen(false)}
                                style={{
                                  padding: '6px 14px', borderRadius: '8px', border: 'none',
                                  background: '#2563eb', color: 'white', fontSize: '11.5px', fontWeight: 700,
                                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                }}
                              >
                                Done ({scopedTotalCount} records)
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Sort Dropdown */}
                    <select
                      value={smsSort}
                      onChange={(e) => handleSmsSortChange(e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: '10px', border: '1px solid #cbd5e1',
                        fontSize: '12px', fontWeight: 700, color: '#0f172a', background: 'white',
                        fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                      }}
                    >
                      <option value="newest">Sort: Newest Sent</option>
                      <option value="sent_first">Sort: Sent & Delivered First</option>
                      <option value="opened_first">Sort: Logged In & Opened First</option>
                      <option value="failed_first">Sort: Failed First</option>
                      <option value="customer_az">Sort: Customer Name (A–Z)</option>
                      <option value="oldest">Sort: Oldest First</option>
                    </select>
                  </div>
                </div>

                {filteredSmsRows.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
                    No maintenance reminder SMS records match this filter.
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            <th style={{ padding: '11px 16px' }}>Customer & Mobile</th>
                            <th style={{ padding: '11px 12px' }}>Vehicle & Booking</th>
                            <th style={{ padding: '11px 12px' }}>SMS Delivery (ITEXMO)</th>
                            <th style={{ padding: '11px 12px' }}>Magic Link & Open Status</th>
                            <th style={{ padding: '11px 12px' }}>App Activity</th>
                            <th style={{ padding: '11px 12px' }}>Device & IP Used</th>
                            <th style={{ padding: '11px 16px', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedSmsRows.map((row) => {
                            const isSent = row.sms_status === 'Sent';
                            const isFailed = row.sms_status === 'Failed';
                            const isOpened = Number(row.access_count || 0) > 0;
                            const isAppOnline = row.app_last_seen_at && (Date.now() - new Date(row.app_last_seen_at).getTime()) <= 5 * 60 * 1000;
                            const isAppActive = Number(row.app_sessions || 0) > 0;
                            return (
                              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {/* 1. Customer & Mobile */}
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.customer_name || 'Unknown'}</div>
                                  <div style={{ fontSize: '11.5px', color: '#64748b', fontFamily: 'monospace' }}>
                                    {row.customer_mobile || 'No mobile'} • ID #{row.customer_id}
                                  </div>
                                </td>

                                {/* 2. Vehicle & Booking */}
                                <td style={{ padding: '12px 12px' }}>
                                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '12.5px' }}>
                                    <i className="bi bi-car-front-fill" style={{ marginRight: '5px' }}></i>
                                    {[row.vehicle_make, row.vehicle_model].filter(Boolean).join(' ') || 'Vehicle'}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    Booking #{row.booking_id || '—'} • Reminder #{row.reminder_id || '—'}
                                  </div>
                                </td>

                                {/* 3. SMS Delivery */}
                                <td style={{ padding: '12px 12px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setSmsPreviewModal(row)}
                                    title="Click to view actual formatted SMS content"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                                      padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700,
                                      background: isSent ? '#dcfce7' : isFailed ? '#fef2f2' : '#f1f5f9',
                                      color: isSent ? '#15803d' : isFailed ? '#dc2626' : '#475569',
                                      border: `1px solid ${isSent ? '#86efac' : isFailed ? '#fecaca' : '#cbd5e1'}`,
                                      whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
                                    }}
                                  >
                                    <i className={`bi ${isSent ? 'bi-check-circle-fill' : isFailed ? 'bi-x-circle-fill' : 'bi-clock-history'}`}></i>
                                    <span>{isSent ? 'Sent & Delivered' : isFailed ? 'Failed (Invalid #)' : 'Scheduled (Pending)'}</span>
                                    <i className="bi bi-chat-text-fill" style={{ fontSize: '10.5px', opacity: 0.75, marginLeft: '2px' }}></i>
                                  </button>
                                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                                    {row.created_at ? new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''}
                                  </div>
                                  {row.itexmo_ref_id ? (
                                    <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                      Ref: {row.itexmo_ref_id.slice(0, 14)}... ({row.sms_credits || 2} cr)
                                    </div>
                                  ) : !isSent && row.sms_log_detail ? (
                                    <div style={{ fontSize: '10.5px', color: '#dc2626', marginTop: '2px', maxWidth: '210px' }}>
                                      {row.sms_log_detail.replace(/^.*ITEXMO Error:\s*/i, 'ITEXMO: ')}
                                    </div>
                                  ) : null}
                                </td>

                                {/* 4. Magic Link & Open Status */}
                                <td style={{ padding: '12px 12px' }}>
                                  {row.slug || row.short_url ? (
                                    <>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <code style={{
                                          fontSize: '11px', color: '#1d4ed8', background: '#f8fafc',
                                          border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 6px', fontWeight: 700,
                                        }}>
                                          {row.short_url || `maskpro.link/${row.slug}`}
                                        </code>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard?.writeText(`https://${row.short_url || `maskpro.link/${row.slug}`}`);
                                            showToast('Short magic link copied');
                                          }}
                                          title="Copy short link"
                                          style={{
                                            border: 'none', background: '#e2e8f0', color: '#334155',
                                            borderRadius: '5px', padding: '2px 5px', fontSize: '10.5px', cursor: 'pointer',
                                          }}
                                        >
                                          <i className="bi bi-clipboard"></i>
                                        </button>
                                      </div>
                                      <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '14px',
                                          background: isOpened ? '#dbeafe' : '#f1f5f9',
                                          color: isOpened ? '#1d4ed8' : '#64748b',
                                          whiteSpace: 'nowrap',
                                        }}>
                                          <i className={`bi ${isOpened ? 'bi-envelope-open-fill' : 'bi-hourglass-split'}`}></i>
                                          {isOpened ? `Opened (${row.access_count}x)` : 'Not Opened Yet'}
                                        </span>
                                        {(() => {
                                          const conv = getRowBookingConversion(row);
                                          const isBookedOk = conv.status === 'booked';
                                          const isBookedCancelled = conv.status === 'cancelled';
                                          const isBranchBooked = isBookedOk && conv.source === 'branch';
                                          const isHovered = hoveredConversionRowId === row.id;
                                          const badgeIcon = isBookedOk
                                            ? (isBranchBooked ? 'bi-telephone-inbound-fill' : 'bi-calendar-check-fill')
                                            : isBookedCancelled
                                            ? 'bi-calendar-x-fill'
                                            : 'bi-calendar-minus';
                                          return (
                                            <div
                                              style={{ position: 'relative', display: 'inline-flex' }}
                                              onMouseEnter={() => setHoveredConversionRowId(row.id)}
                                              onMouseLeave={() => setHoveredConversionRowId((prev) => (prev === row.id ? null : prev))}
                                            >
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setHoveredConversionRowId((prev) => (prev === row.id ? null : row.id));
                                                }}
                                                style={{
                                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '14px',
                                                  background: isBookedOk ? (isBranchBooked ? '#ecfdf5' : '#dcfce7') : isBookedCancelled ? '#fef3c7' : '#f1f5f9',
                                                  color: isBookedOk ? (isBranchBooked ? '#047857' : '#15803d') : isBookedCancelled ? '#b45309' : '#64748b',
                                                  border: `1px solid ${isBookedOk ? (isBranchBooked ? '#6ee7b7' : '#86efac') : isBookedCancelled ? '#fde68a' : '#e2e8f0'}`,
                                                  whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                                                  boxShadow: isHovered ? '0 2px 8px rgba(15, 23, 42, 0.12)' : 'none',
                                                  transition: 'all 0.12s ease',
                                                }}
                                              >
                                                <i className={`bi ${badgeIcon}`}></i>
                                                <span>{conv.label}</span>
                                              </button>

                                              {isHovered && (
                                                <div
                                                  onClick={(e) => e.stopPropagation()}
                                                  style={{
                                                    position: 'absolute',
                                                    left: '0',
                                                    bottom: 'calc(100% + 8px)',
                                                    zIndex: 1050,
                                                    width: '286px',
                                                    background: '#0f172a',
                                                    color: '#f8fafc',
                                                    borderRadius: '12px',
                                                    padding: '11px 13px',
                                                    boxShadow: '0 14px 32px rgba(15, 23, 42, 0.32)',
                                                    border: '1px solid #334155',
                                                    textAlign: 'left',
                                                    pointerEvents: 'auto',
                                                  }}
                                                >
                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                                                    <span style={{
                                                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                      fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px',
                                                      background: isBookedOk ? 'rgba(34, 197, 94, 0.2)' : isBookedCancelled ? 'rgba(245, 158, 11, 0.22)' : 'rgba(148, 163, 184, 0.2)',
                                                      color: isBookedOk ? '#4ade80' : isBookedCancelled ? '#fbbf24' : '#cbd5e1',
                                                      whiteSpace: 'nowrap',
                                                    }}>
                                                      <i className={`bi ${badgeIcon}`}></i>
                                                      {conv.channelLabel}
                                                    </span>
                                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                      {conv.statusBadge}
                                                    </span>
                                                  </div>

                                                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', marginBottom: '3px' }}>
                                                    {conv.service}
                                                  </div>

                                                  <div style={{ fontSize: '11px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div>
                                                      <i className="bi bi-calendar-event" style={{ marginRight: '5px', color: '#38bdf8' }}></i>
                                                      Appointment: <strong style={{ color: '#f8fafc' }}>{conv.forDate}</strong>
                                                    </div>
                                                    {conv.bookedAt && (
                                                      <div>
                                                        <i className="bi bi-clock-history" style={{ marginRight: '5px', color: '#38bdf8' }}></i>
                                                        Encoded: <strong style={{ color: '#f8fafc' }}>{conv.bookedAt}</strong>
                                                        {conv.elapsedAfterSms ? <span style={{ color: '#94a3b8' }}> ({conv.elapsedAfterSms})</span> : null}
                                                      </div>
                                                    )}
                                                    {conv.refLabel && (
                                                      <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                                        <i className="bi bi-hash" style={{ marginRight: '3px' }}></i>
                                                        {conv.refLabel}
                                                      </div>
                                                    )}
                                                    <div style={{ fontSize: '10.5px', color: '#38bdf8', marginTop: '2px', paddingTop: '4px', borderTop: '1px solid #1e293b' }}>
                                                      {conv.channelNote}
                                                    </div>
                                                    {conv.note && (
                                                      <div style={{
                                                        fontSize: '10.5px', color: isBookedCancelled ? '#fcd34d' : '#e2e8f0',
                                                        background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '4px 7px', marginTop: '2px',
                                                      }}>
                                                        Note: "{conv.note}"
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                        {Number(row.blocked_attempts || 0) > 0 && (
                                          <span style={{
                                            fontSize: '10.5px', fontWeight: 700, color: '#dc2626',
                                            background: '#fef2f2', padding: '2px 6px', borderRadius: '10px',
                                            whiteSpace: 'nowrap',
                                          }}>
                                            {row.blocked_attempts} blocked
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <div>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '14px',
                                        background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        <i className="bi bi-slash-circle-fill"></i>
                                        No Magic Link Created
                                      </span>
                                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px' }}>
                                        Skipped: Invalid / Missing Mobile #
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* 5. App Activity Status */}
                                <td style={{ padding: '12px 12px' }}>
                                  {isAppOnline ? (
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                                          background: '#dcfce7', color: '#15803d', border: '1px solid #86efac',
                                          padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                                          Online Now
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openCustomerJourney(row.customer_id, row.customer_name, row)}
                                          title="View pages & actions explored by this customer"
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            background: '#f0f9ff', color: '#0369a1', border: '1px solid #7dd3fc',
                                            padding: '2px 8px', borderRadius: '14px', fontSize: '11px', fontWeight: 700,
                                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                          }}
                                        >
                                          <i className="bi bi-compass-fill"></i>
                                          Explore Log{Number(row.activity_count || 0) > 0 ? ` (${row.activity_count})` : ''}
                                        </button>
                                      </div>
                                    </div>
                                  ) : isAppActive || isOpened || Number(row.activity_count || 0) > 0 ? (
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                                          background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                                          padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          Used App ({Math.max(1, Number(row.app_sessions || 0))} sess)
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openCustomerJourney(row.customer_id, row.customer_name, row)}
                                          title="View pages & actions explored by this customer"
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            background: '#f0f9ff', color: '#0369a1', border: '1px solid #7dd3fc',
                                            padding: '2px 8px', borderRadius: '14px', fontSize: '11px', fontWeight: 700,
                                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                          }}
                                        >
                                          <i className="bi bi-compass-fill"></i>
                                          Explore Log{Number(row.activity_count || 0) > 0 ? ` (${row.activity_count})` : ''}
                                        </button>
                                      </div>
                                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                                        Last seen: {formatTimeAgo(row.app_last_seen_at || row.last_accessed_at)}
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>
                                      Awaiting 1st Click
                                    </span>
                                  )}
                                </td>

                                {/* 6. Device & IP Used */}
                                <td style={{ padding: '12px 12px' }}>
                                  {row.bound_platform || row.bound_ip ? (
                                    <div>
                                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '12px' }}>
                                        <i className="bi bi-phone-fill" style={{ color: '#10b981', marginRight: '4px' }}></i>
                                        {row.bound_platform || 'Bound Device'}
                                      </div>
                                      {row.bound_browser && (
                                        <div style={{ fontSize: '10.5px', color: '#475569' }}>
                                          {row.bound_browser}
                                        </div>
                                      )}
                                      <div style={{ fontSize: '11px', color: '#334155', fontFamily: 'monospace', marginTop: '2px' }}>
                                        IP: {row.bound_ip || '—'}
                                      </div>
                                      {row.bound_location && (
                                        <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                          {row.bound_location}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                      — Not bound yet
                                    </span>
                                  )}
                                </td>

                                {/* 7. Actions */}
                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleImpersonate(row.customer_id, row.customer_name)}
                                    style={{
                                      background: 'rgba(245, 158, 11, 0.15)', color: '#b45309',
                                      border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px',
                                      padding: '5px 10px', fontSize: '11.5px', fontWeight: 700,
                                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <i className="bi bi-box-arrow-in-right" style={{ marginRight: '4px' }}></i>
                                    Login as
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Bar (8 per page) */}
                    <div style={{
                      padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Showing <strong>{(safeSmsPage - 1) * SMS_PER_PAGE + 1}</strong>–<strong>{Math.min(safeSmsPage * SMS_PER_PAGE, totalSmsFiltered)}</strong> of <strong>{totalSmsFiltered}</strong> maintenance reminder SMS (8 per page)
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          disabled={safeSmsPage <= 1}
                          onClick={() => handleSmsPageChange(safeSmsPage - 1)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: '1px solid #cbd5e1', background: safeSmsPage <= 1 ? '#f1f5f9' : 'white',
                            color: safeSmsPage <= 1 ? '#94a3b8' : '#0f172a',
                            cursor: safeSmsPage <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          Prev
                        </button>
                        {Array.from({ length: totalSmsPages }, (_, idx) => idx + 1).slice(0, 7).map((pNum) => (
                          <button
                            key={pNum}
                            onClick={() => handleSmsPageChange(pNum)}
                            style={{
                              minWidth: '30px', height: '30px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                              border: safeSmsPage === pNum ? '1px solid #2563eb' : '1px solid #cbd5e1',
                              background: safeSmsPage === pNum ? '#2563eb' : 'white',
                              color: safeSmsPage === pNum ? 'white' : '#334155',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            {pNum}
                          </button>
                        ))}
                        <button
                          disabled={safeSmsPage >= totalSmsPages}
                          onClick={() => handleSmsPageChange(safeSmsPage + 1)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: '1px solid #cbd5e1', background: safeSmsPage >= totalSmsPages ? '#f1f5f9' : 'white',
                            color: safeSmsPage >= totalSmsPages ? '#94a3b8' : '#0f172a',
                            cursor: safeSmsPage >= totalSmsPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ─── 2nd to Last: Who Uses the App (Active Customers & Device Log — 10 per page + Lazy Prefetch) ─── */}
          {(() => {
            const USERS_PER_PAGE = 10;
            const totalUserRows = Math.max(Number(dashData?.active_users_total || 0), activeUsers.length);
            const totalUserPages = Math.max(1, Math.ceil(totalUserRows / USERS_PER_PAGE));
            const safeUsersPage = Math.min(usersPage, totalUserPages);
            const pagedUsers = activeUsers.slice((safeUsersPage - 1) * USERS_PER_PAGE, safeUsersPage * USERS_PER_PAGE);

            return (
              <div style={{
                background: 'white', borderRadius: '18px', overflow: 'hidden',
                border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                marginBottom: '24px',
              }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="bi bi-activity" style={{ color: '#10b981' }}></i>
                      Who Uses the App (Active Customers & Device Log)
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                      Live presence (Online Now = active in last 5m) & historical device sessions across Web, Android, and iOS (10 per page)
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: (kpis.live_online_users || 0) > 0 ? '#dcfce7' : '#f1f5f9',
                      border: `1px solid ${(kpis.live_online_users || 0) > 0 ? '#86efac' : '#cbd5e1'}`,
                      color: (kpis.live_online_users || 0) > 0 ? '#15803d' : '#64748b',
                      fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                    }}>
                      <span style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        background: (kpis.live_online_users || 0) > 0 ? '#16a34a' : '#94a3b8',
                      }} />
                      Online Right Now: {kpis.live_online_users || 0}
                    </span>
                    <span style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569',
                      fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                    }}>
                      Historical Device Rows: {totalUserRows}
                    </span>
                  </div>
                </div>

                {dashLoading && activeUsers.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading activity...</div>
                ) : activeUsers.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No app sessions recorded yet</div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            <th style={{ padding: '12px 18px' }}>Customer</th>
                            <th style={{ padding: '12px 14px' }}>Live Status</th>
                            <th style={{ padding: '12px 14px' }}>Platform</th>
                            <th style={{ padding: '12px 14px' }}>Device / Auth / IP</th>
                            <th style={{ padding: '12px 14px', textAlign: 'center' }}>Sessions</th>
                            <th style={{ padding: '12px 14px' }}>Last Active</th>
                            <th style={{ padding: '12px 18px', textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedUsers.map((u) => {
                            const badge = getPlatformBadge(u.platform);
                            const isOnlineNow = u.presence_status === 'online' || (u.last_seen_at && (Date.now() - new Date(u.last_seen_at).getTime()) <= 5 * 60 * 1000);
                            const isToday = u.presence_status === 'today';
                            return (
                              <tr key={u.telemetry_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '12px 18px' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.full_name}</div>
                                  <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                                    {u.mobile_number} • {u.booking_count || 0} bookings
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    background: isOnlineNow ? '#dcfce7' : isToday ? '#eff6ff' : '#f1f5f9',
                                    color: isOnlineNow ? '#15803d' : isToday ? '#1d4ed8' : '#64748b',
                                    border: `1px solid ${isOnlineNow ? '#86efac' : isToday ? '#bfdbfe' : '#cbd5e1'}`,
                                    padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    <span style={{
                                      width: '6px', height: '6px', borderRadius: '50%',
                                      background: isOnlineNow ? '#16a34a' : isToday ? '#2563eb' : '#94a3b8',
                                    }} />
                                    {isOnlineNow ? 'Online Now' : isToday ? 'Idle (Today)' : 'Offline'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                                    padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    <i className={`bi ${badge.icon}`}></i>
                                    {badge.label}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12.5px' }}>
                                  <div style={{ fontWeight: 600 }}>{u.device_label || u.app_type}</div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    via {u.auth_method || 'session'}{u.ip_address ? ` • IP: ${u.ip_address}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                                  {u.session_count || 1}
                                </td>
                                <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatTimeAgo(u.last_seen_at)}</div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                      type="button"
                                      onClick={() => openCustomerJourney(u.customer_id, u.full_name)}
                                      style={{
                                        background: '#f0f9ff', color: '#0369a1',
                                        border: '1px solid #7dd3fc', borderRadius: '8px',
                                        padding: '5px 10px', fontSize: '12px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      }}
                                    >
                                      <i className="bi bi-compass-fill"></i>
                                      Explore Log{Number(u.activity_count || 0) > 0 ? ` (${u.activity_count})` : ''}
                                    </button>
                                    <button
                                      onClick={() => handleImpersonate(u.customer_id, u.full_name)}
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.15)', color: '#b45309',
                                        border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px',
                                        padding: '5px 12px', fontSize: '12px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <i className="bi bi-box-arrow-in-right" style={{ marginRight: '4px' }}></i>
                                      Login as
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Bar (10 per page + Lazy Prefetch) */}
                    <div style={{
                      padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Showing <strong>{(safeUsersPage - 1) * USERS_PER_PAGE + 1}</strong>–<strong>{Math.min(safeUsersPage * USERS_PER_PAGE, totalUserRows)}</strong> of <strong>{totalUserRows}</strong> active sessions
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          disabled={safeUsersPage <= 1}
                          onClick={() => handleUsersPageChange(safeUsersPage - 1)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: '1px solid #cbd5e1', background: safeUsersPage <= 1 ? '#f1f5f9' : 'white',
                            color: safeUsersPage <= 1 ? '#94a3b8' : '#0f172a',
                            cursor: safeUsersPage <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          Prev
                        </button>
                        {Array.from({ length: totalUserPages }, (_, idx) => idx + 1).slice(0, 7).map((pNum) => (
                          <button
                            key={pNum}
                            onClick={() => handleUsersPageChange(pNum)}
                            style={{
                              minWidth: '30px', height: '30px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                              border: safeUsersPage === pNum ? '1px solid #0f172a' : '1px solid #cbd5e1',
                              background: safeUsersPage === pNum ? '#0f172a' : 'white',
                              color: safeUsersPage === pNum ? 'white' : '#334155',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            {pNum}
                          </button>
                        ))}
                        <button
                          disabled={safeUsersPage >= totalUserPages}
                          onClick={() => handleUsersPageChange(safeUsersPage + 1)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: '1px solid #cbd5e1', background: safeUsersPage >= totalUserPages ? '#f1f5f9' : 'white',
                            color: safeUsersPage >= totalUserPages ? '#94a3b8' : '#0f172a',
                            cursor: safeUsersPage >= totalUserPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ─── Last Widget: Magic Link Security & Intrusion Audit Log (5 per page + Lazy Prefetch) ─── */}
          <style>{`
            @keyframes mpLiveDotBlink {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.35; transform: scale(0.88); }
            }
            @keyframes mpLiveRingExpand {
              0% { transform: scale(0.95); opacity: 0.75; }
              70% { transform: scale(2.15); opacity: 0; }
              100% { transform: scale(2.15); opacity: 0; }
            }
          `}</style>
          <div style={{
            background: 'white', borderRadius: '18px', overflow: 'hidden',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}>
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px',
              background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="bi bi-shield-exclamation" style={{ color: '#dc2626', fontSize: '18px' }}></i>
                    Magic Link Security & Intrusion Audit Log
                  </h3>

                  {/* Live Monitoring Blinking Red Dot Badge */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '7px',
                    background: '#fef2f2', border: '1px solid #fecaca',
                    color: '#dc2626', fontSize: '11px', fontWeight: 800,
                    padding: '4px 10px', borderRadius: '20px', letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
                      <span style={{
                        position: 'absolute', inset: 0, borderRadius: '50%',
                        background: '#ef4444', animation: 'mpLiveRingExpand 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                      }} />
                      <span style={{
                        position: 'relative', display: 'inline-block', width: '8px', height: '8px',
                        borderRadius: '50%', background: '#dc2626',
                        animation: 'mpLiveDotBlink 1.5s ease-in-out infinite',
                      }} />
                    </span>
                    LIVE MONITORING • {lastSyncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Tracks 2nd-device link sharing, exact accessed URL, browser/OS fingerprint, IP/Geo-ISP, server HTTP logs & tiered lockouts (5 per page)
                </p>

                {/* Filter Pills + Search & Sort Toolbar */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: `All Server Events (${securityOverview.total_all_events ?? magicSecurityLogs.length})` },
                      { key: 'blocked', label: `Blocked Intrusions (${securityOverview.total_intrusion_events ?? 0})` },
                      { key: 'authorized', label: `Authorized Opens (${securityOverview.total_authorized_events ?? 0})` },
                      { key: 'bot', label: `Preview Bots (${securityOverview.total_bot_events ?? 0})` },
                    ].map((f) => (
                      <button
                        key={f.key}
                        onClick={() => handleSecFilterChange(f.key)}
                        style={{
                          padding: '5px 11px', borderRadius: '16px', fontSize: '11.5px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          border: secLogFilter === f.key ? '1px solid #0f172a' : '1px solid #e2e8f0',
                          background: secLogFilter === f.key ? '#0f172a' : 'white',
                          color: secLogFilter === f.key ? 'white' : '#475569',
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Search Input (Name, Mobile, #ID, Vehicle, Device, Browser, IP, Slug) */}
                  <div style={{
                    position: 'relative', display: 'flex', alignItems: 'center',
                    minWidth: '280px', flex: '1 1 280px', maxWidth: '420px',
                  }}>
                    <i className="bi bi-search" style={{
                      position: 'absolute', left: '11px', fontSize: '12.5px', color: '#64748b', pointerEvents: 'none',
                    }}></i>
                    <input
                      type="text"
                      value={secSearch}
                      onChange={(e) => handleSecSearchChange(e.target.value)}
                      placeholder="Search name, mobile, #ID, vehicle, device, IP, URL..."
                      style={{
                        width: '100%', padding: '6px 28px 6px 32px', borderRadius: '10px',
                        border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 500,
                        color: '#0f172a', background: 'white', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    {secSearch && (
                      <button
                        type="button"
                        onClick={() => handleSecSearchChange('')}
                        title="Clear search"
                        style={{
                          position: 'absolute', right: '7px', border: 'none', background: 'transparent',
                          color: '#64748b', cursor: 'pointer', fontSize: '13px', padding: '2px 4px',
                        }}
                      >
                        <i className="bi bi-x-circle-fill"></i>
                      </button>
                    )}
                  </div>

                  {/* Sort Select */}
                  <select
                    value={secSort}
                    onChange={(e) => handleSecSortChange(e.target.value)}
                    style={{
                      padding: '6px 10px', borderRadius: '10px', border: '1px solid #cbd5e1',
                      fontSize: '12px', fontWeight: 700, color: '#0f172a', background: 'white',
                      fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                    }}
                  >
                    <option value="newest">Sort: Newest First</option>
                    <option value="most_attempts">Sort: Most Attempts</option>
                    <option value="customer_az">Sort: Customer Name (A–Z)</option>
                    <option value="ip_az">Sort: IP Address</option>
                    <option value="oldest">Sort: Oldest First</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                  fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                }}>
                  Blocked Attempts: {securityOverview.blocked_attempts || 0}
                </span>
                <span style={{
                  background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c',
                  fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                }}>
                  Blocked Devices: {securityOverview.blocked_devices_count || 0}
                </span>
                <span style={{
                  background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155',
                  fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                }}>
                  Blocked IPs: {securityOverview.blocked_ips_count || 0}
                </span>
              </div>
            </div>

            {(() => {
              const SEC_PER_PAGE = 5;
              const qLower = secSearch.trim().toLowerCase();
              const qIdClean = qLower.replace(/^#/, '');

              const filteredLogs = magicSecurityLogs
                .filter((log) => {
                  if (secLogFilter === 'blocked') {
                    if (log.event_type === 'first_bind' || log.event_type === 'authorized_access' || log.event_type === 'preview_bot_ignored') return false;
                  } else if (secLogFilter === 'authorized') {
                    if (log.event_type !== 'first_bind' && log.event_type !== 'authorized_access') return false;
                  } else if (secLogFilter === 'bot') {
                    if (log.event_type !== 'preview_bot_ignored') return false;
                  }

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

                  return blob.includes(qLower) || (qIdClean && blob.includes(qIdClean));
                })
                .sort((a, b) => {
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

              const totalFilteredCount = qLower
                ? filteredLogs.length
                : Math.max(
                    filteredLogs.length,
                    secLogFilter === 'blocked'
                      ? Number(securityOverview.total_intrusion_events || 0)
                      : secLogFilter === 'authorized'
                      ? Number(securityOverview.total_authorized_events || 0)
                      : secLogFilter === 'bot'
                      ? Number(securityOverview.total_bot_events || 0)
                      : Number(securityOverview.total_all_events || 0)
                  );

              const totalSecPages = Math.max(1, Math.ceil(totalFilteredCount / SEC_PER_PAGE));
              const safeSecPage = Math.min(secPage, totalSecPages);
              const pagedSecLogs = filteredLogs.slice((safeSecPage - 1) * SEC_PER_PAGE, safeSecPage * SEC_PER_PAGE);

              if (filteredLogs.length === 0) {
                return (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
                    No magic link security events matching this filter.
                  </div>
                );
              }

              return (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Target Account & Vehicle</th>
                          <th style={{ padding: '11px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Exact Accessed URL & Server Log</th>
                          <th style={{ padding: '11px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Security Event</th>
                          <th style={{ padding: '11px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Device, Browser, OS & Fingerprint</th>
                          <th style={{ padding: '11px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>IP Address & Geo / ISP</th>
                          <th style={{ padding: '11px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Attempts</th>
                          <th style={{ padding: '11px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>When</th>
                          <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Security Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedSecLogs.map((log) => {
                          const isIntrusion = log.event_type !== 'first_bind' && log.event_type !== 'authorized_access' && log.event_type !== 'preview_bot_ignored';
                          const isBot = log.event_type === 'preview_bot_ignored';
                          const isDeviceBlocked = Number(log.is_device_blocked) > 0;
                          const isIpBlocked = Number(log.is_ip_blocked) > 0;
                          const isLinkRevoked = log.link_status === 'revoked';
                          const vehicleLabel = [log.vehicle_make, log.vehicle_model].filter(Boolean).join(' ') || 'Vehicle';
                          const fullUrl = log.request_url || `https://care.maskpro.ph/m/${log.slug}`;
                          const shortFingerprint = log.device_fingerprint
                            ? `${String(log.device_fingerprint).slice(0, 10)}...${String(log.device_fingerprint).slice(-6)}`
                            : 'N/A';

                          let eventBadge = { label: 'Initial Device Lock', bg: '#dcfce7', color: '#15803d', border: '#86efac', icon: 'bi-lock-fill' };
                          if (log.event_type === 'authorized_access') {
                            eventBadge = { label: 'Authorized Open', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc', icon: 'bi-check-circle-fill' };
                          } else if (log.event_type === 'preview_bot_ignored') {
                            eventBadge = { label: 'Preview Bot Ignored', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', icon: 'bi-robot' };
                          } else if (log.event_type === 'device_locked_elsewhere') {
                            eventBadge = { label: 'Blocked: 2nd Device', bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: 'bi-phone-flip' };
                          } else if (log.event_type === 'invalid_token') {
                            eventBadge = { label: 'Blocked: Invalid Key', bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: 'bi-key-fill' };
                          } else if (log.event_type === 'invalid_slug') {
                            eventBadge = { label: 'Brute-Force Slug (404)', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', icon: 'bi-bug-fill' };
                          } else if (log.event_type === 'revoked_link') {
                            eventBadge = { label: 'Blocked: Link Revoked', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', icon: 'bi-slash-circle-fill' };
                          } else if (log.event_type === 'device_blocked' || log.action_taken === 'auto_device_blocked') {
                            eventBadge = { label: 'Device Blocked (10+)', bg: '#fef2f2', color: '#991b1b', border: '#fca5a5', icon: 'bi-shield-slash-fill' };
                          } else if (log.event_type === 'ip_blocked' || log.action_taken === 'auto_ip_blocked') {
                            eventBadge = { label: 'IP Blocked (100+)', bg: '#450a0a', color: '#ffffff', border: '#7f1d1d', icon: 'bi-cone-striped' };
                          }

                          return (
                            <tr
                              key={log.id}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: isIntrusion ? 'rgba(254, 242, 242, 0.38)' : isBot ? '#f8fafc' : 'white',
                                verticalAlign: 'top',
                              }}
                            >
                              {/* 1. Target Account & Vehicle */}
                              <td style={{ padding: '13px 12px', minWidth: '150px' }}>
                                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                                  {log.customer_name || 'Unknown / Guessed Link'}
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                                  {log.customer_mobile ? (
                                    <>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{log.customer_mobile}</span>
                                      {log.customer_id ? ` • ID #${log.customer_id}` : ''}
                                    </>
                                  ) : 'Unmatched target'}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 700, marginTop: '3px' }}>
                                  <i className="bi bi-car-front-fill" style={{ marginRight: '4px' }}></i>
                                  {vehicleLabel}
                                  {log.vehicle_plate ? ` (${log.vehicle_plate})` : ''}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                  Link Status:{' '}
                                  <strong style={{ color: isLinkRevoked ? '#dc2626' : '#15803d' }}>
                                    {isLinkRevoked ? 'REVOKED' : 'Active'}
                                  </strong>
                                </div>
                              </td>

                              {/* 2. Exact Accessed URL & Server Log */}
                              <td style={{ padding: '13px 10px', minWidth: '190px', maxWidth: '250px' }}>
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '6px',
                                  background: '#f8fafc', border: '1px solid #e2e8f0',
                                  borderRadius: '8px', padding: '5px 8px',
                                }}>
                                  <code style={{
                                    fontSize: '11px', color: '#1d4ed8', fontWeight: 700,
                                    wordBreak: 'break-all', lineHeight: 1.35, flex: 1,
                                  }}>
                                    {fullUrl}
                                  </code>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard?.writeText(fullUrl);
                                      showToast('Exact accessed URL copied to clipboard');
                                    }}
                                    title="Copy exact accessed URL"
                                    style={{
                                      border: 'none', background: '#e2e8f0', color: '#334155',
                                      borderRadius: '6px', padding: '3px 6px', fontSize: '11px',
                                      cursor: 'pointer', flexShrink: 0,
                                    }}
                                  >
                                    <i className="bi bi-clipboard"></i>
                                  </button>
                                </div>

                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                                  marginTop: '6px', fontSize: '11px', fontWeight: 700,
                                  fontFamily: 'monospace',
                                  color: Number(log.http_status) >= 400 ? '#dc2626' : '#0f172a',
                                }}>
                                  <span style={{
                                    background: Number(log.http_status) >= 400 ? '#fee2e2' : '#dcfce7',
                                    color: Number(log.http_status) >= 400 ? '#991b1b' : '#166534',
                                    padding: '1px 6px', borderRadius: '4px',
                                  }}>
                                    HTTP {log.http_status || (isIntrusion ? 403 : 200)}
                                  </span>
                                  <span>{log.server_code || (isIntrusion ? 'DEVICE_LOCKED_ELSEWHERE' : 'OK')}</span>
                                </div>

                                {log.request_headers && (
                                  <div style={{
                                    fontSize: '10.5px', color: '#64748b', marginTop: '4px',
                                    fontFamily: 'monospace', lineHeight: 1.35,
                                  }}>
                                    {log.request_headers}
                                  </div>
                                )}
                              </td>

                              {/* 3. Security Event */}
                              <td style={{ padding: '13px 10px', minWidth: '140px' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                                  padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700,
                                  background: eventBadge.bg, color: eventBadge.color, border: `1px solid ${eventBadge.border}`,
                                  whiteSpace: 'nowrap',
                                }}>
                                  <i className={`bi ${eventBadge.icon}`}></i>
                                  {eventBadge.label}
                                </span>
                                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginTop: '5px' }}>
                                  {isIpBlocked
                                    ? 'Firewall: IP Blocked'
                                    : isDeviceBlocked
                                    ? 'Firewall: Device Blocked'
                                    : log.action_taken === 'bot_ignored'
                                    ? 'Lock Preserved (202)'
                                    : log.action_taken === 'allowed'
                                    ? 'Authorized & Bound (200)'
                                    : 'Rejected at Gate (403)'}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>
                                  Event #{log.id}
                                </div>
                              </td>

                              {/* 4. Device, Browser, OS & Fingerprint */}
                              <td style={{ padding: '13px 10px', minWidth: '205px', maxWidth: '265px' }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 800, color: isIntrusion ? '#dc2626' : '#0f172a' }}>
                                  <i className={`bi ${/iPhone|Android|Mobile/i.test(log.attempted_platform || '') ? 'bi-phone-fill' : 'bi-laptop'}`} style={{ marginRight: '5px' }}></i>
                                  Attempted: {log.attempted_platform || 'Unknown Device'}
                                </div>

                                {log.browser_detail && (
                                  <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '3px' }}>
                                    <strong>Browser:</strong> {log.browser_detail}
                                  </div>
                                )}

                                {log.os_detail && (
                                  <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                                    <strong>OS / HW:</strong> {log.os_detail}
                                  </div>
                                )}

                                {log.bound_platform && (
                                  <div style={{
                                    fontSize: '11px', color: '#15803d', background: '#f0fdf4',
                                    border: '1px solid #bbf7d0', borderRadius: '6px',
                                    padding: '3px 7px', marginTop: '5px', display: 'inline-block',
                                  }}>
                                    <i className="bi bi-lock-fill" style={{ marginRight: '4px' }}></i>
                                    Locked Owner: <strong>{log.bound_platform}</strong>
                                  </div>
                                )}

                                <div style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px' }}>
                                  Device Hash: {shortFingerprint}
                                </div>

                                {log.user_agent && (
                                  <div
                                    style={{
                                      fontSize: '10px', color: '#64748b', marginTop: '4px',
                                      background: '#f8fafc', border: '1px solid #e2e8f0',
                                      borderRadius: '6px', padding: '4px 6px', fontFamily: 'monospace',
                                      wordBreak: 'break-all', lineHeight: 1.3,
                                    }}
                                  >
                                    UA: {log.user_agent}
                                  </div>
                                )}
                              </td>

                              {/* 5. IP Address & Geo / ISP */}
                              <td style={{ padding: '13px 10px', minWidth: '150px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                                  {log.ip_address}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '3px', lineHeight: 1.35 }}>
                                  <i className="bi bi-geo-alt-fill" style={{ color: '#ef4444', marginRight: '4px' }}></i>
                                  {log.location || 'Philippines'}
                                </div>
                                {log.bound_ip && (
                                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                                    Owner Bound IP: {log.bound_ip}
                                  </div>
                                )}
                              </td>

                              {/* 6. Attempts & Brute-Force Thresholds */}
                              <td style={{ padding: '13px 10px', textAlign: 'center', minWidth: '115px' }}>
                                {isIntrusion ? (
                                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '5px', fontSize: '11.5px', width: '100%' }}>
                                    <div style={{
                                      background: log.device_attempt_count >= 10 ? '#fef2f2' : '#f8fafc',
                                      border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px',
                                    }}>
                                      <div style={{ fontWeight: 800, color: log.device_attempt_count >= 10 ? '#dc2626' : '#0f172a', whiteSpace: 'nowrap' }}>
                                        Device: {log.device_attempt_count} / 10
                                      </div>
                                      <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '3px', marginTop: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                          width: `${Math.min(100, (Number(log.device_attempt_count || 1) / 10) * 100)}%`,
                                          height: '100%',
                                          background: log.device_attempt_count >= 8 ? '#dc2626' : '#f59e0b',
                                        }} />
                                      </div>
                                    </div>

                                    <div style={{
                                      background: log.ip_attempt_count >= 100 ? '#fef2f2' : '#f8fafc',
                                      border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px',
                                    }}>
                                      <div style={{ fontWeight: 700, color: log.ip_attempt_count >= 100 ? '#dc2626' : '#475569', whiteSpace: 'nowrap' }}>
                                        IP: {log.ip_attempt_count} / 100
                                      </div>
                                      <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '3px', marginTop: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                          width: `${Math.min(100, Math.max(6, (Number(log.ip_attempt_count || 1) / 100) * 100))}%`,
                                          height: '100%',
                                          background: '#dc2626',
                                        }} />
                                      </div>
                                    </div>

                                    <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                      Link Total: <strong>{log.blocked_attempts || 0}</strong> blocked
                                    </div>
                                  </div>
                                ) : isBot ? (
                                  <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700 }}>
                                    0 (Crawler)
                                  </span>
                                ) : (
                                  <div style={{ fontSize: '11.5px' }}>
                                    <span style={{ color: '#15803d', fontWeight: 800 }}>
                                      {log.event_type === 'first_bind' ? '1st Open (Bound)' : 'Verified Device'}
                                    </span>
                                    <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                                      Total Opens: <strong>{log.access_count || 1}</strong>
                                    </div>
                                  </div>
                                )}
                              </td>

                              {/* 7. When */}
                              <td style={{ padding: '13px 10px', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatTimeAgo(log.created_at)}</div>
                                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                                  {log.created_at ? new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                                  {log.created_at ? new Date(log.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''}
                                </div>
                              </td>

                              {/* 8. Security Actions */}
                              <td style={{ padding: '13px 12px', textAlign: 'right', minWidth: '135px' }}>
                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                  {isIntrusion && log.device_fingerprint && (
                                    <button
                                      disabled={secActionLoading === `dev:${log.id}`}
                                      onClick={() => handleSecurityAction({
                                        action: isDeviceBlocked ? 'unblock_device' : 'block_device',
                                        log_id: log.id,
                                        device_fingerprint: log.device_fingerprint,
                                        device_token_hash: log.device_token_hash,
                                        device_label: log.attempted_platform,
                                        ip_address: log.ip_address,
                                        user_agent: log.user_agent,
                                      }, `dev:${log.id}`)}
                                      style={{
                                        padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        background: isDeviceBlocked ? '#f0fdf4' : '#fff7ed',
                                        border: `1px solid ${isDeviceBlocked ? '#86efac' : '#fdba74'}`,
                                        color: isDeviceBlocked ? '#15803d' : '#c2410c',
                                      }}
                                    >
                                      <i className={`bi ${isDeviceBlocked ? 'bi-unlock-fill' : 'bi-phone-vibrate-fill'}`} style={{ marginRight: '4px' }}></i>
                                      {isDeviceBlocked ? 'Unblock Device' : 'Block Device'}
                                    </button>
                                  )}

                                  {isIntrusion && log.ip_address && (
                                    <button
                                      disabled={secActionLoading === `ip:${log.id}`}
                                      onClick={() => handleSecurityAction({
                                        action: isIpBlocked ? 'unblock_ip' : 'block_ip',
                                        log_id: log.id,
                                        ip_address: log.ip_address,
                                      }, `ip:${log.id}`)}
                                      style={{
                                        padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        background: isIpBlocked ? '#f0fdf4' : '#fef2f2',
                                        border: `1px solid ${isIpBlocked ? '#86efac' : '#fecaca'}`,
                                        color: isIpBlocked ? '#15803d' : '#dc2626',
                                      }}
                                    >
                                      <i className={`bi ${isIpBlocked ? 'bi-shield-check' : 'bi-shield-fill-x'}`} style={{ marginRight: '4px' }}></i>
                                      {isIpBlocked ? 'Unblock IP' : 'Block IP'}
                                    </button>
                                  )}

                                  {log.magic_link_id && (
                                    <button
                                      disabled={secActionLoading === `reset:${log.id}`}
                                      onClick={() => handleSecurityAction({
                                        action: 'reset_device_lock',
                                        magic_link_id: log.magic_link_id,
                                      }, `reset:${log.id}`)}
                                      title="Clear the bound device so the customer can open this link on their new phone"
                                      style={{
                                        padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb',
                                      }}
                                    >
                                      <i className="bi bi-arrow-counterclockwise" style={{ marginRight: '4px' }}></i>
                                      Reset Lock
                                    </button>
                                  )}

                                  {log.magic_link_id && (
                                    <button
                                      disabled={secActionLoading === `rev:${log.id}`}
                                      onClick={() => handleSecurityAction({
                                        action: isLinkRevoked ? 'reactivate_link' : 'revoke_link',
                                        magic_link_id: log.magic_link_id,
                                      }, `rev:${log.id}`)}
                                      style={{
                                        padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        background: isLinkRevoked ? '#f0fdf4' : '#f8fafc',
                                        border: `1px solid ${isLinkRevoked ? '#86efac' : '#cbd5e1'}`,
                                        color: isLinkRevoked ? '#15803d' : '#475569',
                                      }}
                                    >
                                      {isLinkRevoked ? 'Restore Link' : 'Revoke Link'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Bar (5 per page + Smart Lazy Prefetch) */}
                  <div style={{
                    padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                  }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Showing <strong>{(safeSecPage - 1) * SEC_PER_PAGE + 1}</strong>–<strong>{Math.min(safeSecPage * SEC_PER_PAGE, totalFilteredCount)}</strong> of <strong>{totalFilteredCount}</strong> security events (5 per page)
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        disabled={safeSecPage <= 1}
                        onClick={() => handleSecPageChange(safeSecPage - 1)}
                        style={{
                          padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid #cbd5e1', background: safeSecPage <= 1 ? '#f1f5f9' : 'white',
                          color: safeSecPage <= 1 ? '#94a3b8' : '#0f172a',
                          cursor: safeSecPage <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        Prev
                      </button>
                      {Array.from({ length: totalSecPages }, (_, idx) => idx + 1).slice(0, 7).map((pNum) => (
                        <button
                          key={pNum}
                          onClick={() => handleSecPageChange(pNum)}
                          style={{
                            minWidth: '30px', height: '30px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: safeSecPage === pNum ? '1px solid #0f172a' : '1px solid #cbd5e1',
                            background: safeSecPage === pNum ? '#0f172a' : 'white',
                            color: safeSecPage === pNum ? 'white' : '#334155',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {pNum}
                        </button>
                      ))}
                      <button
                        disabled={safeSecPage >= totalSecPages}
                        onClick={() => handleSecPageChange(safeSecPage + 1)}
                        style={{
                          padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid #cbd5e1', background: safeSecPage >= totalSecPages ? '#f1f5f9' : 'white',
                          color: safeSecPage >= totalSecPages ? '#94a3b8' : '#0f172a',
                          cursor: safeSecPage >= totalSecPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2: COMMUNITY MODERATION QUEUE
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'moderation' && (
        <div>
          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { id: 'pending', label: 'Pending Approval', count: modCounts.pending, color: '#d97706' },
              { id: 'sos', label: 'MASKPRO S.O.S.', count: modCounts.active_sos, color: '#dc2626' },
              { id: 'approved', label: 'Approved', count: modCounts.approved, color: '#10b981' },
              { id: 'rejected', label: 'Rejected / Hidden', count: modCounts.rejected, color: '#64748b' },
              { id: 'all', label: 'All Posts', count: modCounts.total, color: '#2563eb' },
            ].map((f) => {
              const active = modFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setModFilter(f.id); loadModerationPosts(f.id); }}
                  style={{
                    padding: '8px 14px', borderRadius: '10px',
                    border: active ? `1.5px solid ${f.color}` : '1px solid #e2e8f0',
                    background: active ? 'white' : '#f8fafc',
                    color: active ? '#0f172a' : '#64748b',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  <span>{f.label}</span>
                  <span style={{
                    background: active ? f.color : '#e2e8f0',
                    color: active ? 'white' : '#475569',
                    fontSize: '11px', fontWeight: 800, padding: '1px 7px', borderRadius: '20px',
                  }}>
                    {f.count || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {modLoading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px' }}>
              Loading community posts...
            </div>
          ) : modPosts.length === 0 ? (
            <div style={{
              background: 'white', borderRadius: '18px', padding: '48px 20px',
              textAlign: 'center', border: '1px dashed #cbd5e1',
            }}>
              <i className="bi bi-check2-circle" style={{ fontSize: '42px', color: '#10b981', display: 'block', marginBottom: '10px' }}></i>
              <h3 style={{ margin: '0 0 6px', fontSize: '17px', color: '#0f172a' }}>No posts in this queue</h3>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
                {modFilter === 'pending'
                  ? 'All Maintenance Discussion posts have been reviewed!'
                  : 'No community posts match the selected filter.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {modPosts.map((post) => {
                const isSos = post.type === 'sos';
                const isPending = post.moderation_status === 'pending';
                const isApproved = post.is_approved === 1 && post.moderation_status === 'approved';
                return (
                  <div
                    key={post.id}
                    style={{
                      background: 'white', borderRadius: '16px', padding: '20px',
                      border: isPending
                        ? '2px solid #fcd34d'
                        : isSos && post.status === 'open'
                        ? '2px solid #fecaca'
                        : '1px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{
                            background: isSos ? '#fef2f2' : '#eff6ff',
                            color: isSos ? '#dc2626' : '#2563eb',
                            border: `1px solid ${isSos ? '#fecaca' : '#bfdbfe'}`,
                            fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                          }}>
                            {isSos ? 'MASKPRO S.O.S.' : 'MAINTENANCE DISCUSSION'}
                          </span>
                          <span style={{
                            background: isPending ? '#fef3c7' : isApproved ? '#dcfce7' : '#f1f5f9',
                            color: isPending ? '#b45309' : isApproved ? '#15803d' : '#64748b',
                            fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                          }}>
                            {isPending ? 'Pending Admin Approval' : isApproved ? 'Approved & Live' : 'Rejected / Hidden'}
                          </span>
                          {isSos && (
                            <span style={{
                              background: post.status === 'resolved' ? '#dcfce7' : '#fee2e2',
                              color: post.status === 'resolved' ? '#15803d' : '#b91c1c',
                              fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                            }}>
                              {post.status === 'resolved' ? 'Resolved' : 'Open Emergency'}
                            </span>
                          )}
                        </div>
                        <h4 style={{ margin: '6px 0 2px', fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                          {post.title}
                        </h4>
                        <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                          By <strong>{post.author_name}</strong> ({post.author_mobile || 'N/A'}) • {formatTimeAgo(post.created_at)} • {post.comment_count || 0} comments
                        </div>
                      </div>
                    </div>

                    {post.location && (
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#dc2626', marginBottom: '8px' }}>
                        <i className="bi bi-geo-alt-fill" style={{ marginRight: '4px' }}></i>
                        {post.location}
                      </div>
                    )}

                    <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '12px 14px', borderRadius: '10px' }}>
                      {post.body}
                    </p>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {(!isApproved || isPending) && (
                        <button
                          disabled={!!modActionLoading}
                          onClick={() => handleModerate(post.id, 'approve')}
                          style={{
                            background: '#10b981', color: 'white', border: 'none', borderRadius: '8px',
                            padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          <i className="bi bi-check-lg"></i> Approve & Publish
                        </button>
                      )}

                      {post.moderation_status !== 'rejected' && (
                        <button
                          disabled={!!modActionLoading}
                          onClick={() => handleModerate(post.id, 'reject')}
                          style={{
                            background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '8px',
                            padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          <i className="bi bi-eye-slash"></i> Reject / Hide
                        </button>
                      )}

                      {isSos && post.status === 'open' && (
                        <button
                          disabled={!!modActionLoading}
                          onClick={() => handleModerate(post.id, 'resolve')}
                          style={{
                            background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '8px',
                            padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          <i className="bi bi-check2-all"></i> Mark S.O.S. Resolved
                        </button>
                      )}

                      <button
                        disabled={!!modActionLoading}
                        onClick={() => handleModerate(post.id, 'delete')}
                        style={{
                          background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px',
                          padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        <i className="bi bi-trash3"></i> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3: CUSTOMER IMPERSONATION DIRECTORY
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'impersonate' && (
        <div>
          {/* Search */}
          <div style={{
            background: 'white', borderRadius: '16px', padding: '14px 18px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)', marginBottom: '18px',
            display: 'flex', alignItems: 'center', gap: '12px',
            border: '1px solid #e2e8f0',
          }}>
            <i className="bi bi-search" style={{ fontSize: '17px', color: '#94a3b8' }}></i>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search customer by name or mobile number..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', color: '#1e293b', fontFamily: 'inherit', background: 'transparent' }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); loadCustomers(1, ''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}
              >
                <i className="bi bi-x-circle"></i>
              </button>
            )}
          </div>

          {/* Customer Table */}
          <div style={{
            background: 'white', borderRadius: '18px', overflow: 'hidden',
            boxShadow: '0 4px 18px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0',
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div className="spinner" style={{ width: '36px', height: '36px', margin: '0 auto 14px' }}></div>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading customers...</p>
              </div>
            ) : customers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <i className="bi bi-people" style={{ fontSize: '42px', color: '#cbd5e1' }}></i>
                <p style={{ color: '#94a3b8', marginTop: '10px' }}>No customers found</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      <th style={{ padding: '14px 20px' }}>Customer</th>
                      <th style={{ padding: '14px 16px' }}>Mobile</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center' }}>Bookings</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '13px 20px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.full_name || 'Unknown'}</div>
                          {c.email && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{c.email}</div>}
                        </td>
                        <td style={{ padding: '13px 16px', color: '#475569', fontFamily: 'monospace', fontSize: '13px' }}>
                          {c.mobile_number || '—'}
                        </td>
                        <td style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>
                          {c.booking_count}
                        </td>
                        <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleImpersonate(c.id, c.full_name)}
                            disabled={impersonating}
                            style={{
                              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                              color: '#78350f', border: 'none', borderRadius: '9px', padding: '6px 14px',
                              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              fontFamily: 'inherit', whiteSpace: 'nowrap',
                            }}
                          >
                            <i className="bi bi-box-arrow-in-right"></i> Login as
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
              <button
                onClick={() => loadCustomers(page - 1, search)}
                disabled={page <= 1}
                style={{
                  padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                  background: 'white', color: page <= 1 ? '#cbd5e1' : '#2563eb',
                  fontWeight: 600, fontSize: '13px', cursor: page <= 1 ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                ← Previous
              </button>
              <span style={{ padding: '8px 16px', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => loadCustomers(page + 1, search)}
                disabled={page >= pagination.totalPages}
                style={{
                  padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                  background: 'white', color: page >= pagination.totalPages ? '#cbd5e1' : '#2563eb',
                  fontWeight: 600, fontSize: '13px', cursor: page >= pagination.totalPages ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
