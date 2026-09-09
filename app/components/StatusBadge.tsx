import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { getStatusStyle } from './statusColors';
import { Feather } from '@expo/vector-icons';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colors = useColors();
  const cfg = getStatusStyle(status);
  const isSmall = size === 'sm';

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, paddingHorizontal: isSmall ? 6 : 10, paddingVertical: isSmall ? 2 : 4 }]}>
      <Feather name={cfg.icon} size={isSmall ? 10 : 12} color={cfg.text} />
      <Text style={[styles.text, { color: cfg.text, fontSize: isSmall ? 10 : 12, marginLeft: 4 }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Inter_500Medium',
  },
});