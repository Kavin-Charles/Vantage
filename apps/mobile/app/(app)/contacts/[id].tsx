// apps/mobile/app/(app)/contacts/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { getContact, listActivity, createActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { ContactStatus } from '@vantage/types';

const STATUS_VARIANT: Record<ContactStatus, 'green' | 'amber' | 'grey' | 'red'> = {
  customer: 'green', prospect: 'amber', cold: 'grey', churned: 'red',
};

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const isOffline = useOffline();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => getContact(token, id),
    enabled: !!token && !!id,
  });

  const { data: actData } = useQuery({
    queryKey: ['activity', 'contact', id],
    queryFn: () => listActivity(token, { contact_id: id, limit: 10 }),
    enabled: !!token && !!id,
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) =>
      createActivity(token, { type: 'note', body, contact_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity', 'contact', id] });
      Toast.show({ type: 'success', text1: 'Note added' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add note' }),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  const contact = data?.data;
  if (!contact) {
    return <View style={styles.center}><Text style={styles.empty}>Not found</Text></View>;
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
          <Text style={styles.name}>{contact.name}</Text>
          <StatusBadge label={contact.status} variant={STATUS_VARIANT[contact.status]} />
          <View style={styles.infoRow}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.val}>{contact.email}</Text>
          </View>
          {contact.phone && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.val}>{contact.phone}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.actionRow}>
          {(['note', 'call', 'email'] as const).map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.actionBtn, isOffline && styles.actionBtnDisabled]}
              disabled={isOffline}
              onPress={() => {
                if (type === 'note') {
                  Alert.prompt('Add Note', 'Enter a note:', text => {
                    if (text?.trim()) noteMutation.mutate(text.trim());
                  });
                }
              }}
            >
              <Text style={[styles.actionBtnText, isOffline && { color: Colors.text3 }]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
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
      <Toast />
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
  back:     { color: Colors.green, fontSize: 15 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16, gap: 8,
  },
  name:      { fontSize: 22, color: Colors.text, fontWeight: '600', marginBottom: 4 },
  infoRow:   { flexDirection: 'row', gap: 8, marginTop: 8 },
  label:     { fontSize: 13, color: Colors.text2, width: 56 },
  val:       { fontSize: 13, color: Colors.text, flex: 1 },
  sectionTitle: { fontSize: 13, color: Colors.text2, fontWeight: '600', marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText:     { color: Colors.text, fontSize: 13, fontWeight: '500' },
  actItem: {
    backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 8,
  },
  actType: { fontSize: 12, color: Colors.text3, textTransform: 'capitalize', marginBottom: 4 },
  actBody: { fontSize: 14, color: Colors.text },
  actDate: { fontSize: 12, color: Colors.text3, marginTop: 4 },
  empty:   { color: Colors.text3 },
});