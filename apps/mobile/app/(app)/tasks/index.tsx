// apps/mobile/app/(app)/tasks/index.tsx
import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { listTasks, updateTask } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Task } from '@vantage/types';

type FilterTab = 'open' | 'done' | 'all';

function dueBucket(t: Task): string {
  if (!t.due_date) return 'No due date';
  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return 'This week';
  return 'Later';
}

const BUCKET_ORDER = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No due date'];

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TasksScreen() {
  const token = useApiToken();
  const isOffline = useOffline();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<FilterTab>('open');

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => listTasks(token),
    enabled: !!token,
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => updateTask(token, taskId, { status: 'done' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tasks'] }); },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to complete task' }),
  });

  const tasks: Task[] = data?.data ?? [];
  const openCount = tasks.filter(t => t.status === 'todo').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  const filtered = useMemo(() => {
    if (tab === 'open') return tasks.filter(t => t.status === 'todo');
    if (tab === 'done') return tasks.filter(t => t.status === 'done');
    return tasks;
  }, [tasks, tab]);

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    filtered.forEach(t => {
      const key = t.status === 'done' ? 'Done' : dueBucket(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    // Sort by bucket order
    return BUCKET_ORDER
      .concat(['Done'])
      .map(k => ({ bucket: k, tasks: map.get(k) ?? [] }))
      .filter(g => g.tasks.length > 0);
  }, [filtered]);

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: 'open', label: 'Open',  count: openCount },
    { id: 'done', label: 'Done',  count: doneCount },
    { id: 'all',  label: 'All',   count: tasks.length },
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
            <Text style={styles.headerEyebrow}>{openCount} open</Text>
            <Text style={styles.headerTitle}>Tasks</Text>
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

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.text3} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              {tab === 'open' ? 'No open tasks 🎉' : 'No tasks'}
            </Text>
          ) : (
            groups.map(({ bucket, tasks: items }) => (
              <View key={bucket} style={styles.group}>
                <Text style={[
                  styles.bucketLabel,
                  bucket === 'Overdue' && { color: Colors.red },
                ]}>
                  {bucket.toUpperCase()}
                </Text>
                <View style={styles.listGroup}>
                  {items.map((t, i) => (
                    <View key={t.id} style={[styles.taskRow, i < items.length - 1 && styles.rowBorder]}>
                      <TouchableOpacity
                        style={[styles.check, t.status === 'done' && styles.checkDone]}
                        disabled={isOffline || t.status === 'done' || completeMutation.isPending}
                        onPress={() => completeMutation.mutate(t.id)}
                        activeOpacity={0.7}
                      >
                        {t.status === 'done' && (
                          <Ionicons name="checkmark" size={11} color={Colors.surface} />
                        )}
                      </TouchableOpacity>
                      <View style={styles.taskInfo}>
                        <Text style={[styles.taskTitle, t.status === 'done' && styles.taskDone]} numberOfLines={2}>
                          {t.title}
                        </Text>
                        {t.due_date && (
                          <Text style={[
                            styles.taskDue,
                            bucket === 'Overdue' && t.status !== 'done' && { color: Colors.red },
                          ]}>
                            Due {fmtDate(t.due_date)}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
      <Toast />
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
  segActive: { backgroundColor: Colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
  segText: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text3 },
  segTextActive: { color: Colors.text },

  body: { paddingTop: 8, paddingBottom: 32 },

  group: { marginBottom: 2 },
  bucketLabel: {
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

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  check: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.text3,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkDone: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  taskInfo: { flex: 1 },
  taskTitle: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text, lineHeight: 18 },
  taskDone: { color: Colors.text3, textDecorationLine: 'line-through' },
  taskDue: { fontFamily: Font.sans, fontSize: 11, color: Colors.text3, marginTop: 2 },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 48,
  },
});
