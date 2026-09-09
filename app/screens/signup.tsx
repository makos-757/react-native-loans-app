import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { OtpModal } from '@/components/OtpModal';
import type { UserRole } from '@/types';
import { API_BASE_URL } from '@/config';

const BRANCHES = ['Nairobi', 'Mombasa', 'Kisumu', 'Eldoret', 'Nakuru', 'Nyeri', 'Meru', 'Machakos', 'Kiambu', 'Other'];

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const router = useRouter();
  const { signup, isLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [telephone, setTelephone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [pfNumber, setPfNumber] = useState('');
  const [branch, setBranch] = useState('');

  const [otpMode, setOtpMode] = useState<'email' | 'phone'>('email');
  const [otpTarget, setOtpTarget] = useState('');
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const topPad = isDesktop ? 0 : insets.top + 24;
  const hPad = isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md;

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePhone = (v: string) => /^(\+?254|0)?7\d{8}$/.test(v.replace(/\s/g, ''));

  const canProceedStep0 = () => fullName.trim().length > 0 && validateEmail(email) && password.length >= 6 && validatePhone(telephone);
  const canProceedStep1 = () => idNumber.trim().length > 0 && pfNumber.trim().length > 0 && branch.trim().length > 0;

  const sendOtp = async (target: string, mode: 'email' | 'phone') => {
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [mode === 'email' ? 'email' : 'phone']: target, purpose: 'signup' }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('OTP Error', data.error || 'Failed to send OTP');
        setOtpLoading(false);
        return;
      }
      setOtpTarget(target);
      setOtpMode(mode);
      setOtpVisible(true);
      setOtpLoading(false);
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [otpMode === 'email' ? 'email' : 'phone']: otpTarget, code, purpose: 'signup' }),
      });
      const data = await res.json();
      if (!res.ok) {
        return false;
      }
      setOtpVerified(true);
      setOtpVisible(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleResendOtp = async () => {
    await sendOtp(otpTarget, otpMode);
  };

  const handleSignup = async () => {
    if (!otpVerified) {
      Alert.alert('Error', 'Please verify your email or phone with OTP first');
      return;
    }
    setSubmitting(true);
    try {
      await signup({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        telephone: telephone.trim(),
        idNumber: idNumber.trim(),
        pfNumber: pfNumber.trim(),
        branch: branch.trim(),
        role: 'user',
      });
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Signup Failed', err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {['Account', 'Details', 'Verify'].map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, { backgroundColor: i <= step ? colors.primary : colors.border }]}>
              {i < step && <Feather name="check" size={12} color="#fff" />}
              {i === step && <View style={styles.stepDotActive} />}
            </View>
            <Text style={[styles.stepLabel, { color: i <= step ? colors.primary : colors.textMuted }]}>{label}</Text>
          </View>
          {i < 2 && <View style={[styles.stepLine, { backgroundColor: i < step ? colors.primary : colors.border }]} />}
        </React.Fragment>
      ))}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingTop: topPad, paddingHorizontal: hPad, paddingBottom: 40 }} keyboardShouldPersistTaps="always">
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>Create Account</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: fontSize.md }]}>Sign up to get started</Text>

      {renderStepIndicator()}

      <View style={styles.form}>
        {step === 0 && (
          <>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15 }]} placeholder="Full Name" placeholderTextColor={colors.textMuted} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15 }]} placeholder="Email" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
            <View style={{ position: 'relative' }}>
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15, paddingRight: 44 }]} placeholder="Password" placeholderTextColor={colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <TouchableOpacity style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 4 }} onPress={() => setShowPassword(v => !v)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15 }]} placeholder="Telephone" placeholderTextColor={colors.textMuted} value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" textContentType="telephoneNumber" />
          </>
        )}

        {step === 1 && (
          <>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15 }]} placeholder="ID Number" placeholderTextColor={colors.textMuted} value={idNumber} onChangeText={setIdNumber} keyboardType="numeric" />
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, fontSize: isTablet ? 16 : 15 }]} placeholder="PF Number" placeholderTextColor={colors.textMuted} value={pfNumber} onChangeText={setPfNumber} keyboardType="numeric" />
            <View style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.pickerPlaceholder, { color: branch ? colors.text : colors.textMuted }]}>{branch || 'Select Branch'}</Text>
              <Feather name="chevron-down" size={18} color={colors.textMuted} />
            </View>
            {BRANCHES.map((b) => (
              <TouchableOpacity key={b} style={[styles.pickerItem, { backgroundColor: branch === b ? colors.primary + '20' : colors.card, borderColor: branch === b ? colors.primary : colors.border }]} onPress={() => setBranch(b)}>
                <Text style={[styles.pickerItemText, { color: branch === b ? colors.primary : colors.text }]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Verify Your Account</Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>We sent a code to your {otpMode === 'email' ? 'email' : 'phone'}. Enter it below to verify.</Text>

            <View style={styles.otpActions}>
              <TouchableOpacity
                style={[styles.otpBtn, { borderColor: colors.border }]}
                onPress={() => email && validateEmail(email) && sendOtp(email, 'email')}
                disabled={otpLoading || !email || !validateEmail(email)}
              >
                {otpLoading && otpMode === 'email' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.otpBtnText, { color: colors.primary }]}>Verify Email</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.otpBtn, { borderColor: colors.border }]}
                onPress={() => telephone && validatePhone(telephone) && sendOtp(telephone, 'phone')}
                disabled={otpLoading || !telephone || !validatePhone(telephone)}
              >
                {otpLoading && otpMode === 'phone' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.otpBtnText, { color: colors.primary }]}>Verify Phone</Text>
                )}
              </TouchableOpacity>
            </View>

            {otpVerified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success + '20' }]}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={[styles.verifiedText, { color: colors.success }]}>Verified via {otpMode}</Text>
              </View>
            )}
          </>
        )}

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          {step > 0 && (
            <TouchableOpacity style={[styles.navBtn, { borderColor: colors.border }]} onPress={() => setStep((s) => s - 1)}>
              <Feather name="arrow-left" size={16} color={colors.text} />
              <Text style={[styles.navBtnText, { color: colors.text }]}>Back</Text>
            </TouchableOpacity>
          )}
          {step < 2 ? (
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: colors.primary, flex: step === 0 ? 1 : undefined }]}
              onPress={() => {
                if (step === 0 && !canProceedStep0()) { Alert.alert('Validation', 'Please fill in all fields correctly'); return; }
                if (step === 1 && !canProceedStep1()) { Alert.alert('Validation', 'Please fill in all fields'); return; }
                setStep((s) => s + 1);
              }}
            >
              <Text style={[styles.navBtnText, { color: colors.primaryForeground }]}>{step === 0 ? 'Continue' : 'Next'}</Text>
              <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={handleSignup}
              disabled={submitting || isLoading || !otpVerified}
            >
              {submitting || isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={[styles.navBtnText, { color: colors.primaryForeground }]}>Create Account</Text>
                  <Feather name="check" size={16} color={colors.primaryForeground} />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.primary, fontSize: isTablet ? 15 : 14 }]}>
            Already have an account? Sign in
          </Text>
        </TouchableOpacity>
      </View>

      <OtpModal
        visible={otpVisible}
        mode={otpMode}
        target={otpTarget}
        purpose="signup"
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        onClose={() => setOtpVisible(false)}
        loading={otpLoading}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', marginBottom: 8 },
  subtitle: { fontFamily: 'Inter_400Regular', marginBottom: 24 },
  form: { gap: 14 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular' },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, padding: 14 },
  pickerPlaceholder: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  pickerItemText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  stepIndicator: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  stepItem: { width: 64, alignItems: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  stepLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 4, textAlign: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 13 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  link: { fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 16 },
  otpSection: { marginTop: 16, padding: 16, borderRadius: 12, borderWidth: 1.5, gap: 8 },
  otpTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  otpDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  otpActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  otpBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  otpBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  verifiedBadge: { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  verifiedText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  stepTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  stepDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 8 },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 24 },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, flex: 1 },
  navBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});