# Companies Screen + Nav Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Companies list + detail screen to the mobile app and replace the Activity tab with Contacts in the bottom nav bar.

**Architecture:** Five files change — `_layout.tsx` (tab swap), `more/index.tsx` (add Companies + Activity rows), plus three new files under `companies/`. The detail screen reuses the list query cache (`['companies']`) so no separate `getCompany` endpoint is needed.

**Tech Stack:** Expo Router, React Native, TanStack Query, `@vantage/api-client`, Ionicons, project design tokens (`Colors`, `Font`).

---

## File Map

| Action | Path |
|---|---|
| Modify | `apps/mobile/app/(app)/_layout.tsx` |
| Modify | `apps/mobile/app/(app)/more/index.tsx` |
| Create | `apps/mobile/app/(app)/companies/_layout.tsx` |
| Create | `apps/mobile/app/(app)/companies/index.tsx` |
| Create | `apps/mobile/app/(app)/companies/[id].tsx` |

---

### Task 1: Create feature branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main
git checkout -b feat/mobile-companies-nav
```

---

### Task 2: Swap Activity → Contacts in tab bar

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx`

- [ ] **Step 1: Replace tab 3 and update hidden routes**

Replace the entire file with:

```tsx
// apps/mobile/app/(app)/_layout.tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useApiToken } from '@/hooks/useApiToken';
import { usePushRegistration } from '@/hooks/usePushRegistration';

export default function AppLayout() {
  const token = useApiToken();
  usePushRegistration(token);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: Colors.text3,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'IBMPlexSans_500Medium',
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pipeline"
        options={{
          title: 'Pipeline',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="servers"
        options={{
          title: 'Servers',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="server-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Hidden routes — accessible via More / deep links */}
      <Tabs.Screen name="activity"  options={{ href: null }} />
      <Tabs.Screen name="tasks"     options={{ href: null }} />
      <Tabs.Screen name="alerts"    options={{ href: null }} />
      <Tabs.Screen name="settings"  options={{ href: null }} />
      <Tabs.Screen name="companies" options={{ href: null }} />
    </Tabs>
  );
}
```

---

### Task 3: Create companies/_layout.tsx

**Files:**
- Create: `apps/mobile/app/(app)/companies/_layout.tsx`

- [ ] **Step 1: Create stack layout**

```tsx
import { Stack } from 'expo-router';
export default function CompaniesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

---

### Task 4: Create companies/index.tsx

**Files:**
- Create: `apps/mobile/app/(app)/companies/index.tsx`

- [ ] **Step 1: Create list screen**

```tsx
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
import type { Company } from '@vantage/types';

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
```

---

### Task 5: Create companies/[id].tsx

**Files:**
- Create: `apps/mobile/app/(app)/companies/[id].tsx`

- [ ] **Step 1: Create detail screen**

```tsx
// apps/mobile/app/(app)/companies/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking,
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
    void Linking.openURL(url);
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
```

---

### Task 6: Update More menu

**Files:**
- Modify: `apps/mobile/app/(app)/more/index.tsx`

- [ ] **Step 1: Add Companies row to CRM section + restore Activity row**

Find the CRM section in `more/index.tsx`. Replace the `<View style={styles.listGroup}>` block inside the `{/* CRM */}` section with:

```tsx
<View style={styles.listGroup}>
  <ListRow
    icon="people-outline"
    iconBg={Colors.blueBg}
    title="Contacts"
    subtitle={workspace?.contact_count != null ? `${workspace.contact_count} people` : undefined}
    onPress={() => router.push('/(app)/contacts')}
  />
  <ListRow
    icon="business-outline"
    iconBg={Colors.purpleBg}
    title="Companies"
    onPress={() => router.push('/(app)/companies')}
  />
  <ListRow
    icon="checkmark-circle-outline"
    iconBg={Colors.amberBg}
    title="Tasks"
    onPress={() => router.push('/(app)/tasks')}
  />
  <ListRow
    icon="trending-up-outline"
    iconBg={Colors.purpleBg}
    title="Pipeline"
    onPress={() => router.push('/(app)/pipeline')}
  />
  <ListRow
    icon="flash-outline"
    iconBg={Colors.grayBg}
    title="Activity"
    onPress={() => router.push('/(app)/activity')}
    last
  />
</View>
```

---

### Task 7: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add apps/mobile/app/(app)/_layout.tsx \
        apps/mobile/app/(app)/more/index.tsx \
        apps/mobile/app/(app)/companies/_layout.tsx \
        apps/mobile/app/(app)/companies/index.tsx \
        "apps/mobile/app/(app)/companies/[id].tsx" \
        docs/superpowers/specs/2026-05-29-companies-nav-design.md \
        docs/superpowers/plans/2026-05-29-companies-nav.md

git commit -m "feat(mobile): add companies screens, swap activity→contacts tab"
```
