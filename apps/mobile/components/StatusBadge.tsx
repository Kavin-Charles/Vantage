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
