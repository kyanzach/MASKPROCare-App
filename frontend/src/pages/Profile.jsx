import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

// ── Loyalty Card category styling ────────────────────────────
const CATEGORY_META = {
  coating: { label: 'Nano Ceramic Coating', icon: 'bi-shield-check', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
  tint:    { label: 'Nano Ceramic Tint',    icon: 'bi-brightness-high', gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' },
  ppf:     { label: 'Paint Protection Film', icon: 'bi-fire', gradient: 'linear-gradient(135deg, #ef4444, #f97316)' },
  wash:    { label: 'Care Wash',             icon: 'bi-stars', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  gift:    { label: 'Gift Card',             icon: 'bi-gift', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
  other:   { label: 'Other',                 icon: 'bi-card-text', gradient: 'linear-gradient(135deg, #64748b, #94a3b8)' },
};
const CATEGORY_ORDER = ['coating', 'tint', 'ppf', 'wash', 'gift', 'other'];

// ── PDF417 Barcode Component ────────────────────────────────
function PDF417Barcode({ text, fullWidth = false }) {
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
          scale: fullWidth ? 2 : 1,
          height: fullWidth ? 12 : 8,
          includetext: false,
        });
      } catch (err) {
        console.error('PDF417 render error:', err);
      }
    });
    return () => { cancelled = true; };
  }, [text, fullWidth]);
  return <canvas ref={canvasRef} style={{ width: fullWidth ? '100%' : 'auto', maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }} />;
}

// ── Category-specific label helpers ──────────────────────────
function getCounterLabel(category) {
  switch (category) {
    case 'coating': return 'Credits Used';
    case 'tint':    return 'Earned Points';
    default:        return 'Visits Used';
  }
}
function getStampLabel(category) {
  switch (category) {
    case 'coating': return 'Maintenance Credits';
    default:        return 'Stamp Progress';
  }
}
function getEmptyLabel(category) {
  switch (category) {
    case 'tint': return 'No points recorded yet';
    default:     return 'No visits recorded yet';
  }
}

export default function Profile() {
  const { customer: authCustomer, logout, updateCustomer } = useAuth();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  // ── Tab state (supports ?tab=loyalty deep-link) ──
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    return tabParam === 'loyalty' ? 'loyalty' : 'profile';
  });

  // ── Profile state ──
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ vehicles: 0, bookings: 0, completed: 0 });

  // ── Loyalty state ──
  const [loyaltyCards, setLoyaltyCards] = useState([]);
  const [loyaltyGrouped, setLoyaltyGrouped] = useState({});
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  // ── Photo upload state ──
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef(null);

  const getPhotoUrl = (filename) => {
    if (!filename) return null;
    const base = import.meta.env.VITE_API_URL || '';
    return `${base}/api/uploads/photos/${filename}`;
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await api.post('/profile/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        const newPhoto = res.data.data.profile_photo;
        setProfile(prev => ({ ...prev, profile_photo: newPhoto }));
        updateCustomer({ profile_photo: newPhoto });
        setSuccess('Profile photo updated!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoUploading(true);
    try {
      await api.delete('/profile/photo');
      setProfile(prev => ({ ...prev, profile_photo: null }));
      updateCustomer({ profile_photo: null });
      setSuccess('Profile photo removed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to remove photo');
    } finally { setPhotoUploading(false); }
  };

  useEffect(() => { loadProfile(); }, []);

  // Load loyalty cards when tab switches to loyalty (lazy load)
  useEffect(() => {
    if (activeTab === 'loyalty' && !loyaltyLoaded) {
      loadLoyaltyCards();
    }
  }, [activeTab]);

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

  const loadLoyaltyCards = async () => {
    setLoyaltyLoading(true);
    try {
      const res = await api.get('/loyalty/cards');
      if (res.data.success) {
        setLoyaltyCards(res.data.data?.cards || []);
        setLoyaltyGrouped(res.data.data?.grouped || {});
      } else {
        setLoyaltyCards([]);
        setLoyaltyGrouped({});
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 401) {
        setLoyaltyCards([]);
        setLoyaltyGrouped({});
      }
      console.error(err);
    } finally {
      setLoyaltyLoading(false);
      setLoyaltyLoaded(true);
    }
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

  // ── Loyalty: helpers ──
  const formatDate = (dateStr) => {
    if (!dateStr) return 'No expiry';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const isExpired = (dateStr) => dateStr ? new Date(dateStr) < new Date() : false;

  // ── Loyalty: render stamps grid ──
  // For coating/PPF: used stamps = greyed out, remaining = colored (blue gradient)
  // For others: filled stamps = colored, remaining = grey
  const renderStamps = (card, catMeta) => {
    const total = card.visitsTotal || card.stampsTotal || 0;
    const used = card.visitsUsed || 0;
    if (total <= 0) return null;
    return (
      <div>
        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, marginBottom: '8px' }}>{getStampLabel(card.category)}</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Array.from({ length: total }, (_, i) => {
            const isUsed = i < used;
            let bg, textColor, shadow, opacity;
            if (card.category === 'coating' || card.category === 'ppf') {
              // Used = greyed out, Remaining = blue gradient
              bg = isUsed ? '#e2e8f0' : catMeta.gradient;
              textColor = isUsed ? '#94a3b8' : 'white';
              shadow = isUsed ? 'none' : '0 2px 6px rgba(0,0,0,0.12)';
              opacity = isUsed ? 0.5 : 1;
            } else {
              bg = isUsed ? catMeta.gradient : '#f1f5f9';
              textColor = isUsed ? 'white' : '#cbd5e1';
              shadow = isUsed ? '0 2px 6px rgba(0,0,0,0.12)' : 'none';
              opacity = 1;
            }
            return (
              <div key={i} style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', color: textColor,
                boxShadow: shadow, opacity,
                transition: 'transform 0.2s',
              }}>
                <i className={`bi ${catMeta.icon}`} style={{ fontSize: '16px' }}></i>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Loyalty: render a single card ──
  const renderLoyaltyCard = (card) => {
    const expired = isExpired(card.expiresAt);
    const catMeta = CATEGORY_META[card.category] || CATEGORY_META.other;
    return (
      <div key={card.id} style={{
        background: 'white', borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
        border: expired ? '2px solid #fca5a5' : '1px solid rgba(59,130,246,0.08)',
        opacity: expired ? 0.7 : 1, transition: 'all 0.3s ease',
        cursor: 'pointer',
      }} onClick={() => setSelectedCard(card)}>
        {/* Card Header */}
        <div style={{ background: catMeta.gradient, padding: '20px 24px 16px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{card.service}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{card.tier}</div>
            </div>
            <div style={{ fontSize: '28px', background: 'rgba(255,255,255,0.15)', borderRadius: '14px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{card.icon}</div>
          </div>
          {card.expiresAt && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: expired ? '#fca5a5' : 'rgba(255,255,255,0.7)', fontWeight: 500, position: 'relative', zIndex: 1 }}>
              <i className="bi bi-clock" style={{ marginRight: '4px' }}></i>
              {expired ? 'Expired' : 'Expires'} {formatDate(card.expiresAt)}
            </div>
          )}
        </div>
        {/* Card Body */}
        <div style={{ padding: '20px 24px 24px' }}>
          {/* Counter — category-specific label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{getCounterLabel(card.category)}</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b', lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                {card.visitsUsed}
                {card.visitsTotal > 0 && (
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8' }}>
                    {' '}out of {card.visitsTotal}
                  </span>
                )}
              </div>
            </div>
            {card.rewardsUnused > 0 && (
              <div style={{ background: 'linear-gradient(135deg, #10b981, #34d399)', color: 'white', padding: '6px 14px', borderRadius: '30px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="bi bi-gift"></i> {card.rewardsUnused} Reward{card.rewardsUnused > 1 ? 's' : ''}
              </div>
            )}
          </div>
          {/* Stamp grid — show ALL stamps */}
          {card.visitsTotal > 0 && renderStamps(card, catMeta)}
          {/* Empty state — category-specific label */}
          {card.visitsUsed === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', color: '#94a3b8', fontSize: '13px' }}>
              <i className="bi bi-ticket-perforated" style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }}></i>
              {getEmptyLabel(card.category)}
            </div>
          )}
          {/* Footer: Vehicle left, Branch right */}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            {(card.vehicle || card.branch) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                {card.vehicle && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="bi bi-car-front" style={{ color: '#94a3b8' }}></i> {card.vehicle}
                  </span>
                )}
                {card.branch && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                    <i className="bi bi-geo-alt" style={{ color: '#94a3b8' }}></i> {card.branch}
                  </span>
                )}
              </div>
            )}
            {/* Full-width barcode + centered card ID */}
            <div style={{ textAlign: 'center' }}>
              <PDF417Barcode text={String(card.id)} fullWidth />
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '6px' }}>Card #{card.id}</div>
            </div>
            {/* Tap hint */}
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: '#cbd5e1' }}>
              <i className="bi bi-hand-index" style={{ marginRight: '4px' }}></i> Tap to view card details
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Card Detail Modal (Back of Card) ──
  const renderCardDetailModal = () => {
    if (!selectedCard) return null;
    const card = selectedCard;
    const catMeta = CATEGORY_META[card.category] || CATEGORY_META.other;
    return (
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px',
        }}
        onClick={() => setSelectedCard(null)}
      >
        <div
          style={{
            background: 'white', borderRadius: '24px', maxWidth: '480px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            animation: 'modalSlideUp 0.3s ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div style={{ background: catMeta.gradient, padding: '24px 28px 20px', borderRadius: '24px 24px 0 0', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '140px', height: '140px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <button
              onClick={() => setSelectedCard(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', zIndex: 2 }}
            >
              <i className="bi bi-x-lg"></i>
            </button>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Warranty, Maintenance & Rewards Card</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>{card.service} — {card.tier}</div>
              {card.branch && (
                <div style={{ marginTop: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                  <i className="bi bi-geo-alt-fill" style={{ marginRight: '4px' }}></i>
                  MaskPro {card.branch} Branch
                </div>
              )}
            </div>
          </div>

          {/* Big Barcode */}
          <div style={{ padding: '24px 28px 16px', borderBottom: '1px dashed #e2e8f0' }}>
            <PDF417Barcode text={String(card.id)} fullWidth />
          </div>

          {/* Card Details */}
          <div style={{ padding: '20px 28px' }}>
            {/* Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              {card.customerName && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Customer</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{card.customerName}</div>
                </div>
              )}
              {card.vehicle && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Vehicle</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{card.vehicle}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{getCounterLabel(card.category)}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{card.visitsUsed}{card.visitsTotal > 0 ? ` out of ${card.visitsTotal}` : ''}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Expiry</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: card.expiresAt && isExpired(card.expiresAt) ? '#ef4444' : '#1e293b' }}>{formatDate(card.expiresAt)}</div>
              </div>
            </div>

            {/* Terms of Use */}
            <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>Terms of Use</div>
              <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: '#64748b', lineHeight: 1.7 }}>
                <li>This card contains free maintenance stamps/visits that comes with your package. One stamp can be claimed every six months until your warranty ends.</li>
                <li>Earn (25) points every time you redeem a stamp/visit. Once your points reach (100), you qualify for an extra free (1) stamp/visit.</li>
                <li>Cards, stamps/visits, and points cannot be traded, returned, replaced, or converted into cash.</li>
                <li>Each card is issued for a specific customer and their vehicle and cannot be transferred or combined with other cards.</li>
                <li>MaskPro holds the right to deny services if deemed necessary.</li>
              </ol>
            </div>

            {/* QR Code + Install Link */}
            {(card.qrLink || card.installLink || card.shortLink) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '14px' }}>
                {card.qrLink && (
                  <img src={card.qrLink} alt="QR Code" style={{ width: '80px', height: '80px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>To install wallet</div>
                  {card.installLink && (
                    <a href={card.installLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#3b82f6', wordBreak: 'break-all', textDecoration: 'none' }}>
                      {card.installLink}
                    </a>
                  )}
                  {card.shortLink && (
                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>or visit: </span>
                      <a href={card.shortLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none' }}>
                        {card.shortLink}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* VIP Footer */}
          <div style={{
            background: '#f1f5f9', borderRadius: '0 0 24px 24px',
            padding: '16px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="bi bi-broadcast" style={{ fontSize: '20px', color: '#3b82f6' }}></i>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>VIP ID No.</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>{card.id}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
              <div>(+63) 1800-155-000-37</div>
              <div>Technical Support</div>
            </div>
          </div>
        </div>

        {/* Modal animation */}
        <style>{`
          @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  };

  // ── Tab styles ──
  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: isActive ? '#3b82f6' : '#64748b',
    background: isActive ? 'white' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '3px solid #3b82f6' : '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: '12px 12px 0 0',
    fontFamily: 'inherit',
  });

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <span>Profile</span>
      </div>

      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <i className="fas fa-user-circle" style={{ color: '#3b82f6' }}></i>
        My Profile
      </h1>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        borderRadius: '14px 14px 0 0',
        padding: '4px 4px 0',
      }}>
        <button style={tabStyle(activeTab === 'profile')} onClick={() => setActiveTab('profile')}>
          <i className="bi bi-person-circle"></i>
          Profile
        </button>
        <button style={tabStyle(activeTab === 'loyalty')} onClick={() => setActiveTab('loyalty')}>
          <i className="bi bi-ticket-perforated"></i>
          Loyalty Cards
          {loyaltyLoaded && loyaltyCards.length > 0 && (
            <span style={{
              background: '#3b82f6', color: 'white', fontSize: '11px', fontWeight: 700,
              padding: '1px 8px', borderRadius: '20px', lineHeight: '18px',
            }}>{loyaltyCards.length}</span>
          )}
        </button>
      </div>

      {/* Alerts */}
      {success && <div className="login-alert login-alert-success" style={{ marginBottom: '20px' }}><i className="fas fa-check-circle"></i> {success}</div>}
      {error && <div className="login-alert login-alert-error" style={{ marginBottom: '20px' }}><i className="fas fa-exclamation-circle"></i> {error}</div>}

      {/* ═══════════ TAB 1: PROFILE ═══════════ */}
      {activeTab === 'profile' && (
        <div className="profile-grid">
          {/* Left Column */}
          <div>
            {/* Avatar Card */}
            <div className="card-modern" style={{ marginBottom: '20px' }}>
              <div className="card-modern-body" style={{ textAlign: 'center' }}>
                {/* Hidden file input */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUpload}
                />
                {/* Clickable avatar */}
                <div
                  style={{ position: 'relative', display: 'inline-block', cursor: 'pointer', marginBottom: '4px' }}
                  onClick={() => !photoUploading && photoInputRef.current?.click()}
                >
                  {profile?.profile_photo ? (
                    <img
                      src={getPhotoUrl(profile.profile_photo)}
                      alt="Profile"
                      style={{
                        width: '90px', height: '90px', borderRadius: '50%',
                        objectFit: 'cover', border: '3px solid #e2e8f0',
                      }}
                    />
                  ) : (
                    <div className="profile-avatar-lg">{initials}</div>
                  )}
                  {/* Camera overlay */}
                  <div style={{
                    position: 'absolute', bottom: '0', right: '0',
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid white', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  }}>
                    {photoUploading ? (
                      <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>
                    ) : (
                      <i className="bi bi-camera-fill" style={{ color: 'white', fontSize: '12px' }}></i>
                    )}
                  </div>
                </div>
                {profile?.profile_photo && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePhotoRemove(); }}
                    style={{
                      background: 'none', border: 'none', color: '#ef4444',
                      fontSize: '11px', cursor: 'pointer', marginBottom: '8px',
                      fontFamily: 'inherit',
                    }}
                  >
                    <i className="bi bi-trash" style={{ marginRight: '4px' }}></i>Remove photo
                  </button>
                )}
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
      )}

      {/* ═══════════ TAB 2: LOYALTY CARDS ═══════════ */}
      {activeTab === 'loyalty' && (
        <div>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
              Track your stamps, visits, and rewards across MaskPro services
            </p>
            <button
              onClick={loadLoyaltyCards}
              disabled={loyaltyLoading}
              style={{
                background: 'white', border: '1px solid #e2e8f0',
                borderRadius: '12px', padding: '8px 16px',
                fontSize: '13px', fontWeight: 600, color: '#3b82f6',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.2s', fontFamily: 'inherit',
              }}
            >
              <i className={`bi bi-arrow-clockwise ${loyaltyLoading ? 'spin' : ''}`}></i>
              Refresh
            </button>
          </div>

          {/* Loading */}
          {loyaltyLoading && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}></div>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading your loyalty cards...</p>
            </div>
          )}

          {/* Empty State */}
          {!loyaltyLoading && loyaltyCards.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              background: 'white', borderRadius: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}>
              <i className="bi bi-ticket-perforated" style={{ fontSize: '56px', color: '#cbd5e1', display: 'block', marginBottom: '16px' }}></i>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                No loyalty cards yet
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', maxWidth: '400px', marginInline: 'auto', lineHeight: 1.6 }}>
                You don't have any loyalty cards at the moment.
                Visit your nearest MaskPro branch and avail of our services to get one! 🎉
              </p>
            </div>
          )}

          {/* Cards grouped by category */}
          {!loyaltyLoading && loyaltyCards.length > 0 && (
            <div>
              {CATEGORY_ORDER.map(category => {
                const catCards = loyaltyGrouped[category];
                if (!catCards || catCards.length === 0) return null;
                const meta = CATEGORY_META[category] || CATEGORY_META.other;
                return (
                  <div key={category} style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: meta.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className={`bi ${meta.icon}`} style={{ color: 'white', fontSize: '14px' }}></i>
                      </div>
                      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{meta.label}</h2>
                      <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px' }}>{catCards.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                      {catCards.map(renderLoyaltyCard)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Spin animation */}
          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .spin { animation: spin 1s linear infinite; }
          `}</style>
        </div>
      )}

      {/* Card Detail Modal */}
      {renderCardDetailModal()}
    </div>
  );
}
