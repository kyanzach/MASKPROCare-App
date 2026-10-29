import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

function getOrCreateBrowserDeviceToken() {
  try {
    let token = localStorage.getItem('mp_care_device_token');
    if (!token || token.length < 16) {
      const arr = new Uint8Array(24);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(arr);
        token = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
      } else {
        token = Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
      localStorage.setItem('mp_care_device_token', token);
    }
    return token;
  } catch {
    return '';
  }
}

function getBrowserPlatformLabel() {
  const ua = navigator.userAgent || '';
  let device = 'Mobile Device';
  if (/iPhone/i.test(ua)) device = 'iPhone';
  else if (/iPad/i.test(ua)) device = 'iPad';
  else if (/SM-|Samsung/i.test(ua)) device = 'Samsung Phone';
  else if (/Android/i.test(ua)) device = 'Android Phone';
  else if (/Macintosh|Mac OS X/i.test(ua)) device = 'Mac';
  else if (/Windows/i.test(ua)) device = 'Windows PC';

  let browser = 'Browser';
  if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = 'Safari';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Edg/i.test(ua)) browser = 'Edge';

  return `${device} (${browser})`;
}

export default function MagicLinkGate() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [state, setState] = useState({
    loading: true,
    lockedElsewhere: false,
    errorMessage: '',
    meta: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function verifyMagicLink() {
      const k = searchParams.get('k') || '';
      const deviceToken = getOrCreateBrowserDeviceToken();
      const platformLabel = getBrowserPlatformLabel();

      try {
        const res = await api.post('/auth/magic-verify', {
          slug,
          k,
          device_token: deviceToken,
          platform_label: platformLabel,
        });

        if (cancelled) return;
        const data = res.data?.data;
        if (res.data?.success && data?.token) {
          if (data.device_token) {
            try { localStorage.setItem('mp_care_device_token', data.device_token); } catch {}
          }
          login(data.token, data.customer);
          navigate(data.redirect_to || '/bookings?openBooking=true&service=NanoFix', { replace: true });
          return;
        }
        setState({
          loading: false,
          lockedElsewhere: false,
          errorMessage: res.data?.message || 'Unable to verify smart link.',
          meta: null,
        });
      } catch (err) {
        if (cancelled) return;
        const resp = err.response?.data;
        if (resp?.code === 'DEVICE_LOCKED_ELSEWHERE') {
          setState({
            loading: false,
            lockedElsewhere: true,
            errorMessage: resp.message,
            meta: resp.data || {},
          });
        } else {
          setState({
            loading: false,
            lockedElsewhere: false,
            errorMessage: resp?.message || 'This smart link is no longer active. Please sign in with your mobile number.',
            meta: null,
          });
        }
      }
    }

    verifyMagicLink();
    return () => { cancelled = true; };
  }, [slug, searchParams, login, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #e0f2fe 100%)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '430px',
        background: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.12)',
        border: '1px solid #e2e8f0',
        padding: '32px 26px',
        textAlign: 'center',
      }}>
        <img
          src="/maskpro_logo.png"
          alt="MaskPro Care"
          style={{ height: '42px', marginBottom: '20px', objectFit: 'contain' }}
        />

        {state.loading ? (
          <div style={{ padding: '16px 0' }}>
            <div className="spinner" style={{ width: '38px', height: '38px', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
              Verifying Your Smart Link...
            </h2>
            <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0 }}>
              Securing your MaskPro Care maintenance session
            </p>
          </div>
        ) : state.lockedElsewhere ? (
          <div>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#2563eb',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '16px',
            }}>
              <i className="fas fa-mobile-alt" />
            </div>

            <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              Already Active on Another Device
            </h2>

            <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.55, margin: '0 0 16px' }}>
              Hi <strong>{state.meta?.customer_first_name || 'there'}</strong>, you already accessed your{' '}
              <strong>{state.meta?.vehicle_name || 'vehicle'}</strong> maintenance link on your{' '}
              <strong>{state.meta?.bound_platform || 'other device'}</strong>.
            </p>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              textAlign: 'left',
              marginBottom: '20px',
              fontSize: '12.5px',
              color: '#475569',
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-shield-alt" style={{ color: '#2563eb' }} />
                Device-Locked for Your Privacy
              </div>
              <div>
                Please continue on your <strong>{state.meta?.bound_platform || 'original device'}</strong>, or sign in below using your registered mobile number{' '}
                {state.meta?.masked_mobile ? <strong>({state.meta.masked_mobile})</strong> : null} to continue here.
              </div>
            </div>

            <Link
              to="/login"
              className="btn-gradient"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fas fa-sign-in-alt" /> Login Here with Mobile Number
            </Link>
          </div>
        ) : (
          <div>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: '#fef2f2',
              color: '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '14px',
            }}>
              <i className="fas fa-link" />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
              Sign In to Continue
            </h2>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 20px' }}>
              {state.errorMessage}
            </p>
            <Link
              to="/login"
              className="btn-gradient"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fas fa-sign-in-alt" /> Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
