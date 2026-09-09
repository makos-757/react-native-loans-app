import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Feather } from '@expo/vector-icons';

export function OfflineBanner() {
  const colors = useColors();
  const { isConnected } = useNetworkStatus();

  if (isConnected === null || isConnected) return null;

  return (
    <View style={[styles.banner, { backgroundColor: '#FCE8E6', borderBottomColor: '#F5C6CB' }]}>
      <Feather name="wifi-off" size={14} color="#C5221F" />
      <Text style={[styles.text, { color: '#C5221F' }]}>
        You are offline. Some features may not work.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});