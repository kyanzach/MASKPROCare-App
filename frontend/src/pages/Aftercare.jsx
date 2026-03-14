/**
 * Aftercare Page — Full blog-style aftercare content with tabbed topics
 * 
 * If user has bookings for the service → shows tips with tabbed topics
 * If user has NO bookings → shows 5% discount CTA → gaq.maskpro.ph
 * 
 * Booking detection uses bookings_service_types.service_name (via /api/bookings/list)
 */
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { AFTERCARE_DATA } from './aftercareData';

export default function Aftercare() {
  const { slug } = useParams();
  const [hasBooking, setHasBooking] = useState(null); // null = loading
  const [activeTopic, setActiveTopic] = useState(0);

  const data = AFTERCARE_DATA[slug];

  // Check if user has bookings for this service category
  useEffect(() => {
    if (!data) return;
    setHasBooking(null);
    setActiveTopic(0);

    (async () => {
      try {
        const res = await api.get('/bookings/list');
        if (res.data.success) {
          const allBookings = [
            ...(res.data.data.bookings || []),
            ...(res.data.data.requests || []),
          ];
          // Check if any booking's service matches this aftercare category
          const found = allBookings.some(b => {
            const svc = (b.latest_service || b.service_names || '').toLowerCase();
            return data.serviceKeywords.some(kw => svc.includes(kw.toLowerCase()));
          });
          setHasBooking(found);
        } else {
          setHasBooking(false);
        }
      } catch {
        setHasBooking(false);
      }
    })();
  }, [slug, data]);

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: '48px', color: '#f59e0b' }}></i>
        <h2 style={{ margin: '16px 0 8px', color: '#1e293b' }}>Service Not Found</h2>
        <p style={{ color: '#94a3b8' }}>This aftercare guide doesn't exist.</p>
        <Link to="/" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>← Back to Dashboard</Link>
      </div>
    );
  }

  const topic = data.topics[activeTopic];

  // Loading state
  if (hasBooking === null) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ background: data.gradient, borderRadius: '20px', padding: '36px 32px', color: 'white', marginBottom: '24px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>{data.icon}</div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800 }}>{data.title}</h1>
          <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: '14px' }}>{data.subtitle}</p>
        </div>
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
        <Link to="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>Home</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Aftercare</span>
        <span style={{ margin: '0 8px' }}>/</span>
        <span style={{ color: '#64748b' }}>{data.title}</span>
      </div>

      {/* Hero Banner */}
      <div style={{
        background: data.gradient, borderRadius: '20px', padding: '36px 32px',
        color: 'white', marginBottom: '24px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: '-20px', top: '-20px', width: '150px', height: '150px',
          borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
        }}></div>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>{data.icon}</div>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800 }}>{data.title}</h1>
        <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: '14px' }}>{data.subtitle}</p>
      </div>

      {/* ═══ Empty State — No Bookings CTA ═══ */}
      {!hasBooking && (
        <div style={{
          background: 'white', borderRadius: '24px', padding: '48px 32px',
          textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
          border: '1px solid rgba(59,130,246,0.06)',
        }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>{data.icon}</div>
          <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#1e293b' }}>
            You haven't tried {data.title} yet!
          </h2>
          <p style={{ margin: '0 0 28px', color: '#94a3b8', fontSize: '15px', lineHeight: 1.7, maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
            Discover why thousands of car owners trust MaskPro for their {data.title.toLowerCase()} needs.
            Get a quote now and enjoy an exclusive discount!
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#78350f',
            borderRadius: '16px', padding: '16px 32px', fontWeight: 800, fontSize: '28px',
            marginBottom: '8px',
          }}>
            5% OFF
          </div>
          <p style={{ margin: '0 0 24px', color: '#94a3b8', fontSize: '13px' }}>
            Exclusive for MaskPro Care app users
          </p>
          <a
            href="https://gaq.maskpro.ph"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white',
              borderRadius: '14px', padding: '14px 32px', fontSize: '16px',
              fontWeight: 700, textDecoration: 'none', transition: 'transform 0.2s',
            }}
          >
            <i className="bi bi-chat-dots-fill"></i>
            Get a Quote Now →
          </a>
        </div>
      )}

      {/* ═══ Aftercare Content — Has Bookings ═══ */}
      {hasBooking && (
        <>
          {/* Topic Tabs */}
          <div style={{
            display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px',
            marginBottom: '24px', WebkitOverflowScrolling: 'touch',
          }}>
            {data.topics.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setActiveTopic(i)}
                style={{
                  flex: '0 0 auto', padding: '10px 18px', borderRadius: '12px',
                  border: activeTopic === i ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  background: activeTopic === i ? '#eff6ff' : 'white',
                  color: activeTopic === i ? '#2563eb' : '#64748b',
                  fontSize: '13px', fontWeight: activeTopic === i ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Active Topic Content */}
          <div style={{
            background: 'white', borderRadius: '20px', overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            border: '1px solid rgba(59,130,246,0.06)',
          }}>
            {/* Topic Header */}
            <div style={{
              padding: '28px 32px', borderBottom: '1px solid #f1f5f9',
              background: 'linear-gradient(135deg, #f8fafc, #eff6ff)',
            }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{topic.icon}</div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1e293b', lineHeight: 1.4 }}>
                {topic.title}
              </h2>
            </div>

            {/* Sections */}
            <div style={{ padding: '8px 0' }}>
              {topic.sections.map((section, i) => (
                <div key={i} style={{
                  padding: '24px 32px', borderBottom: i < topic.sections.length - 1 ? '1px solid #f8fafc' : 'none',
                }}>
                  <h3 style={{
                    margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1e293b',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '24px', height: '24px', borderRadius: '8px',
                      background: '#eff6ff', color: '#3b82f6', fontSize: '12px', fontWeight: 800,
                      flex: '0 0 auto', marginTop: '1px',
                    }}>
                      {i + 1}
                    </span>
                    {section.heading}
                  </h3>
                  <p style={{
                    margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.8,
                    paddingLeft: '34px',
                  }}>
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Topic Navigation */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '12px',
          }}>
            <button
              onClick={() => setActiveTopic(Math.max(0, activeTopic - 1))}
              disabled={activeTopic === 0}
              style={{
                padding: '10px 20px', borderRadius: '12px', border: '1px solid #e2e8f0',
                background: 'white', color: activeTopic === 0 ? '#cbd5e1' : '#3b82f6',
                fontWeight: 600, fontSize: '13px', cursor: activeTopic === 0 ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← Previous
            </button>
            <span style={{ padding: '10px', fontSize: '13px', color: '#94a3b8', alignSelf: 'center' }}>
              {activeTopic + 1} of {data.topics.length}
            </span>
            <button
              onClick={() => setActiveTopic(Math.min(data.topics.length - 1, activeTopic + 1))}
              disabled={activeTopic === data.topics.length - 1}
              style={{
                padding: '10px 20px', borderRadius: '12px', border: '1px solid #e2e8f0',
                background: 'white',
                color: activeTopic === data.topics.length - 1 ? '#cbd5e1' : '#3b82f6',
                fontWeight: 600, fontSize: '13px',
                cursor: activeTopic === data.topics.length - 1 ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
