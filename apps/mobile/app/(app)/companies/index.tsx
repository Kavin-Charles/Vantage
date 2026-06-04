// apps/mobile/app/(app)/companies/index.tsx
import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listCompanies } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { Company } from '@vencore/types';

export default function CompaniesScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => listCompanies(token),
    enabled: !!token,
  });

  const companies: Company[] = useMemo(() => {
    const all = data?.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.industry ?? '').toLowerCase().includes(q) ||
      (c.location ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

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
              {companies.length} {companies.length === 1 ? 'company' : 'companies'}
            </Text>
            <Text style={styles.headerTitle}>Companies</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={15} color={Colors.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search companies…"
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
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={Colors.text3} />
      ) : (
        <FlatList
          data={companies}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.row, index < companies.length - 1 && styles.rowBorder]}
              onPress={() => router.push(`/(app)/companies/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="business-outline" size={16} color={Colors.text2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.location ? (
                  <Text style={styles.rowSub} numberOfLines={1}>{item.location}</Text>
                ) : null}
              </View>
              {item.industry ? (
                <Badge label={item.industry} color="purple" />
              ) : null}
              <Ionicons name="chevron-forward" size={14} color={Colors.text3} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? 'No results' : 'No companies yet'}
            </Text>
          }
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
  },
  searchInput: {
    flex: 1,
    fontFamily: Font.sans,
    fontSize: 14,
    color: Colors.text,
    padding: 0,
  },

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
    gap: 10,
    padding: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: Colors.purpleBg,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: Font.sansMd, fontSize: 14, color: Colors.text },
  rowSub: { fontFamily: Font.sans, fontSize: 12, color: Colors.text3, marginTop: 1 },

  empty: {
    fontFamily: Font.sans,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    marginTop: 48,
    padding: 16,
  },
});
