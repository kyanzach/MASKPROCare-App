import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

// Maps raw DB service names → friendly display labels
const SERVICE_LABEL_MAP = {
  'Nano Ceramic Coating': 'Nano Ceramic Coating',
  'Nano Ceramic Tint': 'Nano Ceramic Tint',
  'PPF': 'Paint Protection Film (PPF)',
  'Paint Protection Film': 'Paint Protection Film (PPF)',
  'Auto Paint & Repair': 'Auto Paint & Repair',
  'Go & Clean': 'Detailing',
  'Nano Fix (Maintenance)': 'Maintenance (NanoFix)',
  'NanoFix': 'Maintenance (NanoFix)',
};
const getServiceLabel = (dbName) => SERVICE_LABEL_MAP[dbName] || dbName || 'N/A';

// Vehicle icon mapping (matching legacy index.php lines 17-61)
const VEHICLE_ICONS = {
  toyota: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #e53e3e, #c53030)' },
  honda: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #3182ce, #2c5aa0)' },
  nissan: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #d69e2e, #b7791f)' },
  mitsubishi: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #38a169, #2f855a)' },
  hyundai: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #805ad5, #6b46c1)' },
  kia: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #e53e3e, #c53030)' },
  mazda: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #dd6b20, #c05621)' },
  subaru: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #3182ce, #2c5aa0)' },
  suzuki: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #38a169, #2f855a)' },
  isuzu: { icon: 'fas fa-truck', bg: 'linear-gradient(135deg, #d69e2e, #b7791f)' },
  ford: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #3182ce, #2c5aa0)' },
  bmw: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #4a5568, #2d3748)' },
  mercedes: { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #4a5568, #2d3748)' },
  tesla: { icon: 'fas fa-bolt', bg: 'linear-gradient(135deg, #e53e3e, #c53030)' },
};

function getVehicleIcon(make, model = '') {
  const m = (make || '').toLowerCase();
  const mod = (model || '').toLowerCase();
  if (mod.includes('innova') || mod.includes('fortuner') || mod.includes('suv'))
    return { icon: 'fas fa-car-side', bg: 'linear-gradient(135deg, #38a169, #2f855a)' };
  if (mod.includes('truck') || mod.includes('pickup'))
    return { icon: 'fas fa-truck', bg: 'linear-gradient(135deg, #d69e2e, #b7791f)' };
  if (mod.includes('van') || mod.includes('hiace'))
    return { icon: 'fas fa-shuttle-van', bg: 'linear-gradient(135deg, #805ad5, #6b46c1)' };
  return VEHICLE_ICONS[m] || { icon: 'fas fa-car', bg: 'linear-gradient(135deg, #0ea5e9, #1e40af)' };
}

export default function Dashboard() {
  const { customer } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingOffer, setRespondingOffer] = useState(false);
  const [declineModal, setDeclineModal] = useState({ open: false, req: null, reason: '', counterDate: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, vehiclesRes, bookingsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/vehicles/list'),
        api.get('/bookings/list'),
      ]);
      setStats(statsRes.data.data);
      setVehicles(vehiclesRes.data.data?.vehicles || []);
      setBookings(bookingsRes.data.data?.bookings || []);
      setRequests(bookingsRes.data.data?.requests || statsRes.data.data?.pending_requests || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOffer = async (requestId) => {
    setRespondingOffer(true);
    try {
      await api.post('/bookings/respond-offer', { request_id: requestId, action: 'accept' });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to accept alternative date.');
    } finally {
      setRespondingOffer(false);
    }
  };

  const handleDeclineSubmit = async (e) => {
    e.preventDefault();
    if (!declineModal.req) return;
    const reason = declineModal.reason.trim();
    if (!reason) {
      alert('Please enter a reason or suggestion.');
      return;
    }
    setRespondingOffer(true);
    try {
      await api.post('/bookings/respond-offer', {
        request_id: declineModal.req.request_id,
        action: 'decline',
        reply_reason: reason,
        counter_date: declineModal.counterDate.trim(),
      });
      setDeclineModal({ open: false, req: null, reason: '', counterDate: '' });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to decline alternative date.');
    } finally {
      setRespondingOffer(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // Get display name — check impersonation name first (it's always set correctly)
  const impersonation = JSON.parse(localStorage.getItem('impersonation') || 'null');
  const displayName = impersonation?.customerName || customer?.full_name || customer?.first_name || '';
  const firstName = displayName?.split(' ')[0] || 'there';
  const upcomingBookings = bookings.filter(b => b.status === 'Scheduled' || new Date(b.booking_date) >= new Date());
  const recentBookings = bookings.slice(0, 5);
  const pendingAppointments = requests.filter(
    r => r.status === 'pending' || r.status === 'negotiating' || (r.status === 'rejected' && (r.offered_date || r.rejection_reason))
  );
  const pendingCount = stats?.stats?.pending_requests ?? requests.filter(
    r => r.status === 'pending' || r.status === 'negotiating' || (r.status === 'rejected' && r.offer_status === 'offered')
  ).length;

  return (
    <div>
      {/* Welcome Section */}
      <div className="flex-between mb-32" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{
            fontSize: '28px', fontWeight: 800,
            background: 'linear-gradient(135deg, #0ea5e9, #1e40af)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', marginBottom: '4px'
          }}>
            Welcome back, {firstName}! 👋
          </h1>
          <p style={{ color: '#64748b', fontSize: '15px' }}>
            Manage your vehicles and appointments with ease
          </p>
        </div>
        <button className="btn-gradient" onClick={() => navigate('/bookings', { state: { openBooking: true } })}>
          <i className="fas fa-calendar-plus"></i>
          Book Now
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid-4 mb-32">
        <div className="stats-card">
          <div className="stats-card-inner">
            <div>
              <div className="stats-card-label">Total Vehicles</div>
              <div className="stats-card-value">{stats?.stats?.total_vehicles ?? vehicles.length}</div>
            </div>
            <div className="stats-icon stats-icon-blue">
              <i className="fas fa-car"></i>
            </div>
          </div>
          <div className="stats-sub stats-sub-success">
            <i className="fas fa-arrow-up"></i>
            <span>Active fleet</span>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-inner">
            <div>
              <div className="stats-card-label">Needs Service</div>
              <div className="stats-card-value">{stats?.stats?.vehicles_needing_service ?? 0}</div>
            </div>
            <div className="stats-icon stats-icon-amber">
              <i className="fas fa-spray-can"></i>
            </div>
          </div>
          <div className="stats-sub stats-sub-warning">
            <i className="fas fa-exclamation-triangle"></i>
            <span>Attention</span>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-inner">
            <div>
              <div className="stats-card-label">Upcoming</div>
              <div className="stats-card-value">{stats?.stats?.upcoming_bookings ?? upcomingBookings.length}</div>
            </div>
            <div className="stats-icon stats-icon-cyan">
              <i className="fas fa-calendar-check"></i>
            </div>
          </div>
          <div className="stats-sub stats-sub-info">
            <i className="fas fa-clock"></i>
            <span>Scheduled</span>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-inner">
            <div>
              <div className="stats-card-label">Pending Requests</div>
              <div className="stats-card-value">{pendingCount}</div>
            </div>
            <div className="stats-icon stats-icon-yellow">
              <i className="fas fa-hourglass-half"></i>
            </div>
          </div>
          <div className="stats-sub stats-sub-warning">
            <i className="fas fa-clock"></i>
            <span>Awaiting Approval</span>
          </div>
        </div>
      </div>

      {/* ─── Pending Appointments Section (Top of Upcoming) ─── */}
      <div className="card-modern mb-32">
        <div className="card-modern-body">
          <div className="flex-between mb-24">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="stats-icon stats-icon-yellow" style={{ width: '40px', height: '40px', borderRadius: '12px', fontSize: '16px' }}>
                <i className="fas fa-hourglass-half"></i>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Pending Appointments</h2>
            </div>
            <span className="badge" style={{ backgroundColor: pendingAppointments.length > 0 ? '#fef3c7' : '#f1f5f9', color: pendingAppointments.length > 0 ? '#b45309' : '#64748b' }}>
              {pendingAppointments.length} pending
            </span>
          </div>

          {pendingAppointments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {pendingAppointments.map((req) => {
                const isRejected = req.status === 'rejected';
                const isNegotiating = req.status === 'negotiating';
                const hasOffer = !!req.offered_date;
                const isOfferPending = (isRejected || isNegotiating) && hasOffer && (!req.offer_status || req.offer_status === 'offered');
                const isOfferAccepted = req.offer_status === 'accepted';
                const isOfferDeclined = req.offer_status === 'declined';
                const isOfferCountered = req.offer_status === 'countered';

                return (
                  <div
                    key={req.request_id}
                    style={{
                      border: isNegotiating ? '1.5px solid #c4b5fd' : isRejected ? '1.5px solid #ef4444' : '1px solid #fde68a',
                      borderRadius: '14px',
                      padding: '16px',
                      backgroundColor: isNegotiating ? '#fdfaff' : isRejected ? '#fff8f8' : '#fffdf5',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: isNegotiating ? '#5b21b6' : isRejected ? '#991b1b' : '#1f2937' }}>
                          {new Date(req.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(req.booking_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {req.make} {req.model} • {req.plate_no} • <strong style={{ color: '#334155' }}>{req.service_names || getServiceLabel(req.latest_service)}</strong>
                        </div>
                      </div>

                      <span
                        className="badge"
                        style={{
                          backgroundColor: isNegotiating ? '#ede9fe' : isRejected ? '#fee2e2' : '#fef3c7',
                          color: isNegotiating ? '#6d28d9' : isRejected ? '#b91c1c' : '#b45309',
                          border: isNegotiating ? '1px solid #c4b5fd' : undefined,
                          fontWeight: 700,
                          fontSize: '12px',
                        }}
                      >
                        <i className={isNegotiating ? 'fas fa-handshake' : isRejected ? 'fas fa-times-circle' : 'fas fa-hourglass-half'} style={{ marginRight: '4px' }}></i>
                        {isNegotiating ? 'In Negotiation' : isRejected ? 'Request Declined' : 'Pending Approval'}
                      </span>
                    </div>

                    {/* Rejection Reason */}
                    {isRejected && req.rejection_reason && (
                      <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 12px', marginTop: '8px', color: '#7f1d1d', fontSize: '13px' }}>
                        <strong style={{ color: '#991b1b' }}><i className="fas fa-exclamation-circle"></i> Reason for Rejection:</strong><br />
                        {req.rejection_reason}
                      </div>
                    )}

                    {/* Alternative / Agreed Date Offered */}
                    {hasOffer && (
                      <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 700 }}>
                            <i className="fas fa-calendar-check"></i> {isNegotiating ? 'Agreed / Alternative Schedule:' : 'Alternative Date Proposed by Agent:'}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#1d4ed8' }}>
                            {new Date(req.offered_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(req.offered_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {isOfferPending && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => handleAcceptOffer(req.request_id)}
                              disabled={respondingOffer}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, padding: '6px 14px', borderRadius: '8px', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
                            >
                              <i className="fas fa-check"></i> Accept Date
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => setDeclineModal({ open: true, req, reason: '', counterDate: '' })}
                              disabled={respondingOffer}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, padding: '6px 14px', borderRadius: '8px', background: '#fff', border: '1px solid #ef4444', color: '#dc2626', cursor: 'pointer' }}
                            >
                              <i className="fas fa-exchange-alt"></i> Decline / Propose
                            </button>
                          </div>
                        )}

                        {isOfferCountered && (
                          <div style={{ color: '#6d28d9', fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>
                            <i className="fas fa-hourglass-half"></i> You proposed: {req.offered_date}. Waiting for branch response.
                          </div>
                        )}

                        {isOfferAccepted && (
                          <div style={{ color: '#15803d', fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>
                            <i className="fas fa-check-circle"></i> You accepted this agreed date. Processing booking.
                          </div>
                        )}

                        {isOfferDeclined && (
                          <div style={{ color: '#b91c1c', fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>
                            <i className="fas fa-times-circle"></i> You declined this offer. {req.customer_offer_reply && <span>Reason: "{req.customer_offer_reply}"</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
              <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: '6px' }}></i> No pending appointments awaiting review.
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div className="card-modern mb-32">
        <div className="card-modern-body">
          <div className="flex-between mb-24">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="stats-icon stats-icon-blue" style={{ width: '40px', height: '40px', borderRadius: '12px', fontSize: '16px' }}>
                <i className="fas fa-calendar-alt"></i>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>Upcoming Appointments</h2>
            </div>
            <span className="badge badge-info">{upcomingBookings.length} scheduled</span>
          </div>

          {upcomingBookings.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Vehicle</th>
                    <th>Service</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingBookings.slice(0, 5).map((b, i) => {
                    const vi = getVehicleIcon(b.make, b.model);
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1f2937', fontSize: '14px' }}>
                            {new Date(b.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                            {new Date(b.booking_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: vi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <i className={vi.icon} style={{ color: 'white', fontSize: '12px' }}></i>
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.make} {b.model}</div>
                              <div style={{ color: '#94a3b8', fontSize: '12px' }}>{b.plate_no}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: '14px', fontWeight: 500 }}>{b.formatted_services || getServiceLabel(b.latest_service)}</td>
                        <td><span className="badge badge-success">Scheduled</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon"><i className="fas fa-calendar-times"></i></div>
              <h3>No upcoming appointments</h3>
              <p>Schedule your next service appointment to keep your vehicles in top condition.</p>
              <Link to="/bookings" className="btn-gradient">
                <i className="fas fa-plus"></i> Schedule Appointment
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* My Vehicles */}
      <div className="card-modern mb-32">
        <div className="card-modern-body">
          <div className="flex-between mb-24">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="stats-icon stats-icon-blue" style={{ width: '40px', height: '40px', borderRadius: '12px', fontSize: '16px', background: 'linear-gradient(135deg, #0ea5e9, #1e40af)' }}>
                <i className="fas fa-car"></i>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>My Vehicles</h2>
            </div>
          </div>

          {vehicles.length > 0 ? (
            <div className="grid-3">
              {vehicles.slice(0, 3).map((v) => {
                const vi = getVehicleIcon(v.make, v.model);
                return (
                  <div className="vehicle-card" key={v.id}>
                    <div className="vehicle-card-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div className="vehicle-icon" style={{ background: vi.bg }}>
                          <i className={vi.icon}></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{v.make} {v.model}</h3>
                          <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, margin: 0 }}>{v.plate_no}</p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <Link to="/vehicles" className="btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                          <i className="fas fa-eye"></i> Details
                        </Link>
                        <button className="btn-gradient btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate('/bookings', { state: { openBooking: true } })}>
                          <i className="bi bi-shield-check"></i> Service
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon"><i className="fas fa-car"></i></div>
              <h3>No vehicles registered</h3>
              <p>Add your first vehicle to start managing maintenance schedules.</p>
              <Link to="/vehicles" className="btn-gradient">
                <i className="fas fa-plus"></i> Add Vehicle
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Decline Offer Modal */}
      {declineModal.open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
            maxWidth: '420px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                <i className="fas fa-times" style={{ fontSize: '18px' }}></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827' }}>Decline or Propose New Date</h3>
                <small style={{ color: '#64748b' }}>
                  Offered: {declineModal.req?.offered_date ? new Date(declineModal.req.offered_date).toLocaleDateString() : ''}
                </small>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '14px', lineHeight: 1.5 }}>
              Please state why this date does not work for you, or suggest an alternative:
            </p>

            <form onSubmit={handleDeclineSubmit}>
              <textarea
                rows={2}
                required
                value={declineModal.reason}
                onChange={(e) => setDeclineModal({ ...declineModal, reason: e.target.value })}
                placeholder="Reason (e.g. Schedule conflict, prefer weekends instead...)"
                style={{
                  width: '100%', borderRadius: '10px', border: '1px solid #d1d5db',
                  padding: '10px 12px', fontSize: '13px', resize: 'vertical',
                  marginBottom: '10px', boxSizing: 'border-box'
                }}
              />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                Suggest Preferred Date & Time (Optional):
              </label>
              <input
                type="text"
                value={declineModal.counterDate || ''}
                onChange={(e) => setDeclineModal({ ...declineModal, counterDate: e.target.value })}
                placeholder="e.g. Next Saturday Nov 5 at 10:00 AM"
                style={{
                  width: '100%', borderRadius: '8px', border: '1px solid #d1d5db',
                  padding: '8px 12px', fontSize: '13px', marginBottom: '16px', boxSizing: 'border-box'
                }}
              />

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setDeclineModal({ open: false, req: null, reason: '', counterDate: '' })}
                  disabled={respondingOffer}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
                    background: '#fff', color: '#4b5563', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={respondingOffer || !declineModal.reason.trim()}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                    background: declineModal.counterDate?.trim() ? '#4f46e5' : '#dc2626',
                    color: '#fff', cursor: 'pointer', fontWeight: 700
                  }}
                >
                  {respondingOffer ? 'Submitting...' : (declineModal.counterDate?.trim() ? 'Propose New Date' : 'Submit & Decline')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
