import { StyleSheet, Text, View } from 'react-native';
import { PandaLogo } from '@/components/PandaLogo';
import { useColors } from '@/hooks/useColors';

export function PandaMark({ compact = false }: { compact?: boolean }) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: colors.ivory }]}>
        <PandaLogo size={compact ? 34 : 34} />
      </View>
      <Text style={[styles.wordmark, { color: colors.green950 }, compact && styles.compactWordmark]}>
        PANDA
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mark: {
    alignItems: 'center',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  wordmark: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    letterSpacing: 2.4,
  },
  compactWordmark: {
    fontSize: 13,
    letterSpacing: 2,
  },
});