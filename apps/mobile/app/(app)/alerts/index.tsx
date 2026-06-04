// apps/mobile/app/(app)/alerts/index.tsx
import { useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listAlerts } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Alert } from '@vencore/types';

type AlertTab = 'unresolved' | 'critical' | 'warning' | 'all';

const SEV_BADGE: Record<string, string> = {
  critical: 'red', warning: 'amber', info: 'blue',
};

const SEV_DOT: Record<string, string> = {
  critical: Colors.red, warning: Colors.amber, info: Colors.blue,
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AlertsScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [tab, setTab] = useState<AlertTab>('unresolved');

  // Fetch all alerts (resolved + unresolved) to support "all" tab
  const { data: unresolvedData, isLoading: loadingUnresolved } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });

  const { data: resolvedData } = useQuery({
    queryKey: ['alerts', true],
    queryFn: () => listAlerts(token, { resolved: true }),
    enabled: !!token && tab === 'all',
  });

  const unresolved: Alert[] = unresolvedData?.data ?? [];
  const allAlerts: Alert[] = [
    ...unresolved,
    ...(resolvedData?.data ?? []),
  ];

  const counts = useMemo(() => ({
    unresolved: unresolved.length,
    critical:   unresolved.filter(a => a.severity === 'critical').length,
    warning:    unresolved.filter(a => a.severity === 'warning').length,
    all:        allAlerts.length,
  }), [unresolved, allAlerts]);

  const filtered = useMemo(() => {
    if (tab === 'all') return allAlerts;
    if (tab === 'unresolved') return unresolved;
    return unresolved.filter(a => a.severity === tab);
  }, [tab, unresolved, allAlerts]);

  const TABS: { id: AlertTab; label: string; count: number }[] = [
    { id: 'unresolved', label: 'Open',      count: counts.unresolved },
    { id: 'critical',   label: 'Critical',  count: counts.critical },
    { id: 'warning',    label: 'Warning',   count: counts.warning },
    { id: 'all',        label: 'All',       count: counts.all },
  ];

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerMid}>
            <Text style={styles.headerEyebrow}>{counts.unresolved} unresolved</Text>
            <Text style={styles.headerTitle}>Alerts</Text>
          </View>
        </View>

        {/* Segmented */}
        <View style={styles.segmented}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.seg, tab === t.id && styles.segActive]}
              onPress={() => setTab(t.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segText, tab === t.id && styles.segTextActive]}>
                {t.label}
                {t.count > 0 ? ` ${t.count}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loadingUnresolved ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.text3} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={a => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.row, index < filtered.length - 1 && styles.rowBorder]}
              onPress={() => router.push(`/(app)/alerts/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowTop}>
                  <View style={[styles.sevDot, { backgroundColor: SEV_DOT[item.severity] ?? Colors.text3 }]} />
                  <Badge label={item.severity} color={SEV_BADGE[item.severity] ?? 'gray'} />
                  {item.resolved && (
                    <View style={styles.resolvedChip}>
                      <Text style={styles.resolvedText}>Resolved</Text>
                    </View>
                  )}
                  {item.acknowledged && !item.resolved && (
                    <View style={styles.ackChip}>
                      <Text style={styles.ackText}>Acknowledged</Text>
                    </View>
                  )}
                  <Text style={styles.date}>{fmtDate(item.created_at)}</Text>
                </View>
                <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.resource}>{item.resource_type}</Text>
              </View>
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
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  backBtn: { marginRight: 4, marginTop: 4 },
  headerMid: { flex: 1 },
  headerEyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  headerTitle: {
    fontFamily: Font.display,
    fontSize: 26,
    color: Colors.text,
    lineHeight: 30,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
  },
  seg: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  segActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  segText: { fontFamily: Font.sansMd, fontSize: 12, color: Colors.text3 },
  segTextActive: { color: Colors.text },

  list: {
    margin: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  row: { padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLeft: { flex: 1 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  sevDot: { width: 7, height: 7, borderRadius: 999 },
  date: { fontFamily: Font.sans, fontSize: 11, color: Colors.text3, marginLeft: 'auto' },
  message: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text, marginBottom: 3 },
  resource: {
    fontFamily: Font.sans, fontSize: 11,
    color: Colors.text3, textTransform: 'capitalize',
  },

  resolvedChip: {
    backgroundColor: Colors.greenBg,
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  resolvedText: { fontFamily: Font.sansSemi, fontSize: 10, color: Colors.green },
  ackChip: {
    backgroundColor: Colors.grayBg,
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  ackText: { fontFamily: Font.sansSemi, fontSize: 10, color: Colors.gray },

  empty: {
    fontFamily: Font.sans, fontSize: 13,
    color: Colors.text3, textAlign: 'center',
    marginTop: 48, padding: 16,
  },
});
