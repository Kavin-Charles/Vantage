// apps/mobile/components/Avatar.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';

interface AvatarProps {
  name: string;
  size?: number;
}

function nameToColor(name: string): string {
  const palette = [
    '#d8f3dc', '#dbeafe', '#ede9fe', '#fef3c7', '#fee2e2', '#f0ede6',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({ name, size = 36 }: AvatarProps) {
  const bg = nameToColor(name);
  const fontSize = Math.round(size * 0.36);
  return (
    <View style={[
      styles.base,
      { width: size, height: size, borderRadius: size / 2.5, backgroundColor: bg },
    ]}>
      <Text style={[styles.text, { fontSize }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    fontFamily: Font.sansSemi,
    color: Colors.text2,
    includeFontPadding: false,
  },
});
