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
  const [impersonating, setImpersonating] = useState(false);
  const modFilterRef = useRef('pending');

  useEffect(() => {
    modFilterRef.current = modFilter;
  }, [modFilter]);

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

  // Real-time background polling every 5s so moderation queue & usage analytics update automatically
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      loadDashboard(true);
      loadModerationPosts(modFilterRef.current, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const loadDashboard = async (silent = false) => {
    if (!silent) setDashLoading(true);
    try {
      const res = await api.get('/admin/dashboard');
      if (res.data.success) {
        setDashData(res.data.data);
      }
    } catch {
      // silent background handling
    } finally {
      if (!silent) setDashLoading(false);
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
  const activeUsers = dashData?.active_users || [];

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
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
        display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto',
        background: '#f1f5f9', padding: '6px', borderRadius: '14px',
      }}>
        <button
          onClick={() => switchTab('dashboard')}
          style={{
            flex: 1, minWidth: '150px', padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: activeTab === 'dashboard' ? 'white' : 'transparent',
            color: activeTab === 'dashboard' ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: activeTab === 'dashboard' ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          <i className="bi bi-bar-chart-line-fill" style={{ color: activeTab === 'dashboard' ? '#2563eb' : '#64748b' }}></i>
          <span>Dashboard & Usage</span>
        </button>

        <button
          onClick={() => switchTab('moderation')}
          style={{
            flex: 1, minWidth: '170px', padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: activeTab === 'moderation' ? 'white' : 'transparent',
            color: activeTab === 'moderation' ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: activeTab === 'moderation' ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          <i className="bi bi-shield-check" style={{ color: activeTab === 'moderation' ? '#d97706' : '#64748b' }}></i>
          <span>Community Moderation</span>
          {(modCounts.pending > 0 || modCounts.active_sos > 0) && (
            <span style={{
              background: modCounts.pending > 0 ? '#f59e0b' : '#ef4444',
              color: 'white', fontSize: '11px', fontWeight: 800,
              padding: '1px 7px', borderRadius: '20px',
            }}>
              {modCounts.pending > 0 ? modCounts.pending : modCounts.active_sos}
            </span>
          )}
        </button>

        <button
          onClick={() => switchTab('impersonate')}
          style={{
            flex: 1, minWidth: '170px', padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: activeTab === 'impersonate' ? 'white' : 'transparent',
            color: activeTab === 'impersonate' ? '#0f172a' : '#64748b',
            fontWeight: 700, fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: activeTab === 'impersonate' ? '0 2px 8px rgba(15,23,42,0.06)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          <i className="bi bi-person-bounding-box" style={{ color: activeTab === 'impersonate' ? '#10b981' : '#64748b' }}></i>
          <span>Customer Impersonate</span>
          {pagination.total > 0 && (
            <span style={{
              background: '#e2e8f0', color: '#334155', fontSize: '11px', fontWeight: 700,
              padding: '1px 7px', borderRadius: '20px',
            }}>
              {pagination.total.toLocaleString()}
            </span>
          )}
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
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                {(kpis.active_app_users || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '11.5px', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>
                {(kpis.total_sessions || 0).toLocaleString()} total sessions
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '13px' }}>
                <span>Links Sent: <strong>{authMethods.magic_link?.total_sent || 0}</strong></span>
                <span>Opened: <strong style={{ color: '#10b981' }}>{authMethods.magic_link?.links_opened || 0}</strong></span>
                <span>Clicks: <strong>{authMethods.magic_link?.total_clicks || 0}</strong></span>
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

          {/* Who Uses the App (Live Active Users & Device Log) */}
          <div style={{
            background: 'white', borderRadius: '18px', overflow: 'hidden',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-activity" style={{ color: '#10b981' }}></i>
                  Who Uses the App (Active Customers & Device Log)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Recent customers who logged in or accessed MASKPRO Care across Web, Android, and iOS
                </p>
              </div>
            </div>

            {dashLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading activity...</div>
            ) : activeUsers.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No app sessions recorded yet</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 18px' }}>Customer</th>
                      <th style={{ padding: '12px 14px' }}>Platform</th>
                      <th style={{ padding: '12px 14px' }}>Device / Auth</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Sessions</th>
                      <th style={{ padding: '12px 14px' }}>Last Active</th>
                      <th style={{ padding: '12px 18px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUsers.map((u) => {
                      const badge = getPlatformBadge(u.platform);
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
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>via {u.auth_method || 'session'}</div>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                            {u.session_count || 1}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                            {formatTimeAgo(u.last_seen_at)}
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
            )}
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
