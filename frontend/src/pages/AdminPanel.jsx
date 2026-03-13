/**
 * Admin Panel — Customer list with search & impersonation
 * Only accessible by users with access_level = 'admin' in Unify users table
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function AdminPanel() {
  const { login: setAuthToken } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [impersonating, setImpersonating] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  useEffect(() => { loadCustomers(1, ''); }, []);

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

  const handleImpersonate = async (customerId, customerName) => {
    if (impersonating) return;
    if (!window.confirm(`Login as "${customerName}"?\n\nYou will see the app from their perspective.`)) return;

    setImpersonating(true);
    try {
      const res = await api.post('/admin/impersonate', { customer_id: customerId });
      if (res.data.success) {
        const { token, customer, impersonatedBy } = res.data.data;
        // Store impersonation info
        localStorage.setItem('impersonation', JSON.stringify({
          originalToken: localStorage.getItem('care_token'),
          impersonatedBy,
          customerName: customer.full_name,
        }));
        // Set new token
        localStorage.setItem('care_token', token);
        // Reload the app to apply the new token
        window.location.href = '/';
      }
    } catch (err) {
      alert('Failed to impersonate: ' + (err.response?.data?.message || err.message));
    } finally {
      setImpersonating(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
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
              display: 'grid', gridTemplateColumns: '1fr 160px 80px 80px 120px',
              gap: '12px', padding: '14px 24px',
              background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
              fontSize: '12px', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              <div>Customer</div>
              <div>Mobile</div>
              <div style={{ textAlign: 'center' }}>Vehicles</div>
              <div style={{ textAlign: 'center' }}>Bookings</div>
              <div style={{ textAlign: 'center' }}>Action</div>
            </div>

            {/* Table Rows */}
            {customers.map((c) => (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 80px 80px 120px',
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
                <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>
                  {c.vehicle_count}
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
