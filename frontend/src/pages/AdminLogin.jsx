/**
 * AdminLogin — Standalone admin login form at /admin-login
 * 
 * Uses username/password against Unify users table (bcrypt).
 * After successful login, calls authLogin() to update AuthContext
 * React state AND localStorage, then navigates to /admin (inside Layout).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AdminLogin() {
  const { login: authLogin, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, go straight to admin panel
  if (isAuthenticated) {
    navigate('/admin', { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/admin/login', { username, password });
      if (res.data.success) {
        const { token, customer } = res.data.data;
        // Store admin token separately for admin-specific checks
        localStorage.setItem('admin_token', token);
        // Update AuthContext → sets mpc_token + mpc_customer + React state
        authLogin(token, customer);
        // Navigate to /admin (inside Layout with sidebar)
        navigate('/admin', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      padding: '20px',
    }}>
      <div style={{
        background: 'rgba(30,41,59,0.9)', borderRadius: '28px', padding: '48px 40px',
        width: '100%', maxWidth: '420px', border: '1px solid rgba(59,130,246,0.15)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '28px',
          }}>
            <i className="bi bi-shield-lock-fill" style={{ color: '#78350f' }}></i>
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'white' }}>
            Admin Access
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#94a3b8' }}>
            MaskPro Care — Admin Panel
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <i className="bi bi-person" style={{
                position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                color: '#64748b', fontSize: '16px',
              }}></i>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Enter username" autoComplete="username"
                style={{
                  width: '100%', padding: '14px 16px 14px 44px',
                  background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(71,85,105,0.5)',
                  borderRadius: '14px', color: 'white', fontSize: '15px',
                  outline: 'none', transition: 'border 0.2s', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(71,85,105,0.5)'}
              />
            </div>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <i className="bi bi-lock" style={{
                position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                color: '#64748b', fontSize: '16px',
              }}></i>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter password" autoComplete="current-password"
                style={{
                  width: '100%', padding: '14px 16px 14px 44px',
                  background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(71,85,105,0.5)',
                  borderRadius: '14px', color: 'white', fontSize: '15px',
                  outline: 'none', transition: 'border 0.2s', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(71,85,105,0.5)'}
              />
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', gap: '8px',
              color: '#fca5a5', fontSize: '13px', fontWeight: 500,
            }}>
              <i className="bi bi-exclamation-triangle"></i>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !username || !password}
            style={{
              width: '100%', padding: '14px',
              background: loading ? '#475569' : 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              color: '#78350f', border: 'none', borderRadius: '14px',
              fontSize: '16px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.2s',
              opacity: (!username || !password) ? 0.5 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
                Authenticating...
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <i className="bi bi-shield-check"></i>
                Sign In
              </span>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Link to="/login" style={{ color: '#64748b', fontSize: '13px', textDecoration: 'none' }}>
            ← Back to Customer Login
          </Link>
        </div>
      </div>
    </div>
  );
}
