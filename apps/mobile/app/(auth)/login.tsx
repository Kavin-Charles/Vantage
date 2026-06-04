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
        <Text style={styles.title}>Vencore</Text>
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
