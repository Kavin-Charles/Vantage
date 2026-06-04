// apps/mobile/app/(app)/pipeline/index.tsx
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllDeals } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Deal } from '@vencore/types';

type DealStage = 'lead' | 'qualifying' | 'proposal' | 'closing' | 'won' | 'lost';

const STAGE_ORDER: DealStage[] = ['lead', 'qualifying', 'proposal', 'closing', 'won', 'lost'];
const ACTIVE_STAGES: DealStage[] = ['lead', 'qualifying', 'proposal', 'closing'];

const STAGE_BADGE: Record<DealStage, string> = {
  lead:       'gray',
  qualifying: 'blue',
  proposal:   'amber',
  closing:    'purple',
  won:        'green',
  lost:       'red',
};

const STAGE_LABELS: Record<DealStage, string> = {
  lead:       'Lead',
  qualifying: 'Qualifying',
  proposal:   'Proposal',
  closing:    'Closing',
  won:        'Won',
  lost:       'Lost',
};

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type StageFilter = DealStage | 'all';

export default function PipelineScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [stage, setStage] = useState<StageFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['deals', 'all'],
    queryFn: () => fetchAllDeals(token),
    enabled: !!token,
  });

  const allDeals: Deal[] = data?.data ?? [];

  const filtered = useMemo(() => {
    if (stage === 'all') return allDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
    return allDeals.filter(d => d.stage === stage);
  }, [allDeals, stage]);

  const total = filtered.reduce((s, d) => s + Number(d.value), 0);

  // Group by stage when "all", single group otherwise
  const groups = useMemo(() => {
    if (stage === 'all') {
      return ACTIVE_STAGES
        .map(s => ({ stage: s, deals: filtered.filter(d => d.stage === s) }))
        .filter(g => g.deals.length > 0);
    }
    return [{ stage, deals: filtered }];
  }, [filtered, stage]);

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEyebrow}>
            {filtered.length} deal{filtered.length !== 1 ? 's' : ''} · {fmtMoney(total)}
          </Text>
          <Text style={styles.headerTitle}>Pipeline</Text>
        </View>
        <TouchableOpacity style={styles.addBtn}>
          <Ionicons name="add" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Stage chips */}
      <View style={styles.chipWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([{ id: 'all', label: 'All' }, ...ACTIVE_STAGES.map(s => ({ id: s, label: STAGE_LABELS[s] }))] as { id: StageFilter; label: string }[]).map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, stage === item.id && styles.chipActive]}
              onPress={() => setStage(item.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, stage === item.id && styles.chipTextActive]}>
                {item.label}
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
            <Text style={styles.empty}>No deals</Text>
          ) : (
            groups.map(({ stage: s, deals }) => (
              <View key={s} style={styles.group}>
                {stage === 'all' && (
                  <Text style={styles.groupLabel}>{STAGE_LABELS[s as DealStage].toUpperCase()}</Text>
                )}
                <View style={styles.listGroup}>
                  {deals.map((d, i) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dealRow, i < deals.length - 1 && styles.rowBorder]}
                      onPress={() => router.push(`/(app)/pipeline/${d.id}`)}
                      activeOpacity={0.7}
                    >
                      <Avatar name={d.name} size={36} />
                      <View style={styles.dealInfo}>
                        <Text style={styles.dealName} numberOfLines={1}>{d.name}</Text>
                        <View style={styles.dealMeta}>
                          {d.close_date && (
                            <Text style={styles.dealMetaText}>{fmtDate(d.close_date)}</Text>
                          )}
                          {d.probability != null && (
                            <Text style={styles.dealMetaText}>{d.probability}%</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.dealRight}>
                        <Text style={styles.dealValue}>{fmtMoney(Number(d.value))}</Text>
                        <Badge label={STAGE_LABELS[d.stage as DealStage] ?? d.stage} color={STAGE_BADGE[d.stage as DealStage] ?? 'gray'} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerLeft: { flex: 1 },
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
  addBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 12,
  },

  chipWrap: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  chipRow: {
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

  body: { paddingTop: 8, paddingBottom: 32 },

  group: { marginBottom: 2 },
  groupLabel: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  listGroup: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },

  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  dealInfo: { flex: 1 },
  dealName: {
    fontFamily: Font.sansMd,
    fontSize: 13,
    color: Colors.text,
  },
  dealMeta: { flexDirection: 'row', gap: 8, marginTop: 3 },
  dealMetaText: {
    fontFamily: Font.sans,
    fontSize: 11,
    color: Colors.text3,
  },
  dealRight: { alignItems: 'flex-end', gap: 4 },
  dealValue: {
    fontFamily: Font.display,
    fontSize: 15,
    color: Colors.text,
  },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 48,
  },
});
