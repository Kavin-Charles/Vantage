// apps/mobile/app/(app)/servers/index.tsx
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { listServers } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Server } from '@vencore/types';

type StatusFilter = 'all' | 'online' | 'degraded' | 'offline';

const STATUS_DOT: Record<string, string> = {
  online:   Colors.green,
  degraded: Colors.amber,
  offline:  Colors.red,
  stopped:  Colors.text3,
};

const STATUS_BADGE_COLOR: Record<string, string> = {
  online:   Colors.green,
  degraded: Colors.amber,
  offline:  Colors.red,
  stopped:  Colors.text3,
};

function fmtUptime(s: number | null): string {
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

export default function ServersScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers(token),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const servers: Server[] = data?.data ?? [];

  const counts = useMemo(() => ({
    all:      servers.length,
    online:   servers.filter(s => s.status === 'online').length,
    degraded: servers.filter(s => s.status === 'degraded').length,
    offline:  servers.filter(s => s.status === 'offline' || s.status === 'stopped').length,
  }), [servers]);

  const filtered = useMemo(() => {
    if (filter === 'all') return servers;
    if (filter === 'offline') return servers.filter(s => s.status === 'offline' || s.status === 'stopped');
    return servers.filter(s => s.status === filter);
  }, [servers, filter]);

  const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all',      label: `All (${counts.all})` },
    { id: 'online',   label: `Online (${counts.online})` },
    { id: 'degraded', label: `Degraded (${counts.degraded})` },
    { id: 'offline',  label: `Offline (${counts.offline})` },
  ];

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.header}>
        <View style={styles.statusDots}>
          {counts.online > 0 && (
            <View style={styles.dotItem}>
              <View style={[styles.dot, { backgroundColor: Colors.green }]} />
              <Text style={styles.dotText}>{counts.online} online</Text>
            </View>
          )}
          {counts.degraded > 0 && (
            <View style={styles.dotItem}>
              <View style={[styles.dot, { backgroundColor: Colors.amber }]} />
              <Text style={styles.dotText}>{counts.degraded} degraded</Text>
            </View>
          )}
          {counts.offline > 0 && (
            <View style={styles.dotItem}>
              <View style={[styles.dot, { backgroundColor: Colors.red }]} />
              <Text style={styles.dotText}>{counts.offline} offline</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerTitle}>Servers</Text>
      </View>

      {/* Status filter */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, filter === f.id && styles.chipActive]}
              onPress={() => setFilter(f.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.text3} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No servers</Text>
          ) : (
            <View style={styles.listGroup}>
              {filtered.map((s, i) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.serverRow, i < filtered.length - 1 && styles.rowBorder]}
                  onPress={() => router.push(`/(app)/servers/${s.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[s.status] ?? Colors.text3 }]} />
                  <View style={styles.serverInfo}>
                    <Text style={styles.serverName}>{s.name}</Text>
                    <Text style={styles.serverMeta}>
                      {s.region ?? ''}
                      {s.ip_address ? ` · ${s.ip_address}` : ''}
                    </Text>
                  </View>
                  <View style={styles.serverMetrics}>
                    {s.cpu_pct != null && (
                      <Text style={[styles.metricText, s.cpu_pct > 80 && { color: Colors.red }]}>
                        CPU {Math.round(s.cpu_pct)}%
                      </Text>
                    )}
                    {s.mem_pct != null && (
                      <Text style={[styles.metricText, s.mem_pct > 85 && { color: Colors.amber }]}>
                        MEM {Math.round(s.mem_pct)}%
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
  },
  statusDots: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  dotText: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontFamily: Font.display,
    fontSize: 26,
    color: Colors.text,
    lineHeight: 30,
  },

  filterWrap: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { fontFamily: Font.sansMd, fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: Colors.surface },

  body: { padding: 16, paddingBottom: 32 },

  listGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },

  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  statusDot: { width: 9, height: 9, borderRadius: 999, flexShrink: 0 },
  serverInfo: { flex: 1 },
  serverName: {
    fontFamily: Font.sansMd,
    fontSize: 14,
    color: Colors.text,
  },
  serverMeta: {
    fontFamily: Font.sans,
    fontSize: 11,
    color: Colors.text3,
    marginTop: 2,
  },
  serverMetrics: { alignItems: 'flex-end', gap: 2 },
  metricText: {
    fontFamily: Font.mono,
    fontSize: 11,
    color: Colors.text2,
  },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 48,
  },
});
