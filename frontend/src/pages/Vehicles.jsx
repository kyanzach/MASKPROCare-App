import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

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

  if (diffDays < 0) return { label: 'Overdue', color: '#dc2626', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)', icon: 'fa-exclamation-circle' };
  if (diffDays <= 30) return { label: `Renew in ${diffDays}d`, color: '#d97706', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.3)', icon: 'fa-clock' };
  if (diffDays <= 90) return { label: `Due ${next.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, color: '#2563eb', bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.2)', icon: 'fa-calendar-check' };
  return { label: `Valid until ${next.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, color: '#059669', bg: 'transparent', border: 'rgba(16,185,129,0.3)', icon: 'fa-check-circle' };
}

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ make: '', model: '', plate_no: '', color: '', registration_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadVehicles(); }, []);

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
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.make || !form.model) { setError('Make and Model are required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editVehicle) {
        await api.post('/vehicles/update', { id: editVehicle.id, ...form });
        setSuccess('Vehicle updated successfully!');
      } else {
        await api.post('/vehicles/create', form);
        setSuccess('Vehicle added successfully!');
      }
      setShowModal(false);
      loadVehicles();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save vehicle');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.post('/vehicles/delete', { id });
      setSuccess('Vehicle deleted successfully!');
      setDeleteConfirm(null);
      loadVehicles();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete vehicle');
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div><p>Loading vehicles...</p></div>;
  }

  return (
    <div>
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
            return (
              <div className="vehicle-card" key={v.id}>
                {/* Photo area placeholder */}
                <div style={{
                  height: '140px', background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '16px 16px 0 0', position: 'relative', overflow: 'hidden',
                }}>
                  <i className="fas fa-car-side" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '8px' }}></i>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, cursor: 'pointer' }}>
                    <i className="fas fa-camera" style={{ marginRight: '4px', fontSize: '10px' }}></i>
                    Snap a photo of your ride
                  </span>
                </div>

                <div className="vehicle-card-body">
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{v.make} {v.model}</h3>
                    <div className="dropdown">
                      <button className="dropdown-btn" onClick={(e) => {
                        document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
                        const menu = e.currentTarget.nextSibling;
                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                      }}>
                        <i className="fas fa-ellipsis-v"></i>
                      </button>
                      <div className="dropdown-menu" style={{ display: 'none' }}>
                        <button className="dropdown-item" onClick={(e) => { e.currentTarget.parentNode.style.display = 'none'; openEdit(v); }}>
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button className="dropdown-item danger" onClick={(e) => { e.currentTarget.parentNode.style.display = 'none'; setDeleteConfirm(v); }}>
                          <i className="fas fa-trash"></i> Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Badge row: plate + color + renewal inline */}
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
                    <input className="form-input" type="date" value={form.registration_date} onChange={e => setForm({...form, registration_date: e.target.value})} />
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
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-gradient" disabled={saving}>
                  {saving ? <span className="spinner"></span> : (editVehicle ? 'Update Vehicle' : 'Add Vehicle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
}
