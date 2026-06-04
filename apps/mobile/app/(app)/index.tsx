// apps/mobile/app/(app)/index.tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listAlerts, listTasks, listActivity, getMe } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Alert, Task, Activity, ActivityType } from '@vencore/types';

const ACTIVITY_ICON: Record<ActivityType, string> = {
  email:       'mail-outline',
  call:        'call-outline',
  note:        'document-text-outline',
  meeting:     'people-outline',
  deal_change: 'briefcase-outline',
  infra_alert: 'warning-outline',
};

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(token),
    enabled: !!token,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => listTasks(token),
    enabled: !!token,
  });

  const { data: activityData } = useQuery({
    queryKey: ['activity'],
    queryFn: () => listActivity(token, { limit: 50 }),
    enabled: !!token,
  });

  const workspace = meData?.data.workspace;
  const user = meData?.data.user;
  const alerts = alertsData?.data ?? [];
  const criticals = alerts.filter((a: Alert) => a.severity === 'critical');
  const warnings  = alerts.filter((a: Alert) => a.severity === 'warning');
  const openTasks = (tasksData?.data ?? []).filter((t: Task) => t.status === 'todo').slice(0, 3);
  const recentActivity = (activityData?.data ?? []).slice(0, 3);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <View style={styles.container}>
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEyebrow}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={styles.headerGreeting}>
            {greeting}{firstName ? `, ${firstName}.` : '.'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => router.push('/(app)/alerts')}
        >
          <Ionicons name="notifications-outline" size={18} color={Colors.text2} />
          {criticals.length + warnings.length > 0 && (
            <View style={styles.bellDot} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Alert banner — shown when critical/warning alerts exist */}
        {(criticals.length + warnings.length) > 0 && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => router.push('/(app)/alerts')}
            activeOpacity={0.8}
          >
            <View style={styles.alertBannerLeft}>
              <View style={styles.alertPulse} />
              <Text style={styles.alertBannerLabel}>
                {criticals.length + warnings.length} active alerts
              </Text>
            </View>
            {criticals.length > 0 && (
              <View style={styles.alertSevRow}>
                <View style={[styles.alertSevChip, { backgroundColor: Colors.redBg }]}>
                  <Text style={[styles.alertSevText, { color: Colors.red }]}>
                    {criticals.length} critical
                  </Text>
                </View>
              </View>
            )}
            {warnings.length > 0 && (
              <View style={[styles.alertSevChip, { backgroundColor: Colors.amberBg }]}>
                <Text style={[styles.alertSevText, { color: Colors.amber }]}>
                  {warnings.length} warning
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* KPI grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>TODAY</Text>
        </View>
        <View style={styles.kpiGrid}>
          <KpiTile
            label="Open tasks"
            value={String((tasksData?.data ?? []).filter((t: Task) => t.status === 'todo').length)}
            onPress={() => router.push('/(app)/tasks')}
          />
          <KpiTile
            label="Alerts"
            value={String(alerts.length)}
            valueTone={criticals.length > 0 ? 'red' : warnings.length > 0 ? 'amber' : undefined}
            onPress={() => router.push('/(app)/alerts')}
          />
          <KpiTile
            label="Contacts"
            value={String(workspace?.contact_count ?? '—')}
            onPress={() => router.push('/(app)/contacts')}
          />
          <KpiTile
            label="Servers"
            value={String(workspace?.server_count ?? '—')}
            onPress={() => router.push('/(app)/servers')}
          />
        </View>

        {/* Open tasks preview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>OPEN TASKS</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/tasks')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.listGroup}>
          {openTasks.length === 0 ? (
            <Text style={styles.empty}>No open tasks</Text>
          ) : (
            openTasks.map((t: Task, i: number) => (
              <View key={t.id} style={[styles.taskRow, i < openTasks.length - 1 && styles.rowBorder]}>
                <View style={[styles.taskCheck, t.status === 'done' && styles.taskCheckDone]} />
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                  {t.due_date && (
                    <Text style={styles.taskDue}>Due {fmtDate(t.due_date)}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Recent activity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/activity')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.listGroup}>
          {recentActivity.length === 0 ? (
            <Text style={styles.empty}>No activity yet</Text>
          ) : (
            recentActivity.map((a: Activity, i: number) => (
              <View key={a.id} style={[styles.actRow, i < recentActivity.length - 1 && styles.rowBorder]}>
                <View style={styles.actIcon}>
                  <Ionicons
                    name={(ACTIVITY_ICON[a.type] ?? 'ellipse-outline') as any}
                    size={14}
                    color={Colors.text2}
                  />
                </View>
                <View style={styles.actInfo}>
                  <Text style={styles.actType}>{a.type.replace('_', ' ')}</Text>
                  {a.body ? <Text style={styles.actBody} numberOfLines={1}>{a.body}</Text> : null}
                </View>
                <Text style={styles.actDate}>{fmtDate(a.created_at)}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}

function KpiTile({
  label, value, valueTone, onPress,
}: {
  label: string;
  value: string;
  valueTone?: 'red' | 'amber';
  onPress?: () => void;
}) {
  const valueColor = valueTone === 'red' ? Colors.red : valueTone === 'amber' ? Colors.amber : Colors.text;
  return (
    <TouchableOpacity style={styles.kpiTile} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.kpiValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
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
  headerGreeting: {
    fontFamily: Font.display,
    fontSize: 22,
    color: Colors.text,
    lineHeight: 26,
  },
  bellBtn: {
    width: 36, height: 36, borderRadius: 11,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 12,
  },
  bellDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 999,
    backgroundColor: Colors.red,
    borderWidth: 1.5, borderColor: Colors.surface,
  },

  body: { paddingBottom: 32 },

  // Alert banner
  alertBanner: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: Colors.amberBg,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.amber + '55',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  alertBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  alertPulse: {
    width: 8, height: 8, borderRadius: 999,
    backgroundColor: Colors.red,
  },
  alertBannerLabel: {
    fontFamily: Font.sansSemi,
    fontSize: 12,
    color: Colors.amber,
  },
  alertSevRow: { flexDirection: 'row', gap: 6 },
  alertSevChip: {
    borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  alertSevText: {
    fontFamily: Font.sansSemi,
    fontSize: 11,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  eyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
  },
  seeAll: {
    fontFamily: Font.sansSemi,
    fontSize: 12,
    color: Colors.blue,
  },

  // KPI grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  kpiTile: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  kpiValue: {
    fontFamily: Font.display,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 32,
  },
  kpiLabel: {
    fontFamily: Font.sans,
    fontSize: 12,
    color: Colors.text3,
    marginTop: 4,
  },

  // List group
  listGroup: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    padding: 16,
  },

  // Task rows
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  taskCheck: {
    width: 18, height: 18, borderRadius: 5,
    borderWidth: 1.5, borderColor: Colors.text3,
    flexShrink: 0,
  },
  taskCheckDone: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  taskInfo: { flex: 1 },
  taskTitle: {
    fontFamily: Font.sansMd,
    fontSize: 13,
    color: Colors.text,
  },
  taskDue: {
    fontFamily: Font.sans,
    fontSize: 11,
    color: Colors.text3,
    marginTop: 2,
  },

  // Activity rows
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  actIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  actInfo: { flex: 1 },
  actType: {
    fontFamily: Font.sansMd,
    fontSize: 12,
    color: Colors.text2,
    textTransform: 'capitalize',
  },
  actBody: {
    fontFamily: Font.sans,
    fontSize: 12,
    color: Colors.text3,
    marginTop: 1,
  },
  actDate: {
    fontFamily: Font.sans,
    fontSize: 11,
    color: Colors.text3,
  },
});
