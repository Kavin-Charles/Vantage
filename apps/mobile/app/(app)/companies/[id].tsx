// apps/mobile/app/(app)/companies/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listCompanies } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';

export default function CompanyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => listCompanies(token),
    enabled: !!token,
  });

  const company = (data?.data ?? []).find(c => c.id === id);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.text3} /></View>;
  }

  if (!company) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Company not found</Text>
      </View>
    );
  }

  function openWebsite() {
    if (!company?.website) return;
    const url = company.website.startsWith('http') ? company.website : `https://${company.website}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Cannot open URL', url);
    });
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
          <Text style={styles.backText}>Companies</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="business-outline" size={22} color={Colors.purple} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{company.name}</Text>
            {company.industry ? (
              <Badge label={company.industry} color="purple" />
            ) : null}
          </View>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>DETAILS</Text>
          <View style={styles.listGroup}>
            <InfoRow label="Location" value={company.location} />
            <InfoRow
              label="Website"
              value={company.website}
              onPress={company.website ? openWebsite : undefined}
              isLink
            />
            <InfoRow
              label="Employees"
              value={company.employee_count != null ? String(company.employee_count) : null}
              last
            />
          </View>
        </View>

        {/* Contacts shortcut */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>CONTACTS</Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/(app)/contacts')}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={16} color={Colors.text2} />
            <Text style={styles.linkText}>View all contacts</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.text3} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({
  label, value, onPress, isLink, last,
}: {
  label: string;
  value: string | null | undefined;
  onPress?: () => void;
  isLink?: boolean;
  last?: boolean;
}) {
  const display = value ?? '—';
  return (
    <TouchableOpacity
      style={[styles.infoRow, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoVal, isLink && value ? styles.infoLink : null]}
        numberOfLines={1}
      >
        {display}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  navbar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontFamily: Font.sansMd, fontSize: 15, color: Colors.text },

  body: { padding: 16, paddingTop: 12 },

  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  heroIcon: {
    width: 48, height: 48, borderRadius: 13,
    backgroundColor: Colors.purpleBg,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  heroInfo: { flex: 1, gap: 8 },
  heroName: {
    fontFamily: Font.display,
    fontSize: 20,
    color: Colors.text,
  },

  section: { marginBottom: 16 },
  eyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  listGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  infoLabel: { fontFamily: Font.sans, fontSize: 13, color: Colors.text3, width: 88 },
  infoVal: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text, flex: 1, textAlign: 'right' },
  infoLink: { color: Colors.blue },

  linkRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkText: { fontFamily: Font.sansMd, fontSize: 14, color: Colors.text },

  empty: { fontFamily: Font.sans, fontSize: 13, color: Colors.text3 },
});
