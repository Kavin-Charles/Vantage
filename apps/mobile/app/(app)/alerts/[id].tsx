// apps/mobile/app/(app)/alerts/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { listAlerts, acknowledgeAlert, resolveAlert } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';

const SEV_BADGE: Record<string, string> = {
  critical: 'red', warning: 'amber', info: 'blue',
};

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const isOffline = useOffline();
  const router = useRouter();
  const qc = useQueryClient();

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
    return <View style={styles.center}><ActivityIndicator color={Colors.text3} /></View>;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
          <Text style={styles.backText}>Alerts</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Alert card */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Badge label={alert.severity} color={SEV_BADGE[alert.severity] ?? 'gray'} size="md" />
            <Text style={styles.date}>
              {new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <Text style={styles.message}>{alert.message}</Text>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>DETAILS</Text>
          <View style={styles.listGroup}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Resource type</Text>
              <Text style={styles.infoVal}>{alert.resource_type}</Text>
            </View>
            {alert.resource_id && (
              <View style={[styles.infoRow, styles.rowBorder]}>
                <Text style={styles.infoLabel}>Resource ID</Text>
                <Text style={[styles.infoVal, { fontFamily: Font.mono, fontSize: 11 }]} numberOfLines={1}>
                  {alert.resource_id}
                </Text>
              </View>
            )}
            <View style={[styles.infoRow, styles.rowBorder]}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoVal}>
                {alert.resolved ? 'Resolved' : alert.acknowledged ? 'Acknowledged' : 'Open'}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        {alert.resolved ? (
          <View style={styles.resolvedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
            <Text style={styles.resolvedText}>Resolved</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {!alert.acknowledged && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, (isOffline || ackMutation.isPending) && styles.btnDisabled]}
                disabled={isOffline || ackMutation.isPending}
                onPress={() => ackMutation.mutate()}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSecondaryText}>
                  {ackMutation.isPending ? 'Acknowledging…' : 'Acknowledge'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (isOffline || resolveMutation.isPending) && styles.btnDisabled]}
              disabled={isOffline || resolveMutation.isPending}
              onPress={() => resolveMutation.mutate()}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>
                {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  navbar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontFamily: Font.sansMd, fontSize: 15, color: Colors.text },

  body: { padding: 16, paddingTop: 12 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  date: { fontFamily: Font.sans, fontSize: 12, color: Colors.text3 },
  message: {
    fontFamily: Font.display,
    fontSize: 17,
    color: Colors.text,
    lineHeight: 22,
  },

  section: { marginBottom: 16 },
  eyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  listGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  infoLabel: { fontFamily: Font.sans, fontSize: 13, color: Colors.text3 },
  infoVal: {
    fontFamily: Font.sansMd,
    fontSize: 13,
    color: Colors.text,
    textTransform: 'capitalize',
    textAlign: 'right',
  },

  actions: { gap: 10 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.text },
  btnSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnDisabled: { opacity: 0.35 },
  btnPrimaryText: { fontFamily: Font.sansSemi, fontSize: 15, color: Colors.surface },
  btnSecondaryText: { fontFamily: Font.sansMd, fontSize: 15, color: Colors.text },

  resolvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.greenBg,
    borderRadius: 12,
    padding: 14,
  },
  resolvedText: { fontFamily: Font.sansSemi, fontSize: 14, color: Colors.green },
});
