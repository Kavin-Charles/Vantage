// apps/mobile/components/Section.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Font } from '@/constants/fonts';

interface SectionProps {
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Section({ eyebrow, children, action }: SectionProps) {
  return (
    <View style={styles.section}>
      {eyebrow != null && (
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/** Grouped list rows — white surface with top/bottom border */
export function ListGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  eyebrow: {
    fontFamily: Font.sansSemi,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
  },
  group: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
});
