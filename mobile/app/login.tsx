import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import AlertPromptModal, { AlertType } from '@/components/ui/AlertPromptModal';
import AlertBanner from '@/components/ui/AlertBanner';
import AiLoginModal from '@/components/ui/AiLoginModal';

const RESEND_COOLDOWN_SECONDS = 30;

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [formattedMobile, setFormattedMobile] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [showAiModal, setShowAiModal] = useState(false);

  // Modal Alert Prompt (Modern Mobile UX)
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'error',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertType, title: string, message: string) => {
    setAlertModal({ visible: true, type, title, message });
  };

  const otpRefs = useRef<(TextInput | null)[]>([]);
  const timerRef = useRef<any>(null);
  const secretTapRef = useRef<{ count: number; timer: any }>({ count: 0, timer: null });

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (secretTapRef.current.timer) clearTimeout(secretTapRef.current.timer);
    };
  }, []);

  const handleSecurityBadgeTap = () => {
    const s = secretTapRef.current;
    if (s.timer) clearTimeout(s.timer);
    s.count++;
    if (s.count >= 5) {
      s.count = 0;
      router.push('/admin-login' as any);
      return;
    }
    s.timer = setTimeout(() => {
      s.count = 0;
    }, 2000);
  };

  const startResendTimer = () => {
    setResendTimer(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleMobileSubmit = async () => {
    setSuccess('');

    const cleaned = mobile.replace(/[^0-9]/g, '');
    const mobilePattern = /^(0)?9\d{9}$/;
    if (!mobilePattern.test(cleaned)) {
      showAlert('warning', 'Invalid Mobile Number', 'Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)');
      return;
    }

    setLoading(true);
    try {
      const res = await client.post('/auth/login', { mobile: cleaned });
      if (res.data?.success) {
        const returnedMobile = res.data.data?.mobile || cleaned;
        setFormattedMobile(returnedMobile);
        if (res.data.data?.otp) {
          setDevOtp(res.data.data.otp);
        }
        setStep('otp');
        setSuccess(`OTP sent to ${returnedMobile}`);
        startResendTimer();
        setTimeout(() => {
          otpRefs.current[0]?.focus();
        }, 300);
      } else {
        showAlert('error', 'Sign In Failed', res.data?.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP. Please check your network and try again.';
      showAlert('error', 'Unable to Send Code', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    const newOtp = [...otp];

    if (cleaned.length > 1) {
      // User pasted multiple digits into one box
      const digits = cleaned.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newOtp[i] = digits[i] || '';
      }
      setOtp(newOtp);
      const nextIndex = Math.min(digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = cleaned.slice(-1);
    setOtp(newOtp);

    // Auto-focus next box
    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || loading) return;
    setSuccess('');
    setLoading(true);
    try {
      const cleaned = mobile.replace(/[^0-9]/g, '');
      const res = await client.post('/auth/login', { mobile: cleaned });
      if (res.data?.success) {
        if (res.data.data?.otp) {
          setDevOtp(res.data.data.otp);
        }
        setSuccess('New OTP sent successfully');
        startResendTimer();
      } else {
        showAlert('error', 'Resend Failed', res.data?.message || 'Failed to resend OTP.');
      }
    } catch (err: any) {
      showAlert('error', 'Resend Failed', err.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      showAlert('warning', 'Incomplete Code', 'Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    const cleaned = mobile.replace(/[^0-9]/g, '');

    try {
      const response = await client.post('/auth/verify', {
        mobile: cleaned,
        otp: otpCode,
      });

      if (response.data?.success) {
        await login(response.data.data.token, response.data.data.customer);
      } else {
        showAlert('error', 'Verification Failed', response.data?.message || 'Invalid or expired OTP');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Verification failed. Please try again.';
      showAlert('error', 'Verification Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const allFilled = otp.every((d) => d !== '');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#0a1628', '#1e3a8a', '#1e3a5f', '#0f172a']}
        locations={[0, 0.4, 0.7, 1]}
        style={styles.background}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* Top Gradient Accent Bar */}
          <LinearGradient
            colors={['#2563eb', '#06b6d4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardTopAccent}
          />

          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/maskpro_logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Header Title & Subtitle */}
          <Text style={styles.title}>
            {step === 'mobile' ? 'MASKPRO Care' : 'Verify OTP'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'mobile'
              ? 'Enter your mobile number to access your account'
              : 'Enter the verification code sent to your mobile'}
          </Text>

          {/* Alerts */}
          {success ? (
            <AlertBanner message={success} type="success" onDismiss={() => setSuccess('')} autoDismissMs={4000} />
          ) : null}
          {devOtp && step === 'otp' ? (
            <View style={styles.devOtpBanner}>
              <FontAwesome name="code" size={14} color="#2563eb" style={{ marginRight: 6 }} />
              <Text style={styles.devOtpText}>
                Dev OTP: <Text style={{ fontWeight: '800' }}>{devOtp}</Text>
              </Text>
            </View>
          ) : null}

          {/* Step 1: Mobile Form */}
          {step === 'mobile' ? (
            <View style={styles.formSection}>
              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                style={styles.mobileInput}
                placeholder="09XX XXX XXXX"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={mobile}
                onChangeText={(val) => {
                  setMobile(val.replace(/[^0-9]/g, '').slice(0, 11));
                }}
                maxLength={11}
              />
              <Text style={styles.helpText}>
                Please use the mobile number registered for the service or from where you receive maintenance reminders
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleMobileSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.primaryButtonText}>
                    Continue with Mobile
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.aiHelperLinkBtn}
                onPress={() => setShowAiModal(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="hardware-chip-outline" size={15} color="#0284c7" />
                <Text numberOfLines={1} adjustsFontSizeToFit style={styles.aiHelperLinkText}>
                  SMS Delayed or Unavailable? Verify with AI Helper
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Step 2: 6-Box OTP Form */
            <View style={styles.formSection}>
              <Text style={styles.label}>OTP Code</Text>
              <View style={styles.otpBoxesContainer}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    style={[
                      styles.otpBox,
                      digit ? styles.otpBoxFilled : null,
                    ]}
                    value={digit}
                    onChangeText={(val) => handleOtpChange(i, val)}
                    onKeyPress={(e) => handleOtpKeyPress(i, e)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>
              <Text style={styles.helpText}>
                Enter the 6-digit OTP sent to {formattedMobile || mobile}
              </Text>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!allFilled || loading) && styles.buttonDisabled,
                ]}
                onPress={handleVerifyOtp}
                disabled={loading || !allFilled}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.primaryButtonText}>
                    Verify & Continue
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.aiHelperBoxBtn}
                onPress={() => setShowAiModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="hardware-chip-outline" size={15} color="#0284c7" />
                <Text numberOfLines={1} adjustsFontSizeToFit style={styles.aiHelperBoxBtnText}>
                  SMS Delayed? Login with AI Assistant
                </Text>
              </TouchableOpacity>

              <View style={styles.secondaryButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    resendTimer > 0 && styles.secondaryButtonDisabled,
                  ]}
                  onPress={handleResend}
                  disabled={resendTimer > 0 || loading}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      resendTimer > 0 && styles.secondaryButtonTextDisabled,
                    ]}
                  >
                    {resendTimer > 0 ? `Resend OTP (${resendTimer}s)` : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setStep('mobile');
                    setOtp(['', '', '', '', '', '']);
                    setSuccess('');
                    setDevOtp('');
                  }}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Use Different Number</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Footer Terms & Security Badge */}
          <View style={styles.cardFooter}>
            <Text style={styles.termsText}>
              By continuing, you agree to our{' '}
              <Text
                style={styles.termsLink}
                onPress={() => {
                  WebBrowser.openBrowserAsync('https://care.maskpro.ph/terms').catch(() => {
                    Linking.openURL('https://care.maskpro.ph/terms').catch(() => {});
                  });
                }}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                style={styles.termsLink}
                onPress={() => {
                  WebBrowser.openBrowserAsync('https://care.maskpro.ph/privacy').catch(() => {
                    Linking.openURL('https://care.maskpro.ph/privacy').catch(() => {});
                  });
                }}
              >
                Privacy Policy
              </Text>
            </Text>

            <TouchableOpacity
              style={styles.securityBadge}
              onPress={handleSecurityBadgeTap}
              activeOpacity={0.7}
            >
              <FontAwesome name="shield" size={13} color="#2563eb" style={{ marginRight: 6 }} />
              <Text style={styles.securityText}>
                {step === 'mobile' ? 'Secured by MASKPRO' : 'Secured with 256-bit SSL encryption'}
              </Text>
              <FontAwesome name="lock" size={12} color="#2563eb" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Support Help Footer */}
        <View style={styles.supportHelp}>
          <Text style={styles.supportText}>
            Need help? Contact our support team at
          </Text>
          <TouchableOpacity
            style={styles.supportPhoneBtn}
            onPress={() => Linking.openURL('tel:+63180015500037')}
            activeOpacity={0.75}
          >
            <FontAwesome name="phone" size={13} color="#93c5fd" />
            <Text numberOfLines={1} style={styles.supportPhone}>
              +63-1800-1-550-0037
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Izumi AI Identity Verification Helper Modal */}
      <AiLoginModal
        visible={showAiModal}
        onClose={() => setShowAiModal(false)}
        initialMobile={mobile}
      />

      {/* Modern Modal Alert Prompt */}
      <AlertPromptModal
        visible={alertModal.visible}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        onConfirm={() => setAlertModal(prev => ({ ...prev, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingVertical: 48,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  cardTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  devOtpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  devOtpText: {
    color: '#1d4ed8',
    fontSize: 13,
  },
  formSection: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
    marginBottom: 10,
  },
  mobileInput: {
    width: '100%',
    height: 56,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  helpText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 20,
  },
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  aiHelperLinkBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  aiHelperLinkText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
  },
  aiHelperBoxBtn: {
    marginTop: 12,
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  aiHelperBoxBtnText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButtonTextDisabled: {
    color: '#94a3b8',
  },
  cardFooter: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
    alignItems: 'center',
  },
  termsText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  termsLink: {
    color: '#2563eb',
    fontWeight: '600',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  securityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  supportHelp: {
    marginTop: 24,
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 4,
  },
  supportText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
  supportPhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  supportPhone: {
    color: '#93c5fd',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
