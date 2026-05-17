// apps/mobile/app/(app)/index.tsx
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listAlerts, getMe } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { Alert } from '@vantage/types';

function sevVariant(s: Alert['severity']): 'red' | 'amber' | 'blue' {
  if (s === 'critical') return 'red';
  if (s === 'warning') return 'amber';
  return 'blue';
}

export default function DashboardScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(token),
    enabled: !!token,
  });

  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });

  const alerts  = alertsData?.data ?? [];
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning  = alerts.filter(a => a.severity === 'warning').length;
  const top3     = alerts.slice(0, 3);

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <View>
          <Text style={styles.workspaceName}>
            {meData?.data.workspace.name ?? 'Vantage'}
          </Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
          <Ionicons name="settings-outline" size={22} color={Colors.text2} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderColor: Colors.redBg }]}>
          <Text style={[styles.statCount, { color: Colors.red }]}>{critical}</Text>
          <Text style={styles.statLabel}>Critical</Text>
        </View>
        <View style={[styles.statCard, { borderColor: Colors.amberBg }]}>
          <Text style={[styles.statCount, { color: Colors.amber }]}>{warning}</Text>
          <Text style={styles.statLabel}>Warning</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Alerts</Text>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={top3}
          keyExtractor={a => a.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.alertRow}
              onPress={() => router.push(`/(app)/alerts/${item.id}`)}
            >
              <StatusBadge label={item.severity} variant={sevVariant(item.severity)} />
              <Text style={styles.alertMsg} numberOfLines={1}>{item.message}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No active alerts</Text>
          }
          scrollEnabled={false}
        />
      )}

      <TouchableOpacity
        style={styles.activityLink}
        onPress={() => router.push('/(app)/activity')}
      >
        <Text style={styles.activityLinkText}>View all activity →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  workspaceName: { fontSize: 12, color: Colors.text3, marginBottom: 2 },
  headerTitle:   { fontSize: 22, color: Colors.text, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, margin: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, padding: 16, alignItems: 'center',
  },
  statCount: { fontSize: 32, fontWeight: '700' },
  statLabel: { fontSize: 12, color: Colors.text2, marginTop: 2 },
  sectionTitle: {
    fontSize: 13, color: Colors.text2, fontWeight: '600',
    marginHorizontal: 16, marginBottom: 8,
  },
  alertRow: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 8, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  alertMsg:    { fontSize: 14, color: Colors.text },
  empty:       { color: Colors.text3, textAlign: 'center', marginTop: 16 },
  activityLink: { margin: 16 },
  activityLinkText: { color: Colors.green, fontSize: 14 },
});
