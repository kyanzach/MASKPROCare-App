import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Profile() {
  const { customer: authCustomer, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ vehicles: 0, bookings: 0, completed: 0 });

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const [profileRes, statsRes] = await Promise.all([
        api.get('/profile/get'),
        api.get('/dashboard/stats'),
      ]);
      const p = profileRes.data.data?.customer || profileRes.data.data;
      setProfile(p);
      setForm({ full_name: p?.full_name || '', email: p?.email || '', address: p?.address || '' });
      const s = statsRes.data.data;
      setStats({
        vehicles: s?.total_vehicles || 0,
        bookings: s?.total_bookings || 0,
        completed: s?.completed_services || 0,
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put('/profile/update', form);
      setSuccess('Profile updated successfully!');
      setEditing(false);
      loadProfile();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div><p>Loading profile...</p></div>;
  }

  const initials = (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>Profile</span>
      </div>

      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <i className="fas fa-user-circle" style={{ color: '#3b82f6' }}></i>
        My Profile
      </h1>

      {/* Alerts */}
      {success && <div className="login-alert login-alert-success" style={{ marginBottom: '20px' }}><i className="fas fa-check-circle"></i> {success}</div>}
      {error && <div className="login-alert login-alert-error" style={{ marginBottom: '20px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

      <div className="profile-grid">
        {/* Left Column */}
        <div>
          {/* Avatar Card */}
          <div className="card-modern" style={{ marginBottom: '20px' }}>
            <div className="card-modern-body" style={{ textAlign: 'center' }}>
              <div className="profile-avatar-lg">{initials}</div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', marginBottom: '4px' }}>{profile?.full_name}</h2>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>Customer</p>
              <div className="profile-stat-row">
                <div className="profile-stat">
                  <div className="profile-stat-value">{stats.vehicles}</div>
                  <div className="profile-stat-label">Vehicles</div>
                </div>
                <div className="profile-stat">
                  <div className="profile-stat-value">{stats.bookings}</div>
                  <div className="profile-stat-label">Bookings</div>
                </div>
                <div className="profile-stat">
                  <div className="profile-stat-value">{stats.completed}</div>
                  <div className="profile-stat-label">Completed</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Info Card */}
          <div className="card-modern" style={{ marginBottom: '20px' }}>
            <div className="card-modern-body">
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-address-book" style={{ color: '#3b82f6' }}></i>
                Contact Details
              </h3>
              <div className="quick-info-item">
                <i className="fas fa-phone quick-info-icon"></i>
                <div>
                  <div className="quick-info-label">Mobile</div>
                  <div className="quick-info-value">{profile?.mobile_number || 'N/A'}</div>
                </div>
              </div>
              <div className="quick-info-item">
                <i className="fas fa-envelope quick-info-icon"></i>
                <div>
                  <div className="quick-info-label">Email</div>
                  <div className="quick-info-value">{profile?.email || 'Not set'}</div>
                </div>
              </div>
              {profile?.branch_name && (
                <div className="quick-info-item">
                  <i className="fas fa-map-marker-alt quick-info-icon"></i>
                  <div>
                    <div className="quick-info-label">Branch</div>
                    <div className="quick-info-value">{profile.branch_name}</div>
                  </div>
                </div>
              )}
              {profile?.birth_date && (
                <div className="quick-info-item">
                  <i className="fas fa-birthday-cake quick-info-icon"></i>
                  <div>
                    <div className="quick-info-label">Birthday</div>
                    <div className="quick-info-value">
                      {new Date(profile.birth_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              )}
              {profile?.address && (
                <div className="quick-info-item">
                  <i className="fas fa-home quick-info-icon"></i>
                  <div>
                    <div className="quick-info-label">Address</div>
                    <div className="quick-info-value">{profile.address}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Logout Card */}
          <div className="card-modern">
            <div className="card-modern-body">
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: '14px', background: 'transparent',
                  color: '#dc2626', border: '2px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px', fontSize: '15px', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.3s ease',
                  fontFamily: 'var(--font-family)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
                onMouseEnter={e => { e.target.style.background = '#fef2f2'; }}
                onMouseLeave={e => { e.target.style.background = 'transparent'; }}
              >
                <i className="fas fa-sign-out-alt"></i> Logout
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Edit Profile */}
        <div className="card-modern">
          <div className="card-modern-body">
            <div className="flex-between mb-24">
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
                {editing ? 'Edit Profile' : 'Profile Overview'}
              </h3>
              {!editing && (
                <button className="btn-gradient btn-sm" onClick={() => setEditing(true)}>
                  <i className="fas fa-edit"></i> Edit
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Enter email" />
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Enter address" rows={3} />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-outline" onClick={() => { setEditing(false); setForm({ full_name: profile?.full_name || '', email: profile?.email || '', address: profile?.address || '' }); }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-gradient" disabled={saving}>
                    {saving ? <span className="spinner"></span> : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ display: 'grid', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>Full Name</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{profile?.full_name || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>Email</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{profile?.email || 'Not set'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>Mobile</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{profile?.mobile_number || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>Address</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{profile?.address || 'Not set'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
