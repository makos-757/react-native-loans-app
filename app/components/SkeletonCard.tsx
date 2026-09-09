import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';

export function SkeletonCard() {
  const colors = useColors();
  const { isTablet, isDesktop } = useResponsive();
  const iconSize = isDesktop ? 48 : isTablet ? 44 : 40;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={[styles.skeletonIcon, { backgroundColor: colors.muted, width: iconSize, height: iconSize }]} />
      <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.muted }]} />
      <View style={[styles.skeletonLine, { width: '40%', backgroundColor: colors.muted }]} />
      <View style={[styles.skeletonLine, { width: '35%', backgroundColor: colors.muted }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  skeletonIcon: {
    borderRadius: 12,
    marginBottom: 4,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    marginBottom: 6,
  },
});