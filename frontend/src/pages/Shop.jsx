/**
 * Shop — Coming Soon page
 * Exciting teaser for the upcoming MaskPro Care Shop
 */
import { useNavigate } from 'react-router-dom';

export default function Shop() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
        <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => navigate('/')}>Home</span>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Shop</span>
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <i className="bi bi-bag" style={{ color: '#6366f1' }}></i>
        MaskPro Shop
      </h2>

      {/* Hero Card */}
      <div style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
        borderRadius: '24px',
        padding: '48px 40px',
        textAlign: 'center',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(99, 102, 241, 0.3)',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: '-40px', right: '-40px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }}></div>
        <div style={{
          position: 'absolute', bottom: '-60px', left: '-30px',
          width: '180px', height: '180px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }}></div>

        {/* Animated bag icon */}
        <div style={{
          width: '100px', height: '100px', borderRadius: '28px',
          background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: '48px',
          animation: 'float 3s ease-in-out infinite',
        }}>
          🛍️
        </div>

        <div style={{
          display: 'inline-block',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '50px',
          padding: '6px 20px',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: '16px',
        }}>
          Coming Soon
        </div>

        <h3 style={{
          fontSize: '32px', fontWeight: 800, margin: '0 0 12px',
          lineHeight: 1.2,
        }}>
          The MaskPro Shop is<br />Almost Here!
        </h3>

        <p style={{
          fontSize: '16px', lineHeight: 1.6, margin: '0 auto 32px',
          maxWidth: '480px', opacity: 0.9,
        }}>
          We're building something special for our VIP customers. Premium car accessories, 
          high-grade gadgets, and members-only deals — all at your fingertips.
        </p>

        {/* Feature highlights */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '24px',
          flexWrap: 'wrap', marginBottom: '32px',
        }}>
          {[
            { icon: '💎', text: 'VIP Exclusive Discounts' },
            { icon: '🔧', text: 'Premium Gadgets' },
            { icon: '🎁', text: 'Loyalty Rewards' },
          ].map((f, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)',
              borderRadius: '12px', padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
              <span style={{ fontSize: '20px' }}>{f.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{f.text}</span>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: '14px', opacity: 0.75, margin: 0,
          fontStyle: 'italic',
        }}>
          As a valued MaskPro customer, you'll enjoy exclusive pricing and early access.
          <br />Stay tuned — great things are on the way! 🚀
        </p>
      </div>

      {/* Teaser grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px', marginTop: '24px',
      }}>
        {[
          { icon: '🚗', title: 'Car Accessories', desc: 'Premium accessories to elevate your vehicle\'s style and functionality' },
          { icon: '🔧', title: 'Premium Gadgets', desc: 'High-grade tools and gadgets handpicked for car enthusiasts' },
          { icon: '🎫', title: 'Gift Cards', desc: 'Give the gift of MaskPro protection to friends and family' },
          { icon: '⭐', title: 'VIP Rewards', desc: 'Redeem loyalty points for exclusive products and services' },
        ].map((item, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: '14px', padding: '20px',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            opacity: 0.7,
          }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>{item.icon}</div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>{item.title}</h4>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Float animation */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}
