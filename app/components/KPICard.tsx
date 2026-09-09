import React from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  trend?: number;
  isLoading?: boolean;
  onPress?: () => void;
}

export const KPICard = React.memo(function KPICard({ title, value, subtitle, icon, color, trend, isLoading, onPress }: KPICardProps) {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const accent = color ?? colors.primary;
  const [fadeAnim] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: isLoading ? 0.4 : 1, duration: 600, useNativeDriver: true }).start();
  }, [isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.iconBg, { backgroundColor: colors.muted, width: isDesktop ? 48 : isTablet ? 44 : 40, height: isDesktop ? 48 : isTablet ? 44 : 40, borderRadius: 12 }]} />
        <View style={[styles.skeletonLine, { width: '70%', backgroundColor: colors.muted }]} />
        <View style={[styles.skeletonLine, { width: '50%', backgroundColor: colors.muted }]} />
        {trend !== undefined && <View style={[styles.skeletonLine, { width: '40%', backgroundColor: colors.muted }]} />}
        {subtitle && <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.muted }]} />}
      </View>
    );
  }

  return (
    <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        style={[styles.card, { backgroundColor: colors.card }]}
      >
        <View style={[styles.iconBg, { backgroundColor: accent + '1A', width: isDesktop ? 48 : isTablet ? 44 : 40, height: isDesktop ? 48 : isTablet ? 44 : 40, borderRadius: 12 }]}>
          <Feather name={icon} size={isDesktop ? 24 : isTablet ? 22 : 20} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.textMuted, fontSize: isDesktop ? 13 : isTablet ? 12 : 11 }]}>{title}</Text>
        <Text style={[styles.value, { color: colors.text, fontSize: isDesktop ? 24 : isTablet ? 22 : 20 }]}>{value}</Text>
        {trend !== undefined && (
          <View style={[styles.trendBadge, { backgroundColor: trend >= 0 ? '#E6F4EA' : '#FCE8E6' }]}>
            <Feather
              name={trend >= 0 ? 'trending-up' : 'trending-down'}
              size={isDesktop ? 13 : 11}
              color={trend >= 0 ? '#137333' : '#C5221F'}
            />
            <Text style={[styles.trendText, { color: trend >= 0 ? '#137333' : '#C5221F', fontSize: isDesktop ? 11 : 10 }]}>
              {Math.abs(trend)}% vs prior period
            </Text>
          </View>
        )}
        {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: isDesktop ? 11 : 10 }]}>{subtitle}</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    flex: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  iconBg: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: {
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontFamily: 'Inter_400Regular',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  trendText: {
    fontFamily: 'Inter_600SemiBold',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    marginBottom: 6,
  },
});