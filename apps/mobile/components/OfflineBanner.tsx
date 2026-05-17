// apps/mobile/components/OfflineBanner.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { useOffline } from '@/hooks/useOffline';

export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        You're offline — viewing cached data. Connect to make changes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.amberBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: Colors.amber,
    fontSize: 13,
    textAlign: 'center',
  },
});
