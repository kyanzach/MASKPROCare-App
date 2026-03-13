/**
 * Loyalty Cards Page
 * Displays customer's BoomerangMe loyalty card stamps / visit progress
 */

import { useState, useEffect } from 'react';
import api from '../api/client';

// Category display config
const CATEGORY_META = {
  coating: { label: 'Nano Ceramic Coating', icon: 'bi-shield-check', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
  tint:    { label: 'Nano Ceramic Tint',    icon: 'bi-brightness-high', gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' },
  ppf:     { label: 'Paint Protection Film', icon: 'bi-fire', gradient: 'linear-gradient(135deg, #ef4444, #f97316)' },
  wash:    { label: 'Care Wash',             icon: 'bi-stars', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  gift:    { label: 'Gift Card',             icon: 'bi-gift', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
  other:   { label: 'Other',                 icon: 'bi-card-text', gradient: 'linear-gradient(135deg, #64748b, #94a3b8)' },
};

export default function Loyalty() {
  const [cards, setCards] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/loyalty/cards');
      if (res.data.success) {
        setCards(res.data.data?.cards || []);
        setGrouped(res.data.data?.grouped || {});
      } else {
        // No cards is not an error — just show empty state
        setCards([]);
        setGrouped({});
      }
    } catch (err) {
      // 404 or 401 = no cards for this user, show empty state
      const status = err.response?.status;
      if (status === 404 || status === 401) {
        setCards([]);
        setGrouped({});
      } else {
        setError('Something went wrong. Please try again later.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No expiry';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isExpired = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  // Render a single loyalty card
  const renderCard = (card) => {
    const expired = isExpired(card.expiresAt);
    const catMeta = CATEGORY_META[card.category] || CATEGORY_META.other;

    return (
      <div
        key={card.id}
        style={{
          background: 'white',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
          border: expired ? '2px solid #fca5a5' : '1px solid rgba(59,130,246,0.08)',
          opacity: expired ? 0.7 : 1,
          transition: 'all 0.3s ease',
        }}
      >
        {/* Card Header with gradient */}
        <div style={{
          background: catMeta.gradient,
          padding: '20px 24px 16px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background pattern */}
          <div style={{
            position: 'absolute', top: '-20px', right: '-20px',
            width: '120px', height: '120px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-30px', left: '40%',
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                {card.service}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
                {card.tier}
              </div>
            </div>
            <div style={{
              fontSize: '28px', background: 'rgba(255,255,255,0.15)',
              borderRadius: '14px', width: '48px', height: '48px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {card.icon}
            </div>
          </div>

          {/* Expiry */}
          {card.expiresAt && (
            <div style={{
              marginTop: '12px', fontSize: '11px', color: expired ? '#fca5a5' : 'rgba(255,255,255,0.7)',
              fontWeight: 500, position: 'relative', zIndex: 1,
            }}>
              <i className="bi bi-clock" style={{ marginRight: '4px' }}></i>
              {expired ? 'Expired' : 'Expires'} {formatDate(card.expiresAt)}
            </div>
          )}
        </div>

        {/* Card Body — Visit / Stamp Progress */}
        <div style={{ padding: '20px 24px 24px' }}>
          {/* Visit counter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                Visits Used
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                {card.visitsUsed}
              </div>
            </div>
            {card.rewardsUnused > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #10b981, #34d399)',
                color: 'white', padding: '6px 14px', borderRadius: '30px',
                fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <i className="bi bi-gift"></i>
                {card.rewardsUnused} Reward{card.rewardsUnused > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Stamp Row — visual stamp indicator */}
          {card.visitsUsed > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, marginBottom: '8px' }}>
                Stamp Progress
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Array.from({ length: Math.min(card.visitsUsed, 20) }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: catMeta.gradient,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', color: 'white',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <i className={`bi ${catMeta.icon}`} style={{ fontSize: '16px' }}></i>
                  </div>
                ))}
                {card.visitsUsed > 20 && (
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, color: '#64748b',
                  }}>
                    +{card.visitsUsed - 20}
                  </div>
                )}
              </div>
            </div>
          )}

          {card.visitsUsed === 0 && (
            <div style={{
              textAlign: 'center', padding: '16px',
              background: '#f8fafc', borderRadius: '12px',
              color: '#94a3b8', fontSize: '13px',
            }}>
              <i className="bi bi-ticket-perforated" style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }}></i>
              No visits recorded yet
            </div>
          )}

          {/* Vehicle info if available */}
          {card.vehicle && (
            <div style={{
              marginTop: '16px', paddingTop: '12px',
              borderTop: '1px solid #f1f5f9',
              fontSize: '12px', color: '#64748b',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="bi bi-car-front" style={{ color: '#94a3b8' }}></i>
              {card.vehicle}
            </div>
          )}

          {/* Branch info if available */}
          {card.branch && (
            <div style={{
              marginTop: card.vehicle ? '4px' : '16px',
              paddingTop: card.vehicle ? '0' : '12px',
              borderTop: card.vehicle ? 'none' : '1px solid #f1f5f9',
              fontSize: '12px', color: '#64748b',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <i className="bi bi-geo-alt" style={{ color: '#94a3b8' }}></i>
              {card.branch}
            </div>
          )}

          {/* Card ID */}
          <div style={{
            marginTop: '12px', fontSize: '11px', color: '#cbd5e1',
            fontFamily: 'monospace',
          }}>
            Card #{card.id}
          </div>
        </div>
      </div>
    );
  };

  // Category order for display
  const categoryOrder = ['coating', 'tint', 'ppf', 'wash', 'gift', 'other'];

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
        <a href="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>Home</a>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Loyalty Cards</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: '28px', fontWeight: 800, color: '#1e293b',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <i className="bi bi-ticket-perforated" style={{ color: '#3b82f6' }}></i>
            My Loyalty Cards
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#94a3b8' }}>
            Track your stamps, visits, and rewards across MaskPro services
          </p>
        </div>
        <button
          onClick={loadCards}
          disabled={loading}
          style={{
            background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '12px', padding: '10px 20px',
            fontSize: '13px', fontWeight: 600, color: '#3b82f6',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: '12px', padding: '14px 20px',
          color: '#dc2626', fontSize: '14px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <i className="bi bi-exclamation-triangle"></i>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading your loyalty cards...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && cards.length === 0 && (
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
      {!loading && cards.length > 0 && (
        <div>
          {categoryOrder.map(category => {
            const catCards = grouped[category];
            if (!catCards || catCards.length === 0) return null;
            const meta = CATEGORY_META[category] || CATEGORY_META.other;

            return (
              <div key={category} style={{ marginBottom: '32px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: meta.gradient,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`bi ${meta.icon}`} style={{ color: 'white', fontSize: '14px' }}></i>
                  </div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                    {meta.label}
                  </h2>
                  <span style={{
                    background: '#f1f5f9', color: '#64748b', fontSize: '12px',
                    fontWeight: 600, padding: '2px 10px', borderRadius: '20px',
                  }}>
                    {catCards.length}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                  gap: '20px',
                }}>
                  {catCards.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Spin animation for refresh icon */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
