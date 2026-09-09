import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

type NetworkStatus = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isUnstable: boolean;
  isLoading: boolean;
};

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: null,
    isInternetReachable: null,
    isUnstable: false,
    isLoading: true,
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => setStatus({ isConnected: true, isInternetReachable: true, isUnstable: false, isLoading: false });
      const handleOffline = () => setStatus({ isConnected: false, isInternetReachable: false, isUnstable: false, isLoading: false });

      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        setStatus({ isConnected: navigator.onLine, isInternetReachable: navigator.onLine, isUnstable: false, isLoading: false });
      }

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected ?? null;
      const isInternetReachable = state.isInternetReachable ?? null;
      const details = state.details as { downlink?: number } | null;
      const downlink = details?.downlink;
      const isUnstable = !!(isConnected && downlink !== undefined && downlink < 1.5);

      setStatus({
        isConnected,
        isInternetReachable,
        isUnstable,
        isLoading: false,
      });
    });

    return unsubscribe;
  }, []);

  return status;
}
