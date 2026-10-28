import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

// Build photo URL helper: points to root domain on production (/uploads/...) or Express dev server
const getPhotoUrl = (photoPath) => {
  if (!photoPath) return null;
  if (photoPath.startsWith('http')) return photoPath;
  const rootBase = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : (import.meta.env.PROD ? '' : 'http://localhost:3004');
  return `${rootBase}/${photoPath.replace(/^\//, '')}`;
};

// Map common colors to CSS color values
const COLOR_MAP = {
  'red': '#dc2626', 'blue': '#2563eb', 'black': '#1f2937', 'white': '#e5e7eb',
  'silver': '#9ca3af', 'gray': '#6b7280', 'grey': '#6b7280', 'green': '#16a34a',
  'yellow': '#eab308', 'orange': '#ea580c', 'brown': '#92400e', 'gold': '#d97706',
  'maroon': '#7f1d1d', 'beige': '#d4c5a9', 'ivory': '#fffff0', 'cream': '#fffdd0',
  'blackish red': '#5c1a1a', 'midnight blue': '#1e3a5f', 'pearl white': '#f5f5f0',
  'wine red': '#722f37', 'dark blue': '#1e3a8a', 'light blue': '#93c5fd',
  'sky blue': '#38bdf8', 'navy blue': '#1e40af',
};

function getColorDot(colorName) {
  if (!colorName) return null;
  const key = colorName.toLowerCase().trim();
  const hex = COLOR_MAP[key] || '#94a3b8';
  const isWhite = key.includes('white') || key === 'ivory' || key === 'cream' || key === 'pearl white';
  return (
    <span style={{
      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
      backgroundColor: hex, border: isWhite ? '1px solid #d1d5db' : '1px solid transparent',
      marginRight: '5px', verticalAlign: 'middle',
    }} />
  );
}

// Philippine vehicle registration renewal logic:
// First 3 years are free. After that, annual renewal.
function getNextRenewal(registrationDate) {
  if (!registrationDate) return null;
  const regDate = new Date(registrationDate + 'T00:00');
  const now = new Date();
  const firstRenewal = new Date(regDate);
  firstRenewal.setFullYear(firstRenewal.getFullYear() + 3);

  if (now < firstRenewal) {
    return firstRenewal;
  }
  // Annual renewals after first 3 years
  const yearsPastFirst = Math.floor((now - firstRenewal) / (365.25 * 24 * 60 * 60 * 1000));
  const nextRenewal = new Date(firstRenewal);
  nextRenewal.setFullYear(nextRenewal.getFullYear() + yearsPastFirst + 1);
  return nextRenewal;
}

function getRenewalStatus(registrationDate) {
  const next = getNextRenewal(registrationDate);
  if (!next) return null;
  const now = new Date();
  const diffDays = Math.ceil((next - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'LTO Registration Overdue', color: '#dc2626', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)', icon: 'fa-exclamation-circle' };
  if (diffDays <= 30) return { label: `LTO Registration — Renew in ${diffDays}d`, color: '#d97706', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.3)', icon: 'fa-clock' };
  if (diffDays <= 90) return { label: `LTO Registration — Due ${next.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, color: '#2563eb', bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.2)', icon: 'fa-calendar-check' };
  return { label: `LTO Registration valid until ${next.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, color: '#059669', bg: 'transparent', border: 'rgba(16,185,129,0.3)', icon: 'fa-check-circle' };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDisplayDate(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length !== 3) return ymd;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11) return ymd;
  return `${SHORT_MONTHS[m]} ${d}, ${y}`;
}

function toYMD(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export default function Vehicles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ make: '', model: '', plate_no: '', color: '', registration_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(null); // vehicle id being uploaded
  const [viewingPhoto, setViewingPhoto] = useState(null); // { url, title, plate }
  const [modalPhoto, setModalPhoto] = useState(null); // file selected in modal
  const [modalPhotoPreview, setModalPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  const modalFileInputRef = useRef(null);
  const uploadTargetRef = useRef(null); // which vehicle id to upload for

  // Hotel/Flight-Style Interactive Calendar Picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showYearMonthJump, setShowYearMonthJump] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  const openDatePicker = () => {
    const existing = form.registration_date;
    if (existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) {
      const [y, m] = existing.split('-').map((n) => parseInt(n, 10));
      if (!isNaN(y) && !isNaN(m)) {
        setCalYear(y);
        setCalMonth(m - 1);
      }
    } else {
      const now = new Date();
      setCalYear(now.getFullYear());
      setCalMonth(now.getMonth());
    }
    setShowYearMonthJump(false);
    setShowDatePicker(true);
  };

  const stepCalendarMonth = (delta) => {
    let nextMonth = calMonth + delta;
    let nextYear = calYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setCalMonth(nextMonth);
    setCalYear(nextYear);
  };

  const selectCalendarDay = (day) => {
    const ymd = toYMD(calYear, calMonth, day);
    setForm((prev) => ({ ...prev, registration_date: ymd }));
    setShowDatePicker(false);
  };

  useEffect(() => { loadVehicles(); }, []);

  // Auto-open vehicle edit/details modal when deep-linked via ?vehicle_id=X
  useEffect(() => {
    const targetId = searchParams.get('vehicle_id');
    if (targetId && vehicles.length > 0) {
      const target = vehicles.find((v) => String(v.id) === String(targetId));
      if (target) {
        openEdit(target);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('vehicle_id');
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [vehicles, searchParams]);

  const loadVehicles = async () => {
    try {
      const res = await api.get('/vehicles/list');
      setVehicles(res.data.data?.vehicles || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openAdd = () => {
    setEditVehicle(null);
    setForm({ make: '', model: '', plate_no: '', color: '', registration_date: '' });
    setModalPhoto(null);
    setModalPhotoPreview(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditVehicle(v);
    setForm({
      make: v.make || '',
      model: v.model || '',
      plate_no: v.plate_no || '',
      color: v.color || '',
      registration_date: v.registration_date || v.registration_expiry || '',
    });
    setModalPhoto(null);
    setModalPhotoPreview(v.photo ? getPhotoUrl(v.photo) : null);
    setError('');
    setShowModal(true);
  };
  const handleDelete = async (id) => {
    try {
      await api.post('/vehicles/delete', { id });
      setSuccess('Vehicle deleted successfully!');
      setDeleteConfirm(null);
      setShowModal(false);
      loadVehicles();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete vehicle');
      setDeleteConfirm(null);
    }
  };

  // Trigger delete confirm from inside edit modal
  const handleDeleteFromModal = () => {
    if (!editVehicle) return;
    setShowModal(false);
    setDeleteConfirm(editVehicle);
  };

  // Photo upload handler (for card click)
  const handleCardPhotoUpload = (vehicleId) => {
    uploadTargetRef.current = vehicleId;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected
    
    const vehicleId = uploadTargetRef.current;
    if (!vehicleId) return;

    setUploading(vehicleId);
    try {
      const formData = new FormData();
      formData.append('vehicle_id', vehicleId);
      formData.append('photo', file);
      await api.post('/vehicles/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Photo uploaded!');
      loadVehicles();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload photo');
      setTimeout(() => setError(''), 4000);
    } finally {
      setUploading(null);
    }
  };

  // Photo upload handler for modal
  const handleModalPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setModalPhoto(file);
    setModalPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.make || !form.model) { setError('Make and Model are required'); return; }
    setSaving(true);
    setError('');
    try {
      let vehicleId;
      if (editVehicle) {
        await api.post('/vehicles/update', { id: editVehicle.id, ...form });
        vehicleId = editVehicle.id;
        setSuccess('Vehicle updated successfully!');
      } else {
        const res = await api.post('/vehicles/create', form);
        vehicleId = res.data?.data?.vehicle?.id;
        setSuccess('Vehicle added successfully!');
      }
      // Upload modal photo if one was selected
      if (modalPhoto && vehicleId) {
        const formData = new FormData();
        formData.append('vehicle_id', vehicleId);
        formData.append('photo', modalPhoto);
        await api.post('/vehicles/upload-photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setShowModal(false);
      loadVehicles();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save vehicle');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div><p>Loading vehicles...</p></div>;
  }

  return (
    <div>
      {/* Hidden file input for card photo uploads */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleFileSelected}
      />

      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>Vehicles</span>
      </div>

      {/* Header */}
      <div className="flex-between mb-24">
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fas fa-car" style={{ color: '#3b82f6' }}></i>
          My Vehicles
        </h1>
        <button className="btn-gradient" onClick={openAdd}>
          <i className="fas fa-plus"></i> Add Vehicle
        </button>
      </div>

      {/* Alerts */}
      {success && <div className="login-alert login-alert-success" style={{ marginBottom: '20px' }}><i className="fas fa-check-circle"></i> {success}</div>}
      {error && !showModal && <div className="login-alert login-alert-error" style={{ marginBottom: '20px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

      {/* Vehicle Cards */}
      {vehicles.length > 0 ? (
        <div className="grid-3">
          {vehicles.map((v) => {
            const regDate = v.registration_date || v.registration_expiry;
            const renewal = getRenewalStatus(regDate);
            const photoUrl = getPhotoUrl(v.photo);
            const isUploadingThis = uploading === v.id;
            return (
              <div className="vehicle-card" key={v.id} style={{ position: 'relative' }}>
                {/* Photo area — clickable to open edit modal or upload */}
                <div
                  onClick={() => !isUploadingThis && (photoUrl ? openEdit(v) : handleCardPhotoUpload(v.id))}
                  style={{
                    height: '160px',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '16px 16px 0 0',
                    cursor: 'pointer',
                    background: photoUrl ? '#0f172a' : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    transition: 'opacity 0.2s',
                  }}
                  title={photoUrl ? 'Click to edit vehicle' : 'Click to add photo'}
                >
                  {photoUrl && (
                    <img
                      src={photoUrl}
                      alt={`${v.make} ${v.model}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  {isUploadingThis && (
                    <div style={{
                      position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '16px 16px 0 0', zIndex: 2,
                    }}>
                      <div className="spinner" style={{ borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', width: '32px', height: '32px' }}></div>
                    </div>
                  )}
                  {!photoUrl && !isUploadingThis && (
                    <>
                      <i className="fas fa-car-side" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '8px' }}></i>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                        <i className="fas fa-camera" style={{ marginRight: '4px', fontSize: '10px' }}></i>
                        Snap a photo of your ride
                      </span>
                    </>
                  )}
                  {photoUrl && !isUploadingThis && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardPhotoUpload(v.id);
                      }}
                      title="Change photo"
                      style={{
                        position: 'absolute', bottom: '8px', right: '8px',
                        background: '#2563eb', borderRadius: '50%',
                        width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)', cursor: 'pointer',
                        zIndex: 1,
                      }}
                    >
                      <i className="fas fa-camera" style={{ fontSize: '11px', color: 'white' }}></i>
                    </div>
                  )}
                </div>

                <div className="vehicle-card-body">
                  {/* Header row with Edit button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{v.make} {v.model}</h3>
                    <button
                      onClick={() => openEdit(v)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        background: 'rgba(59,130,246,0.08)', color: '#3b82f6',
                        border: '1px solid rgba(59,130,246,0.2)', cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
                    >
                      <i className="fas fa-edit" style={{ fontSize: '12px' }}></i> Edit
                    </button>
                  </div>

                  {/* Badge row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {v.plate_no && (
                      <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 10px' }}>{v.plate_no}</span>
                    )}
                    {v.color && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                        border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#4b5563',
                      }}>
                        {getColorDot(v.color)}{v.color}
                      </span>
                    )}
                    {renewal && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                        border: `1px solid ${renewal.border}`, background: renewal.bg, color: renewal.color,
                      }}>
                        <i className={`fas ${renewal.icon}`} style={{ fontSize: '10px' }}></i>
                        {renewal.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-modern">
          <div className="empty-state">
            <div className="empty-state-icon"><i className="fas fa-car"></i></div>
            <h3>No vehicles yet</h3>
            <p>Add your first vehicle to start managing maintenance schedules.</p>
            <button className="btn-gradient" onClick={openAdd}><i className="fas fa-plus"></i> Add Vehicle</button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="login-alert login-alert-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
                
                {/* Vehicle Photo Upload in Modal */}
                <div
                  onClick={() => modalFileInputRef.current?.click()}
                  style={{
                    height: '140px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: modalPhotoPreview ? '#0f172a' : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                    borderRadius: '12px', cursor: 'pointer', marginBottom: '20px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: '2px dashed rgba(59,130,246,0.3)',
                    transition: 'all 0.2s',
                  }}
                >
                  {modalPhotoPreview && (
                    <img
                      src={modalPhotoPreview}
                      alt="Vehicle preview"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  {!modalPhotoPreview && (
                    <>
                      <i className="fas fa-camera" style={{ fontSize: '28px', color: '#94a3b8', marginBottom: '8px' }}></i>
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                        {editVehicle ? 'Tap to change photo' : 'Tap to add a photo'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>JPEG, PNG, or WebP</span>
                    </>
                  )}
                  {modalPhotoPreview && (
                    <div style={{
                      position: 'absolute', bottom: '8px', right: '8px',
                      background: 'rgba(0,0,0,0.6)', borderRadius: '20px',
                      padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                      backdropFilter: 'blur(4px)',
                      zIndex: 1,
                    }}>
                      <i className="fas fa-camera" style={{ fontSize: '10px', color: 'white' }}></i>
                      <span style={{ fontSize: '11px', color: 'white', fontWeight: 500 }}>Change</span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  ref={modalFileInputRef}
                  style={{ display: 'none' }}
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={handleModalPhotoSelect}
                />
                <div className="form-group">
                  <label className="form-label">Make *</label>
                  <input className="form-input" value={form.make} onChange={e => setForm({...form, make: e.target.value})} placeholder="e.g. Toyota" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Model *</label>
                  <input className="form-input" value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="e.g. Innova" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Plate Number</label>
                  <input className="form-input" value={form.plate_no} onChange={e => setForm({...form, plate_no: e.target.value})} placeholder="e.g. ABC 1234" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Color</label>
                    <input className="form-input" value={form.color} onChange={e => setForm({...form, color: e.target.value})} placeholder="e.g. White" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vehicle Registration Date</label>
                    <button
                      type="button"
                      onClick={openDatePicker}
                      className="form-input"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        textAlign: 'left',
                        backgroundColor: form.registration_date ? '#f8fafc' : '#ffffff',
                        borderColor: form.registration_date ? '#93c5fd' : undefined,
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <i className="fas fa-calendar-alt" style={{ color: form.registration_date ? '#2563eb' : '#64748b', fontSize: '13px' }}></i>
                        <span style={{ color: form.registration_date ? '#111827' : '#9ca3af', fontWeight: form.registration_date ? 600 : 400, fontSize: '14px' }}>
                          {form.registration_date ? formatDisplayDate(form.registration_date) : 'Select date'}
                        </span>
                      </span>
                      {form.registration_date ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({ ...form, registration_date: '' });
                          }}
                          title="Clear date"
                          style={{ color: '#94a3b8', padding: '0 2px', fontSize: '13px' }}
                        >
                          <i className="fas fa-times-circle"></i>
                        </span>
                      ) : (
                        <i className="fas fa-chevron-down" style={{ color: '#94a3b8', fontSize: '11px' }}></i>
                      )}
                    </button>
                  </div>
                </div>
                {/* Footnote */}
                <div style={{
                  marginTop: '4px', padding: '12px 16px', background: 'rgba(59,130,246,0.04)',
                  borderRadius: '10px', border: '1px solid rgba(59,130,246,0.1)',
                  fontSize: '12px', color: '#6b7280', lineHeight: '1.5',
                  display: 'flex', gap: '8px', alignItems: 'flex-start',
                }}>
                  <i className="fas fa-bell" style={{ color: '#3b82f6', marginTop: '2px', fontSize: '13px' }}></i>
                  <span>Enter your vehicle's registration date and we'll automatically calculate your next renewal — the first 3 years are free in the Philippines, then it's annual. We'll remind you before it's due.</span>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Delete link — only in edit mode, far left, separated */}
                {editVehicle ? (
                  <button
                    type="button"
                    onClick={handleDeleteFromModal}
                    style={{
                      background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 500, padding: '6px 0',
                      display: 'flex', alignItems: 'center', gap: '5px',
                      opacity: 0.7, transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                  >
                    <i className="fas fa-trash-alt" style={{ fontSize: '12px' }}></i> Delete Vehicle
                  </button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-gradient" disabled={saving}>
                    {saving ? <span className="spinner"></span> : (editVehicle ? 'Update Vehicle' : 'Add Vehicle')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hotel / Flight-Style Interactive Calendar Date Picker Modal */}
      {showModal && showDatePicker && (() => {
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
        const today = new Date();
        const todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());
        const currentYear = today.getFullYear();
        const years = [];
        for (let y = currentYear + 1; y >= currentYear - 25; y--) {
          years.push(y);
        }

        const cells = [];
        for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        return (
          <div
            className="modal-overlay"
            style={{ zIndex: 1100 }}
            onClick={(e) => e.target === e.currentTarget && setShowDatePicker(false)}
          >
            <div
              className="modal-content"
              style={{
                maxWidth: '370px',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
              }}
            >
              {/* Top booking-style summary header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9',
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>
                    Vehicle Registration Date
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    {form.registration_date ? formatDisplayDate(form.registration_date) : 'Select a date'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  style={{
                    width: '32px', height: '32px', borderRadius: '50%', border: 'none',
                    background: '#f1f5f9', color: '#475569', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Month & Year Navigation Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => stepCalendarMonth(-1)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    cursor: 'pointer', color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <i className="fas fa-chevron-left" style={{ fontSize: '12px' }}></i>
                </button>

                <button
                  type="button"
                  onClick={() => setShowYearMonthJump(!showYearMonthJump)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '10px', border: 'none',
                    background: '#eff6ff', color: '#1e3a8a', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  }}
                >
                  <span>{MONTH_NAMES[calMonth]} {calYear}</span>
                  <i className={`fas fa-chevron-${showYearMonthJump ? 'up' : 'down'}`} style={{ fontSize: '11px', color: '#2563eb' }}></i>
                </button>

                <button
                  type="button"
                  onClick={() => stepCalendarMonth(1)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    cursor: 'pointer', color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <i className="fas fa-chevron-right" style={{ fontSize: '12px' }}></i>
                </button>
              </div>

              {showYearMonthJump ? (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>Select Month</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {SHORT_MONTHS.map((mName, idx) => {
                      const active = idx === calMonth;
                      return (
                        <button
                          type="button"
                          key={mName}
                          onClick={() => setCalMonth(idx)}
                          style={{
                            padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
                            border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                            background: active ? '#2563eb' : '#f8fafc',
                            color: active ? '#ffffff' : '#334155',
                            fontWeight: active ? 700 : 600, fontSize: '12.5px',
                          }}
                        >
                          {mName}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', marginTop: '14px', marginBottom: '8px' }}>Select Year</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', maxHeight: '160px', overflowY: 'auto', paddingRight: '2px' }}>
                    {years.map((yr) => {
                      const active = yr === calYear;
                      return (
                        <button
                          type="button"
                          key={yr}
                          onClick={() => {
                            setCalYear(yr);
                            setShowYearMonthJump(false);
                          }}
                          style={{
                            padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
                            border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                            background: active ? '#2563eb' : '#ffffff',
                            color: active ? '#ffffff' : '#334155',
                            fontWeight: active ? 700 : 600, fontSize: '12.5px',
                          }}
                        >
                          {yr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* Day headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '6px', textAlign: 'center' }}>
                    {DAY_HEADERS.map((dh) => (
                      <div key={dh} style={{ fontSize: '11.5px', fontWeight: 700, color: '#94a3b8', padding: '4px 0' }}>
                        {dh}
                      </div>
                    ))}
                  </div>

                  {/* 7-column day grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                    {cells.map((day, idx) => {
                      if (day === null) {
                        return <div key={`empty-${idx}`} style={{ height: '38px' }} />;
                      }
                      const cellYMD = toYMD(calYear, calMonth, day);
                      const isSelected = form.registration_date === cellYMD;
                      const isToday = todayYMD === cellYMD;

                      return (
                        <button
                          type="button"
                          key={cellYMD}
                          onClick={() => selectCalendarDay(day)}
                          style={{
                            height: '38px', borderRadius: '10px', cursor: 'pointer',
                            border: isToday && !isSelected ? '1.5px solid #2563eb' : 'none',
                            background: isSelected ? '#2563eb' : (isToday ? '#eff6ff' : 'transparent'),
                            color: isSelected ? '#ffffff' : (isToday ? '#2563eb' : '#1e293b'),
                            fontWeight: isSelected || isToday ? 700 : 600,
                            fontSize: '13.5px',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f1f5f9';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = isToday ? '#eff6ff' : 'transparent';
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Footer buttons */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9',
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, registration_date: '' }));
                    setShowDatePicker(false);
                  }}
                  style={{
                    background: 'none', border: 'none', color: '#64748b',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '6px 10px',
                  }}
                >
                  Clear
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const ymd = toYMD(now.getFullYear(), now.getMonth(), now.getDate());
                      setForm((prev) => ({ ...prev, registration_date: ymd }));
                      setShowDatePicker(false);
                    }}
                    style={{
                      background: '#f1f5f9', border: 'none', borderRadius: '8px',
                      color: '#2563eb', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '7px 13px',
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    style={{
                      background: '#2563eb', border: 'none', borderRadius: '8px',
                      color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: '7px 16px',
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Delete Vehicle</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', color: '#ef4444', marginBottom: '16px' }}><i className="fas fa-exclamation-triangle"></i></div>
              <p style={{ fontSize: '15px', color: '#374151', marginBottom: '8px' }}>
                Are you sure you want to delete <strong>{deleteConfirm.make} {deleteConfirm.model}</strong>?
              </p>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>
                <i className="fas fa-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Full Vehicle Photo Lightbox Modal */}
      {viewingPhoto && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewingPhoto(null)}>
          <div className="modal-content" style={{ maxWidth: '720px', padding: 0, overflow: 'hidden', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header" style={{ background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-car" style={{ color: '#38bdf8' }}></i> {viewingPhoto.title}
                </h3>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{viewingPhoto.plate}</span>
              </div>
              <button className="modal-close" onClick={() => setViewingPhoto(null)} style={{ color: '#ffffff', fontSize: '24px', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0, background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', maxHeight: '75vh' }}>
              <img src={viewingPhoto.url} alt={viewingPhoto.title} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
            </div>
            <div className="modal-footer" style={{ background: '#1e293b', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}><i className="fas fa-camera"></i> Vehicle Photo</span>
              <button className="btn-outline" onClick={() => setViewingPhoto(null)} style={{ color: '#ffffff', borderColor: '#475569' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
