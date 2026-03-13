import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const APP_VERSION = '1.5.0';

export default function Layout() {
  const { customer, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Notification state
  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = customer?.full_name
    ? customer.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const firstName = customer?.first_name || customer?.full_name?.split(' ')[0] || 'User';

  // Poll notification count every 60s
  const fetchNotifCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/count');
      setNotifCount(res.data.data?.unread_count || 0);
    } catch (err) { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifCount]);

  // Load notifications when dropdown opens
  const toggleNotifDropdown = async () => {
    if (!notifOpen) {
      setNotifOpen(true);
      setNotifLoading(true);
      try {
        const res = await api.get('/notifications/list?limit=10');
        setNotifications(res.data.data?.notifications || []);
      } catch (err) { console.error(err); }
      finally { setNotifLoading(false); }
    } else {
      setNotifOpen(false);
    }
  };

  // Mark all as read
  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark_read', { all: true });
      setNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) { console.error(err); }
  };

  // Mark single as read + navigate
  const handleNotifClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.post('/notifications/mark_read', { id: notif.id });
        setNotifCount(prev => Math.max(0, prev - 1));
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      } catch (err) { /* silent */ }
    }
    setNotifOpen(false);
    if (notif.link) navigate(notif.link);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Time ago helper
  const timeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const NOTIF_ICONS = {
    registration_renewal: { icon: 'fas fa-car', color: '#f59e0b' },
    booking_confirmed: { icon: 'fas fa-calendar-check', color: '#10b981' },
    booking_reminder: { icon: 'fas fa-clock', color: '#3b82f6' },
    system: { icon: 'fas fa-info-circle', color: '#6366f1' },
  };

  const navItems = [
    { path: '/', icon: 'bi-grid', label: 'Dashboard', exact: true },
    { path: '/bookings', icon: 'bi-calendar-check', label: 'My Bookings' },
    { path: '/vehicles', icon: 'bi-car-front', label: 'My Vehicles' },
    { path: '/profile', icon: 'bi-person', label: 'Profile' },
  ];

  // Bell icon component (reused in sidebar + mobile header)
  const BellIcon = ({ style }) => (
    <div ref={notifRef} style={{ position: 'relative', ...style }}>
      <button
        onClick={toggleNotifDropdown}
        style={{
          background: notifOpen ? 'rgba(59,130,246,0.1)' : 'transparent',
          border: 'none', borderRadius: '12px', padding: '10px',
          cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
          color: '#64748b', fontSize: '20px',
        }}
      >
        <i className="bi bi-bell"></i>
        {notifCount > 0 && (
          <span style={{
            position: 'absolute', top: '4px', right: '4px',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: 'white', fontSize: '10px', fontWeight: 700,
            width: notifCount > 9 ? '20px' : '16px', height: '16px',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white', lineHeight: 1,
          }}>
            {notifCount > 99 ? '99+' : notifCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {notifOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, width: '360px',
          background: 'white', borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
          border: '1px solid rgba(59,130,246,0.1)',
          zIndex: 300, overflow: 'hidden', marginTop: '8px',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
              Notifications
            </h4>
            {notifCount > 0 && (
              <button onClick={markAllRead} style={{
                background: 'none', border: 'none', color: '#3b82f6',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {notifLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 8px' }}></div>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <i className="bi bi-bell" style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }}></i>
                <p style={{ margin: 0, fontSize: '14px' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => {
                const nIcon = NOTIF_ICONS[notif.type] || NOTIF_ICONS.system;
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    style={{
                      padding: '14px 20px', cursor: 'pointer',
                      background: notif.is_read ? 'transparent' : 'rgba(59,130,246,0.04)',
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = notif.is_read ? 'transparent' : 'rgba(59,130,246,0.04)'}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: `${nIcon.color}15`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <i className={nIcon.icon} style={{ color: nIcon.color, fontSize: '14px' }}></i>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', fontWeight: notif.is_read ? 500 : 600,
                        color: '#1f2937', marginBottom: '2px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{notif.title}</div>
                      {notif.message && (
                        <div style={{
                          fontSize: '12px', color: '#64748b', lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>{notif.message}</div>
                      )}
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                        {timeAgo(notif.created_at)}
                      </div>
                    </div>
                    {!notif.is_read && (
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#3b82f6', flexShrink: 0, marginTop: '6px',
                      }}></div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-layout">
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <img src="/maskpro_logo.png" alt="MaskPro" className="sidebar-logo-img" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
            <div className="sidebar-brand">
              MASKPRO<span>Care</span>
            </div>
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#fff', background: 'var(--primary-gradient)', padding: '1px 7px', borderRadius: '20px', marginTop: '-2px', letterSpacing: '0.5px' }}>v{APP_VERSION}</span>
          </div>
          {/* Bell in sidebar header */}
          <BellIcon />
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <div className="nav-item" key={item.path}>
              <NavLink
                to={item.path}
                end={item.exact}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <i className={`bi ${item.icon}`}></i>
                <span>{item.label}</span>
              </NavLink>
            </div>
          ))}

          {/* Services Dropdown */}
          <div className="nav-heading">Services</div>
          {['Nano Ceramic Coating', 'Nano Ceramic Tint', 'Paint Protection Film (PPF)', 'Auto Paint & Repair', 'Detailing'].map(s => (
            <div className="nav-item" key={s}>
              <span className="nav-link" style={{ cursor: 'default', opacity: 0.6, fontSize: '13px', paddingLeft: '28px' }}>
                <i className="bi bi-chevron-right" style={{ fontSize: '10px' }}></i>
                <span>{s}</span>
              </span>
            </div>
          ))}

          <div className="nav-heading">Account</div>
          <div className="nav-item">
            <NavLink
              to="/profile"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <i className="bi bi-gear"></i>
              <span>Account Settings</span>
            </NavLink>
          </div>
          <div className="nav-item">
            <button className="nav-link" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right"></i>
              <span>Sign Out</span>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer - User */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{customer?.full_name || 'User'}</div>
              <div className="sidebar-user-role">Customer</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        {/* Mobile Header */}
        <div className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
              <i className="bi bi-list"></i>
            </button>
            <div className="top-header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/maskpro_logo.png" alt="MaskPro" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
              <h1>MASKPRO<span style={{ WebkitTextFillColor: '#06b6d4' }}>Care</span></h1>
            </div>
          </div>
          <div className="top-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Bell in mobile header */}
            <BellIcon />
            <div className="sidebar-avatar" style={{ width: '36px', height: '36px', fontSize: '14px', cursor: 'pointer' }}
                 onClick={() => navigate('/profile')}>
              {initials}
            </div>
          </div>
        </div>

        <Outlet />
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-nav">
        <div className="mobile-nav-items">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
            >
              <i className={`bi ${item.icon}`}></i>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
