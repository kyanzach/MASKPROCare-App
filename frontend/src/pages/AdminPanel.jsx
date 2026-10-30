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
  const [impersonating, setImpersonating] = useState(false);
  const [secActionLoading, setSecActionLoading] = useState(null);
  const [secLogFilter, setSecLogFilter] = useState('all');
  const [secSearch, setSecSearch] = useState('');
  const [secSort, setSecSort] = useState('newest');
  const [secPage, setSecPage] = useState(1);
  const [secLimit, setSecLimit] = useState(10); // Prefetch 2 pages (5 per page = 10 items) initially
  const [smsFilter, setSmsFilter] = useState('today');
  const [smsSearch, setSmsSearch] = useState('');
  const [smsSort, setSmsSort] = useState('newest');
  const [smsPage, setSmsPage] = useState(1);
  const [smsLimit, setSmsLimit] = useState(40); // Prefetch 5 pages (8 per page = 40 items) initially
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(20); // Prefetch 2 pages (10 per page = 20 items) initially
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date());
  const modFilterRef = useRef('pending');
  const dashParamsRef = useRef({
    secLimit: 10, secFilter: 'all', secSearch: '', secSort: 'newest',
    smsLimit: 40, smsFilter: 'today', smsSearch: '', smsSort: 'newest',
    usersLimit: 20,
  });

  useEffect(() => {
    modFilterRef.current = modFilter;
  }, [modFilter]);

  useEffect(() => {
    dashParamsRef.current = {
      secLimit, secFilter: secLogFilter, secSearch, secSort,
      smsLimit, smsFilter, smsSearch, smsSort,
      usersLimit,
    };
  }, [secLimit, secLogFilter, secSearch, secSort, smsLimit, smsFilter, smsSearch, smsSort, usersLimit]);

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
        `/admin/dashboard?sec_limit=${p.secLimit}&sec_filter=${encodeURIComponent(p.secFilter)}&sec_search=${encodeURIComponent(p.secSearch || '')}&sec_sort=${encodeURIComponent(p.secSort || 'newest')}&sms_limit=${p.smsLimit || 40}&sms_filter=${encodeURIComponent(p.smsFilter || 'today')}&sms_search=${encodeURIComponent(p.smsSearch || '')}&sms_sort=${encodeURIComponent(p.smsSort || 'newest')}&users_limit=${p.usersLimit}`
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

  // Handlers for Maintenance Reminder SMS & Magic Link Delivery Tracker (8 per page):
  const handleSmsPageChange = (nextPage) => {
    setSmsPage(nextPage);
    const neededLimit = (nextPage + 2) * 8;
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
    const updated = { ...dashParamsRef.current, smsFilter: nextFilter, smsLimit: Math.max(smsLimit, 40) };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSmsSearchChange = (val) => {
    setSmsSearch(val);
    setSmsPage(1);
    const needed = val.trim() ? Math.max(smsLimit, 80) : 40;
    setSmsLimit(needed);
    const updated = { ...dashParamsRef.current, smsSearch: val, smsLimit: needed };
    dashParamsRef.current = updated;
    loadDashboard(true, updated);
  };

  const handleSmsSortChange = (nextSort) => {
    setSmsSort(nextSort);
    setSmsPage(1);
    const updated = { ...dashParamsRef.current, smsSort: nextSort };
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

          {/* ─── NEW WIDGET: Maintenance Reminder SMS & Magic Link Delivery Tracker (8 per page + Lazy Prefetch) ─── */}
          {(() => {
            const SMS_PER_PAGE = 8;
            const smsQuery = smsSearch.trim().toLowerCase();
            const smsQueryId = smsQuery.replace(/^#/, '');

            const filteredSmsRows = smsReminderLogs
              .filter((r) => {
                if (!smsQuery) {
                  if (smsFilter === 'today') {
                    if (!r.created_at) return false;
                    const rowDate = new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                    if (rowDate !== todayDate) return false;
                  } else if (smsFilter === 'sent' && r.sms_status !== 'Sent') {
                    return false;
                  } else if (smsFilter === 'failed' && r.sms_status !== 'Failed') {
                    return false;
                  } else if (smsFilter === 'opened' && Number(r.access_count || 0) <= 0) {
                    return false;
                  } else if (smsFilter === 'unopened' && (Number(r.access_count || 0) > 0 || r.sms_status !== 'Sent')) {
                    return false;
                  }
                  return true;
                }
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

                return blob.includes(smsQuery) || (smsQueryId && blob.includes(smsQueryId));
              })
              .sort((a, b) => {
                if (smsSort === 'opened_first') {
                  return Number(b.access_count || 0) - Number(a.access_count || 0);
                }
                if (smsSort === 'failed_first') {
                  if (a.sms_status === 'Failed' && b.sms_status !== 'Failed') return -1;
                  if (b.sms_status === 'Failed' && a.sms_status !== 'Failed') return 1;
                }
                if (smsSort === 'customer_az') {
                  return String(a.customer_name || 'ZZZZ').localeCompare(String(b.customer_name || 'ZZZZ'));
                }
                if (smsSort === 'oldest') {
                  return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                }
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
              });

            const totalSmsFiltered = smsQuery
              ? filteredSmsRows.length
              : Math.max(
                  filteredSmsRows.length,
                  smsFilter === 'today'
                    ? Number(smsReminderSummary.today_generated || 0)
                    : smsFilter === 'sent'
                    ? Number(smsReminderSummary.total_sent || 0)
                    : smsFilter === 'failed'
                    ? Number(smsReminderSummary.total_failed || 0)
                    : smsFilter === 'opened'
                    ? Number(smsReminderSummary.total_opened || 0)
                    : smsFilter === 'unopened'
                    ? Number(smsReminderSummary.total_unopened || 0)
                    : Number(smsReminderSummary.total_generated || 0)
                );

            const totalSmsPages = Math.max(1, Math.ceil(totalSmsFiltered / SMS_PER_PAGE));
            const safeSmsPage = Math.min(smsPage, totalSmsPages);
            const pagedSmsRows = filteredSmsRows.slice((safeSmsPage - 1) * SMS_PER_PAGE, safeSmsPage * SMS_PER_PAGE);

            return (
              <div style={{
                background: 'white', borderRadius: '18px', overflow: 'hidden',
                border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                marginBottom: '24px',
              }}>
                {/* Header & Summary Badges */}
                <div style={{
                  padding: '18px 22px', borderBottom: '1px solid #e2e8f0',
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
                          7:00 AM Cron • Today: {smsReminderSummary.today_sent || 0} Sent / {smsReminderSummary.today_failed || 0} Failed
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                        Tracks every 6-Month Maintenance Reminder SMS sent with <code style={{ color: '#1d4ed8', fontWeight: 700 }}>maskpro.link</code> — gateway status, link opens, active app status, bound device & IP (8 per page)
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        background: '#dcfce7', border: '1px solid #86efac', color: '#15803d',
                        fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                      }}>
                        Delivered: {smsReminderSummary.total_sent || 0}
                      </span>
                      <span style={{
                        background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
                        fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                      }}>
                        Opened Link: {smsReminderSummary.total_opened || 0}
                      </span>
                      <span style={{
                        background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                        fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                      }}>
                        Failed Number: {smsReminderSummary.total_failed || 0}
                      </span>
                    </div>
                  </div>

                  {/* Filter Pills + Search & Sort */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { key: 'today', label: `Today's 7AM Batch (${smsReminderSummary.today_generated || 0})` },
                        { key: 'all', label: `All Reminders (${smsReminderSummary.total_generated || 0})` },
                        { key: 'sent', label: `Sent (${smsReminderSummary.total_sent || 0})` },
                        { key: 'opened', label: `Opened (${smsReminderSummary.total_opened || 0})` },
                        { key: 'unopened', label: `Not Opened Yet (${smsReminderSummary.total_unopened || 0})` },
                        { key: 'failed', label: `Failed (${smsReminderSummary.total_failed || 0})` },
                      ].map((f) => (
                        <button
                          key={f.key}
                          onClick={() => handleSmsFilterChange(f.key)}
                          style={{
                            padding: '5px 11px', borderRadius: '16px', fontSize: '11.5px', fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                            border: smsFilter === f.key ? '1px solid #2563eb' : '1px solid #e2e8f0',
                            background: smsFilter === f.key ? '#2563eb' : 'white',
                            color: smsFilter === f.key ? 'white' : '#475569',
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div style={{
                      position: 'relative', display: 'flex', alignItems: 'center',
                      minWidth: '260px', flex: '1 1 260px', maxWidth: '380px',
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
                      <option value="opened_first">Sort: Opened First</option>
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
                                        }}>
                                          <i className={`bi ${isOpened ? 'bi-envelope-open-fill' : 'bi-hourglass-split'}`}></i>
                                          {isOpened ? `Opened (${row.access_count}x)` : 'Not Opened Yet'}
                                        </span>
                                        {Number(row.blocked_attempts || 0) > 0 && (
                                          <span style={{
                                            fontSize: '10.5px', fontWeight: 700, color: '#dc2626',
                                            background: '#fef2f2', padding: '2px 6px', borderRadius: '10px',
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
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                                      background: '#dcfce7', color: '#15803d', border: '1px solid #86efac',
                                      padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                                      Online Now
                                    </span>
                                  ) : isAppActive ? (
                                    <div>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                                        padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                      }}>
                                        Used App ({row.app_sessions} sess)
                                      </span>
                                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                                        Last seen: {formatTimeAgo(row.app_last_seen_at)}
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
