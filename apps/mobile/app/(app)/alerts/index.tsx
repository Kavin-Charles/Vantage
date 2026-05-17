import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { listAlerts } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { Alert, AlertSeverity } from '@vantage/types';

const SEV_VARIANT: Record<AlertSeverity, 'red' | 'amber' | 'blue'> = {
  critical: 'red', warning: 'amber', info: 'blue',
};

export default function AlertsScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [showResolved, setShowResolved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', showResolved],
    queryFn: () => listAlerts(token, { resolved: showResolved }),
    enabled: !!token,
  });

  const alerts = data?.data ?? [];

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <View style={styles.filterRow}>
          {([false, true] as const).map(resolved => (
            <TouchableOpacity
              key={String(resolved)}
              onPress={() => setShowResolved(resolved)}
              style={[styles.chip, showResolved === resolved && styles.chipActive]}
            >
              <Text style={[styles.chipText, showResolved === resolved && styles.chipTextActive]}>
                {resolved ? 'Resolved' : 'Active'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: Alert }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/(app)/alerts/${item.id}`)}
            >
              <View style={styles.rowTop}>
                <StatusBadge label={item.severity} variant={SEV_VARIANT[item.severity]} />
                <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.resource}>{item.resource_type}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No alerts</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  title:          { fontSize: 22, color: Colors.text, fontWeight: '600', marginBottom: 10 },
  filterRow:      { flexDirection: 'row', gap: 8 },
  chip:           { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  chipActive:     { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText:       { fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: '#fff' },
  row:       { backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  rowTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  date:      { fontSize: 12, color: Colors.text3 },
  message:   { fontSize: 14, color: Colors.text, marginBottom: 4 },
  resource:  { fontSize: 12, color: Colors.text3, textTransform: 'capitalize' },
  empty:     { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
