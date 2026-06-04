// apps/mobile/app/(app)/contacts/index.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listContacts } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Contact } from '@vencore/types';

const STATUS_BADGE: Record<string, string> = {
  customer: 'green', prospect: 'blue', cold: 'gray', churned: 'red',
};

const STATUS_FILTERS = ['all', 'prospect', 'customer', 'cold', 'churned'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function ContactsScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const params: Record<string, string> = { per_page: '100' };
  if (search) params['search'] = search;
  if (statusFilter !== 'all') params['status'] = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, statusFilter],
    queryFn: () => listContacts(token, params),
    enabled: !!token,
  });

  const contacts: Contact[] = data?.data ?? [];

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerMid}>
            <Text style={styles.headerEyebrow}>
              {contacts.length} {statusFilter === 'all' ? 'people' : statusFilter}
            </Text>
            <Text style={styles.headerTitle}>Contacts</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={15} color={Colors.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people, companies…"
            placeholderTextColor={Colors.text3}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color={Colors.text3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status filter */}
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(s)}
              style={[styles.chip, statusFilter === s && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.text3} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.row, index < contacts.length - 1 && styles.rowBorder]}
              onPress={() => router.push(`/(app)/contacts/${item.id}`)}
              activeOpacity={0.7}
            >
              <Avatar name={item.name} size={38} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowEmail} numberOfLines={1}>{item.email}</Text>
              </View>
              <Badge label={item.status} color={STATUS_BADGE[item.status] ?? 'gray'} />
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

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Font.sans,
    fontSize: 14,
    color: Colors.text,
    padding: 0,
  },

  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { fontFamily: Font.sansMd, fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: Colors.surface },

  list: {
    margin: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: Font.sansMd, fontSize: 14, color: Colors.text },
  rowEmail: { fontFamily: Font.sans, fontSize: 12, color: Colors.text3, marginTop: 1 },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 48,
    padding: 16,
  },
});
