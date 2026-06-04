// apps/mobile/app/(app)/pipeline/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getDeal, listActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { ActivityType } from '@vencore/types';

type DealStage = 'lead' | 'qualifying' | 'proposal' | 'closing' | 'won' | 'lost';

const PIPELINE_STAGES: DealStage[] = ['lead', 'qualifying', 'proposal', 'closing'];

const STAGE_BADGE: Record<DealStage, string> = {
  lead: 'gray', qualifying: 'blue', proposal: 'amber',
  closing: 'purple', won: 'green', lost: 'red',
};

const STAGE_LABELS: Record<DealStage, string> = {
  lead: 'Lead', qualifying: 'Qualifying', proposal: 'Proposal',
  closing: 'Closing', won: 'Won', lost: 'Lost',
};

const ACT_ICON: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  email: 'mail-outline', call: 'call-outline', note: 'document-text-outline',
  meeting: 'people-outline', deal_change: 'briefcase-outline', infra_alert: 'warning-outline',
};

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['deal', id],
    queryFn: () => getDeal(token, id),
    enabled: !!token && !!id,
  });

  const { data: actData } = useQuery({
    queryKey: ['activity', 'deal', id],
    queryFn: () => listActivity(token, { deal_id: id, limit: 10 }),
    enabled: !!token && !!id,
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.text3} /></View>;
  }

  const deal = data?.data;
  if (!deal) {
    return <View style={styles.center}><Text style={styles.empty}>Deal not found</Text></View>;
  }

  const stage = deal.stage as DealStage;
  const stageIdx = PIPELINE_STAGES.indexOf(stage);
  const isWonLost = stage === 'won' || stage === 'lost';

  return (
    <View style={styles.container}>
      <OfflineBanner />

      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
          <Text style={styles.backText}>Pipeline</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Avatar name={deal.name} size={40} />
            <View style={styles.heroInfo}>
              <Text style={styles.dealName}>{deal.name}</Text>
              <Badge
                label={STAGE_LABELS[stage] ?? stage}
                color={STAGE_BADGE[stage] ?? 'gray'}
              />
            </View>
          </View>
          <Text style={styles.dealValue}>{fmtMoney(Number(deal.value))}</Text>

          {/* Stage progress bar */}
          {!isWonLost && (
            <View style={styles.stageBar}>
              {PIPELINE_STAGES.map((s, i) => (
                <View
                  key={s}
                  style={[
                    styles.stageSegment,
                    i < PIPELINE_STAGES.length - 1 && { marginRight: 3 },
                    i <= stageIdx ? styles.stageSegmentFilled : styles.stageSegmentEmpty,
                  ]}
                />
              ))}
            </View>
          )}
          {!isWonLost && stageIdx >= 0 && (
            <View style={styles.stageLabels}>
              <Text style={styles.stageLabelCurrent}>
                {STAGE_LABELS[stage]}
              </Text>
              {stageIdx < PIPELINE_STAGES.length - 1 && (
                <Text style={styles.stageLabelNext}>
                  Next: {STAGE_LABELS[PIPELINE_STAGES[stageIdx + 1]]}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>DETAILS</Text>
          <View style={styles.listGroup}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Value</Text>
              <Text style={styles.infoVal}>{fmtMoney(Number(deal.value))}</Text>
            </View>
            <View style={[styles.infoRow, styles.rowBorder]}>
              <Text style={styles.infoLabel}>Probability</Text>
              <Text style={styles.infoVal}>{deal.probability ?? 0}%</Text>
            </View>
            <View style={[styles.infoRow, styles.rowBorder]}>
              <Text style={styles.infoLabel}>Close date</Text>
              <Text style={styles.infoVal}>{fmtDate(deal.close_date)}</Text>
            </View>
            <View style={[styles.infoRow, styles.rowBorder]}>
              <Text style={styles.infoLabel}>Stage</Text>
              <Text style={styles.infoVal}>{STAGE_LABELS[stage] ?? stage}</Text>
            </View>
          </View>
        </View>

        {/* Activity */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>ACTIVITY</Text>
          {(actData?.data ?? []).length === 0 ? (
            <Text style={styles.empty}>No activity logged</Text>
          ) : (
            <View style={styles.listGroup}>
              {(actData?.data ?? []).map((a, i, arr) => (
                <View key={a.id} style={[styles.actRow, i < arr.length - 1 && styles.rowBorder]}>
                  <View style={styles.actIcon}>
                    <Ionicons
                      name={ACT_ICON[a.type] ?? 'ellipse-outline'}
                      size={13}
                      color={Colors.text3}
                    />
                  </View>
                  <View style={styles.actInfo}>
                    <Text style={styles.actType}>{a.type.replace('_', ' ')}</Text>
                    {a.body ? <Text style={styles.actBody} numberOfLines={2}>{a.body}</Text> : null}
                  </View>
                  <Text style={styles.actDate}>
                    {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
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

  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  heroInfo: { flex: 1, gap: 6 },
  dealName: {
    fontFamily: Font.display,
    fontSize: 18,
    color: Colors.text,
    lineHeight: 22,
  },
  dealValue: {
    fontFamily: Font.display,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 32,
    marginBottom: 14,
  },

  stageBar: { flexDirection: 'row', height: 5, marginBottom: 6 },
  stageSegment: { flex: 1, borderRadius: 999, height: 5 },
  stageSegmentFilled: { backgroundColor: Colors.text },
  stageSegmentEmpty: { backgroundColor: Colors.border2 },
  stageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stageLabelCurrent: {
    fontFamily: Font.sansMd,
    fontSize: 11,
    color: Colors.text,
  },
  stageLabelNext: {
    fontFamily: Font.sans,
    fontSize: 11,
    color: Colors.text3,
  },

  section: { marginBottom: 12 },
  eyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginBottom: 6,
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
  infoVal: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text },

  actRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  actIcon: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  actInfo: { flex: 1 },
  actType: {
    fontFamily: Font.sansMd, fontSize: 12,
    color: Colors.text2, textTransform: 'capitalize',
  },
  actBody: { fontFamily: Font.sans, fontSize: 12, color: Colors.text3, marginTop: 1 },
  actDate: { fontFamily: Font.sans, fontSize: 11, color: Colors.text3 },

  empty: { fontFamily: Font.sans, fontSize: 13, color: Colors.text3, textAlign: 'center', paddingVertical: 16 },
});
