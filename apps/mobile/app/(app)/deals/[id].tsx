// apps/mobile/app/(app)/deals/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getDeal, listActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';

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
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  const deal = data?.data;
  if (!deal) {
    return <View style={styles.center}><Text style={styles.empty}>Deal not found</Text></View>;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <Text style={styles.name}>{deal.name}</Text>
          <Text style={styles.value}>${deal.value.toLocaleString()}</Text>
          {deal.close_date && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Close date</Text>
              <Text style={styles.val}>{new Date(deal.close_date).toLocaleDateString()}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.label}>Probability</Text>
            <Text style={styles.val}>{deal.probability}%</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Activity</Text>
        {(actData?.data ?? []).map(a => (
          <View key={a.id} style={styles.actItem}>
            <Text style={styles.actType}>{a.type}</Text>
            <Text style={styles.actBody}>{a.body ?? ''}</Text>
            <Text style={styles.actDate}>{new Date(a.created_at).toLocaleDateString()}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: {
    backgroundColor: Colors.surface, paddingTop: 56, paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back:  { color: Colors.green, fontSize: 15 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16,
  },
  name:  { fontSize: 22, color: Colors.text, fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 28, color: Colors.green, fontWeight: '700', marginBottom: 12 },
  infoRow:  { flexDirection: 'row', gap: 8, marginTop: 6 },
  label:    { fontSize: 13, color: Colors.text2, width: 80 },
  val:      { fontSize: 13, color: Colors.text, flex: 1 },
  sectionTitle: { fontSize: 13, color: Colors.text2, fontWeight: '600', marginBottom: 8 },
  actItem: {
    backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 8,
  },
  actType: { fontSize: 12, color: Colors.text3, textTransform: 'capitalize', marginBottom: 4 },
  actBody: { fontSize: 14, color: Colors.text },
  actDate: { fontSize: 12, color: Colors.text3, marginTop: 4 },
  empty:   { color: Colors.text3 },
});
