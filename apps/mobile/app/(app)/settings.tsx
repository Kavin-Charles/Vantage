import { useState } from 'react';
import {
  View, Text, Switch, TouchableOpacity, ScrollView,
  StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { getMe, updatePushPreferences, unregisterPushToken } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { deleteAuthToken, getPushToken, deletePushToken } from '@/lib/secureStore';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';

interface PushPrefs {
  alerts_critical: boolean;
  alerts_warning: boolean;
  tasks_due: boolean;
  deals_assigned: boolean;
  contacts_assigned: boolean;
}

const DEFAULT_PREFS: PushPrefs = {
  alerts_critical: true,
  alerts_warning: true,
  tasks_due: true,
  deals_assigned: true,
  contacts_assigned: true,
};

const PREF_LABELS: Record<keyof PushPrefs, string> = {
  alerts_critical:   'Critical alerts',
  alerts_warning:    'Warning alerts',
  tasks_due:         'Tasks due today',
  deals_assigned:    'Deals assigned to me',
  contacts_assigned: 'Contacts assigned to me',
};

export default function SettingsScreen() {
  const token = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);

  const { data: meData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(token),
    enabled: !!token,
  });

  const prefsMutation = useMutation({
    mutationFn: (p: PushPrefs) => updatePushPreferences(token, p),
    onError: () => Toast.show({ type: 'error', text1: 'Failed to save preferences' }),
  });

  async function handleToggle(key: keyof PushPrefs, val: boolean) {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    prefsMutation.mutate(next);
  }

  async function handleLogout() {
    try {
      const pushToken = await getPushToken();
      if (pushToken) {
        await unregisterPushToken(token, pushToken);
        await deletePushToken();
      }
    } catch { /* ignore push cleanup failures */ }
    await deleteAuthToken();
    qc.clear();
    router.replace('/(auth)/login');
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  const workspace = meData?.data.workspace;

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>

        {/* Workspace branding */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workspace</Text>
          <View style={styles.workspaceRow}>
            {workspace?.logo_url ? (
              <Image source={{ uri: workspace.logo_url }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Text style={styles.logoChar}>
                  {workspace?.name?.charAt(0) ?? 'V'}
                </Text>
              </View>
            )}
            <View>
              <Text style={styles.workspaceName}>{workspace?.name ?? '—'}</Text>
              <Text style={styles.workspacePlan}>{workspace?.plan ?? ''}</Text>
            </View>
          </View>
        </View>

        {/* Push notification preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>
          {(Object.keys(prefs) as (keyof PushPrefs)[]).map((key, i) => (
            <View key={key} style={[styles.prefRow, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={styles.prefLabel}>{PREF_LABELS[key]}</Text>
              <Switch
                value={prefs[key]}
                onValueChange={val => handleToggle(key, val)}
                trackColor={{ true: Colors.green, false: Colors.border }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
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
  back:  { color: Colors.green, fontSize: 15, marginBottom: 8 },
  title: { fontSize: 22, color: Colors.text, fontWeight: '600' },
  section: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16,
  },
  sectionTitle:  { fontSize: 13, color: Colors.text2, fontWeight: '600', marginBottom: 12 },
  workspaceRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo:          { width: 48, height: 48, borderRadius: 8 },
  logoPlaceholder: { backgroundColor: Colors.greenBg, alignItems: 'center', justifyContent: 'center' },
  logoChar:      { color: Colors.green, fontSize: 20, fontWeight: '600' },
  workspaceName: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  workspacePlan: { fontSize: 12, color: Colors.text3, textTransform: 'capitalize', marginTop: 2 },
  prefRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  prefLabel: { fontSize: 14, color: Colors.text, flex: 1 },
  logoutBtn: {
    backgroundColor: Colors.redBg, borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.red,
  },
  logoutText: { color: Colors.red, fontSize: 15, fontWeight: '600' },
});
