/**
 * Aftercare Page — Service-specific aftercare tips scraped from maskpro.ph blog
 * Shows tips if user has bookings for the service, or a 5% discount CTA to GAQ if not.
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';

// ── Aftercare content per service (curated from maskpro.ph/blog) ──
const AFTERCARE_DATA = {
  coating: {
    title: 'Nano Ceramic Coating',
    subtitle: 'Post-Service Care Guide',
    icon: '🛡️',
    gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    serviceCodes: ['MNCC'],
    blogUrl: 'https://maskpro.ph/7-days-period-after-nano-ceramic-coating/',
    sections: [
      {
        title: '🕐 First 7 Days — Critical Curing Period',
        tips: [
          'Keep the surface of your vehicle dry for the first 24–72 hours to avoid water spots.',
          'Avoid unnecessary car wash or water exposure for the first 7 days.',
          'If you must clean, gently wipe with a soft cloth — no harsh chemicals or soap.',
          'Never use an automated drive-through car wash — it can damage the coating layers.',
          'If exposed to rain, immediately wipe with a microfiber cloth. Don\'t let rain dry on its own.',
        ],
      },
      {
        title: '🧽 After 7 Days — Maintenance',
        tips: [
          'Always wash your car manually — use the one-bucket or two-bucket wash method.',
          'Use a pH-neutral car shampoo (no harsh chemicals).',
          'Maintain a regular wash schedule — once every 1–2 weeks or when dirt builds up.',
          'Use clean microfiber towels and a soft wash mitt only.',
          'Avoid waxing over the ceramic coat — it\'s not needed and can reduce hydrophobicity.',
        ],
      },
      {
        title: '🌳 Dealing with Contaminants',
        tips: [
          'Tree sap: Use isopropyl alcohol (IPA) diluted solution on a microfiber cloth. Don\'t scrub hard.',
          'Bird droppings: Remove as soon as possible — the acid can etch through the coating if left.',
          'Bug splatter: Soak with warm soapy water for a few minutes before gently wiping.',
          'Avoid parking under trees for extended periods.',
        ],
      },
      {
        title: '⚡ Important Don\'ts',
        tips: [
          'Never use automated car washes — the brushes can damage the coating.',
          'Don\'t apply harsh chemicals, acid-based cleaners, or abrasive compounds.',
          'Avoid parking in direct harsh sunlight for extended periods during the first week.',
          'Don\'t use regular household cleaning products on your car.',
        ],
      },
    ],
  },
  tint: {
    title: 'Nano Ceramic Tint',
    subtitle: 'Window Film Aftercare',
    icon: '🪟',
    gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
    serviceCodes: ['MCT'],
    blogUrl: 'https://maskpro.ph/aftercare-for-nano-ceramic-tint/',
    sections: [
      {
        title: '🕐 After Installation — First 3–4 Days',
        tips: [
          'Do NOT roll your windows up and down for 3–4 days after installation.',
          'This allows the tint to properly dry and bond to the glass.',
          'Rolling windows too early can pull the film loose, requiring reinstallation.',
        ],
      },
      {
        title: '🔍 What to Expect (Curing Process)',
        tips: [
          'Newly installed film may appear foggy — this is completely normal.',
          'The foggy look will disappear after the curing process (about 1 month).',
          'You may also see small bubbles — these should disappear within a month.',
          'Don\'t try to "fix" the fog or bubbles — leave the car under the sun to speed up curing.',
          'Hot weather = faster curing. Cold weather = slower curing.',
          'If bubbles persist after 1 month, bring the car back for a checkup.',
        ],
      },
      {
        title: '🧹 Cleaning Your Tinted Windows',
        tips: [
          'Always clean tinted windows last (after washing the body of the car).',
          'Use a clean rubber squeegee and clean microfiber towels.',
          'Use warm water with soap, or an ammonia-free cleaning solution made for window films.',
          'NEVER use products containing ammonia — it damages the tint.',
          'Immediately dry the window completely after cleaning.',
          'Never use sharp or hard objects to remove grime — they will scratch/damage the tint.',
        ],
      },
    ],
  },
  ppf: {
    title: 'Paint Protection Film',
    subtitle: 'PPF Maintenance Guide',
    icon: '🔥',
    gradient: 'linear-gradient(135deg, #ef4444, #f97316)',
    serviceCodes: ['PPF'],
    blogUrl: 'https://maskpro.ph/blog',
    sections: [
      {
        title: '🕐 First 48 Hours',
        tips: [
          'Do not wax or apply any products on the PPF for the first 48 hours.',
          'Avoid washing the vehicle for at least 48 hours after installation.',
          'Keep the vehicle dry and avoid exposure to rain if possible.',
        ],
      },
      {
        title: '🧽 Regular Maintenance',
        tips: [
          'Hand-wash only — avoid pressure washers directly on the film edges.',
          'Use a pH-neutral car shampoo and soft microfiber wash mitt.',
          'For stubborn stains, use a dedicated PPF cleaner or isopropyl alcohol.',
          'Inspect the film regularly for lifting, especially at edges and corners.',
          'PPF is self-healing — minor scratches will disappear with warm water or sunlight.',
        ],
      },
      {
        title: '⚡ Important Don\'ts',
        tips: [
          'Don\'t use abrasive polishing compounds on the PPF.',
          'Avoid automatic car washes with spinning brushes.',
          'Don\'t apply ceramic coating on top of PPF unless it\'s specifically designed for it.',
          'Don\'t let bird droppings, tree sap, or bug splatter sit on PPF for extended periods.',
        ],
      },
    ],
  },
  'paint-repair': {
    title: 'Auto Paint & Repair',
    subtitle: 'Post-Paint Care',
    icon: '🎨',
    gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    serviceCodes: ['MAP'],
    blogUrl: 'https://maskpro.ph/maskpro-car-paint-repair/',
    sections: [
      {
        title: '🕐 First 24–48 Hours',
        tips: [
          'Avoid direct sunlight exposure for the first 24 hours after paint job.',
          'Do not wash the vehicle for at least 48 hours.',
          'Keep the car parked in a shaded, dust-free area if possible.',
        ],
      },
      {
        title: '🧽 First 30 Days',
        tips: [
          'Hand-wash only with a mild car shampoo.',
          'Avoid waxing or polishing for 30 days — the paint needs time to fully cure.',
          'Don\'t use automatic car washes during this period.',
          'Avoid parking under trees (tree sap and bird droppings can damage fresh paint).',
        ],
      },
      {
        title: '🛡️ Long-Term Care',
        tips: [
          'Apply a quality wax or sealant after the 30-day curing period.',
          'Consider adding a ceramic coating for long-lasting protection.',
          'Regular washing every 1–2 weeks helps maintain the finish.',
          'Touch up any stone chips promptly to prevent rust.',
        ],
      },
    ],
  },
  detailing: {
    title: 'Detailing',
    subtitle: 'Post-Detail Maintenance',
    icon: '✨',
    gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    serviceCodes: [],
    blogUrl: 'https://maskpro.ph/blog',
    sections: [
      {
        title: '🧽 Maintaining Your Detail',
        tips: [
          'Use pH-neutral car shampoo for regular washes.',
          'Always use clean microfiber towels — never rags or old t-shirts.',
          'Wash the car in the shade, never in direct sunlight.',
          'Use the two-bucket wash method to avoid swirl marks.',
          'Dry with a quality drying towel or air blower — never let it air-dry.',
        ],
      },
      {
        title: '🚗 Interior Care',
        tips: [
          'Vacuum the interior regularly to prevent dirt buildup.',
          'Use UV-protectant on the dashboard and leather surfaces.',
          'Clean leather seats with a leather-specific cleaner and conditioner.',
          'Keep windows clean on the inside with an ammonia-free glass cleaner.',
        ],
      },
      {
        title: '📅 Recommended Schedule',
        tips: [
          'Exterior wash: every 1–2 weeks.',
          'Interior vacuum: every 2 weeks.',
          'Full detail: every 3–6 months for best results.',
          'Wax/sealant: reapply every 2–3 months.',
        ],
      },
    ],
  },
};

export default function Aftercare() {
  const { slug } = useParams();
  const [hasBookings, setHasBookings] = useState(null); // null = loading
  const [loading, setLoading] = useState(true);

  const data = AFTERCARE_DATA[slug];

  useEffect(() => {
    if (!data) { setLoading(false); return; }
    checkBookings();
  }, [slug]);

  const checkBookings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/bookings/list');
      if (res.data.success) {
        const bookings = res.data.data?.bookings || res.data.data || [];
        const codes = data.serviceCodes;
        // If no service codes to match (e.g. detailing), show content always
        if (codes.length === 0) {
          setHasBookings(true);
        } else {
          const match = bookings.some(b =>
            codes.some(c => (b.latest_service || '').toUpperCase().includes(c))
          );
          setHasBookings(match);
        }
      } else {
        setHasBookings(false);
      }
    } catch {
      setHasBookings(false);
    } finally {
      setLoading(false);
    }
  };

  // 404 — unknown slug
  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <i className="bi bi-question-circle" style={{ fontSize: '64px', color: '#cbd5e1' }}></i>
        <h2 style={{ color: '#1e293b', margin: '16px 0 8px', fontWeight: 700 }}>Page not found</h2>
        <p style={{ color: '#94a3b8' }}>This aftercare guide doesn't exist.</p>
        <Link to="/" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>← Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>
        <Link to="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>Home</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Aftercare</span>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>{data.title}</span>
      </div>

      {/* Header */}
      <div style={{
        background: data.gradient, borderRadius: '24px', padding: '32px',
        marginBottom: '28px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '30%', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>{data.icon}</div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{data.title}</h1>
          <p style={{ margin: '8px 0 0', fontSize: '15px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{data.subtitle}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Checking your service history...</p>
        </div>
      )}

      {/* ═══ NO BOOKINGS — CTA with 5% discount ═══ */}
      {!loading && !hasBookings && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'white', borderRadius: '24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>{data.icon}</div>
          <h2 style={{ margin: '0 0 12px', fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>
            You haven't tried {data.title} yet!
          </h2>
          <p style={{ margin: '0 0 8px', fontSize: '15px', color: '#64748b', maxWidth: '440px', marginInline: 'auto', lineHeight: 1.7 }}>
            Discover why thousands of car owners trust MaskPro for their {data.title.toLowerCase()} needs.
            Get a quote now and enjoy an exclusive discount!
          </p>
          <div style={{
            display: 'inline-block', margin: '24px 0 12px',
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            color: '#78350f', fontWeight: 800, fontSize: '28px',
            padding: '8px 28px', borderRadius: '16px',
          }}>
            5% OFF
          </div>
          <p style={{ margin: '0 0 28px', fontSize: '13px', color: '#94a3b8' }}>
            Exclusive for MaskPro Care app users
          </p>
          <a
            href="https://gaq.maskpro.ph"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: data.gradient, color: 'white',
              padding: '16px 36px', borderRadius: '16px',
              fontSize: '16px', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
              transition: 'all 0.3s ease',
            }}
          >
            <i className="bi bi-chat-dots-fill"></i>
            Get a Quote Now
            <i className="bi bi-arrow-right"></i>
          </a>
        </div>
      )}

      {/* ═══ HAS BOOKINGS — Aftercare content ═══ */}
      {!loading && hasBookings && (
        <div>
          {data.sections.map((section, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: '20px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
              border: '1px solid rgba(59,130,246,0.06)',
              marginBottom: '20px', overflow: 'hidden',
            }}>
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#1e293b' }}>
                  {section.title}
                </h3>
              </div>
              <div style={{ padding: '16px 24px 20px' }}>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {section.tips.map((tip, j) => (
                    <li key={j} style={{
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      padding: '10px 0',
                      borderBottom: j < section.tips.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '8px',
                        background: `${data.gradient.split(',')[1]?.replace(')', '') || '#3b82f6'}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: '2px',
                      }}>
                        <i className="bi bi-check2" style={{ fontSize: '14px', color: '#3b82f6', fontWeight: 900 }}></i>
                      </div>
                      <span style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}

          {/* Source link */}
          <div style={{ textAlign: 'center', padding: '12px 0 24px' }}>
            <a
              href={data.blogUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '13px', color: '#94a3b8', textDecoration: 'none' }}
            >
              <i className="bi bi-box-arrow-up-right" style={{ marginRight: '4px' }}></i>
              Read more on maskpro.ph/blog
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
