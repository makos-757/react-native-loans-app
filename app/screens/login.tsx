// @ts-nocheck
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { OtpModal } from '@/components/OtpModal';
import { API_BASE_URL } from '@/config';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const router = useRouter();
  const { login, otpLogin, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showOtp, setShowOtp] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'verify' | 'reset' | null>(null);
  const [otpMode, setOtpMode] = useState<'email' | 'phone'>('phone');
  const [otpTarget, setOtpTarget] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotMode, setForgotMode] = useState<'email' | 'phone'>('email');
  const [forgotTarget, setForgotTarget] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'send' | 'reset'>('send');
  const [forgotLoading, setForgotLoading] = useState(false);

  const topPad = isDesktop ? 0 : insets.top + 40;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePhone = (v: string) => /^(\+?254|0)?7\d{8}$/.test(v.replace(/\s/g, ''));

  const normalizePhone = (v: string) => v.replace(/\s/g, '').replace(/^0/, '+254');

  const sendOtp = async (target: string, mode: 'email' | 'phone'): Promise<boolean> => {
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [mode === 'email' ? 'email' : 'phone']: target, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('OTP Error', data.error || 'Failed to send OTP');
        return false;
      }
      setOtpTarget(target);
      setOtpMode(mode);
      return true;
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
      return false;
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/otp-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [otpMode === 'email' ? 'email' : 'phone']: otpTarget, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        return false;
      }
      if (data.token && data.user) {
        await otpLogin(otpTarget, otpMode, data.token, data.user);
        router.replace('/(tabs)');
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleResendOtp = async () => {
    await sendOtp(otpTarget, otpMode);
  };

  const handleOtpLogin = async () => {
    const value = identifier.trim();
    if (!value) {
      Alert.alert('Error', 'Please enter your email or phone number first');
      return;
    }
    if (!validateEmail(value) && !validatePhone(value)) {
      Alert.alert('Error', 'Enter a valid email or phone number');
      return;
    }
    const mode = validateEmail(value) ? 'email' : 'phone';
    setOtpMode(mode);
    const ok = await sendOtp(value, mode);
    if (ok) {
      setOtpPurpose('login');
      setShowOtp(true);
    }
  };

  const handleForgotPasswordSend = async () => {
    const target = forgotTarget.trim();
    if (!target) { Alert.alert('Error', 'Please enter your email or phone'); return; }
    setForgotLoading(true);
    try {
      const field = forgotMode === 'email' ? 'email' : 'phone';
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to send reset OTP');
        return;
      }
      setForgotStep('reset');
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotPasswordReset = async () => {
    if (!forgotOtp.trim() || !forgotNewPassword.trim()) {
      Alert.alert('Error', 'Please enter OTP and new password');
      return;
    }
    if (forgotNewPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setForgotLoading(true);
    try {
      const field = forgotMode === 'email' ? 'email' : 'phone';
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: forgotTarget, code: forgotOtp, newPassword: forgotNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to reset password');
        return;
      }
      Alert.alert('Success', 'Password reset successfully. Please log in.', [{ text: 'OK', onPress: () => { setForgotVisible(false); setForgotStep('send'); setForgotOtp(''); setForgotNewPassword(''); } }]);
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    const value = identifier.trim();
    const pass = password.trim();
    if (!value || !pass) {
      Alert.alert('Error', 'Please enter email/phone and password');
      return;
    }
    setSubmitting(true);
    try {
      await login(value, pass);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Login Failed', err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad, paddingHorizontal: hPad }]}>
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>Welcome Back</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: fontSize.md }]}>Sign in to your account</Text>

      <View style={styles.form}>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15 }]}
          placeholder="Email or Phone Number"
          placeholderTextColor={colors.textMuted}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType={validateEmail(identifier.trim()) ? 'email-address' : 'default'}
          autoComplete="email"
          textContentType="username"
        />
        <View style={{ position: 'relative' }}>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15, paddingRight: 44 }]}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 4 }}
            onPress={() => setShowPassword(v => !v)}
          >
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={handlePasswordLogin}
          disabled={submitting || isLoading}
        >
          {submitting || isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.buttonText, { color: '#fff', fontSize: isTablet ? 17 : 16 }]}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border }]}
          onPress={handleOtpLogin}
          disabled={otpLoading}
        >
          {otpLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.primary, fontSize: isTablet ? 17 : 16 }]}>Login with OTP</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/signup')}>
          <Text style={[styles.link, { color: colors.primary, fontSize: isTablet ? 15 : 14 }]}>
            Don't have an account? Sign up
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setForgotVisible(true); const detectedMode = validateEmail(identifier.trim()) ? 'email' : 'phone'; setForgotMode(detectedMode); setForgotTarget(identifier.trim()); }}>
          <Text style={[styles.link, { color: colors.primary, fontSize: isTablet ? 15 : 14 }]}>
            Forgot Password?
          </Text>
        </TouchableOpacity>
      </View>

      {showOtp && otpPurpose && (
        <OtpModal
          visible={showOtp && otpPurpose !== null}
          mode={otpMode}
          target={otpTarget}
          purpose={otpPurpose}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          onClose={() => {
            setShowOtp(false);
            setOtpPurpose(null);
          }}
          loading={otpLoading}
        />
      )}

      <Modal visible={forgotVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.fpStyles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.fpStyles.header, { backgroundColor: colors.primary }]}>
            <TouchableOpacity onPress={() => { setForgotVisible(false); setForgotStep('send'); setForgotOtp(''); setForgotNewPassword(''); }}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.fpStyles.title, { color: '#fff' }]}>Reset Password</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ gap: 16 }}>
            {forgotStep === 'send' ? (
              <>
                <Text style={[styles.fpStyles.label, { color: colors.text }]}>Reset via</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['email', 'phone'] as const).map(m => (
                    <TouchableOpacity key={m} style={[styles.fpStyles.modeBtn, { borderColor: forgotMode === m ? colors.primary : colors.border, backgroundColor: forgotMode === m ? colors.accent : colors.card }]} onPress={() => setForgotMode(m)}>
                      <Text style={[styles.fpStyles.modeText, { color: forgotMode === m ? colors.primary : colors.text }]}>{m === 'email' ? 'Email' : 'Phone'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.fpStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  placeholder={forgotMode === 'email' ? 'Enter your email' : 'Enter your phone (07XXXXXXXX)'}
                  placeholderTextColor={colors.textMuted}
                  value={forgotTarget}
                  onChangeText={setForgotTarget}
                  keyboardType={forgotMode === 'email' ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={[styles.fpStyles.btn, { backgroundColor: colors.primary }]} onPress={handleForgotPasswordSend} disabled={forgotLoading}>
                  {forgotLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.fpStyles.btnText, { color: '#fff' }]}>Send OTP</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.fpStyles.infoBox, { backgroundColor: colors.accent }]}>
                  <Feather name="shield" size={16} color={colors.primary} />
                  <Text style={[styles.fpStyles.infoText, { color: colors.primaryHover }]}>Enter the OTP sent to {forgotTarget}</Text>
                </View>
                <TextInput
                  style={[styles.fpStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background, textAlign: 'center', letterSpacing: 8, fontSize: 20 }]}
                  placeholder="OTP"
                  placeholderTextColor={colors.textMuted}
                  value={forgotOtp}
                  onChangeText={setForgotOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TextInput
                  style={[styles.fpStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  placeholder="New Password (min 6 characters)"
                  placeholderTextColor={colors.textMuted}
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                  secureTextEntry
                />
                <TouchableOpacity style={[styles.fpStyles.btn, { backgroundColor: colors.primary }]} onPress={handleForgotPasswordReset} disabled={forgotLoading}>
                  {forgotLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.fpStyles.btnText, { color: '#fff' }]}>Reset Password</Text>}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', marginBottom: 8 },
  subtitle: { fontFamily: 'Inter_400Regular', marginBottom: 32 },
  form: { gap: 16 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular' },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  link: { fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 16 },
  otpHint: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 4,
  },
  otpSendBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  otpSendBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  fpStyles: {
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    title: { fontSize: 17, fontFamily: 'Inter_700Bold' },
    label: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
    input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular' },
    btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    btnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
    modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
    modeText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
    infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10 },
    infoText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  },
});
