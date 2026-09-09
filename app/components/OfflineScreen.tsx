import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useEffect, useRef } from 'react';

interface OfflineScreenProps {
  onRetry?: () => void;
  message?: string;
}

export function OfflineScreen({ onRetry, message }: OfflineScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isTablet, spacing, fontSize } = useResponsive();
  const { isConnected } = useNetworkStatus();
  const hasAutoRetried = useRef(false);

  const defaultMessage = "You're currently offline. Please check your internet connection and try again.";

  useEffect(() => {
    if (isConnected && onRetry && !hasAutoRetried.current) {
      hasAutoRetried.current = true;
      const timer = setTimeout(() => {
        onRetry();
        hasAutoRetried.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, onRetry]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accent, width: isTablet ? 120 : 100, height: isTablet ? 120 : 100, borderRadius: isTablet ? 60 : 50 }]}>
        <Feather name="wifi-off" size={isTablet ? 56 : 48} color={colors.primary} />
      </View>

      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl, marginTop: spacing.lg }]}>
        No Internet Connection
      </Text>

      <Text style={[styles.message, { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.sm, paddingHorizontal: spacing.md }]}>
        {message || defaultMessage}
      </Text>

      {isConnected !== null && isConnected && (
        <Text style={[styles.reconnecting, { color: colors.primary, fontSize: fontSize.sm, marginTop: spacing.md }]}>
          Reconnected — refreshing data...
        </Text>
      )}

      <View style={[styles.tips, { backgroundColor: colors.card, borderColor: colors.border, marginTop: spacing.lg, padding: spacing.md }]}>
        <Text style={[styles.tipsTitle, { color: colors.text, fontSize: fontSize.md }]}>Quick checks:</Text>
        {[
          'Make sure Wi-Fi or mobile data is turned on',
          'Try moving to an area with better signal',
          'Restart your router or toggle airplane mode',
          'If using a VPN, try disconnecting it',
        ].map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={[styles.tipBullet, { backgroundColor: colors.primary }]} />
            <Text style={[styles.tipText, { color: colors.textMuted, fontSize: fontSize.sm }]}>{tip}</Text>
          </View>
        ))}
      </View>

      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryBtn,
            {
              backgroundColor: colors.primary,
              marginTop: spacing.xl,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Feather name="refresh-cw" size={isTablet ? 20 : 18} color="#fff" />
          <Text style={[styles.retryText, { fontSize: isTablet ? 16 : 15, color: colors.primaryForeground }]}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  reconnecting: {
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  tips: {
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    maxWidth: 420,
    gap: 10,
  },
  tipsTitle: {
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tipText: {
    fontFamily: 'Inter_400Regular',
    flex: 1,
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 200,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
