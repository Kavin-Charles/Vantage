import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { listAlerts, acknowledgeAlert, resolveAlert } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { AlertSeverity } from '@vantage/types';

const SEV_VARIANT: Record<AlertSeverity, 'red' | 'amber' | 'blue'> = {
  critical: 'red', warning: 'amber', info: 'blue',
};

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const isOffline = useOffline();
  const router = useRouter();
  const qc = useQueryClient();

  // Read from cached list to avoid an extra request
  const { data: allAlerts } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });
  const alert = allAlerts?.data.find(a => a.id === id);

  const ackMutation = useMutation({
    mutationFn: () => acknowledgeAlert(token, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      Toast.show({ type: 'success', text1: 'Alert acknowledged' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to acknowledge' }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveAlert(token, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      router.back();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to resolve' }),
  });

  if (!alert) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <StatusBadge label={alert.severity} variant={SEV_VARIANT[alert.severity]} />
            <Text style={styles.date}>{new Date(alert.created_at).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.message}>{alert.message}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Resource</Text>
            <Text style={styles.val}>{alert.resource_type}</Text>
          </View>
          {alert.resource_id && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>ID</Text>
              <Text style={[styles.val, { fontSize: 11, color: Colors.text3 }]}>{alert.resource_id}</Text>
            </View>
          )}
        </View>

        {alert.resolved ? (
          <View style={styles.resolvedBadge}>
            <Text style={styles.resolvedText}>✓ Resolved</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {!alert.acknowledged && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, isOffline && styles.btnDisabled]}
                disabled={isOffline || ackMutation.isPending}
                onPress={() => ackMutation.mutate()}
              >
                <Text style={styles.btnSecondaryText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, isOffline && styles.btnDisabled]}
              disabled={isOffline || resolveMutation.isPending}
              onPress={() => resolveMutation.mutate()}
            >
              <Text style={styles.btnPrimaryText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: {
    backgroundColor: Colors.surface, paddingTop: 56, paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back:    { color: Colors.green, fontSize: 15 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16,
  },
  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  date:     { fontSize: 12, color: Colors.text3 },
  message:  { fontSize: 16, color: Colors.text, marginBottom: 12 },
  infoRow:  { flexDirection: 'row', gap: 8, marginTop: 4 },
  label:    { fontSize: 13, color: Colors.text2, width: 64 },
  val:      { fontSize: 13, color: Colors.text, flex: 1, textTransform: 'capitalize' },
  actions:  { gap: 8 },
  btn:      { borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnPrimary:   { backgroundColor: Colors.green },
  btnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  btnDisabled:  { opacity: 0.4 },
  btnPrimaryText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnSecondaryText: { color: Colors.text, fontSize: 15 },
  resolvedBadge: { backgroundColor: Colors.greenBg, borderRadius: 8, padding: 12, alignItems: 'center' },
  resolvedText:  { color: Colors.green, fontSize: 14, fontWeight: '500' },
});
