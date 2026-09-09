import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';

interface ApiErrorProps {
  message?: string;
  onRetry?: () => void;
  title?: string;
}

export function ApiError({ message = "We couldn't load this data. Please try again.", onRetry, title = "Something went wrong" }: ApiErrorProps) {
  const colors = useColors();
  const { isTablet, spacing, fontSize } = useResponsive();
  const [loading, setLoading] = React.useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setLoading(true);
    try {
      await onRetry();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { padding: spacing.md }]} accessible accessibilityRole="alert" accessibilityLabel={title}>
      <View style={[styles.iconWrap, { backgroundColor: `${colors.destructive}20`, width: isTablet ? 56 : 48, height: isTablet ? 56 : 48, borderRadius: isTablet ? 28 : 24 }]}> 
        <Feather name="alert-circle" size={isTablet ? 28 : 24} color={colors.destructive} />
      </View>
      <Text style={[styles.title, { color: colors.text, fontSize: fontSize.md, marginTop: spacing.sm }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.retryBtn,
            {
              backgroundColor: colors.primary,
              marginTop: spacing.md,
              opacity: pressed || loading ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Feather name={loading ? 'loader' : 'refresh-cw'} size={isTablet ? 18 : 16} color={colors.primaryForeground} />
          <Text style={[styles.retryText, { fontSize: isTablet ? 15 : 14, color: colors.primaryForeground }]}>{loading ? 'Retrying...' : 'Retry'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 120,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
  },
});
