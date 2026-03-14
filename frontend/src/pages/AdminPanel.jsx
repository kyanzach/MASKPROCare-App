/**
 * Admin Panel — Dedicated login + Customer list with impersonation
 * 
 * When accessed at /admin:
 *   - If not admin-authenticated → shows username/password login form
 *   - Once authenticated → shows customer list with impersonation
 * 
 * Uses custom confirmation modal (no window.confirm per agent rules)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function AdminPanel() {
  // Admin auth state
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Customer list state
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Confirmation modal state (replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState(null);
  const [impersonating, setImpersonating] = useState(false);

  // Check if already admin-authenticated (from localStorage)
  useEffect(() => {
    const adminToken = localStorage.getItem('admin_token');
    if (adminToken) {
      // Verify the admin token is still valid
      api.get('/admin/check', { headers: { Authorization: `Bearer ${adminToken}` } })
        .then(res => {
          if (res.data.data?.isAdmin) {
            setAdminAuthed(true);
            loadCustomers(1, '');
          } else {
            localStorage.removeItem('admin_token');
          }
        })
        .catch(() => { localStorage.removeItem('admin_token'); });
    }

    // Also check if current regular session is admin
    const currentToken = localStorage.getItem('care_token');
    if (currentToken) {
      api.get('/admin/check')
        .then(res => {
          if (res.data.data?.isAdmin) {
            setAdminAuthed(true);
            loadCustomers(1, '');
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await api.post('/admin/login', { username, password });
      if (res.data.success) {
        const { token, customer } = res.data.data;
        // Store admin token separately
        localStorage.setItem('admin_token', token);
        // Also set as main token so API calls work
        localStorage.setItem('care_token', token);
        // Store customer data for the app
        localStorage.setItem('care_customer', JSON.stringify(customer));
        setAdminAuthed(true);
        loadCustomers(1, '');
      }
    } catch (err) {
      setLoginError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoginLoading(false);
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
    // Show custom confirmation modal instead of window.confirm
    setConfirmModal({ customerId, customerName });
  };

  const confirmImpersonate = async () => {
    const { customerId, customerName } = confirmModal;
    setConfirmModal(null);
    setImpersonating(true);
    try {
      const res = await api.post('/admin/impersonate', { customer_id: customerId });
      if (res.data.success) {
        const { token, customer, impersonatedBy } = res.data.data;
        localStorage.setItem('impersonation', JSON.stringify({
          originalToken: localStorage.getItem('care_token'),
          impersonatedBy,
          customerName: customer.full_name,
        }));
        localStorage.setItem('care_token', token);
        localStorage.setItem('care_customer', JSON.stringify(customer));
        window.location.href = '/';
      }
    } catch (err) {
      // Show error in a non-system-dialog way
      setConfirmModal({ error: err.response?.data?.message || err.message });
      setTimeout(() => setConfirmModal(null), 3000);
    } finally {
      setImpersonating(false);
    }
  };

  // ═══ Admin Login Form ═══
  if (!adminAuthed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        padding: '20px',
      }}>
        <div style={{
          background: 'rgba(30,41,59,0.9)', borderRadius: '28px', padding: '48px 40px',
          width: '100%', maxWidth: '420px', border: '1px solid rgba(59,130,246,0.15)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '20px',
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: '28px',
            }}>
              <i className="bi bi-shield-lock-fill" style={{ color: '#78350f' }}></i>
            </div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'white' }}>
              Admin Access
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#94a3b8' }}>
              MaskPro Care — Admin Panel
            </p>
          </div>

          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <i className="bi bi-person" style={{
                  position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                  color: '#64748b', fontSize: '16px',
                }}></i>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  style={{
                    width: '100%', padding: '14px 16px 14px 44px',
                    background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(71,85,105,0.5)',
                    borderRadius: '14px', color: 'white', fontSize: '15px',
                    outline: 'none', transition: 'border 0.2s', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = 'rgba(71,85,105,0.5)'}
                />
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <i className="bi bi-lock" style={{
                  position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                  color: '#64748b', fontSize: '16px',
                }}></i>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  style={{
                    width: '100%', padding: '14px 16px 14px 44px',
                    background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(71,85,105,0.5)',
                    borderRadius: '14px', color: 'white', fontSize: '15px',
                    outline: 'none', transition: 'border 0.2s', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = 'rgba(71,85,105,0.5)'}
                />
              </div>
            </div>

            {loginError && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '12px', padding: '12px 16px', marginBottom: '20px',
                display: 'flex', alignItems: 'center', gap: '8px',
                color: '#fca5a5', fontSize: '13px', fontWeight: 500,
              }}>
                <i className="bi bi-exclamation-triangle"></i>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading || !username || !password}
              style={{
                width: '100%', padding: '14px',
                background: loginLoading ? '#475569' : 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                color: '#78350f', border: 'none', borderRadius: '14px',
                fontSize: '16px', fontWeight: 700, cursor: loginLoading ? 'wait' : 'pointer',
                fontFamily: 'inherit', transition: 'all 0.2s',
                opacity: (!username || !password) ? 0.5 : 1,
              }}
            >
              {loginLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
                  Authenticating...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <i className="bi bi-shield-check"></i>
                  Sign In
                </span>
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <Link to="/login" style={{ color: '#64748b', fontSize: '13px', textDecoration: 'none' }}>
              ← Back to Customer Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ═══ Admin Panel (authenticated) ═══
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
      {/* Confirmation Modal (replaces window.confirm) */}
      {confirmModal && !confirmModal.error && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)',
        }} onClick={() => setConfirmModal(null)}>
          <div style={{
            background: 'white', borderRadius: '24px', padding: '32px',
            maxWidth: '420px', width: '90%', boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px',
                background: 'linear-gradient(135deg, #f59e0b15, #fbbf2415)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <i className="bi bi-person-badge" style={{ fontSize: '24px', color: '#f59e0b' }}></i>
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                Impersonate Customer
              </h3>
            </div>
            <p style={{ textAlign: 'center', margin: '0 0 24px', fontSize: '14px', color: '#64748b', lineHeight: 1.7 }}>
              You are about to login as <strong style={{ color: '#1e293b' }}>{confirmModal.customerName}</strong>.
              You'll see the app from their perspective.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, padding: '12px', border: '1px solid #e2e8f0', background: 'white',
                  borderRadius: '12px', fontSize: '14px', fontWeight: 600, color: '#64748b',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmImpersonate}
                style={{
                  flex: 1, padding: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  borderRadius: '12px', fontSize: '14px', fontWeight: 700, color: '#78350f',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                <i className="bi bi-box-arrow-in-right"></i>
                Login as
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast (modal-style) */}
      {confirmModal?.error && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px',
          padding: '16px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '360px',
        }}>
          <i className="bi bi-exclamation-circle" style={{ color: '#ef4444', fontSize: '18px' }}></i>
          <span style={{ fontSize: '13px', color: '#991b1b', fontWeight: 500 }}>{confirmModal.error}</span>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
        <Link to="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>Home</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Admin Panel</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="bi bi-shield-lock" style={{ color: '#f59e0b' }}></i>
            Admin Panel
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#94a3b8' }}>
            View and impersonate customers ({pagination.total} total)
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{
        background: 'white', borderRadius: '16px', padding: '16px 20px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px',
        border: '1px solid rgba(59,130,246,0.08)',
      }}>
        <i className="bi bi-search" style={{ fontSize: '18px', color: '#94a3b8' }}></i>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name or phone number..."
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: '15px',
            color: '#1e293b', fontFamily: 'inherit', background: 'transparent',
          }}
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
        background: 'white', borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        border: '1px solid rgba(59,130,246,0.06)',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}></div>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <i className="bi bi-people" style={{ fontSize: '48px', color: '#cbd5e1' }}></i>
            <p style={{ color: '#94a3b8', marginTop: '12px' }}>No customers found</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 160px 80px 120px',
              gap: '12px', padding: '14px 24px',
              background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
              fontSize: '12px', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              <div>Customer</div>
              <div>Mobile</div>
              <div style={{ textAlign: 'center' }}>Bookings</div>
              <div style={{ textAlign: 'center' }}>Action</div>
            </div>

            {/* Table Rows */}
            {customers.map((c) => (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 80px 120px',
                gap: '12px', padding: '14px 24px',
                borderBottom: '1px solid #f1f5f9',
                alignItems: 'center',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {c.full_name || 'Unknown'}
                  </div>
                  {c.email && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{c.email}</div>}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>
                  {c.mobile_number || '—'}
                </div>
                <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#10b981' }}>
                  {c.booking_count}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => handleImpersonate(c.id, c.full_name)}
                    disabled={impersonating}
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                      color: '#78350f', border: 'none',
                      borderRadius: '10px', padding: '6px 14px',
                      fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontFamily: 'inherit',
                    }}
                  >
                    <i className="bi bi-box-arrow-in-right"></i>
                    Login as
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px',
        }}>
          <button
            onClick={() => loadCustomers(page - 1, search)}
            disabled={page <= 1}
            style={{
              padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: 'white', color: page <= 1 ? '#cbd5e1' : '#3b82f6',
              fontWeight: 600, fontSize: '13px', cursor: page <= 1 ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ← Previous
          </button>
          <span style={{
            padding: '8px 16px', fontSize: '13px', color: '#64748b',
            display: 'flex', alignItems: 'center',
          }}>
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => loadCustomers(page + 1, search)}
            disabled={page >= pagination.totalPages}
            style={{
              padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: 'white', color: page >= pagination.totalPages ? '#cbd5e1' : '#3b82f6',
              fontWeight: 600, fontSize: '13px',
              cursor: page >= pagination.totalPages ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
