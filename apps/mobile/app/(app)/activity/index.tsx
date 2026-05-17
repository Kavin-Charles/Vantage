import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { listActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import type { Activity } from '@vantage/types';

const TYPE_LABEL: Record<Activity['type'], string> = {
  email:        '✉️ Email',
  call:         '📞 Call',
  note:         '📝 Note',
  meeting:      '🤝 Meeting',
  deal_change:  '💼 Deal change',
  infra_alert:  '🔴 Infra alert',
};

export default function ActivityScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => listActivity(token, { limit: 50 }),
    enabled: !!token,
  });

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Activity</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: Activity }) => (
            <View style={styles.row}>
              <Text style={styles.type}>{TYPE_LABEL[item.type]}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No activity yet</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
  },
  back:  { color: Colors.green, fontSize: 15, marginBottom: 8 },
  title: { fontSize: 22, color: Colors.text, fontWeight: '600' },
  row: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  type:  { fontSize: 13, color: Colors.text2, marginBottom: 4 },
  body:  { fontSize: 14, color: Colors.text, marginBottom: 4 },
  date:  { fontSize: 12, color: Colors.text3 },
  empty: { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
