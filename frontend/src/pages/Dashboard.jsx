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
  const [loading, setLoading] = useState(true);

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
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
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

  const firstName = customer?.full_name?.split(' ')[0] || customer?.first_name || 'there';
  const upcomingBookings = bookings.filter(b => b.status === 'Scheduled' || new Date(b.booking_date) >= new Date());
  const recentBookings = bookings.slice(0, 5);

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
              <div className="stats-card-value">{stats?.stats?.pending_requests ?? 0}</div>
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
    </div>
  );
}
