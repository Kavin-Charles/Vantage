// apps/mobile/app/(app)/activity/index.tsx
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Activity, ActivityType } from '@vencore/types';

const ACTIVITY_ICON: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  email:       'mail-outline',
  call:        'call-outline',
  note:        'document-text-outline',
  meeting:     'people-outline',
  deal_change: 'briefcase-outline',
  infra_alert: 'warning-outline',
};

const ICON_BG: Record<ActivityType, string> = {
  email:       Colors.blueBg,
  call:        Colors.greenBg,
  note:        Colors.amberBg,
  meeting:     Colors.purpleBg,
  deal_change: Colors.grayBg,
  infra_alert: Colors.redBg,
};

const ICON_COLOR: Record<ActivityType, string> = {
  email:       Colors.blue,
  call:        Colors.green,
  note:        Colors.amber,
  meeting:     Colors.purple,
  deal_change: Colors.gray,
  infra_alert: Colors.red,
};

type FilterType = 'all' | 'email' | 'call' | 'note' | 'meeting';
const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',     label: 'All' },
  { id: 'call',    label: 'Calls' },
  { id: 'email',   label: 'Email' },
  { id: 'note',    label: 'Notes' },
  { id: 'meeting', label: 'Meetings' },
];

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayLabel(d: string | Date): string {
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default function ActivityScreen() {
  const token = useApiToken();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['activity', 'full'],
    queryFn: () => listActivity(token, { limit: 100 }),
    enabled: !!token,
  });

  const activities: Activity[] = data?.data ?? [];

  const filtered = useMemo(() => activities.filter(a => {
    if (filter === 'all') return true;
    return a.type === filter;
  }), [activities, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    filtered.forEach(a => {
      const key = dayLabel(a.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>
          {filtered.length} {filter === 'all' ? 'events' : filter}
        </Text>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
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
          {groups.length === 0 ? (
            <Text style={styles.empty}>No activity yet</Text>
          ) : (
            groups.map(([day, items]) => (
              <View key={day} style={styles.group}>
                <Text style={styles.dayLabel}>{day}</Text>
                <View style={styles.listGroup}>
                  {items.map((a, i) => (
                    <View key={a.id} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
                      <View style={[
                        styles.iconBox,
                        { backgroundColor: ICON_BG[a.type] ?? Colors.surface2 },
                      ]}>
                        <Ionicons
                          name={ACTIVITY_ICON[a.type] ?? 'ellipse-outline'}
                          size={14}
                          color={ICON_COLOR[a.type] ?? Colors.text3}
                        />
                      </View>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowType}>{a.type.replace('_', ' ')}</Text>
                        {a.body ? (
                          <Text style={styles.rowBody} numberOfLines={2}>{a.body}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.rowDate}>{fmtDate(a.created_at)}</Text>
                    </View>
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
  },
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { fontFamily: Font.sansMd, fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: Colors.surface },

  body: { paddingTop: 8, paddingBottom: 32 },

  group: { marginBottom: 2 },
  dayLabel: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 6,
    marginTop: 14,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowInfo: { flex: 1 },
  rowType: {
    fontFamily: Font.sansMd,
    fontSize: 12,
    color: Colors.text2,
    textTransform: 'capitalize',
  },
  rowBody: {
    fontFamily: Font.sans,
    fontSize: 12,
    color: Colors.text3,
    marginTop: 1,
    lineHeight: 16,
  },
  rowDate: {
    fontFamily: Font.sans,
    fontSize: 11,
    color: Colors.text3,
    flexShrink: 0,
  },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 48,
  },
});
