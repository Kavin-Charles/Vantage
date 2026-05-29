// apps/mobile/app/(app)/more/index.tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMe, listAlerts } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';

type NavRow = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
};

function ListRow({
  icon, iconBg, title, subtitle, badge, badgeColor, onPress, last,
}: NavRow & { last?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={Colors.text2} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={[styles.badgeChip, { backgroundColor: badgeColor === 'red' ? Colors.redBg : Colors.amberBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor === 'red' ? Colors.red : Colors.amber }]}>
            {badge}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={Colors.text3} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(token),
    enabled: !!token,
  });

  const { data: alertData } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });

  const user = meData?.data.user;
  const workspace = meData?.data.workspace;
  const activeAlerts = alertData?.data ?? [];
  const criticals = activeAlerts.filter((a: any) => a.severity === 'critical').length;
  const totalActive = activeAlerts.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* User card */}
        <TouchableOpacity
          style={styles.userCard}
          onPress={() => router.push('/(app)/settings')}
          activeOpacity={0.8}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {user?.name ? user.name.trim().split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '??'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name ?? 'Loading…'}</Text>
            <Text style={styles.userRole}>
              {user?.role ?? ''}{workspace?.name ? ` · ${workspace.name}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.text3} />
        </TouchableOpacity>

        {/* CRM */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>CRM</Text>
          <View style={styles.listGroup}>
            <ListRow
              icon="people-outline"
              iconBg={Colors.blueBg}
              title="Contacts"
              subtitle={workspace?.contact_count != null ? `${workspace.contact_count} people` : undefined}
              onPress={() => router.push('/(app)/contacts')}
            />
            <ListRow
              icon="checkmark-circle-outline"
              iconBg={Colors.amberBg}
              title="Tasks"
              onPress={() => router.push('/(app)/tasks')}
            />
            <ListRow
              icon="briefcase-outline"
              iconBg={Colors.purpleBg}
              title="Pipeline"
              onPress={() => router.push('/(app)/pipeline')}
              last
            />
          </View>
        </View>

        {/* Infrastructure */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>INFRASTRUCTURE</Text>
          <View style={styles.listGroup}>
            <ListRow
              icon="warning-outline"
              iconBg={Colors.redBg}
              title="Alerts"
              subtitle={totalActive > 0 ? `${totalActive} active` : 'No active alerts'}
              badge={criticals > 0 ? String(criticals) : undefined}
              badgeColor="red"
              onPress={() => router.push('/(app)/alerts')}
              last
            />
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <View style={styles.listGroup}>
            <ListRow
              icon="settings-outline"
              iconBg={Colors.surface2}
              title="Settings"
              subtitle="Profile, notifications"
              onPress={() => router.push('/(app)/settings')}
              last
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerApp}>VANTAGE</Text>
          <Text style={styles.footerVersion}>mobile build</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
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
    paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: Font.display,
    fontSize: 26,
    color: Colors.text,
    lineHeight: 30,
  },

  body: { paddingTop: 16, paddingHorizontal: 16 },

  userCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.blueBg,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: {
    fontFamily: Font.sansSemi,
    fontSize: 15,
    color: Colors.blue,
  },
  userInfo: { flex: 1 },
  userName: {
    fontFamily: Font.sansSemi,
    fontSize: 15,
    color: Colors.text,
  },
  userRole: {
    fontFamily: Font.sans,
    fontSize: 12,
    color: Colors.text3,
    marginTop: 2,
    textTransform: 'capitalize',
  },

  section: { marginBottom: 20 },
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

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  rowIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowInfo: { flex: 1 },
  rowTitle: {
    fontFamily: Font.sansMd,
    fontSize: 14,
    color: Colors.text,
  },
  rowSubtitle: {
    fontFamily: Font.sans,
    fontSize: 12,
    color: Colors.text3,
    marginTop: 1,
  },
  badgeChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 2,
  },
  badgeText: {
    fontFamily: Font.sansSemi,
    fontSize: 11,
  },

  footer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  footerApp: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  footerVersion: {
    fontFamily: Font.mono,
    fontSize: 11,
    color: Colors.text3,
  },
});
