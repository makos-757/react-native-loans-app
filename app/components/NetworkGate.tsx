import React from 'react';
import { View } from 'react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';
import { OfflineScreen } from '@/components/OfflineScreen';

interface NetworkGateProps {
  children: React.ReactNode;
}

export function NetworkGate({ children }: NetworkGateProps) {
  const { isConnected, isLoading } = useNetworkStatus();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <OfflineScreen message="Checking connection..." />
      </View>
    );
  }

  if (isConnected === false) {
    return (
      <View style={{ flex: 1 }}>
        <OfflineBanner />
        <OfflineScreen
          message="You are offline. Showing cached data where available."
          onRetry={undefined}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      {children}
    </View>
  );
}