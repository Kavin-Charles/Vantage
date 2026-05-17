// apps/mobile/hooks/useOffline.ts
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    });
    return unsubscribe;
  }, []);

  return isOffline;
}
