// apps/mobile/app/(app)/servers/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getServer } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Server } from '@vencore/types';

const STATUS_BADGE: Record<string, string> = {
  online: 'green', degraded: 'amber', offline: 'red', stopped: 'gray',
};

const STATUS_DOT: Record<string, string> = {
  online: Colors.green, degraded: Colors.amber, offline: Colors.red, stopped: Colors.text3,
};

function fmtUptime(s: number | null | undefined): string {
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MetricBar({ label, value, warn = 80, crit = 90 }: {
  label: string;
  value: number | null | undefined;
  warn?: number;
  crit?: number;
}) {
  const pct = value ?? 0;
  const color = pct >= crit ? Colors.red : pct >= warn ? Colors.amber : Colors.green;
  return (
    <View style={mStyles.row}>
      <Text style={mStyles.label}>{label}</Text>
      <View style={mStyles.barTrack}>
        <View style={[mStyles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[mStyles.pct, { color: pct >= crit ? Colors.red : pct >= warn ? Colors.amber : Colors.text2 }]}>
        {Math.round(pct)}%
      </Text>
    </View>
  );
}

const mStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { fontFamily: Font.sansMd, fontSize: 12, color: Colors.text2, width: 40 },
  barTrack: {
    flex: 1, height: 6, borderRadius: 999,
    backgroundColor: Colors.border2 ?? Colors.border,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 999 },
  pct: { fontFamily: Font.mono, fontSize: 12, width: 36, textAlign: 'right' },
});

export default function ServerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['server', id],
    queryFn: () => getServer(token, id),
    enabled: !!token && !!id,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.text3} /></View>;
  }

  const server: Server | undefined = data?.data;
  if (!server) {
    return <View style={styles.center}><Text style={styles.empty}>Server not found</Text></View>;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
          <Text style={styles.backText}>Servers</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Status card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[server.status] ?? Colors.text3 }]} />
            <Text style={styles.serverName}>{server.name}</Text>
          </View>
          <Badge
            label={server.status.charAt(0).toUpperCase() + server.status.slice(1)}
            color={STATUS_BADGE[server.status] ?? 'gray'}
          />
        </View>

        {/* Metrics */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>METRICS</Text>
          <View style={styles.card}>
            <MetricBar label="CPU" value={server.cpu_pct} warn={75} crit={90} />
            <MetricBar label="MEM" value={server.mem_pct} warn={80} crit={90} />
            <MetricBar label="DISK" value={server.disk_pct} warn={80} crit={90} />
          </View>
        </View>

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>INFO</Text>
          <View style={styles.listGroup}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Region</Text>
              <Text style={styles.infoVal}>{server.region ?? '—'}</Text>
            </View>
            {server.ip_address && (
              <View style={[styles.infoRow, styles.rowBorder]}>
                <Text style={styles.infoLabel}>IP</Text>
                <Text style={[styles.infoVal, { fontFamily: Font.mono, fontSize: 12 }]}>{server.ip_address}</Text>
              </View>
            )}
            <View style={[styles.infoRow, styles.rowBorder]}>
              <Text style={styles.infoLabel}>Uptime</Text>
              <Text style={styles.infoVal}>{fmtUptime(server.uptime_seconds)}</Text>
            </View>
            <View style={[styles.infoRow, styles.rowBorder]}>
              <Text style={styles.infoLabel}>Last ping</Text>
              <Text style={styles.infoVal}>
                {server.last_ping_at
                  ? new Date(server.last_ping_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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

  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 999 },
  serverName: {
    fontFamily: Font.display,
    fontSize: 18,
    color: Colors.text,
    flex: 1,
  },

  section: { marginBottom: 16 },
  eyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
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
  infoVal: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text, textAlign: 'right' },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
  },
});
