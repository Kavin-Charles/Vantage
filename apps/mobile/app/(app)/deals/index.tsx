// apps/mobile/app/(app)/deals/index.tsx
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { fetchAllDeals } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import type { Deal } from '@vantage/types';

export default function DealsScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => fetchAllDeals(token),
    enabled: !!token,
  });

  const deals = data?.data ?? [];

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Deals</Text>
        <Text style={styles.subtitle}>{deals.length} deals</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={deals}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: Deal }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/(app)/deals/${item.id}`)}
            >
              <Text style={styles.dealName}>{item.name}</Text>
              <Text style={styles.dealValue}>${item.value.toLocaleString()}</Text>
              {item.close_date && (
                <Text style={styles.closeDate}>
                  Close: {new Date(item.close_date).toLocaleDateString()}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No deals found</Text>}
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
  title:     { fontSize: 22, color: Colors.text, fontWeight: '600' },
  subtitle:  { fontSize: 13, color: Colors.text2, marginTop: 2 },
  row: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  dealName:  { fontSize: 15, color: Colors.text, fontWeight: '500' },
  dealValue: { fontSize: 17, color: Colors.green, fontWeight: '600', marginTop: 4 },
  closeDate: { fontSize: 12, color: Colors.text3, marginTop: 4 },
  empty:     { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
