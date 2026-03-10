import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api/client';

const SERVICE_TYPES = [
  'Nano Ceramic Coating',
  'Nano Ceramic Tint',
  'Paint Protection Film (PPF)',
  'Auto Paint',
  'Full Detailing',
  'Interior Detailing',
  'Exterior Detailing',
  'Paint Correction',
  'Headlight Restoration',
  'Other'
];

const TIME_SLOTS = [
  { time: '08:00', label: '8:00 AM' },
  { time: '09:00', label: '9:00 AM' },
  { time: '10:00', label: '10:00 AM' },
  { time: '11:00', label: '11:00 AM' },
  { time: '13:00', label: '1:00 PM' },
  { time: '14:00', label: '2:00 PM' },
  { time: '15:00', label: '3:00 PM' },
];

export default function Bookings() {
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // New booking modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [bookingForm, setBookingForm] = useState({
    vehicle_id: '',
    service_type: '',
    booking_date: '',
    booking_time: '',
    notes: '',
  });
  const [availableDates, setAvailableDates] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  useEffect(() => { loadData(); }, []);

  const location = useLocation();
  useEffect(() => {
    if (location.state?.openBooking) {
      setTab('new');
      openBookingModal();
      // Clear the state so it doesn't re-open on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadData = async () => {
    try {
      const [bookingsRes, vehiclesRes] = await Promise.all([
        api.get('/bookings/list'),
        api.get('/vehicles/list'),
      ]);
      const data = bookingsRes.data.data;
      setBookings(data?.bookings || []);
      setPendingRequests(data?.pending_requests || []);
      setVehicles(vehiclesRes.data.data?.vehicles || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Load available dates when service is selected
  const loadAvailableDates = async (service) => {
    if (!service) { setAvailableDates([]); return; }
    setLoadingDates(true);
    try {
      const res = await api.post('/bookings/availability', {
        action: 'get_available_dates',
        service,
        days: 90,
      });
      setAvailableDates(res.data.data?.dates || []);
    } catch (err) {
      console.error('Availability error:', err);
      setAvailableDates([]);
    } finally { setLoadingDates(false); }
  };

  // Load available times when date is selected
  const loadAvailableTimes = async (service, date) => {
    if (!service || !date) { setAvailableTimes([]); return; }
    setLoadingTimes(true);
    try {
      const res = await api.post('/bookings/availability', {
        action: 'get_available_times',
        service,
        date,
      });
      setAvailableTimes(res.data.data?.times || []);
    } catch (err) {
      console.error(err);
      setAvailableTimes([]);
    } finally { setLoadingTimes(false); }
  };

  const handleServiceChange = (service) => {
    setBookingForm({ ...bookingForm, service_type: service, booking_date: '', booking_time: '' });
    setAvailableTimes([]);
    loadAvailableDates(service);
  };

  const handleDateSelect = (dateStr) => {
    setBookingForm({ ...bookingForm, booking_date: dateStr, booking_time: '' });
    loadAvailableTimes(bookingForm.service_type, dateStr);
  };

  const handleCancel = async (id) => {
    try {
      await api.post(`/bookings/cancel`, { booking_id: id });
      setSuccess('Booking cancelled successfully.');
      setCancelConfirm(null);
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel booking');
      setCancelConfirm(null);
    }
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!bookingForm.vehicle_id || !bookingForm.service_type || !bookingForm.booking_date || !bookingForm.booking_time) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/bookings/create', bookingForm);
      setSuccess('Booking request submitted! Your request is pending approval.');
      setShowBookingModal(false);
      setBookingForm({ vehicle_id: '', service_type: '', booking_date: '', booking_time: '', notes: '' });
      setAvailableDates([]);
      setAvailableTimes([]);
      loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit booking.');
    } finally { setSubmitting(false); }
  };

  const openBookingModal = () => {
    setError('');
    setBookingForm({ vehicle_id: '', service_type: '', booking_date: '', booking_time: '', notes: '' });
    setAvailableDates([]);
    setAvailableTimes([]);
    setCalendarMonth(new Date());
    setShowBookingModal(true);
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('cancel')) return <span className="badge badge-danger">Cancelled</span>;
    if (s.includes('done') || s.includes('complet')) return <span className="badge badge-info">Done</span>;
    if (s.includes('schedul') || s.includes('confirm')) return <span className="badge badge-success">Scheduled</span>;
    if (s.includes('pending')) return <span className="badge badge-warning">Pending</span>;
    return <span className="badge badge-info">{status || 'Unknown'}</span>;
  };

  // Build calendar grid for current month
  const dateAvailMap = useMemo(() => {
    const map = {};
    availableDates.forEach(d => { map[d.date] = d.available; });
    return map;
  }, [availableDates]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const days = [];

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) days.push(null);
    // Days of the month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateObj = new Date(year, month, d);
      const isPast = dateObj < today;
      const isSunday = dateObj.getDay() === 0;
      const isAvailable = dateAvailMap[dateStr] === true;
      const isUnavailable = dateAvailMap[dateStr] === false;
      const isSelected = bookingForm.booking_date === dateStr;
      const isToday = dateObj.getTime() === today.getTime();

      days.push({ day: d, dateStr, isPast, isSunday, isAvailable, isUnavailable, isSelected, isToday });
    }
    return days;
  }, [calendarMonth, dateAvailMap, bookingForm.booking_date]);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div><p>Loading bookings...</p></div>;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>Bookings</span>
      </div>

      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <i className="fas fa-calendar-check" style={{ color: '#3b82f6' }}></i>
        My Bookings
      </h1>

      {/* Alerts */}
      {success && <div className="login-alert login-alert-success" style={{ marginBottom: '20px' }}><i className="fas fa-check-circle"></i> {success}</div>}
      {error && !showBookingModal && <div className="login-alert login-alert-error" style={{ marginBottom: '20px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

      {/* Tabs */}
      <div className="tabs-nav">
        <button className={`tab-btn${tab === 'bookings' ? ' active' : ''}`} onClick={() => setTab('bookings')}>
          <i className="fas fa-calendar-alt"></i> My Bookings
        </button>
        <button className={`tab-btn${tab === 'new' ? ' active' : ''}`} onClick={() => { setTab('new'); openBookingModal(); }}>
          <i className="fas fa-plus-circle"></i> New Booking
        </button>
        <button className={`tab-btn${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
          <i className="fas fa-hourglass-half"></i> Pending
          {pendingRequests.length > 0 && (
            <span style={{ background: '#ef4444', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, marginLeft: '6px' }}>
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* My Bookings Tab */}
      {tab === 'bookings' && (
        <div className="card-modern">
          <div className="card-modern-body">
            {bookings.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Vehicle</th>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b, i) => {
                      const isCancelled = (b.status || '').toLowerCase().includes('cancel');
                      const isPast = new Date(b.booking_date) < new Date();
                      return (
                        <tr key={i}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>
                              {new Date(b.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                              {new Date(b.booking_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.make} {b.model}</div>
                            <div style={{ color: '#94a3b8', fontSize: '12px' }}>{b.plate_no}</div>
                          </td>
                          <td style={{ fontSize: '14px' }}>{b.formatted_services || b.service || 'N/A'}</td>
                          <td>{getStatusBadge(b.status)}</td>
                          <td>
                            {!isCancelled && !isPast && (
                              <button className="btn-danger btn-sm" onClick={() => setCancelConfirm(b)}>
                                <i className="fas fa-times"></i> Cancel
                              </button>
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
                <h3>No bookings found</h3>
                <p>Create a new booking to schedule your next vehicle service.</p>
                <button className="btn-gradient" onClick={openBookingModal}>
                  <i className="fas fa-plus"></i> New Booking
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Booking Tab - Now shows the booking form inline */}
      {tab === 'new' && !showBookingModal && (
        <div className="card-modern">
          <div className="card-modern-body">
            <div className="empty-state">
              <div className="empty-state-icon"><i className="fas fa-calendar-plus"></i></div>
              <h3>Ready to book?</h3>
              <p>Select a service, pick a date, and choose a time slot.</p>
              <button className="btn-gradient" onClick={openBookingModal}>
                <i className="fas fa-plus"></i> Start New Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Requests Tab */}
      {tab === 'pending' && (
        <div className="card-modern">
          <div className="card-modern-body">
            {pendingRequests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pendingRequests.map((r, i) => (
                  <div key={i} style={{
                    padding: '20px',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05), rgba(217, 119, 6, 0.05))',
                    borderRadius: '16px',
                    border: '1px solid rgba(245, 158, 11, 0.15)',
                  }}>
                    <div className="flex-between" style={{ marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#1f2937' }}>{r.make} {r.model}</div>
                        <div style={{ color: '#94a3b8', fontSize: '13px' }}>{r.plate_no}</div>
                      </div>
                      <span className="badge badge-warning">Pending</span>
                    </div>
                    <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#64748b', flexWrap: 'wrap' }}>
                      <span><i className="fas fa-calendar" style={{ marginRight: '6px' }}></i>
                        {new Date(r.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span><i className="fas fa-wrench" style={{ marginRight: '6px' }}></i>
                        {r.formatted_services || r.latest_service || 'Service'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="fas fa-hourglass-half"></i></div>
                <h3>No pending requests</h3>
                <p>All your booking requests have been processed.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW BOOKING MODAL */}
      {showBookingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBookingModal(false)}>
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-calendar-plus" style={{ marginRight: '8px', color: '#3b82f6' }}></i>New Booking</h3>
              <button className="modal-close" onClick={() => setShowBookingModal(false)}>×</button>
            </div>
            <form onSubmit={handleBookingSubmit}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {error && <div className="login-alert login-alert-error" style={{ marginBottom: '16px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

                {/* Step 1: Vehicle */}
                <div className="form-group">
                  <label className="form-label"><i className="fas fa-car" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Vehicle *</label>
                  {vehicles.length > 0 ? (
                    <select className="form-select" value={bookingForm.vehicle_id} onChange={e => setBookingForm({...bookingForm, vehicle_id: e.target.value})} required>
                      <option value="">Choose a vehicle...</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plate_no || 'No plate'}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '12px', color: '#dc2626', fontSize: '14px' }}>
                      <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                      No vehicles found. <Link to="/vehicles" style={{ fontWeight: 600 }}>Add a vehicle first</Link>.
                    </div>
                  )}
                </div>

                {/* Step 2: Service */}
                <div className="form-group">
                  <label className="form-label"><i className="fas fa-wrench" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Service *</label>
                  <select className="form-select" value={bookingForm.service_type} onChange={e => handleServiceChange(e.target.value)} required>
                    <option value="">Choose a service...</option>
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Step 3: Calendar */}
                {bookingForm.service_type && (
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-calendar" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Date *</label>
                    {loadingDates ? (
                      <div style={{ textAlign: 'center', padding: '24px' }}><div className="spinner" style={{ borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', width: '28px', height: '28px' }}></div><p style={{ color: '#64748b', marginTop: '8px', fontSize: '13px' }}>Checking availability...</p></div>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '16px' }}>
                        {/* Calendar Nav */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                            style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-chevron-left"></i>
                          </button>
                          <span style={{ fontWeight: 600, color: '#374151' }}>
                            {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </span>
                          <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                            style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-chevron-right"></i>
                          </button>
                        </div>

                        {/* Day Headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontWeight: 600, color: '#6b7280', padding: '6px', fontSize: '12px' }}>{d}</div>
                          ))}
                        </div>

                        {/* Calendar Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                          {calendarDays.map((d, i) => {
                            if (!d) return <div key={`empty-${i}`} />;
                            const canClick = d.isAvailable && !d.isPast && !d.isSunday;
                            return (
                              <button
                                key={d.dateStr}
                                type="button"
                                onClick={() => canClick && handleDateSelect(d.dateStr)}
                                style={{
                                  aspectRatio: '1',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '8px',
                                  border: d.isSelected ? '2px solid #1d4ed8' : d.isToday ? '2px solid #f59e0b' : '1px solid transparent',
                                  background: d.isSelected
                                    ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                                    : d.isPast || d.isSunday
                                    ? '#f3f4f6'
                                    : d.isAvailable
                                    ? 'rgba(16, 185, 129, 0.1)'
                                    : d.isUnavailable
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : 'transparent',
                                  color: d.isSelected ? 'white' : d.isPast || d.isSunday ? '#9ca3af' : d.isAvailable ? '#059669' : d.isUnavailable ? '#dc2626' : '#374151',
                                  fontWeight: d.isSelected || d.isToday ? 600 : 500,
                                  fontSize: '13px',
                                  cursor: canClick ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s ease',
                                  position: 'relative',
                                  textDecoration: d.isUnavailable && !d.isPast ? 'line-through' : 'none',
                                }}
                              >
                                {d.day}
                              </button>
                            );
                          })}
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', justifyContent: 'center', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#d1fae5', border: '1px solid #10b981' }}></span>Available</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #ef4444' }}></span>Full</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f3f4f6', border: '1px solid #9ca3af' }}></span>Past/Closed</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Time Slots */}
                {bookingForm.booking_date && (
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-clock" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Time *</label>
                    {loadingTimes ? (
                      <div style={{ textAlign: 'center', padding: '16px' }}><div className="spinner" style={{ borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', width: '24px', height: '24px' }}></div></div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {(availableTimes.length > 0 ? availableTimes : TIME_SLOTS.map(t => ({ ...t, available: true }))).map(t => (
                          <button
                            key={t.time}
                            type="button"
                            onClick={() => t.available && setBookingForm({...bookingForm, booking_time: t.time})}
                            style={{
                              padding: '12px',
                              borderRadius: '10px',
                              border: bookingForm.booking_time === t.time ? '2px solid #1d4ed8' : '1px solid rgba(59,130,246,0.2)',
                              background: bookingForm.booking_time === t.time ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : t.available ? 'white' : '#f3f4f6',
                              color: bookingForm.booking_time === t.time ? 'white' : t.available ? '#374151' : '#9ca3af',
                              fontWeight: 600,
                              fontSize: '13px',
                              cursor: t.available ? 'pointer' : 'not-allowed',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {bookingForm.booking_time && (
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-sticky-note" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Notes (Optional)</label>
                    <textarea className="form-input" rows={3} value={bookingForm.notes} onChange={e => setBookingForm({...bookingForm, notes: e.target.value})} placeholder="Any special requests or notes..." />
                  </div>
                )}

                {/* Summary */}
                {bookingForm.vehicle_id && bookingForm.service_type && bookingForm.booking_date && bookingForm.booking_time && (
                  <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(59,130,246,0.05), rgba(14,165,233,0.05))', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.15)', marginTop: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', marginBottom: '12px' }}><i className="fas fa-clipboard-check" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Booking Summary</h4>
                    <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
                      <div><span style={{ color: '#64748b' }}>Vehicle:</span> <strong>{vehicles.find(v => v.id == bookingForm.vehicle_id)?.make} {vehicles.find(v => v.id == bookingForm.vehicle_id)?.model}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Service:</span> <strong>{bookingForm.service_type}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Date:</span> <strong>{new Date(bookingForm.booking_date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Time:</span> <strong>{TIME_SLOTS.find(t => t.time === bookingForm.booking_time)?.label || bookingForm.booking_time}</strong></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowBookingModal(false)}>Cancel</button>
                <button type="submit" className="btn-gradient" disabled={submitting || !bookingForm.vehicle_id || !bookingForm.service_type || !bookingForm.booking_date || !bookingForm.booking_time}>
                  {submitting ? <span className="spinner"></span> : <><i className="fas fa-paper-plane"></i> Submit Request</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelConfirm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setCancelConfirm(null)}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Cancel Booking</h3>
              <button className="modal-close" onClick={() => setCancelConfirm(null)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', color: '#ef4444', marginBottom: '16px' }}><i className="fas fa-exclamation-triangle"></i></div>
              <p style={{ fontSize: '15px', color: '#374151', marginBottom: '8px' }}>
                Cancel booking for <strong>{cancelConfirm.make} {cancelConfirm.model}</strong>?
              </p>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                {new Date(cancelConfirm.booking_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setCancelConfirm(null)}>Keep Booking</button>
              <button className="btn-danger" onClick={() => handleCancel(cancelConfirm.booking_id || cancelConfirm.id)}>
                <i className="fas fa-times"></i> Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
