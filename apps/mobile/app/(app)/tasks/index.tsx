import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { listTasks, updateTask } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import type { Task } from '@vantage/types';

function isToday(d: Date | string | null): boolean {
  if (!d) return false;
  const date = new Date(d);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isUpcoming(d: Date | string | null): boolean {
  if (!d) return false;
  return new Date(d) > new Date() && !isToday(d);
}

export default function TasksScreen() {
  const token = useApiToken();
  const isOffline = useOffline();
  const qc = useQueryClient();

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

  const tasks       = data?.data ?? [];
  const todayTasks    = tasks.filter(t => t.status === 'todo' && isToday(t.due_date));
  const upcomingTasks = tasks.filter(t => t.status === 'todo' && isUpcoming(t.due_date));
  const noDueTasks    = tasks.filter(t => t.status === 'todo' && !t.due_date);
  const doneTasks     = tasks.filter(t => t.status === 'done').slice(0, 20);

  function TaskRow({ item, showComplete }: { item: Task; showComplete: boolean }) {
    return (
      <View style={styles.taskRow}>
        <View style={styles.taskLeft}>
          <Text style={[styles.taskTitle, item.status === 'done' && styles.taskTitleDone]}>
            {item.title}
          </Text>
          {item.due_date && (
            <Text style={styles.dueDate}>
              Due: {new Date(item.due_date).toLocaleDateString()}
            </Text>
          )}
        </View>
        {showComplete && (
          <TouchableOpacity
            style={[styles.completeBtn, isOffline && styles.completeBtnDisabled]}
            disabled={isOffline || completeMutation.isPending}
            onPress={() => completeMutation.mutate(item.id)}
          >
            <Text style={styles.completeBtnText}>✓</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {todayTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Today</Text>
            {todayTasks.map(t => <TaskRow key={t.id} item={t} showComplete />)}
          </>
        )}
        {upcomingTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingTasks.map(t => <TaskRow key={t.id} item={t} showComplete />)}
          </>
        )}
        {noDueTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>No due date</Text>
            {noDueTasks.map(t => <TaskRow key={t.id} item={t} showComplete />)}
          </>
        )}
        {doneTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Done</Text>
            {doneTasks.map(t => <TaskRow key={t.id} item={t} showComplete={false} />)}
          </>
        )}
        {tasks.length === 0 && <Text style={styles.empty}>No tasks</Text>}
      </ScrollView>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
  },
  title:        { fontSize: 22, color: Colors.text, fontWeight: '600' },
  sectionTitle: { fontSize: 13, color: Colors.text2, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  taskRow: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  taskLeft:       { flex: 1, marginRight: 8 },
  taskTitle:      { fontSize: 14, color: Colors.text },
  taskTitleDone:  { textDecorationLine: 'line-through', color: Colors.text3 },
  dueDate:        { fontSize: 12, color: Colors.text3, marginTop: 2 },
  completeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.greenBg, alignItems: 'center', justifyContent: 'center',
  },
  completeBtnDisabled: { opacity: 0.4 },
  completeBtnText:     { color: Colors.green, fontSize: 16, fontWeight: '700' },
  empty: { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
