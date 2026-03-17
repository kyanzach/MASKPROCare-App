import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  // Steps: 'mobile' or 'otp'
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [formattedMobile, setFormattedMobile] = useState('');

  const otpRefs = useRef([]);
  const mobileInputRef = useRef(null);
  const secretTapRef = useRef({ count: 0, timer: null });

  // URL parameter pre-fill (admin/sales UX enhancement)
  useEffect(() => {
    const urlMobile = searchParams.get('mobile');
    if (urlMobile) {
      setMobile(urlMobile.replace(/[^0-9]/g, ''));
    }
  }, [searchParams]);

  // Auto-focus mobile input on mount
  useEffect(() => {
    if (step === 'mobile' && mobileInputRef.current) {
      mobileInputRef.current.focus();
    }
  }, [step]);

  // Handle mobile number submission
  const handleMobileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const cleaned = mobile.replace(/[^0-9]/g, '');
    const mobilePattern = /^(0)?9\d{9}$/;
    if (!mobilePattern.test(cleaned)) {
      setError('Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/login', { mobile: cleaned });
      setFormattedMobile(res.data.data?.mobile || cleaned);
      if (res.data.data?.otp) {
        setDevOtp(res.data.data.otp);
      }
      setStep('otp');
      setSuccess('OTP sent to ' + (res.data.data?.mobile || cleaned));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP input change (6 separate boxes)
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next box
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pasted[i] || '';
      }
      setOtp(newOtp);
      const nextEmpty = pasted.length < 6 ? pasted.length : 5;
      otpRefs.current[nextEmpty]?.focus();
    }
  };

  // Handle OTP verification
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/verify', {
        mobile: formattedMobile || mobile,
        otp: otpCode
      });
      if (res.data.data?.token) {
        login(res.data.data.token, res.data.data.customer);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { mobile: mobile.replace(/[^0-9]/g, '') });
      if (res.data.data?.otp) {
        setDevOtp(res.data.data.otp);
      }
      setOtp(['', '', '', '', '', '']);
      setSuccess('New OTP has been sent to your mobile number');
      otpRefs.current[0]?.focus();
    } catch (err) {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const allFilled = otp.every(d => d !== '');

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="login-card">
          {/* Header */}
          <div className="login-logo">
            <img src="/maskpro_logo.png" alt="MaskPro" style={{ width: '64px', height: '64px', borderRadius: '14px' }} />
          </div>
          <h1 className="login-title">
            {step === 'mobile' ? 'MASKPRO Care' : 'Verify OTP'}
          </h1>
          <p className="login-subtitle">
            {step === 'mobile'
              ? 'Enter your mobile number to access your account'
              : 'Enter the verification code sent to your mobile'
            }
          </p>

          {/* Alerts */}
          {error && (
            <div className="login-alert login-alert-error">
              <i className="fas fa-exclamation-triangle"></i>
              {error}
            </div>
          )}
          {success && (
            <div className="login-alert login-alert-success">
              <i className="fas fa-check-circle"></i>
              {success}
            </div>
          )}
          {devOtp && step === 'otp' && (
            <div className="login-alert login-alert-info">
              <i className="fas fa-code"></i>
              Dev OTP: <strong>{devOtp}</strong>
            </div>
          )}

          {/* Mobile Step */}
          {step === 'mobile' && (
            <form onSubmit={handleMobileSubmit}>
              <div className="login-form-group">
                <label className="login-label">Mobile Number</label>
                <input
                  ref={mobileInputRef}
                  type="tel"
                  className="login-input"
                  placeholder="09XX XXX XXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                  maxLength={12}
                  required
                />
                <p className="login-help">
                  Please use the mobile number registered for the service or from where you receive maintenance reminders
                </p>
              </div>
              <div className="login-form-group">
                <button type="submit" className="login-btn-primary" disabled={loading}>
                  {loading ? <span className="spinner"></span> : 'Continue with Mobile'}
                </button>
              </div>
            </form>
          )}

          {/* OTP Step */}
          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit}>
              <div className="login-form-group">
                <label className="login-label">OTP Code</label>
                <div className="otp-boxes" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => otpRefs.current[i] = el}
                      type="text"
                      inputMode="numeric"
                      className={`otp-box${digit ? ' filled' : ''}`}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      maxLength={1}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                <p className="login-help">
                  Enter the 6-digit OTP sent to {formattedMobile || mobile}
                </p>
              </div>

              <div className="login-form-group">
                <button
                  type="submit"
                  className="login-btn-primary"
                  disabled={loading || !allFilled}
                >
                  {loading ? <span className="spinner"></span> : 'Verify & Continue'}
                </button>
              </div>

              <div className="login-form-group">
                <button
                  type="button"
                  className="login-btn-secondary"
                  onClick={handleResend}
                  disabled={loading}
                >
                  Resend OTP
                </button>
                <button
                  type="button"
                  className="login-btn-secondary"
                  onClick={() => {
                    setStep('mobile');
                    setOtp(['', '', '', '', '', '']);
                    setError('');
                    setSuccess('');
                    setDevOtp('');
                  }}
                >
                  Use Different Number
                </button>
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="login-footer">
            <p className="login-footer-text">
              By continuing, you agree to our{' '}
              <a className="login-footer-link">Terms of Service</a> and{' '}
              <a className="login-footer-link">Privacy Policy</a>
            </p>
            <div className="login-security-badge" onClick={() => {
              const s = secretTapRef.current;
              clearTimeout(s.timer);
              s.count++;
              if (s.count >= 5) { s.count = 0; navigate('/admin-login'); return; }
              s.timer = setTimeout(() => { s.count = 0; }, 2000);
            }} style={{ cursor: 'default' }}>
              <i className="fas fa-shield-alt"></i>
              <span>{step === 'mobile' ? 'Secured by MASKPRO' : 'Secured with 256-bit SSL encryption'}</span>
              <i className="fas fa-lock"></i>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="login-help-section">
          <p>
            Need help? Contact our support team at{' '}
            <a href="tel:+63-1800-1-550-0037">
              <i className="fas fa-phone"></i> +63-1800-1-550-0037
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
