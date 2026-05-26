import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import AlertBanner from '@/components/ui/AlertBanner';

export default function LoginScreen() {
  const { login } = useAuth();
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); // 1 = mobile, 2 = otp
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestOTP = async () => {
    if (!mobile || mobile.length < 10) {
      setError('Please enter a valid mobile number');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await client.post('/auth/login', { mobile_number: mobile });
      if (response.data.success) {
        setStep(2);
      } else {
        setError(response.data.message || 'Failed to send OTP');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Network error occurred';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await client.post('/auth/verify', { mobile_number: mobile, otp_code: otp });
      if (response.data.success) {
        // Log in the user by storing the token and user data
        await login(response.data.data.token, response.data.data.customer);
        // The AuthContext will automatically redirect to /(tabs)
      } else {
        setError(response.data.message || 'Invalid OTP');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#4f46e5', '#06b6d4']}
        style={styles.background}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back 👋</Text>
          <Text style={styles.subtitle}>
            {step === 1 ? 'Enter your mobile number to continue' : `We sent an OTP to ${mobile}`}
          </Text>

          {error ? (
            <AlertBanner message={error} type="error" onDismiss={() => setError('')} />
          ) : null}

          {step === 1 ? (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.prefix}>+63</Text>
                <TextInput
                  style={styles.input}
                  placeholder="9XX XXX XXXX"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  value={mobile}
                  onChangeText={(val) => {
                    setMobile(val);
                    if (error) setError('');
                  }}
                  maxLength={11}
                />
              </View>

              <TouchableOpacity 
                style={styles.button} 
                onPress={requestOTP}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue with Mobile</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={[styles.input, { textAlign: 'center', letterSpacing: 8, fontSize: 24, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, backgroundColor: '#fff', marginBottom: 24 }]}
                placeholder="000000"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={otp}
                onChangeText={(val) => {
                  setOtp(val);
                  if (error) setError('');
                }}
                maxLength={6}
              />

              <TouchableOpacity 
                style={styles.button} 
                onPress={verifyOTP}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify OTP</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.linkButton} 
                onPress={() => {
                  setStep(1);
                  setError('');
                }}
                disabled={loading}
              >
                <Text style={styles.linkText}>Change Mobile Number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#fff',
  },
  prefix: {
    fontSize: 16,
    color: '#374151',
    marginRight: 8,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 16,
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: '600',
  },
});
