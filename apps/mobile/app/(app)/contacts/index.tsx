// apps/mobile/app/(app)/contacts/index.tsx
import { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { listContacts } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { Contact, ContactStatus } from '@vantage/types';

const STATUS_VARIANT: Record<ContactStatus, 'green' | 'amber' | 'grey' | 'red'> = {
  customer: 'green', prospect: 'amber', cold: 'grey', churned: 'red',
};

const STATUS_FILTERS = ['all', 'prospect', 'customer', 'cold', 'churned'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function ContactsScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const params: Record<string, string> = { per_page: '50' };
  if (search) params['search'] = search;
  if (statusFilter !== 'all') params['status'] = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, statusFilter],
    queryFn: () => listContacts(token, params),
    enabled: !!token,
  });

  const contacts = data?.data ?? [];

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={Colors.text3}
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(s)}
              style={[styles.chip, statusFilter === s && styles.chipActive]}
            >
              <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: Contact }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/(app)/contacts/${item.id}`)}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.email}>{item.email}</Text>
              </View>
              <StatusBadge label={item.status} variant={STATUS_VARIANT[item.status]} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No contacts found</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  title: { fontSize: 22, color: Colors.text, fontWeight: '600', marginBottom: 10 },
  searchInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    padding: 8, fontSize: 14, color: Colors.text, backgroundColor: Colors.surface, marginBottom: 10,
  },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive:     { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText:       { fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: '#fff' },
  row: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  rowLeft: { flex: 1, marginRight: 8 },
  name:  { fontSize: 15, color: Colors.text, fontWeight: '500' },
  email: { fontSize: 13, color: Colors.text2, marginTop: 2 },
  empty: { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
