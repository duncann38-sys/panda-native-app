import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

const pandaLogo = require('../assets/panda-logo-mark.svg');

export function PandaLogo({ size = 34 }: { size?: number }) {
  return (
    <Image
      source={pandaLogo}
      contentFit="cover"
      accessibilityLabel="Panda logo"
      style={[styles.logo, { borderRadius: Math.max(8, Math.round(size * 0.24)), height: size, width: size }]}
    />
  );
}

const styles = StyleSheet.create({
  logo: { backgroundColor: '#FFFFFF' },
});