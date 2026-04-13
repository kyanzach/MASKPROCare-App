import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

const CANCEL_REASONS = [
  'Schedule conflict',
  'Vehicle issue',
  'Service no longer needed',
  'Found another provider',
  'Financial reasons',
  'Others',
];
const EDIT_REASONS = [
  'Schedule conflict',
  'Vehicle not available',
  'Change of plans',
  'Others',
];

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   bg: '#fef3c7', color: '#92400e', border: '#fbbf24', icon: 'fa-hourglass-half' },
  scheduled: { label: 'Scheduled', bg: '#dbeafe', color: '#1e40af', border: '#3b82f6', icon: 'fa-calendar-check' },
  done:      { label: 'Done',      bg: '#d1fae5', color: '#065f46', border: '#10b981', icon: 'fa-check-circle' },
  cancelled: { label: 'Cancelled', bg: '#fee2e2', color: '#991b1b', border: '#ef4444', icon: 'fa-times-circle' },
  rejected:  { label: 'Rejected',  bg: '#fee2e2', color: '#991b1b', border: '#ef4444', icon: 'fa-ban' },
};

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // New booking modal
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [bookingForm, setBookingForm] = useState({ vehicle_id: '', service_type: '', booking_date: '', booking_time: '', notes: '' });
  const [availableDates, setAvailableDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState(null); // { item, type: 'booking'|'request' }
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonCustom, setCancelReasonCustom] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null); // the request item
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editReasonCustom, setEditReasonCustom] = useState('');
  const [editing, setEditing] = useState(false);
  const [editCalendarMonth, setEditCalendarMonth] = useState(new Date());
  const [editAvailableDates, setEditAvailableDates] = useState([]);
  const [editLoadingDates, setEditLoadingDates] = useState(false);

  const location = useLocation();
  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (location.state?.openBooking) {
      openBookingModal();
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadData = async () => {
    try {
      const [bookingsRes, vehiclesRes, servicesRes] = await Promise.all([
        api.get('/bookings/list'),
        api.get('/vehicles/list'),
        api.get('/services/list'),
      ]);
      const data = bookingsRes.data.data;
      setBookings(data?.bookings || []);
      setRequests(data?.requests || []);
      setVehicles(vehiclesRes.data.data?.vehicles || []);
      setServiceTypes(servicesRes.data.data?.service_types || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Unified list: merge bookings + requests, sorted by date (newest first)
  const unifiedList = useMemo(() => {
    const all = [
      ...bookings.map(b => ({
        ...b,
        id: b.booking_id,
        type: 'booking',
        status: b.status,
        service: getServiceLabel(b.latest_service),
        dateObj: new Date(b.booking_date),
        dateStr: new Date(b.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        timeStr: new Date(b.booking_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      })),
      ...requests.map(r => ({
        ...r,
        id: r.request_id,
        type: 'request',
        status: r.status, // pending, cancelled, rejected
        service: getServiceLabel(r.latest_service || r.service_names),
        dateObj: new Date(r.booking_date),
        dateStr: new Date(r.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        timeStr: new Date(r.booking_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      })),
    ];
    all.sort((a, b) => b.dateObj - a.dateObj);
    return all;
  }, [bookings, requests]);

  // --- New Booking Logic ---
  const loadAvailability = async (serviceType, vehicleId, monthDate) => {
    setLoadingDates(true);
    try {
      const m = monthDate || new Date();
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const res = await api.get('/bookings/availability', {
        params: { action: 'get_available_dates', service_type: serviceType, vehicle_id: vehicleId, month },
      });
      setAvailableDates(res.data.data?.dates || []);
    } catch (err) { console.error(err); }
    finally { setLoadingDates(false); }
  };

  const handleServiceChange = (service) => {
    setBookingForm({ ...bookingForm, service_type: service, booking_date: '', booking_time: '' });
  };

  const handleVehicleChange = (vehicleId) => {
    setBookingForm({ ...bookingForm, vehicle_id: vehicleId, booking_date: '', booking_time: '' });
  };

  useEffect(() => {
    if (bookingForm.service_type && bookingForm.vehicle_id) {
      loadAvailability(bookingForm.service_type, bookingForm.vehicle_id, calendarMonth);
    } else {
      setAvailableDates([]);
    }
  }, [bookingForm.service_type, bookingForm.vehicle_id, calendarMonth]);

  const handleDateSelect = (dateStr) => {
    setBookingForm({ ...bookingForm, booking_date: dateStr, booking_time: '' });
  };

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateInfo = availableDates.find(a => a.date === dateStr);
      const isSunday = new Date(year, month, d).getDay() === 0;
      const isClosed = !dateInfo && !isSunday && dateStr >= today;
      days.push({
        day: d, dateStr,
        isToday: dateStr === today,
        isPast: dateStr < today,
        isSunday,
        isAvailable: dateInfo ? dateInfo.available : false,
        isLimited: dateInfo ? dateInfo.status === 'limited' : false,
        isUnavailable: dateInfo ? dateInfo.status === 'full' : false,
        isClosed,
        isSelected: bookingForm.booking_date === dateStr,
        capacity: dateInfo?.capacity,
        booked: dateInfo?.booked,
      });
    }
    return days;
  }, [calendarMonth, availableDates, bookingForm.booking_date]);

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!bookingForm.vehicle_id || !bookingForm.service_type || !bookingForm.booking_date) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/bookings/create', { ...bookingForm, booking_time: '08:00' });
      setSuccess('Booking request submitted! Your request is pending approval.');
      setShowBookingModal(false);
      setBookingForm({ vehicle_id: '', service_type: '', booking_date: '', booking_time: '', notes: '' });
      setAvailableDates([]);
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
    setCalendarMonth(new Date());
    setShowBookingModal(true);
  };

  // --- Cancel Logic ---
  const openCancelModal = (item) => {
    setCancelTarget(item);
    setCancelReason('');
    setCancelReasonCustom('');
    setError('');
  };

  const handleCancel = async () => {
    const reason = cancelReason === 'Others' ? cancelReasonCustom.trim() : cancelReason;
    if (!reason) { setError('Please select or enter a reason.'); return; }
    setCancelling(true);
    setError('');
    try {
      if (cancelTarget.type === 'request') {
        await api.post('/bookings/cancel', { type: 'request', request_id: cancelTarget.id, reason });
      } else {
        await api.post('/bookings/cancel', { type: 'booking', booking_id: cancelTarget.id, reason });
      }
      setSuccess('Booking cancelled successfully.');
      setCancelTarget(null);
      loadData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel.');
    } finally { setCancelling(false); }
  };

  // --- Edit Logic ---
  const openEditModal = (item) => {
    setEditTarget(item);
    setEditDate('');
    setEditReason('');
    setEditReasonCustom('');
    setEditCalendarMonth(new Date());
    setEditAvailableDates([]);
    setError('');
    // Load availability for this service
    loadEditAvailability(item.latest_service || item.service_names, new Date());
  };

  const loadEditAvailability = async (serviceType, monthDate) => {
    setEditLoadingDates(true);
    try {
      const m = monthDate || new Date();
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const res = await api.get('/bookings/availability', {
        params: { action: 'get_available_dates', service_type: serviceType, month },
      });
      setEditAvailableDates(res.data.data?.dates || []);
    } catch (err) { console.error(err); }
    finally { setEditLoadingDates(false); }
  };

  useEffect(() => {
    if (editTarget?.latest_service || editTarget?.service_names) {
      loadEditAvailability(editTarget.latest_service || editTarget.service_names, editCalendarMonth);
    }
  }, [editTarget, editCalendarMonth]);

  const editCalendarDays = useMemo(() => {
    const year = editCalendarMonth.getFullYear();
    const month = editCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateInfo = editAvailableDates.find(a => a.date === dateStr);
      const isSunday = new Date(year, month, d).getDay() === 0;
      const isClosed = !dateInfo && !isSunday && dateStr > today;
      days.push({
        day: d, dateStr,
        isToday: dateStr === today,
        isPast: dateStr <= today,
        isSunday,
        isAvailable: dateInfo ? dateInfo.available : false,
        isLimited: dateInfo ? dateInfo.status === 'limited' : false,
        isUnavailable: dateInfo ? dateInfo.status === 'full' : false,
        isClosed,
        isSelected: editDate === dateStr,
        capacity: dateInfo?.capacity,
        booked: dateInfo?.booked,
      });
    }
    return days;
  }, [editCalendarMonth, editAvailableDates, editDate]);

  const handleEdit = async () => {
    const reason = editReason === 'Others' ? editReasonCustom.trim() : editReason;
    if (!editDate) { setError('Please select a new date.'); return; }
    if (!reason) { setError('Please select or enter a reason.'); return; }
    setEditing(true);
    setError('');
    try {
      await api.post('/bookings/edit-request', { request_id: editTarget.id, new_date: editDate, reason });
      setSuccess('Booking request updated successfully.');
      setEditTarget(null);
      loadData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update.');
    } finally { setEditing(false); }
  };

  // --- Helpers ---
  const canCancel = (item) => {
    if (item.type === 'request') return item.status === 'pending';
    return item.status === 'scheduled'; // only future bookings
  };
  const canEdit = (item) => {
    return item.type === 'request' && item.status === 'pending';
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div><p>Loading bookings...</p></div>;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/">Home</Link><span>/</span><span>Bookings</span>
      </div>

      {/* Header */}
      <div className="flex-between mb-24">
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fas fa-calendar-check" style={{ color: '#3b82f6' }}></i>
          My Bookings
        </h1>
        <button className="btn-gradient" onClick={openBookingModal}>
          <i className="fas fa-plus"></i> New Booking
        </button>
      </div>

      {/* Alerts */}
      {success && <div className="login-alert login-alert-success" style={{ marginBottom: '20px' }}><i className="fas fa-check-circle"></i> {success}</div>}
      {error && !showBookingModal && !cancelTarget && !editTarget && <div className="login-alert login-alert-error" style={{ marginBottom: '20px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

      {/* Unified Booking List */}
      <div className="card-modern" style={{ borderRadius: '16px', overflow: 'hidden' }}>
        {unifiedList.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: 'rgba(59,130,246,0.05)', borderBottom: '2px solid rgba(59,130,246,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#374151', fontWeight: 600, fontSize: '13px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#374151', fontWeight: 600, fontSize: '13px' }}>Vehicle</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#374151', fontWeight: 600, fontSize: '13px' }}>Service</th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', color: '#374151', fontWeight: 600, fontSize: '13px' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', color: '#374151', fontWeight: 600, fontSize: '13px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {unifiedList.map((item, idx) => {
                  const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled;
                  return (
                    <tr key={`${item.type}-${item.id}`} style={{
                      borderBottom: idx < unifiedList.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      opacity: item.status === 'cancelled' || item.status === 'rejected' ? 0.65 : 1,
                    }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{item.dateStr}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{item.timeStr}</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{item.make} {item.model}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{item.plate_no || ''}</div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#374151' }}>{item.service}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                          background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                        }}>
                          <i className={`fas ${sc.icon}`} style={{ fontSize: '10px' }}></i>
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {canEdit(item) && (
                            <button
                              onClick={() => openEditModal(item)}
                              title="Edit booking date"
                              style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)',
                                color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                              }}
                            >
                              <i className="fas fa-pencil-alt" style={{ fontSize: '12px' }}></i>
                            </button>
                          )}
                          {canCancel(item) && (
                            <button
                              onClick={() => openCancelModal(item)}
                              title="Cancel booking"
                              style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)',
                                color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                              }}
                            >
                              <i className="fas fa-times" style={{ fontSize: '12px' }}></i>
                            </button>
                          )}
                          {!canEdit(item) && !canCancel(item) && (
                            <span style={{ color: '#d1d5db', fontSize: '12px' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><i className="fas fa-calendar-check"></i></div>
            <h3>No bookings yet</h3>
            <p>Book your first service appointment.</p>
            <button className="btn-gradient" onClick={openBookingModal}><i className="fas fa-plus"></i> New Booking</button>
          </div>
        )}
      </div>

      {/* ===== NEW BOOKING MODAL ===== */}
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

                {/* Vehicle */}
                <div className="form-group">
                  <label className="form-label"><i className="fas fa-car" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Vehicle *</label>
                  {vehicles.length > 0 ? (
                    <select className="form-select" value={bookingForm.vehicle_id} onChange={e => handleVehicleChange(e.target.value)} required>
                      <option value="">Choose a vehicle...</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plate_no || 'No plate'}</option>)}
                    </select>
                  ) : (
                    <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '12px', color: '#dc2626', fontSize: '14px' }}>
                      <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                      No vehicles found. <Link to="/vehicles" style={{ fontWeight: 600 }}>Add a vehicle first</Link>.
                    </div>
                  )}
                </div>

                {/* Service */}
                <div className="form-group">
                  <label className="form-label"><i className="fas fa-wrench" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Service *</label>
                  <select className="form-select" value={bookingForm.service_type} onChange={e => handleServiceChange(e.target.value)} required>
                    <option value="">Choose a service...</option>
                    {serviceTypes.map(s => <option key={s.api_name} value={s.api_name}>{s.label}</option>)}
                  </select>
                </div>

                {/* Calendar */}
                {bookingForm.service_type && (
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-calendar" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select Date *</label>
                    {loadingDates ? (
                      <div style={{ textAlign: 'center', padding: '24px' }}><div className="spinner" style={{ borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', width: '28px', height: '28px' }}></div><p style={{ color: '#64748b', marginTop: '8px', fontSize: '13px' }}>Checking availability...</p></div>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '16px' }}>
                        {renderCalendar(calendarMonth, setCalendarMonth, calendarDays, handleDateSelect)}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {bookingForm.booking_date && (
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-sticky-note" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Notes (Optional)</label>
                    <textarea className="form-input" rows={3} value={bookingForm.notes} onChange={e => setBookingForm({...bookingForm, notes: e.target.value})} placeholder="Any special requests or notes..." />
                  </div>
                )}

                {/* Summary */}
                {bookingForm.vehicle_id && bookingForm.service_type && bookingForm.booking_date && (
                  <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(59,130,246,0.05), rgba(14,165,233,0.05))', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.15)', marginTop: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', marginBottom: '12px' }}><i className="fas fa-clipboard-check" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Booking Summary</h4>
                    <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
                      <div><span style={{ color: '#64748b' }}>Vehicle:</span> <strong>{vehicles.find(v => v.id == bookingForm.vehicle_id)?.make} {vehicles.find(v => v.id == bookingForm.vehicle_id)?.model}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Service:</span> <strong>{getServiceLabel(bookingForm.service_type)}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Date:</span> <strong>{new Date(bookingForm.booking_date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowBookingModal(false)}>Cancel</button>
                <button type="submit" className="btn-gradient" disabled={submitting || !bookingForm.vehicle_id || !bookingForm.service_type || !bookingForm.booking_date}>
                  {submitting ? <span className="spinner"></span> : <><i className="fas fa-paper-plane"></i> Submit Request</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== CANCEL MODAL ===== */}
      {cancelTarget && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCancelTarget(null)}>
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-times-circle" style={{ marginRight: '8px', color: '#ef4444' }}></i>Cancel Booking</h3>
              <button className="modal-close" onClick={() => setCancelTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-alert login-alert-error" style={{ marginBottom: '16px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '40px', color: '#ef4444', marginBottom: '12px' }}><i className="fas fa-exclamation-triangle"></i></div>
                <p style={{ fontSize: '15px', color: '#374151', marginBottom: '4px' }}>
                  Cancel booking for <strong>{cancelTarget.make} {cancelTarget.model}</strong>?
                </p>
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {cancelTarget.dateStr} — {cancelTarget.service}
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Reason for cancellation *</label>
                <select className="form-select" value={cancelReason} onChange={e => setCancelReason(e.target.value)}>
                  <option value="">Select a reason...</option>
                  {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {cancelReason === 'Others' && (
                <div className="form-group">
                  <label className="form-label">Please specify</label>
                  <textarea className="form-input" rows={2} value={cancelReasonCustom} onChange={e => setCancelReasonCustom(e.target.value)} placeholder="Describe your reason..." />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setCancelTarget(null)}>Keep Booking</button>
              <button
                className="btn-danger"
                onClick={handleCancel}
                disabled={cancelling || (!cancelReason || (cancelReason === 'Others' && !cancelReasonCustom.trim()))}
              >
                {cancelling ? <span className="spinner"></span> : <><i className="fas fa-times"></i> Cancel Booking</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EDIT MODAL ===== */}
      {editTarget && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditTarget(null)}>
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-pencil-alt" style={{ marginRight: '8px', color: '#3b82f6' }}></i>Edit Booking</h3>
              <button className="modal-close" onClick={() => setEditTarget(null)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <div className="login-alert login-alert-error" style={{ marginBottom: '16px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

              {/* Current booking info */}
              <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.05)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', display: 'grid', gap: '6px' }}>
                <div><span style={{ color: '#64748b' }}>Vehicle:</span> <strong>{editTarget.make} {editTarget.model}</strong></div>
                <div><span style={{ color: '#64748b' }}>Service:</span> <strong>{editTarget.service}</strong></div>
                <div><span style={{ color: '#64748b' }}>Current date:</span> <strong>{editTarget.dateStr}</strong></div>
              </div>

              {/* New date calendar */}
              <div className="form-group">
                <label className="form-label"><i className="fas fa-calendar" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Select New Date *</label>
                {editLoadingDates ? (
                  <div style={{ textAlign: 'center', padding: '24px' }}><div className="spinner" style={{ borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', width: '28px', height: '28px' }}></div></div>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '16px' }}>
                    {renderCalendar(editCalendarMonth, setEditCalendarMonth, editCalendarDays, (d) => setEditDate(d))}
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="form-group">
                <label className="form-label">Reason for change *</label>
                <select className="form-select" value={editReason} onChange={e => setEditReason(e.target.value)}>
                  <option value="">Select a reason...</option>
                  {EDIT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {editReason === 'Others' && (
                <div className="form-group">
                  <label className="form-label">Please specify</label>
                  <textarea className="form-input" rows={2} value={editReasonCustom} onChange={e => setEditReasonCustom(e.target.value)} placeholder="Describe your reason..." />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setEditTarget(null)}>Cancel</button>
              <button
                className="btn-gradient"
                onClick={handleEdit}
                disabled={editing || !editDate || !editReason || (editReason === 'Others' && !editReasonCustom.trim())}
              >
                {editing ? <span className="spinner"></span> : <><i className="fas fa-check"></i> Update Booking</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared calendar renderer
function renderCalendar(month, setMonth, days, onSelect) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))}
          style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fas fa-chevron-left"></i>
        </button>
        <span style={{ fontWeight: 600, color: '#374151' }}>
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))}
          style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontWeight: 600, color: '#6b7280', padding: '6px', fontSize: '12px' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {days.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const canClick = (d.isAvailable || d.isLimited) && !d.isPast && !d.isSunday && !d.isClosed;
          return (
            <button key={d.dateStr} type="button" onClick={() => canClick && onSelect(d.dateStr)}
              title={d.isClosed || d.isSunday ? 'Closed' : d.isLimited ? 'Almost Full — 1 slot left' : d.isUnavailable ? 'Fully Booked' : ''}
              style={{
                aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px', position: 'relative',
                border: d.isSelected ? '2px solid #1d4ed8' : d.isToday ? '2px solid #f59e0b' : '1px solid transparent',
                background: d.isSelected ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                  : d.isPast || d.isSunday ? '#f3f4f6'
                  : d.isLimited ? 'rgba(245, 158, 11, 0.12)'
                  : d.isAvailable ? 'rgba(16, 185, 129, 0.1)'
                  : d.isUnavailable ? 'rgba(239, 68, 68, 0.1)'
                  : d.isClosed ? 'rgba(203, 213, 225, 0.25)' : 'transparent',
                color: d.isSelected ? 'white'
                  : d.isPast || d.isSunday ? '#9ca3af'
                  : d.isLimited ? '#d97706'
                  : d.isAvailable ? '#059669'
                  : d.isUnavailable ? '#dc2626'
                  : d.isClosed ? '#94a3b8' : '#374151',
                fontWeight: d.isSelected || d.isToday ? 600 : 500, fontSize: '13px',
                cursor: canClick ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                textDecoration: d.isUnavailable && !d.isPast ? 'line-through' : 'none',
              }}>
              {d.day}
              {/* Status dot — matches Unify's calendar dots */}
              {!d.isPast && !d.isSelected && (d.isLimited || d.isUnavailable || d.isAvailable || d.isClosed || d.isSunday) && (
                <span style={{
                  width: d.isUnavailable ? '6px' : '5px',
                  height: d.isUnavailable ? '6px' : '5px',
                  borderRadius: '50%',
                  background: d.isClosed || d.isSunday ? '#cbd5e1' : d.isLimited ? '#f59e0b' : d.isUnavailable ? '#ef4444' : '#22c55e',
                  position: 'absolute', bottom: '3px',
                  boxShadow: d.isUnavailable ? '0 0 3px 1px rgba(239,68,68,0.4)' : '0 0 0 1px rgba(255,255,255,0.8)',
                }} />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', justifyContent: 'center', fontSize: '10px', color: '#64748b', flexWrap: 'wrap', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 500 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span>Open</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span>Limited</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span>Full</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#cbd5e1' }}></span>Closed</span>
      </div>
    </>
  );
}
