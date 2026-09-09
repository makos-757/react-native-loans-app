import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'success';
  loading?: boolean;
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  loading = false,
  showInput = false,
  inputLabel,
  inputPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const [inputVal, setInputVal] = useState('');

  const btnColor =
    variant === 'danger' ? colors.destructive
    : variant === 'success' ? colors.success
    : colors.primary;

  const iconName =
    variant === 'danger' ? 'alert-triangle'
    : variant === 'success' ? 'check-circle'
    : 'info';

  const iconBg =
    variant === 'danger' ? `${colors.destructive}20`
    : variant === 'success' ? `${colors.success}20`
    : colors.accent;

  const handleConfirm = () => {
    const value = showInput ? inputVal.trim() : undefined;
    onConfirm(value);
    setInputVal('');
  };

  const handleCancel = () => {
    setInputVal('');
    onCancel();
  };

  const modalMaxWidth = isDesktop ? 520 : isTablet ? 480 : '100%';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity activeOpacity={1} style={styles.confirmOverlay} onPress={handleCancel}>
        <TouchableOpacity activeOpacity={1} style={[styles.confirmSheet, { backgroundColor: colors.card, shadowColor: colors.shadow || '#000', maxWidth: modalMaxWidth }]} onPress={() => {}}>
          <View style={[styles.iconBg, { backgroundColor: iconBg }]}> 
            <Feather name={iconName} size={isDesktop ? 28 : 24} color={btnColor} />
          </View>
          <Text style={[styles.title, { color: colors.text, fontSize: isDesktop ? 20 : 18 }]}>{title}</Text>
          {message && (
            <Text style={[styles.message, { color: colors.textMuted, fontSize: isDesktop ? 15 : 14 }]}>{message}</Text>
          )}
          {showInput && (
            <View style={styles.inputWrap}>
              {inputLabel && <Text style={[styles.inputLabel, { color: colors.text, fontSize: isDesktop ? 14 : 13 }]}>{inputLabel}</Text>}
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, fontSize: isDesktop ? 15 : 14, backgroundColor: colors.muted }]}
                placeholder={inputPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={inputVal}
                onChangeText={setInputVal}
                multiline={inputPlaceholder?.includes('reason') || false}
                accessibilityLabel={inputLabel || 'Input'}
              />
            </View>
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
              onPress={handleCancel}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={cancelText}
            >
              <Text style={[styles.btnText, { color: colors.textMuted, fontSize: isDesktop ? 15 : 14 }]}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: btnColor }, loading && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={confirmText}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.btnText, { color: colors.primaryForeground, fontSize: isDesktop ? 15 : 14 }]}>{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

interface OTPModalProps {
  visible: boolean;
  mode: 'phone' | 'email';
  target: string;
  purpose: string;
  onVerify: (code: string) => Promise<boolean> | boolean;
  onResend: () => void;
  onClose: () => void;
  loading?: boolean;
}

export function OTPModal({ visible, mode, target, purpose, onVerify, onResend, onClose, loading }: OTPModalProps) {
  const colors = useColors();
  const { isTablet, isDesktop, spacing, fontSize } = useResponsive();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const containerWidth = isDesktop ? 460 : isTablet ? 440 : 380;
  const boxHorizontalMargin = spacing.sm;
  const boxCount = 6;
  const boxWidth = Math.max(44, (containerWidth - 48 - (boxCount - 1) * boxHorizontalMargin) / boxCount);

  useEffect(() => {
    if (!visible) {
      setCode(['', '', '', '', '', '']);
      setCountdown(0);
      setError('');
      setVerifying(false);
      setVerified(false);
      return;
    }

    setCode(['', '', '', '', '', '']);
    setCountdown(60);
    setError('');
    setVerifying(false);
    setVerified(false);
    const focusTimer = setTimeout(() => inputRefs.current[0]?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [visible]);

  useEffect(() => {
    if (!visible || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, countdown]);

  const triggerShake = () => {
    const animatedValue = new Animated.Value(0);
    Animated.sequence([
      Animated.timing(animatedValue, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(animatedValue, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(animatedValue, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleChange = (text: string, index: number) => {
    if (!/^\d*$/.test(text)) return;
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      digits.forEach((digit, offset) => { if (offset < 6) newCode[offset] = digit; });
      setCode(newCode);
      setError('');
      if (digits.length === 6 && !verifying && !loading) {
        handleVerify(digits.join(''));
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = text.slice(-1);
    setCode(newCode);
    setError('');

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const fullCode = newCode.join('');
    if (fullCode.length === 6 && !verifying && !loading) {
      handleVerify(fullCode);
    }
  };

  const handleVerify = async (fullCode: string) => {
    if (verifying || loading || verified) return;
    setVerifying(true);
    setError('');
    try {
      const ok = await onVerify(fullCode);
      if (!ok) {
        setError('Invalid code. Please try again.');
        triggerShake();
      } else {
        setVerified(true);
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch {
      setError('Verification failed. Please try again.');
      triggerShake();
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    setError('');
    setCountdown(60);
    await onResend();
  };

  const maskedTarget = !target
    ? ''
    : mode === 'phone'
      ? target.length > 6
        ? `${target.slice(0, 4)}****${target.slice(-2)}`
        : target
      : target.replace(/(.{2}).+(@.+)/, '$1***$2');

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity activeOpacity={1} style={[styles.otpOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.otpContainer, { backgroundColor: colors.card, maxWidth: containerWidth, shadowColor: colors.shadow || '#000' }]} onPress={() => {}}>
          <View style={[styles.iconBg, { backgroundColor: colors.accent }]}> 
            <Feather name="shield" size={isDesktop ? 26 : 24} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>Verify {mode === 'phone' ? 'Phone' : 'Email'}</Text>
          <Text style={[styles.description, { color: colors.textMuted, fontSize: fontSize.md }]}> 
            {verified
              ? `Code verified for ${maskedTarget}`
              : `Enter the 6-digit code sent to ${maskedTarget}`}
          </Text>

          <View style={styles.codeRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                value={digit}
                onChangeText={(text) => handleChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="done"
                editable={!verifying}
                style={[styles.codeBox, { borderColor: error ? colors.destructive : colors.border, color: colors.text, backgroundColor: colors.muted, width: boxWidth, fontSize: isTablet ? 22 : 18, fontFamily: 'Inter_700Bold' }]}
                accessibilityLabel={`OTP digit ${i + 1}`}
              />
            ))}
          </View>

          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={[styles.countdown, { color: colors.textMuted, fontSize: fontSize.sm }]}>Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={loading || verifying} accessibilityRole="button" accessibilityLabel="Resend code">
                <Text style={[styles.resendBtn, { color: colors.primary, fontSize: fontSize.md }]}>Resend Code</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 8 }} accessibilityRole="button" accessibilityLabel={`Change ${mode === 'phone' ? 'phone number' : 'email'}`}>
            <Text style={[styles.changeTargetBtn, { color: colors.primary }]}>Change {mode === 'phone' ? 'phone number' : 'email'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.verifyBtn, { backgroundColor: colors.primary, opacity: (verifying || loading || code.join('').length !== 6) ? 0.6 : 1 }]}
            onPress={() => code.join('').length === 6 && handleVerify(code.join(''))}
            disabled={verifying || loading || code.join('').length !== 6}
            accessibilityRole="button"
            accessibilityLabel="Verify code"
          >
            {verifying || loading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.verifyBtnText, { color: colors.primaryForeground, fontSize: fontSize.lg }]}>Verify</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  confirmOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmSheet: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  otpOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  otpContainer: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  iconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  codeBox: {
    height: 52,
    borderWidth: 2,
    borderRadius: 12,
    fontFamily: 'Inter_700Bold',
    marginHorizontal: 4,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  resendRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  countdown: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  resendBtn: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  verifyBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  changeTargetBtn: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  message: {
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  inputWrap: {
    width: '100%',
    marginTop: 16,
  },
  inputLabel: {
    fontFamily: 'Inter_500Medium',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Inter_400Regular',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  btnText: {
    fontFamily: 'Inter_600SemiBold',
  },
});
