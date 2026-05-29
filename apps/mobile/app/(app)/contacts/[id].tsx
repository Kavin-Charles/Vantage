// apps/mobile/app/(app)/contacts/[id].tsx
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { getContact, listActivity, createActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';
import type { ActivityType } from '@vantage/types';

const STATUS_BADGE: Record<string, string> = {
  customer: 'green', prospect: 'blue', cold: 'gray', churned: 'red',
};

const ACT_ICON: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  email: 'mail-outline', call: 'call-outline', note: 'document-text-outline',
  meeting: 'people-outline', deal_change: 'briefcase-outline', infra_alert: 'warning-outline',
};

type LogType = 'note' | 'call' | 'email';

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const isOffline = useOffline();
  const router = useRouter();
  const qc = useQueryClient();

  const [logSheet, setLogSheet] = useState<LogType | null>(null);
  const [logText, setLogText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => getContact(token, id),
    enabled: !!token && !!id,
  });

  const { data: actData } = useQuery({
    queryKey: ['activity', 'contact', id],
    queryFn: () => listActivity(token, { contact_id: id, limit: 15 }),
    enabled: !!token && !!id,
  });

  const logMutation = useMutation({
    mutationFn: ({ type, body }: { type: LogType; body: string }) =>
      createActivity(token, { type, body, contact_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity', 'contact', id] });
      void qc.invalidateQueries({ queryKey: ['activity', 'full'] });
      setLogSheet(null);
      setLogText('');
      Toast.show({ type: 'success', text1: 'Activity logged' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to log activity' }),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.text3} /></View>;
  }

  const contact = data?.data;
  if (!contact) {
    return <View style={styles.center}><Text style={styles.empty}>Not found</Text></View>;
  }

  function openLog(type: LogType) {
    if (isOffline) { Alert.alert('Offline', 'Cannot log while offline'); return; }
    setLogText('');
    setLogSheet(type);
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />

      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
          <Text style={styles.backText}>Contacts</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Avatar name={contact.name} size={44} />
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{contact.name}</Text>
              <Badge label={contact.status} color={STATUS_BADGE[contact.status] ?? 'gray'} />
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openLog('call')} activeOpacity={0.7}>
              <Ionicons name="call-outline" size={16} color={Colors.text2} />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openLog('email')} activeOpacity={0.7}>
              <Ionicons name="mail-outline" size={16} color={Colors.text2} />
              <Text style={styles.actionText}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnAccent]}
              onPress={() => openLog('note')}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={16} color={Colors.surface} />
              <Text style={[styles.actionText, { color: Colors.surface }]}>Log</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact info */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>CONTACT INFO</Text>
          <View style={styles.listGroup}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoVal} numberOfLines={1}>{contact.email}</Text>
            </View>
            {contact.phone && (
              <View style={[styles.infoRow, styles.rowBorder]}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoVal}>{contact.phone}</Text>
              </View>
            )}
            {contact.last_contacted_at && (
              <View style={[styles.infoRow, styles.rowBorder]}>
                <Text style={styles.infoLabel}>Last contact</Text>
                <Text style={styles.infoVal}>
                  {new Date(contact.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Activity */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>ACTIVITY</Text>
          {(actData?.data ?? []).length === 0 ? (
            <Text style={styles.emptyInline}>No activity yet</Text>
          ) : (
            <View style={styles.listGroup}>
              {(actData?.data ?? []).map((a, i, arr) => (
                <View key={a.id} style={[styles.actRow, i < arr.length - 1 && styles.rowBorder]}>
                  <View style={styles.actIcon}>
                    <Ionicons
                      name={ACT_ICON[a.type] ?? 'ellipse-outline'}
                      size={13}
                      color={Colors.text3}
                    />
                  </View>
                  <View style={styles.actInfo}>
                    <Text style={styles.actType}>{a.type.replace('_', ' ')}</Text>
                    {a.body ? <Text style={styles.actBody} numberOfLines={2}>{a.body}</Text> : null}
                  </View>
                  <Text style={styles.actDate}>
                    {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Log activity sheet */}
      <Modal visible={!!logSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLogSheet(null)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              Log {logSheet?.charAt(0).toUpperCase()}{logSheet?.slice(1)}
            </Text>
            <TouchableOpacity onPress={() => setLogSheet(null)}>
              <Ionicons name="close" size={20} color={Colors.text2} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.sheetInput}
            placeholder={logSheet === 'note' ? 'Enter note…' : `Notes about this ${logSheet}…`}
            placeholderTextColor={Colors.text3}
            value={logText}
            onChangeText={setLogText}
            multiline
            autoFocus
          />
          <TouchableOpacity
            style={[styles.sheetBtn, (!logText.trim() || logMutation.isPending) && styles.sheetBtnDisabled]}
            disabled={!logText.trim() || logMutation.isPending}
            onPress={() => logSheet && logMutation.mutate({ type: logSheet, body: logText.trim() })}
            activeOpacity={0.8}
          >
            <Text style={styles.sheetBtnText}>
              {logMutation.isPending ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Toast />
    </View>
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
    marginBottom: 16,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heroInfo: { flex: 1, gap: 6 },
  heroName: {
    fontFamily: Font.display,
    fontSize: 20,
    color: Colors.text,
  },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnAccent: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  actionText: {
    fontFamily: Font.sansMd,
    fontSize: 13,
    color: Colors.text2,
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
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  infoLabel: { fontFamily: Font.sans, fontSize: 13, color: Colors.text3, width: 88 },
  infoVal: { fontFamily: Font.sansMd, fontSize: 13, color: Colors.text, flex: 1, textAlign: 'right' },

  actRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  actIcon: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  actInfo: { flex: 1 },
  actType: {
    fontFamily: Font.sansMd, fontSize: 12,
    color: Colors.text2, textTransform: 'capitalize',
  },
  actBody: { fontFamily: Font.sans, fontSize: 12, color: Colors.text3, marginTop: 1 },
  actDate: { fontFamily: Font.sans, fontSize: 11, color: Colors.text3 },

  emptyInline: {
    fontFamily: Font.sans, fontSize: 13,
    color: Colors.text3, paddingVertical: 12,
  },
  empty: { fontFamily: Font.sans, fontSize: 13, color: Colors.text3 },

  // Sheet
  sheet: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 999,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: Font.display,
    fontSize: 18,
    color: Colors.text,
  },
  sheetInput: {
    fontFamily: Font.sans,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  sheetBtn: {
    backgroundColor: Colors.text,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetBtnDisabled: { opacity: 0.35 },
  sheetBtnText: {
    fontFamily: Font.sansSemi,
    fontSize: 15,
    color: Colors.surface,
  },
});
