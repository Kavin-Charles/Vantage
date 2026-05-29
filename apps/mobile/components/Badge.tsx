// apps/mobile/components/Badge.tsx
import { View, Text, StyleSheet } from 'react-native';
import { BadgeColors, Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';

interface BadgeProps {
  label: string;
  color?: string; // 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'gray'
  size?: 'sm' | 'md';
}

export function Badge({ label, color = 'gray', size = 'sm' }: BadgeProps) {
  const pair = BadgeColors[color] ?? BadgeColors['gray'];
  const py = size === 'md' ? 4 : 2;
  const px = size === 'md' ? 10 : 7;
  const fs = size === 'md' ? 12 : 11;
  return (
    <View style={[styles.base, { backgroundColor: pair.bg, paddingVertical: py, paddingHorizontal: px }]}>
      <Text style={[styles.text, { color: pair.fg, fontSize: fs }]}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: Font.sansSemi,
    includeFontPadding: false,
  },
});
