# Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CRM-first React Native / Expo mobile app (`apps/mobile`) with offline-first caching and push notifications.

**Architecture:** Expo managed workflow + Expo Router (file-based routing). Auth via existing `POST /api/auth/login` — JWT stored in `expo-secure-store`. All API calls through `@vantage/api-client` (configured via `EXPO_PUBLIC_API_URL`). TanStack Query v5 + AsyncStorage for offline-first caching. Push notifications via Expo Push Service.

**Tech Stack:** Expo ~51, Expo Router ~3.5, `@tanstack/react-query` v5, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-notifications`, `expo-secure-store`, `react-native-toast-message`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/middleware/auth.ts` | Modify | Accept `Authorization: Bearer <jwt>` alongside cookie |
| `apps/api/src/routes/auth.ts` | Modify | Include JWT token in login response body |
| `packages/api-client/src/me.ts` | Modify | Fix `unregisterPushToken` to send push token in DELETE body |
| `apps/mobile/package.json` | Create | Expo workspace manifest |
| `apps/mobile/app.json` | Create | Expo app config |
| `apps/mobile/eas.json` | Create | EAS build profiles |
| `apps/mobile/tsconfig.json` | Create | TypeScript config |
| `apps/mobile/.env` | Create | `EXPO_PUBLIC_API_URL` |
| `apps/mobile/constants/colors.ts` | Create | Design token colours matching web |
| `apps/mobile/lib/api.ts` | Create | Configure api-client + mobile-only helpers |
| `apps/mobile/lib/secureStore.ts` | Create | JWT + push token storage |
| `apps/mobile/lib/queryClient.ts` | Create | TanStack Query client + AsyncStorage persister |
| `apps/mobile/lib/logger.ts` | Create | Console wrapper |
| `apps/mobile/hooks/useOffline.ts` | Create | NetInfo connectivity hook |
| `apps/mobile/hooks/useApiToken.ts` | Create | JWT from SecureStore (reactive) |
| `apps/mobile/hooks/usePushRegistration.ts` | Create | Expo push token registration |
| `apps/mobile/components/OfflineBanner.tsx` | Create | Amber offline banner |
| `apps/mobile/components/StatusBadge.tsx` | Create | Reusable status chip |
| `apps/mobile/app/_layout.tsx` | Create | Root: providers + auth redirect |
| `apps/mobile/app/(auth)/_layout.tsx` | Create | Auth group layout |
| `apps/mobile/app/(auth)/login.tsx` | Create | Email + password login |
| `apps/mobile/app/(app)/_layout.tsx` | Create | Tab navigator (5 tabs) + push registration |
| `apps/mobile/app/(app)/index.tsx` | Create | Dashboard screen |
| `apps/mobile/app/(app)/contacts/index.tsx` | Create | Contacts list |
| `apps/mobile/app/(app)/contacts/[id].tsx` | Create | Contact detail |
| `apps/mobile/app/(app)/deals/index.tsx` | Create | Deals list |
| `apps/mobile/app/(app)/deals/[id].tsx` | Create | Deal detail |
| `apps/mobile/app/(app)/tasks/index.tsx` | Create | Tasks (Today / Upcoming / Done) |
| `apps/mobile/app/(app)/alerts/index.tsx` | Create | Alerts list |
| `apps/mobile/app/(app)/alerts/[id].tsx` | Create | Alert detail + ack/resolve |
| `apps/mobile/app/(app)/activity/index.tsx` | Create | Activity feed |
| `apps/mobile/app/(app)/settings.tsx` | Create | Workspace branding + push prefs + logout |

---

### Task 1: API prerequisites — Bearer auth + token in login body

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `packages/api-client/src/me.ts`

Mobile sends `Authorization: Bearer <jwt>` — the API currently only reads `req.cookies['vantage_token']`. Fix this (additive, doesn't break web). Also expose the JWT in the login response body so mobile can store it. Fix `unregisterPushToken` which currently sends no body (the DELETE endpoint requires the push token in body).

- [ ] **Step 1: Update `requireAuth` to accept Bearer header**

In `apps/api/src/middleware/auth.ts`, replace the `createRequireAuth` function body with:

```typescript
export function createRequireAuth(db: Kysely<Database>, jwtSecret: string) {
  return async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Prefer Authorization: Bearer for mobile; fall back to cookie for web
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.cookies['vantage_token'] as string | undefined);

    if (!token) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const user = await db
      .selectFrom('users')
      .where('id', '=', payload.sub)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const workspace = await db
      .selectFrom('workspaces')
      .where('id', '=', user.workspace_id)
      .selectAll()
      .executeTakeFirst();

    if (!workspace) {
      res.status(500).json({ data: null, error: { code: 'WORKSPACE_NOT_FOUND' } });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).workspace = workspace;
    next();
  };
}
```

- [ ] **Step 2: Include JWT in login response body**

In `apps/api/src/routes/auth.ts`, in `router.post('/login', ...)`, after the `jwt.sign(...)` call, replace:

```typescript
res.json({ data: { id: user.id, name: user.name, email: user.email, role: user.role }, error: null });
```

With (the cookie is still set; `token` is additive for mobile):

```typescript
res.json({ data: { id: user.id, name: user.name, email: user.email, role: user.role, token }, error: null });
```

- [ ] **Step 3: Fix `unregisterPushToken` in api-client**

In `packages/api-client/src/me.ts`, replace:

```typescript
export async function unregisterPushToken(
  token: string,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', { method: 'DELETE', token });
}
```

With:

```typescript
export async function unregisterPushToken(
  token: string,
  pushToken: string,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', {
    method: 'DELETE',
    body: JSON.stringify({ token: pushToken }),
    token,
  });
}
```

- [ ] **Step 4: Type-check API and rebuild api-client**

```bash
cd D:/Projects/Vantage/apps/api && pnpm exec tsc --noEmit
cd D:/Projects/Vantage/packages/api-client && pnpm build
```

Expected: no TypeScript errors, `packages/api-client/dist/` rebuilt.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/routes/auth.ts packages/api-client/src/me.ts packages/api-client/dist
git commit -m "feat(api): support Bearer token auth and expose JWT in login response"
```

---

### Task 2: Scaffold apps/mobile workspace

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/eas.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/.env`

Note: `pnpm-workspace.yaml` already has `apps/*` — no change needed.

- [ ] **Step 1: Create `apps/mobile/package.json`**

```json
{
  "name": "@vantage/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@expo/vector-icons": "^14.0.0",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@react-native-community/netinfo": "11.3.1",
    "@tanstack/query-async-storage-persister": "^5.51.0",
    "@tanstack/react-query": "^5.51.0",
    "@tanstack/react-query-persist-client": "^5.51.0",
    "@vantage/api-client": "workspace:*",
    "@vantage/types": "workspace:*",
    "expo": "~51.0.28",
    "expo-notifications": "~0.28.19",
    "expo-router": "~3.5.23",
    "expo-secure-store": "~13.0.2",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "react-native-safe-area-context": "4.10.5",
    "react-native-screens": "~3.31.1",
    "react-native-toast-message": "^2.2.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.2.0",
    "typescript": "~5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/mobile/app.json`**

```json
{
  "expo": {
    "name": "Vantage",
    "slug": "vantage",
    "version": "1.0.0",
    "scheme": "vantage",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#f7f6f2"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.vantage.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#f7f6f2"
      },
      "package": "com.vantage.app"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#2d6a4f"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

Note: `./assets/` images are required for native builds. For development with Expo Go, placeholder PNGs work fine. Create `apps/mobile/assets/` and add any placeholder 1024×1024 PNG as `icon.png`, `splash.png`, `adaptive-icon.png`, and `notification-icon.png`.

- [ ] **Step 3: Create `apps/mobile/eas.json`**

```json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": { "distribution": "store" },
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

- [ ] **Step 4: Create `apps/mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 5: Create `apps/mobile/.env`**

```
EXPO_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 6: Install dependencies**

```bash
cd D:/Projects/Vantage && pnpm install
```

Expected: `@vantage/mobile` workspace linked, all packages installed.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/eas.json apps/mobile/tsconfig.json apps/mobile/.env
git commit -m "feat(mobile): scaffold apps/mobile Expo workspace"
```

---

### Task 3: Core utilities — colors, API config, SecureStore, QueryClient

**Files:**
- Create: `apps/mobile/constants/colors.ts`
- Create: `apps/mobile/lib/api.ts`
- Create: `apps/mobile/lib/secureStore.ts`
- Create: `apps/mobile/lib/queryClient.ts`
- Create: `apps/mobile/lib/logger.ts`

- [ ] **Step 1: Create `apps/mobile/constants/colors.ts`**

```typescript
// apps/mobile/constants/colors.ts
// Matches Vantage web design tokens exactly.
export const Colors = {
  bg: '#f7f6f2',
  surface: '#ffffff',
  surface2: '#f0ede6',
  border: '#e4e0d8',
  text: '#1a1814',
  text2: '#6b665c',
  text3: '#9e998f',
  green: '#2d6a4f',
  greenBg: '#d8f3dc',
  amber: '#92400e',
  amberBg: '#fef3c7',
  red: '#991b1b',
  redBg: '#fee2e2',
  blue: '#1e3a8a',
  blueBg: '#dbeafe',
} as const;
```

- [ ] **Step 2: Create `apps/mobile/lib/api.ts`**

Call `configure` at module load time. Export everything from api-client plus a mobile-specific `fetchAllDeals` (the shared `listDeals` requires a `pipelineId` arg; mobile shows a flat list without it).

```typescript
// apps/mobile/lib/api.ts
import { configure, apiFetch } from '@vantage/api-client';
import type { Deal } from '@vantage/types';

configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001');

export * from '@vantage/api-client';

/**
 * Fetch all deals as a flat list without requiring a pipeline_id.
 * Returns at most 200 deals.
 */
export async function fetchAllDeals(token: string): Promise<{ data: Deal[] }> {
  return apiFetch<{ data: Deal[] }>('/api/deals?per_page=200', { token });
}
```

- [ ] **Step 3: Create `apps/mobile/lib/secureStore.ts`**

```typescript
// apps/mobile/lib/secureStore.ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'vantage_token';
const PUSH_TOKEN_KEY = 'vantage_push_token';

export async function storeAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function deleteAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function storePushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

export async function getPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

export async function deletePushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
```

- [ ] **Step 4: Create `apps/mobile/lib/queryClient.ts`**

```typescript
// apps/mobile/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000,  // 24h — survive app restarts
      staleTime: 5 * 60 * 1000,     // 5 min — background refetch
      networkMode: 'offlineFirst',  // serve cache immediately
      retry: 3,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'VANTAGE_QUERY_CACHE',
});
```

- [ ] **Step 5: Create `apps/mobile/lib/logger.ts`**

```typescript
// apps/mobile/lib/logger.ts
export const logger = {
  info:  (...args: unknown[]) => console.log('[vantage]', ...args),
  warn:  (...args: unknown[]) => console.warn('[vantage]', ...args),
  error: (...args: unknown[]) => console.error('[vantage]', ...args),
};
```

- [ ] **Step 6: Type-check**

```bash
cd D:/Projects/Vantage/apps/mobile && npx tsc --noEmit
```

Expected: no errors (Expo + RN types resolve via `expo/tsconfig.base`).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/constants/ apps/mobile/lib/
git commit -m "feat(mobile): add core utilities (colors, api config, secureStore, queryClient)"
```

---

### Task 4: Hooks + shared components

**Files:**
- Create: `apps/mobile/hooks/useOffline.ts`
- Create: `apps/mobile/hooks/useApiToken.ts`
- Create: `apps/mobile/components/OfflineBanner.tsx`
- Create: `apps/mobile/components/StatusBadge.tsx`

- [ ] **Step 1: Create `apps/mobile/hooks/useOffline.ts`**

```typescript
// apps/mobile/hooks/useOffline.ts
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    });
    return unsubscribe;
  }, []);

  return isOffline;
}
```

- [ ] **Step 2: Create `apps/mobile/hooks/useApiToken.ts`**

Reads the auth JWT from SecureStore into React state on mount.

```typescript
// apps/mobile/hooks/useApiToken.ts
import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/secureStore';

export function useApiToken(): string {
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    const t = await getAuthToken();
    setToken(t ?? '');
  }, []);

  useEffect(() => { void load(); }, [load]);

  return token;
}
```

- [ ] **Step 3: Create `apps/mobile/components/OfflineBanner.tsx`**

```typescript
// apps/mobile/components/OfflineBanner.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { useOffline } from '@/hooks/useOffline';

export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        You're offline — viewing cached data. Connect to make changes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.amberBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: Colors.amber,
    fontSize: 13,
    textAlign: 'center',
  },
});
```

- [ ] **Step 4: Create `apps/mobile/components/StatusBadge.tsx`**

```typescript
// apps/mobile/components/StatusBadge.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

type Variant = 'green' | 'amber' | 'red' | 'blue' | 'grey';

const VARIANT_STYLES: Record<Variant, { bg: string; fg: string }> = {
  green: { bg: Colors.greenBg, fg: Colors.green },
  amber: { bg: Colors.amberBg, fg: Colors.amber },
  red:   { bg: Colors.redBg,   fg: Colors.red },
  blue:  { bg: Colors.blueBg,  fg: Colors.blue },
  grey:  { bg: Colors.surface2, fg: Colors.text2 },
};

interface Props {
  label: string;
  variant?: Variant;
}

export function StatusBadge({ label, variant = 'grey' }: Props) {
  const { bg, fg } = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/ apps/mobile/components/
git commit -m "feat(mobile): add offline hook, useApiToken, OfflineBanner, StatusBadge"
```

---

### Task 5: Push notification hook

**Files:**
- Create: `apps/mobile/hooks/usePushRegistration.ts`

- [ ] **Step 1: Create `apps/mobile/hooks/usePushRegistration.ts`**

```typescript
// apps/mobile/hooks/usePushRegistration.ts
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '@/lib/api';
import { storePushToken } from '@/lib/secureStore';
import { logger } from '@/lib/logger';

/**
 * Call inside the authenticated app layout with the current auth token.
 * Requests notification permission, gets Expo push token, stores it in
 * SecureStore, and POSTs it to the API. Silently skips if permission denied.
 */
export function usePushRegistration(authToken: string): void {
  useEffect(() => {
    if (!authToken) return;

    void (async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return; // silently skip

        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';

        await storePushToken(expoPushToken);
        await registerPushToken(authToken, expoPushToken, platform);
      } catch (err) {
        // Push registration failures must never crash the app
        logger.warn('[usePushRegistration] error:', err);
      }
    })();
  }, [authToken]);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/hooks/usePushRegistration.ts
git commit -m "feat(mobile): add push notification registration hook"
```

---

### Task 6: Root layout + login screen

**Files:**
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(auth)/_layout.tsx`
- Create: `apps/mobile/app/(auth)/login.tsx`

- [ ] **Step 1: Create `apps/mobile/app/_layout.tsx`**

Wraps everything with `PersistQueryClientProvider`. Reads auth token on startup and redirects to `(auth)` or `(app)`.

```typescript
// apps/mobile/app/_layout.tsx
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import { getAuthToken } from '@/lib/secureStore';

export default function RootLayout() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void getAuthToken().then(setToken);
  }, []);

  useEffect(() => {
    if (token === undefined) return; // still loading
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [token, segments, router]);

  if (token === undefined) return null; // show nothing while loading token

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </PersistQueryClientProvider>
  );
}
```

- [ ] **Step 2: Create `apps/mobile/app/(auth)/_layout.tsx`**

```typescript
// apps/mobile/app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Create `apps/mobile/app/(auth)/login.tsx`**

```typescript
// apps/mobile/app/(auth)/login.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { storeAuthToken } from '@/lib/secureStore';

interface LoginData {
  id: string;
  name: string;
  email: string;
  role: string;
  token: string;
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as {
        data: LoginData | null;
        error: { code: string } | null;
      };

      if (!res.ok || json.error || !json.data?.token) {
        setError('Invalid email or password.');
        return;
      }

      await storeAuthToken(json.data.token);
      router.replace('/(app)');
    } catch {
      setError('Could not connect to server. Check your network.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Vantage</Text>
        <Text style={styles.subtitle}>Sign in to your workspace</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.text3}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign in</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 28,
    color: Colors.text,
    marginBottom: 4,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text2,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginBottom: 12,
  },
  error: {
    color: Colors.red,
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    backgroundColor: Colors.green,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/app/(auth)/
git commit -m "feat(mobile): add root layout, auth layout, and login screen"
```

---

### Task 7: Tab navigator + Dashboard screen

**Files:**
- Create: `apps/mobile/app/(app)/_layout.tsx`
- Create: `apps/mobile/app/(app)/index.tsx`

- [ ] **Step 1: Create `apps/mobile/app/(app)/_layout.tsx`**

Tab navigator with 5 tabs. Registers push token after auth resolves.

```typescript
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
        tabBarActiveTintColor: Colors.green,
        tabBarInactiveTintColor: Colors.text3,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: 'Deals',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden non-tab routes */}
      <Tabs.Screen name="activity/index" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create `apps/mobile/app/(app)/index.tsx`**

Dashboard: unresolved alert counts, top 3 alerts, link to full activity. Settings gear in header.

```typescript
// apps/mobile/app/(app)/index.tsx
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listAlerts, getMe } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { Alert } from '@vantage/types';

function sevVariant(s: Alert['severity']): 'red' | 'amber' | 'blue' {
  if (s === 'critical') return 'red';
  if (s === 'warning') return 'amber';
  return 'blue';
}

export default function DashboardScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(token),
    enabled: !!token,
  });

  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });

  const alerts  = alertsData?.data ?? [];
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning  = alerts.filter(a => a.severity === 'warning').length;
  const top3     = alerts.slice(0, 3);

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <View>
          <Text style={styles.workspaceName}>
            {meData?.data.workspace.name ?? 'Vantage'}
          </Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
          <Ionicons name="settings-outline" size={22} color={Colors.text2} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderColor: Colors.redBg }]}>
          <Text style={[styles.statCount, { color: Colors.red }]}>{critical}</Text>
          <Text style={styles.statLabel}>Critical</Text>
        </View>
        <View style={[styles.statCard, { borderColor: Colors.amberBg }]}>
          <Text style={[styles.statCount, { color: Colors.amber }]}>{warning}</Text>
          <Text style={styles.statLabel}>Warning</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Alerts</Text>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={top3}
          keyExtractor={a => a.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.alertRow}
              onPress={() => router.push(`/(app)/alerts/${item.id}`)}
            >
              <StatusBadge label={item.severity} variant={sevVariant(item.severity)} />
              <Text style={styles.alertMsg} numberOfLines={1}>{item.message}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No active alerts</Text>
          }
          scrollEnabled={false}
        />
      )}

      <TouchableOpacity
        style={styles.activityLink}
        onPress={() => router.push('/(app)/activity')}
      >
        <Text style={styles.activityLinkText}>View all activity →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  workspaceName: { fontSize: 12, color: Colors.text3, marginBottom: 2 },
  headerTitle:   { fontSize: 22, color: Colors.text, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, margin: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, padding: 16, alignItems: 'center',
  },
  statCount: { fontSize: 32, fontWeight: '700' },
  statLabel: { fontSize: 12, color: Colors.text2, marginTop: 2 },
  sectionTitle: {
    fontSize: 13, color: Colors.text2, fontWeight: '600',
    marginHorizontal: 16, marginBottom: 8,
  },
  alertRow: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 8, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  alertMsg:    { fontSize: 14, color: Colors.text },
  empty:       { color: Colors.text3, textAlign: 'center', marginTop: 16 },
  activityLink: { margin: 16 },
  activityLinkText: { color: Colors.green, fontSize: 14 },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/_layout.tsx apps/mobile/app/(app)/index.tsx
git commit -m "feat(mobile): add tab navigator and dashboard screen"
```

---

### Task 8: Contacts screens

**Files:**
- Create: `apps/mobile/app/(app)/contacts/index.tsx`
- Create: `apps/mobile/app/(app)/contacts/[id].tsx`

- [ ] **Step 1: Create `apps/mobile/app/(app)/contacts/index.tsx`**

```typescript
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
```

- [ ] **Step 2: Create `apps/mobile/app/(app)/contacts/[id].tsx`**

Contact detail: name, status, email, phone, activity timeline, action buttons (note/call/email — disabled offline).

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/contacts/
git commit -m "feat(mobile): add contacts list and detail screens"
```

---

### Task 9: Deals screens

**Files:**
- Create: `apps/mobile/app/(app)/deals/index.tsx`
- Create: `apps/mobile/app/(app)/deals/[id].tsx`

- [ ] **Step 1: Create `apps/mobile/app/(app)/deals/index.tsx`**

Flat list of all deals (uses `fetchAllDeals` from `lib/api.ts` which omits `pipeline_id`).

```typescript
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
```

- [ ] **Step 2: Create `apps/mobile/app/(app)/deals/[id].tsx`**

Deal detail: name, value, close date, probability, activity timeline.

```typescript
// apps/mobile/app/(app)/deals/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getDeal, listActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['deal', id],
    queryFn: () => getDeal(token, id),
    enabled: !!token && !!id,
  });

  const { data: actData } = useQuery({
    queryKey: ['activity', 'deal', id],
    queryFn: () => listActivity(token, { deal_id: id, limit: 10 }),
    enabled: !!token && !!id,
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  const deal = data?.data;
  if (!deal) {
    return <View style={styles.center}><Text style={styles.empty}>Deal not found</Text></View>;
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
          <Text style={styles.name}>{deal.name}</Text>
          <Text style={styles.value}>${deal.value.toLocaleString()}</Text>
          {deal.close_date && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Close date</Text>
              <Text style={styles.val}>{new Date(deal.close_date).toLocaleDateString()}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.label}>Probability</Text>
            <Text style={styles.val}>{deal.probability}%</Text>
          </View>
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
  back:  { color: Colors.green, fontSize: 15 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16,
  },
  name:  { fontSize: 22, color: Colors.text, fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 28, color: Colors.green, fontWeight: '700', marginBottom: 12 },
  infoRow:  { flexDirection: 'row', gap: 8, marginTop: 6 },
  label:    { fontSize: 13, color: Colors.text2, width: 80 },
  val:      { fontSize: 13, color: Colors.text, flex: 1 },
  sectionTitle: { fontSize: 13, color: Colors.text2, fontWeight: '600', marginBottom: 8 },
  actItem: {
    backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 8,
  },
  actType: { fontSize: 12, color: Colors.text3, textTransform: 'capitalize', marginBottom: 4 },
  actBody: { fontSize: 14, color: Colors.text },
  actDate: { fontSize: 12, color: Colors.text3, marginTop: 4 },
  empty:   { color: Colors.text3 },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/deals/
git commit -m "feat(mobile): add deals list and detail screens"
```

---

### Task 10: Tasks screen

**Files:**
- Create: `apps/mobile/app/(app)/tasks/index.tsx`

Tasks grouped into Today / Upcoming / No due date / Done. Tap ✓ to complete (disabled offline).

- [ ] **Step 1: Create `apps/mobile/app/(app)/tasks/index.tsx`**

```typescript
// apps/mobile/app/(app)/tasks/index.tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { listTasks, updateTask } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import type { Task } from '@vantage/types';

function isToday(d: Date | string | null): boolean {
  if (!d) return false;
  const date = new Date(d);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isUpcoming(d: Date | string | null): boolean {
  if (!d) return false;
  return new Date(d) > new Date() && !isToday(d);
}

export default function TasksScreen() {
  const token = useApiToken();
  const isOffline = useOffline();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => listTasks(token),
    enabled: !!token,
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => updateTask(token, taskId, { status: 'done' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tasks'] }); },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to complete task' }),
  });

  const tasks       = data?.data ?? [];
  const todayTasks    = tasks.filter(t => t.status === 'todo' && isToday(t.due_date));
  const upcomingTasks = tasks.filter(t => t.status === 'todo' && isUpcoming(t.due_date));
  const noDueTasks    = tasks.filter(t => t.status === 'todo' && !t.due_date);
  const doneTasks     = tasks.filter(t => t.status === 'done').slice(0, 20);

  function TaskRow({ item, showComplete }: { item: Task; showComplete: boolean }) {
    return (
      <View style={styles.taskRow}>
        <View style={styles.taskLeft}>
          <Text style={[styles.taskTitle, item.status === 'done' && styles.taskTitleDone]}>
            {item.title}
          </Text>
          {item.due_date && (
            <Text style={styles.dueDate}>
              Due: {new Date(item.due_date).toLocaleDateString()}
            </Text>
          )}
        </View>
        {showComplete && (
          <TouchableOpacity
            style={[styles.completeBtn, isOffline && styles.completeBtnDisabled]}
            disabled={isOffline || completeMutation.isPending}
            onPress={() => completeMutation.mutate(item.id)}
          >
            <Text style={styles.completeBtnText}>✓</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {todayTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Today</Text>
            {todayTasks.map(t => <TaskRow key={t.id} item={t} showComplete />)}
          </>
        )}
        {upcomingTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingTasks.map(t => <TaskRow key={t.id} item={t} showComplete />)}
          </>
        )}
        {noDueTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>No due date</Text>
            {noDueTasks.map(t => <TaskRow key={t.id} item={t} showComplete />)}
          </>
        )}
        {doneTasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Done</Text>
            {doneTasks.map(t => <TaskRow key={t.id} item={t} showComplete={false} />)}
          </>
        )}
        {tasks.length === 0 && <Text style={styles.empty}>No tasks</Text>}
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
  title:        { fontSize: 22, color: Colors.text, fontWeight: '600' },
  sectionTitle: { fontSize: 13, color: Colors.text2, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  taskRow: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  taskLeft:       { flex: 1, marginRight: 8 },
  taskTitle:      { fontSize: 14, color: Colors.text },
  taskTitleDone:  { textDecorationLine: 'line-through', color: Colors.text3 },
  dueDate:        { fontSize: 12, color: Colors.text3, marginTop: 2 },
  completeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.greenBg, alignItems: 'center', justifyContent: 'center',
  },
  completeBtnDisabled: { opacity: 0.4 },
  completeBtnText:     { color: Colors.green, fontSize: 16, fontWeight: '700' },
  empty: { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(app)/tasks/
git commit -m "feat(mobile): add tasks screen with Today/Upcoming/Done sections"
```

---

### Task 11: Alerts + Activity screens

**Files:**
- Create: `apps/mobile/app/(app)/alerts/index.tsx`
- Create: `apps/mobile/app/(app)/alerts/[id].tsx`
- Create: `apps/mobile/app/(app)/activity/index.tsx`

- [ ] **Step 1: Create `apps/mobile/app/(app)/alerts/index.tsx`**

```typescript
// apps/mobile/app/(app)/alerts/index.tsx
import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { listAlerts } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { Alert, AlertSeverity } from '@vantage/types';

const SEV_VARIANT: Record<AlertSeverity, 'red' | 'amber' | 'blue'> = {
  critical: 'red', warning: 'amber', info: 'blue',
};

export default function AlertsScreen() {
  const token = useApiToken();
  const router = useRouter();
  const [showResolved, setShowResolved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', showResolved],
    queryFn: () => listAlerts(token, { resolved: showResolved }),
    enabled: !!token,
  });

  const alerts = data?.data ?? [];

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <View style={styles.filterRow}>
          {([false, true] as const).map(resolved => (
            <TouchableOpacity
              key={String(resolved)}
              onPress={() => setShowResolved(resolved)}
              style={[styles.chip, showResolved === resolved && styles.chipActive]}
            >
              <Text style={[styles.chipText, showResolved === resolved && styles.chipTextActive]}>
                {resolved ? 'Resolved' : 'Active'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: Alert }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/(app)/alerts/${item.id}`)}
            >
              <View style={styles.rowTop}>
                <StatusBadge label={item.severity} variant={SEV_VARIANT[item.severity]} />
                <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.resource}>{item.resource_type}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No alerts</Text>}
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
  title:          { fontSize: 22, color: Colors.text, fontWeight: '600', marginBottom: 10 },
  filterRow:      { flexDirection: 'row', gap: 8 },
  chip:           { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  chipActive:     { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText:       { fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: '#fff' },
  row:       { backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  rowTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  date:      { fontSize: 12, color: Colors.text3 },
  message:   { fontSize: 14, color: Colors.text, marginBottom: 4 },
  resource:  { fontSize: 12, color: Colors.text3, textTransform: 'capitalize' },
  empty:     { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
```

- [ ] **Step 2: Create `apps/mobile/app/(app)/alerts/[id].tsx`**

Alert detail with acknowledge and resolve buttons (disabled offline).

```typescript
// apps/mobile/app/(app)/alerts/[id].tsx
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { listAlerts, acknowledgeAlert, resolveAlert } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { useOffline } from '@/hooks/useOffline';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Colors } from '@/constants/colors';
import type { AlertSeverity } from '@vantage/types';

const SEV_VARIANT: Record<AlertSeverity, 'red' | 'amber' | 'blue'> = {
  critical: 'red', warning: 'amber', info: 'blue',
};

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useApiToken();
  const isOffline = useOffline();
  const router = useRouter();
  const qc = useQueryClient();

  // Read from cached list to avoid an extra request
  const { data: allAlerts } = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => listAlerts(token, { resolved: false }),
    enabled: !!token,
  });
  const alert = allAlerts?.data.find(a => a.id === id);

  const ackMutation = useMutation({
    mutationFn: () => acknowledgeAlert(token, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      Toast.show({ type: 'success', text1: 'Alert acknowledged' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to acknowledge' }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveAlert(token, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      router.back();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to resolve' }),
  });

  if (!alert) {
    return <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>;
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
          <View style={styles.cardTop}>
            <StatusBadge label={alert.severity} variant={SEV_VARIANT[alert.severity]} />
            <Text style={styles.date}>{new Date(alert.created_at).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.message}>{alert.message}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Resource</Text>
            <Text style={styles.val}>{alert.resource_type}</Text>
          </View>
          {alert.resource_id && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>ID</Text>
              <Text style={[styles.val, { fontSize: 11, color: Colors.text3 }]}>{alert.resource_id}</Text>
            </View>
          )}
        </View>

        {alert.resolved ? (
          <View style={styles.resolvedBadge}>
            <Text style={styles.resolvedText}>✓ Resolved</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {!alert.acknowledged && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, isOffline && styles.btnDisabled]}
                disabled={isOffline || ackMutation.isPending}
                onPress={() => ackMutation.mutate()}
              >
                <Text style={styles.btnSecondaryText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, isOffline && styles.btnDisabled]}
              disabled={isOffline || resolveMutation.isPending}
              onPress={() => resolveMutation.mutate()}
            >
              <Text style={styles.btnPrimaryText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
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
  back:    { color: Colors.green, fontSize: 15 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16,
  },
  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  date:     { fontSize: 12, color: Colors.text3 },
  message:  { fontSize: 16, color: Colors.text, marginBottom: 12 },
  infoRow:  { flexDirection: 'row', gap: 8, marginTop: 4 },
  label:    { fontSize: 13, color: Colors.text2, width: 64 },
  val:      { fontSize: 13, color: Colors.text, flex: 1, textTransform: 'capitalize' },
  actions:  { gap: 8 },
  btn:      { borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnPrimary:   { backgroundColor: Colors.green },
  btnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  btnDisabled:  { opacity: 0.4 },
  btnPrimaryText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnSecondaryText: { color: Colors.text, fontSize: 15 },
  resolvedBadge: { backgroundColor: Colors.greenBg, borderRadius: 8, padding: 12, alignItems: 'center' },
  resolvedText:  { color: Colors.green, fontSize: 14, fontWeight: '500' },
});
```

- [ ] **Step 3: Create `apps/mobile/app/(app)/activity/index.tsx`**

Unified activity feed. Non-tab route — accessible via Dashboard "View all activity" link.

```typescript
// apps/mobile/app/(app)/activity/index.tsx
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { listActivity } from '@/lib/api';
import { useApiToken } from '@/hooks/useApiToken';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Colors } from '@/constants/colors';
import type { Activity } from '@vantage/types';

const TYPE_LABEL: Record<Activity['type'], string> = {
  email:        '✉️ Email',
  call:         '📞 Call',
  note:         '📝 Note',
  meeting:      '🤝 Meeting',
  deal_change:  '💼 Deal change',
  infra_alert:  '🔴 Infra alert',
};

export default function ActivityScreen() {
  const token = useApiToken();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => listActivity(token, { limit: 50 }),
    enabled: !!token,
  });

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Activity</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: Activity }) => (
            <View style={styles.row}>
              <Text style={styles.type}>{TYPE_LABEL[item.type]}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No activity yet</Text>}
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
  back:  { color: Colors.green, fontSize: 15, marginBottom: 8 },
  title: { fontSize: 22, color: Colors.text, fontWeight: '600' },
  row: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  type:  { fontSize: 13, color: Colors.text2, marginBottom: 4 },
  body:  { fontSize: 14, color: Colors.text, marginBottom: 4 },
  date:  { fontSize: 12, color: Colors.text3 },
  empty: { color: Colors.text3, textAlign: 'center', marginTop: 24 },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(app)/alerts/ apps/mobile/app/(app)/activity/
git commit -m "feat(mobile): add alerts list/detail and activity feed screens"
```

---

### Task 12: Settings screen

**Files:**
- Create: `apps/mobile/app/(app)/settings.tsx`

Workspace branding (logo + name from `GET /api/me`), push notification preference toggles, logout.

- [ ] **Step 1: Create `apps/mobile/app/(app)/settings.tsx`**

```typescript
// apps/mobile/app/(app)/settings.tsx
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
```

- [ ] **Step 2: Type-check the entire mobile workspace**

```bash
cd D:/Projects/Vantage/apps/mobile && npx tsc --noEmit
```

Expected: no TypeScript errors across all screens.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(app)/settings.tsx
git commit -m "feat(mobile): add settings screen with workspace branding, push prefs, and logout"
```
