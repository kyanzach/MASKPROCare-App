/**
 * AdminPanel — Customer list + impersonation (inside Layout with sidebar)
 * 
 * This component renders at /admin INSIDE the Layout route.
 * It requires authentication (ProtectedRoute) and admin access.
 * The login form is in AdminLogin.jsx at /admin-login.
 * 
 * Uses custom confirmation modal (no window.confirm per agent rules).
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function AdminPanel() {
  const navigate = useNavigate();

  // Admin status
  const [isAdmin, setIsAdmin] = useState(null); // null = loading
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Confirmation modal state (replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState(null);
  const [impersonating, setImpersonating] = useState(false);

  // Check admin status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/check');
        if (res.data.data?.isAdmin) {
          setIsAdmin(true);
          loadCustomers(1, '');
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

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
          impersonatedBy,
          customerName: customer.full_name,
        }));
        localStorage.setItem('mpc_token', token);
        localStorage.setItem('mpc_customer', JSON.stringify(customer));
        window.location.href = '/';
      }
    } catch (err) {
      setConfirmModal({ error: err.response?.data?.message || err.message });
      setTimeout(() => setConfirmModal(null), 3000);
    } finally {
      setImpersonating(false);
    }
  };

  // Loading state
  if (isAdmin === null) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}></div>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Checking admin access...</p>
      </div>
    );
  }

  // Not admin
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
          color: '#3b82f6', textDecoration: 'none', fontWeight: 600, fontSize: '14px',
        }}>
          <i className="bi bi-arrow-left"></i> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
              <button onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, padding: '12px', border: '1px solid #e2e8f0', background: 'white',
                  borderRadius: '12px', fontSize: '14px', fontWeight: 600, color: '#64748b',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
              <button onClick={confirmImpersonate}
                style={{
                  flex: 1, padding: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  borderRadius: '12px', fontSize: '14px', fontWeight: 700, color: '#78350f',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                <i className="bi bi-box-arrow-in-right"></i> Login as
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
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
        <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name or phone number..."
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', color: '#1e293b', fontFamily: 'inherit', background: 'transparent' }}
        />
        {search && (
          <button onClick={() => { setSearch(''); loadCustomers(1, ''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}>
            <i className="bi bi-x-circle"></i>
          </button>
        )}
      </div>

      {/* Customer Table */}
      <div style={{
        background: 'white', borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid rgba(59,130,246,0.06)',
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

            {customers.map((c) => (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 80px 120px',
                gap: '12px', padding: '14px 24px',
                borderBottom: '1px solid #f1f5f9', alignItems: 'center',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{c.full_name || 'Unknown'}</div>
                  {c.email && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{c.email}</div>}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>{c.mobile_number || '—'}</div>
                <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#10b981' }}>{c.booking_count}</div>
                <div style={{ textAlign: 'center' }}>
                  <button onClick={() => handleImpersonate(c.id, c.full_name)} disabled={impersonating}
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                      color: '#78350f', border: 'none', borderRadius: '10px', padding: '6px 14px',
                      fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                      display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
                    }}>
                    <i className="bi bi-box-arrow-in-right"></i> Login as
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          <button onClick={() => loadCustomers(page - 1, search)} disabled={page <= 1}
            style={{
              padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: 'white', color: page <= 1 ? '#cbd5e1' : '#3b82f6',
              fontWeight: 600, fontSize: '13px', cursor: page <= 1 ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>← Previous</button>
          <span style={{ padding: '8px 16px', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center' }}>
            Page {page} of {pagination.totalPages}
          </span>
          <button onClick={() => loadCustomers(page + 1, search)} disabled={page >= pagination.totalPages}
            style={{
              padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: 'white', color: page >= pagination.totalPages ? '#cbd5e1' : '#3b82f6',
              fontWeight: 600, fontSize: '13px', cursor: page >= pagination.totalPages ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>Next →</button>
        </div>
      )}
    </div>
  );
}
