import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';

interface OtpModalProps {
  visible: boolean;
  mode: 'phone' | 'email';
  target: string;
  purpose: string;
  onVerify: (code: string) => Promise<boolean> | boolean;
  onResend: () => void;
  onClose: () => void;
  loading?: boolean;
}

export function OtpModal({ visible, mode, target, purpose, onVerify, onResend, onClose, loading }: OtpModalProps) {
  const colors = useColors();
  const { isTablet, isDesktop, spacing, fontSize, width } = useResponsive();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const containerWidth = isDesktop ? 460 : isTablet ? 440 : 380;
  const boxHorizontalMargin = spacing.sm;
  const boxCount = 6;
  const boxWidth = Math.max(44, (containerWidth - 48 - (boxCount - 1) * boxHorizontalMargin) / boxCount);

  useEffect(() => {
    if (visible) {
      setCode(['', '', '', '', '', '']);
      setCountdown(60);
      setError('');
      setVerifying(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [visible]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    if (!/^\d*$/.test(text)) return;
    const newCode = [...code];
    newCode[index] = text.slice(-1);
    setCode(newCode);
    setError('');

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const fullCode = newCode.join('');
    if (fullCode.length === 6 && !verifying) {
      handleVerify(fullCode);
    }
  };

  const handleVerify = async (fullCode: string) => {
    setVerifying(true);
    setError('');
    try {
      const ok = await onVerify(fullCode);
      if (!ok) {
        setError('Invalid code. Please try again.');
      }
    } catch {
      setError('Verification failed. Please try again.');
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

  const maskedTarget = mode === 'phone'
    ? target.replace(/(\+\d{3})\d{7}(\d{2})/, '$1******$2')
    : target.replace(/(.{3})(.*)(@.*)/, '$1***$3');

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View style={[styles.container, { backgroundColor: colors.card, maxWidth: containerWidth }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>Verify {mode === 'phone' ? 'Phone' : 'Email'}</Text>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { width: 44, height: 44 }]}>
            <Feather name="x" size={isDesktop ? 22 : 20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.description, { color: colors.textMuted, fontSize: fontSize.md }]}>
          Enter the 6-digit code sent to {maskedTarget}
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
              style={[
                styles.codeBox,
                { borderColor: error ? colors.destructive : colors.border, color: colors.text, backgroundColor: colors.background, width: boxWidth, fontSize: isTablet ? 22 : 18, fontFamily: 'Inter_700Bold' },
              ]}
            />
          ))}
        </View>

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        <View style={styles.resendRow}>
          {countdown > 0 ? (
            <Text style={[styles.countdown, { color: colors.textMuted, fontSize: fontSize.sm }]}>
              Resend in {countdown}s
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={loading || verifying}>
              <Text style={[styles.resendBtn, { color: colors.primary, fontSize: fontSize.md }]}>Resend Code</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => onClose()} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text style={[styles.changeTargetBtn, { color: colors.primary }]}>Change {mode === 'phone' ? 'phone number' : 'email'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.verifyBtn, { backgroundColor: colors.primary, opacity: (verifying || loading || code.join('').length !== 6) ? 0.6 : 1 }]}
          onPress={() => code.join('').length === 6 && handleVerify(code.join(''))}
          disabled={verifying || loading || code.join('').length !== 6}
        >
          {verifying || loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.verifyBtnText, { color: colors.primaryForeground, fontSize: fontSize.lg }]}>Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: 'Inter_700Bold',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
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
});
