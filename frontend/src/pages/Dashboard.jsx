import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import CounterDateModal, { formatCounterDate } from '../components/CounterDateModal';

function ThinPDF417Barcode({ text }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !text) return;
    let cancelled = false;
    import('bwip-js').then((bwipjs) => {
      if (cancelled || !canvasRef.current) return;
      try {
        bwipjs.toCanvas(canvasRef.current, {
          bcid: 'pdf417',
          text: String(text),
          scale: 2,
          height: 5,
          includetext: false,
        });
      } catch (err) {
        console.error('PDF417 render error:', err);
      }
    });
    return () => { cancelled = true; };
  }, [text]);
  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '28px',
        display: 'block',
        borderRadius: '4px',
      }}
    />
  );
}

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

// Category display config for Loyalty Cards
const CATEGORY_META = {
  coating: { label: 'Nano Ceramic Coating', icon: 'fas fa-shield-alt', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
  ppf:     { label: 'Paint Protection Film', icon: 'fas fa-fire', gradient: 'linear-gradient(135deg, #ef4444, #f97316)' },
  tint:    { label: 'Nano Ceramic Tint',    icon: 'fas fa-sun', gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' },
  wash:    { label: 'Care Wash',             icon: 'fas fa-star', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  gift:    { label: 'Gift Card',             icon: 'fas fa-gift', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
  other:   { label: 'Other',                 icon: 'fas fa-file-alt', gradient: 'linear-gradient(135deg, #64748b, #94a3b8)' },
};
const LOYALTY_CATEGORY_PRIORITY = { coating: 1, ppf: 2, tint: 3, wash: 4, gift: 5, other: 6 };
const sortLoyaltyCards = (cards = []) =>
  [...cards].sort((a, b) => (LOYALTY_CATEGORY_PRIORITY[a.category] || 99) - (LOYALTY_CATEGORY_PRIORITY[b.category] || 99));

function getCounterLabel(category) {
  switch (category) {
    case 'coating':
    case 'ppf':
      return 'Credits Used';
    case 'tint':
      return 'Earned Points';
    default:
      return 'Visits Used';
  }
}

export default function Dashboard() {
  const { customer } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loyaltyCards, setLoyaltyCards] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingOffer, setRespondingOffer] = useState(false);
  const [declineModal, setDeclineModal] = useState({ open: false, req: null, mode: 'decline' });
  const closeDeclineModal = () => setDeclineModal({ open: false, req: null, mode: 'decline' });
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', text }

  useEffect(() => {
    loadData();
  }, []);

  const getVehiclePhotoUrl = (photoPath) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    const base = import.meta.env.VITE_API_URL || '';
    return `${base}/${photoPath.replace(/^\//, '')}`;
  };

  const loadData = async () => {
    try {
      // 1. Fetch core dashboard data first (stats, vehicles, bookings) for instant ~180ms render
      const [statsRes, vehiclesRes, bookingsRes] = await Promise.all([
        api.get('/dashboard/stats').catch(err => {
          console.warn('Dashboard stats error:', err?.message);
          return { data: { data: null } };
        }),
        api.get('/vehicles/list').catch(err => {
          console.warn('Vehicles list error:', err?.message);
          return { data: { data: { vehicles: [] } } };
        }),
        api.get('/bookings/list').catch(err => {
          console.warn('Bookings list error:', err?.message);
          return { data: { data: { bookings: [] } } };
        }),
      ]);

      if (statsRes.data?.data) {
        setStats(statsRes.data.data);
      }

      const statVehicles = statsRes.data?.data?.vehicles || [];
      const maintMap = new Map(statVehicles.map((v) => [v.id, v.maintenance]));
      const rawVehicles = vehiclesRes.data?.data?.vehicles || [];
      const enrichedVehicles = rawVehicles.map((v) => ({
        ...v,
        maintenance: v.maintenance || maintMap.get(v.id) || null,
      }));
      setVehicles(enrichedVehicles);
      setBookings(bookingsRes.data?.data?.bookings || []);
      setRequests(bookingsRes.data?.data?.requests || statsRes.data?.data?.pending_requests || []);

      // Core dashboard is ready — dismiss loading immediately!
      setLoading(false);

      // 2. Fetch loyalty cards (cached on server in memory)
      api.get('/loyalty/cards')
        .then(loyaltyRes => {
          setLoyaltyCards(sortLoyaltyCards(loyaltyRes.data?.data?.cards || []));
        })
        .catch(() => {
          setLoyaltyCards([]);
        });
    } catch (err) {
      console.error('Dashboard load error:', err);
      setLoading(false);
    }
  };

  const handleAcceptOffer = async (requestId) => {
    setRespondingOffer(true);
    try {
      await api.post('/bookings/respond-offer', { request_id: requestId, action: 'accept' });
      await loadData();
      setNotice({ type: 'success', text: 'Agreed date accepted! Your booking is confirmed.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Failed to accept alternative date.' });
    } finally {
      setRespondingOffer(false);
    }
  };

  const handleDeclineSubmit = async ({ counterDate, reason }) => {
    if (!declineModal.req) return;
    setRespondingOffer(true);
    try {
      await api.post('/bookings/respond-offer', {
        request_id: declineModal.req.request_id,
        action: 'decline',
        reply_reason: reason || 'Customer requested reschedule',
        counter_date: counterDate || undefined,
      });
      closeDeclineModal();
      await loadData();
      setNotice({
        type: 'success',
        text: counterDate
          ? `Preferred date sent (${formatCounterDate(counterDate)}). Our branch will call you to finalize it.`
          : 'Your response has been sent to our branch agent.',
      });
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Failed to submit response.' });
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
  const upcomingBookings = bookings.filter((b) => {
    const st = String(b.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'completed' || st === 'done' || st === 'rejected') return false;
    return st === 'scheduled' || st === 'cancel_requested' || new Date(b.booking_date) >= new Date();
  });
  const recentBookings = bookings.slice(0, 5);
  const pendingAppointments = requests.filter(
    r => ['pending', 'negotiating', 'waitlisted'].includes(r.status) || (r.status === 'rejected' && (r.offered_date || r.rejection_reason))
  );
  const pendingCount = stats?.stats?.pending_requests ?? requests.filter(
    r => ['pending', 'negotiating', 'waitlisted'].includes(r.status) || (r.status === 'rejected' && r.offer_status === 'offered')
  ).length;

  return (
    <div>
      {notice && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '14px',
            background: notice.type === 'error' ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${notice.type === 'error' ? '#fca5a5' : '#86efac'}`,
            color: notice.type === 'error' ? '#991b1b' : '#166534',
          }}
        >
          <span>
            <i className={notice.type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle'} style={{ marginRight: 6 }}></i>
            {notice.text}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
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

      {/* NanoFix Maintenance Alert Widget */}
      {((stats?.stats?.vehicles_needing_maintenance ?? stats?.stats?.vehicles_needing_service ?? 0) > 0 || (stats?.stats?.missed_maintenance_visits || 0) > 0) && (
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          border: '1px solid #fde68a',
          borderRadius: '16px',
          padding: '16px 20px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 2px 8px rgba(217, 119, 6, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: '#f59e0b', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', flexShrink: 0
            }}>
              <i className="fas fa-shield-alt"></i>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#92400e' }}>
                {(stats?.stats?.vehicles_needing_maintenance ?? stats?.stats?.vehicles_needing_service ?? 0)} Vehicle{(stats?.stats?.vehicles_needing_maintenance ?? stats?.stats?.vehicles_needing_service ?? 0) === 1 ? '' : 's'} Needs NanoFix Maintenance
              </div>
              {(stats?.stats?.missed_maintenance_visits || 0) > 0 && (
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#b45309', marginTop: '2px' }}>
                  <i className="fas fa-history" style={{ marginRight: '5px' }}></i>
                  {stats.stats.missed_maintenance_visits} Missed Visit{stats.stats.missed_maintenance_visits === 1 ? '' : 's'}
                  {stats.stats.last_missed_maintenance ? ` (Last ${new Date(stats.stats.last_missed_maintenance).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})` : ''}
                </div>
              )}
            </div>
          </div>
          <button
            className="btn-gradient"
            onClick={() => navigate('/bookings', { state: { openBooking: true } })}
            style={{ flexShrink: 0, padding: '8px 18px', fontSize: '13px' }}
          >
            <i className="fas fa-calendar-plus" style={{ marginRight: '6px' }}></i>
            Book NanoFix
          </button>
        </div>
      )}

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
              <div className="stats-card-value">{stats?.stats?.vehicles_needing_maintenance ?? stats?.stats?.vehicles_needing_service ?? 0}</div>
            </div>
            <div className="stats-icon stats-icon-amber">
              <i className="fas fa-spray-can"></i>
            </div>
          </div>
          {(stats?.stats?.missed_maintenance_visits || 0) > 0 ? (
            <div className="stats-sub" style={{ color: '#dc2626', fontWeight: 600 }}>
              <i className="fas fa-exclamation-circle"></i>
              <span>{stats.stats.missed_maintenance_visits} Missed Visit{stats.stats.missed_maintenance_visits > 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div className="stats-sub stats-sub-warning">
              <i className="fas fa-exclamation-triangle"></i>
              <span>Attention</span>
            </div>
          )}
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
                const isWaitlisted = req.status === 'waitlisted';
                const hasOffer = !!req.offered_date;
                const isOfferPending = (isRejected || isNegotiating) && hasOffer && (!req.offer_status || req.offer_status === 'offered');
                const isOfferAccepted = req.offer_status === 'accepted';
                const isOfferDeclined = req.offer_status === 'declined';
                const isOfferCountered = req.offer_status === 'countered';
                const canPropose = (isRejected || isNegotiating) && !isOfferPending;

                return (
                  <div
                    key={req.request_id}
                    style={{
                      border: isNegotiating ? '1.5px solid #c4b5fd' : isWaitlisted ? '1.5px solid #fcd34d' : isRejected ? '1.5px solid #ef4444' : '1px solid #fde68a',
                      borderRadius: '14px',
                      padding: '16px',
                      backgroundColor: isNegotiating ? '#fdfaff' : isRejected ? '#fff8f8' : '#fffdf5',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: isNegotiating ? '#5b21b6' : isRejected ? '#991b1b' : '#1f2937' }}>
                          {new Date(req.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(req.booking_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {req.make} {req.model} • {req.plate_no} • <strong style={{ color: '#334155' }}>{req.service_names || getServiceLabel(req.latest_service)}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: isRejected ? '#fee2e2' : '#fef3c7',
                            color: isRejected ? '#b91c1c' : '#b45309',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          <i className={isRejected ? 'fas fa-times-circle' : 'fas fa-hourglass-half'} style={{ marginRight: '4px' }}></i>
                          {isRejected ? 'Request Declined' : 'Pending Approval'}
                        </span>
                        {(isNegotiating || isWaitlisted) && (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: isWaitlisted ? '#fffbeb' : '#ede9fe',
                              color: isWaitlisted ? '#b45309' : '#6d28d9',
                              border: `1px solid ${isWaitlisted ? '#fcd34d' : '#c4b5fd'}`,
                              fontWeight: 700,
                              fontSize: '11px',
                            }}
                          >
                            <i className={isWaitlisted ? 'fas fa-list-ol' : 'fas fa-handshake'} style={{ marginRight: '4px' }}></i>
                            {isWaitlisted ? 'Waitlisted' : 'Negotiating'}
                          </span>
                        )}
                      </div>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
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
                              onClick={() => setDeclineModal({ open: true, req, mode: 'decline' })}
                              disabled={respondingOffer}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, padding: '6px 14px', borderRadius: '8px', background: '#fff', border: '1px solid #ef4444', color: '#dc2626', cursor: 'pointer' }}
                            >
                              <i className="fas fa-exchange-alt"></i> Decline / Propose
                            </button>
                          </div>
                        )}

                        {isOfferCountered && (
                          <div style={{ color: '#6d28d9', fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>
                            <i className="fas fa-exchange-alt"></i> You suggested a different schedule (see below).
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

                    {/* Client's preferred date / waitlist / propose action */}
                    {(req.counter_date || isWaitlisted || canPropose) && (
                      <div style={{
                        backgroundColor: isWaitlisted ? '#fffbeb' : '#faf5ff',
                        border: `1px solid ${isWaitlisted ? '#fde68a' : '#ddd6fe'}`,
                        borderRadius: '10px', padding: '12px', marginTop: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
                      }}>
                        <div>
                          {req.counter_date && (
                            <div style={{ fontSize: '12px', fontWeight: 700, color: isWaitlisted ? '#92400e' : '#5b21b6' }}>
                              <i className="fas fa-calendar-plus"></i> Your Preferred Date:{' '}
                              <span style={{ fontSize: '14px', fontWeight: 800, color: isWaitlisted ? '#b45309' : '#6d28d9' }}>
                                {formatCounterDate(req.counter_date)}
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: '12px', color: '#4b5563', marginTop: req.counter_date ? '4px' : 0 }}>
                            {isWaitlisted
                              ? "You're on the waitlist. We'll call you as soon as a slot opens for your preferred date."
                              : req.counter_date
                              ? 'Our branch will call you to check availability and finalize your schedule.'
                              : 'None of the offered dates work? Pick your preferred date and our branch will call you.'}
                          </div>
                        </div>
                        {canPropose && (
                          <button
                            type="button"
                            onClick={() => setDeclineModal({ open: true, req, mode: 'propose' })}
                            disabled={respondingOffer}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, padding: '8px 14px', borderRadius: '8px', background: '#6d28d9', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                          >
                            <i className="fas fa-calendar-alt"></i>
                            {req.counter_date ? 'Change Preferred Date' : 'Propose a Preferred Date'}
                          </button>
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
                        <td>
                          {String(b.status || '').toLowerCase() === 'cancel_requested' ? (
                            <span className="badge badge-warning">Cancellation Requested</span>
                          ) : (
                            <span className="badge badge-success">Scheduled</span>
                          )}
                        </td>
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
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>My Vehicles</h2>
            </div>
            {vehicles.length > 0 && (
              <Link to="/vehicles" style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                See All <i className="fas fa-arrow-right"></i>
              </Link>
            )}
          </div>

          {vehicles.length > 0 ? (
            <div className="grid-3">
              {vehicles.map((v) => {
                const vi = getVehicleIcon(v.make, v.model);
                return (
                  <div className="vehicle-card" key={v.id}>
                    <div className="vehicle-card-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                        {v.photo ? (
                          <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '14px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                          }}>
                            <img
                              src={getVehiclePhotoUrl(v.photo)}
                              alt={`${v.make} ${v.model}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.parentElement) {
                                  e.currentTarget.parentElement.innerHTML = `<div class="vehicle-icon" style="background:${vi.bg};display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:14px;"><i class="${vi.icon}" style="color:#fff;font-size:22px;"></i></div>`;
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <div className="vehicle-icon" style={{ background: vi.bg }}>
                            <i className={vi.icon}></i>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.make} {v.model}</h3>
                          <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, margin: '2px 0 0' }}>{v.plate_no || 'No Plate Number'}</p>
                          {v.maintenance?.status === 'overdue' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', marginTop: '6px' }}>
                              <i className="fas fa-exclamation-circle"></i> NanoFix Overdue
                            </span>
                          )}
                          {v.maintenance?.status === 'due' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 8px', marginTop: '6px' }}>
                              <i className="fas fa-clock"></i> NanoFix Due
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <Link to={`/vehicles?vehicle_id=${v.id}`} className="btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                          <i className="fas fa-eye"></i> Details
                        </Link>
                        <button
                          className="btn-gradient btn-sm"
                          style={{ flex: 1, justifyContent: 'center' }}
                          onClick={() => navigate(`/bookings?openBooking=true&vehicle_id=${v.id}`, { state: { openBooking: true, vehicle_id: String(v.id) } })}
                        >
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

      {/* My MASKPROCare Cards */}
      <div className="card-modern mb-32">
        <div className="card-modern-body">
          <div className="flex-between mb-24">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="stats-icon" style={{ width: '40px', height: '40px', borderRadius: '12px', fontSize: '16px', background: 'linear-gradient(135deg, #2563eb, #1e40af)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-id-card"></i>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>My MASKPROCare Cards</h2>
            </div>
            {loyaltyCards.length > 0 && (
              <Link to="/profile?tab=loyalty" style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                See All <i className="fas fa-arrow-right"></i>
              </Link>
            )}
          </div>

          {loyaltyCards.length > 0 ? (
            <div className="grid-3">
              {loyaltyCards.slice(0, 6).map((card) => {
                const catMeta = CATEGORY_META[card.category] || CATEGORY_META.other;
                return (
                  <div className="vehicle-card" key={card.id}>
                    <div className="vehicle-card-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div className="vehicle-icon" style={{ background: catMeta.gradient, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className={catMeta.icon}></i>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {card.service || catMeta.label}
                          </h3>
                          <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: '2px 0 0' }}>
                            {card.tier || 'Member Card'}
                          </p>
                        </div>
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px',
                        fontSize: '12px', border: '1px solid #f1f5f9'
                      }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{getCounterLabel(card.category)}</span>
                        <span style={{ color: '#1e293b', fontWeight: 700 }}>
                          {card.visitsUsed}
                          {card.visitsTotal > 0 && <span style={{ color: '#94a3b8', fontWeight: 500 }}> / {card.visitsTotal}</span>}
                        </span>
                      </div>

                      {/* Thin Full-Width Barcode above View Card button */}
                      <div style={{ marginBottom: '12px', padding: '6px 0 2px', borderTop: '1px solid #f1f5f9' }}>
                        <ThinPDF417Barcode text={String(card.id)} />
                      </div>

                      <div>
                        <Link
                          to="/profile?tab=loyalty"
                          className="btn-gradient btn-sm"
                          style={{
                            width: '100%',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                            color: '#ffffff',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none',
                            padding: '9px 16px',
                            borderRadius: '10px',
                            border: 'none',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                          }}
                        >
                          <i className="fas fa-eye" style={{ color: '#ffffff' }}></i> View Card
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon"><i className="fas fa-credit-card"></i></div>
              <h3>No MASKPROCare cards registered</h3>
              <p>Your warranty and maintenance MASKPROCare cards will appear here once issued.</p>
              <Link to="/profile?tab=loyalty" className="btn-gradient">
                <i className="fas fa-id-card"></i> View MASKPROCare Cards
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Decline / Propose Preferred Date Modal */}
      <CounterDateModal
        open={declineModal.open}
        mode={declineModal.mode}
        offeredDate={declineModal.req?.offered_date}
        submitting={respondingOffer}
        onClose={closeDeclineModal}
        onSubmit={handleDeclineSubmit}
      />
    </div>
  );
}
