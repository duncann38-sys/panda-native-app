import { ReactNode, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaLogo } from '@/components/PandaLogo';
import { useColors } from '@/hooks/useColors';

function Dot({ value, color }: { value: Animated.Value; color: string }) {
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color, opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]}
    />
  );
}

export function LoadingDots({ label }: { label: string }) {
  const colors = useColors('light');
  const values = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (cancelled) return;
      if (reduce) { values.forEach((v, i) => v.setValue(i === 1 ? 1 : 0.5)); return; }
      const native = Platform.OS !== 'web';
      loop = Animated.loop(Animated.stagger(160, values.map((v) => Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: native }),
      ]))));
      loop.start();
    });
    return () => { cancelled = true; loop?.stop(); };
  }, [values]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={styles.dots}>
      {values.map((v, i) => <Dot key={i} value={v} color={i === 1 ? colors.green600 : colors.green800} />)}
    </View>
  );
}

export function AuthWelcome({ eyebrow, message, children }: { eyebrow: string; message: string; children?: ReactNode }) {
  const colors = useColors('light');
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === 'web' ? 67 : 0;
  return (
    <View style={[styles.root, { backgroundColor: '#E7EFDF' }]}>
      <View pointerEvents="none" style={[styles.orbit, styles.orbitOne]} />
      <View pointerEvents="none" style={[styles.orbit, styles.orbitTwo]} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: insets.top + webTop + 24, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 20 }}>
      <View style={styles.center}>
        <View style={styles.logoRing}>
          <PandaLogo size={104} />
        </View>
        <View style={styles.overline}>
          <View style={styles.rule} />
          <Text style={[styles.overlineText, { color: colors.mutedForeground }]}>{eyebrow}</Text>
          <View style={styles.rule} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.green950 }]}>
          Welcome to <Text style={{ color: colors.green700 }}>Panda</Text>
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
        <View style={styles.body}>{children}</View>
      </View>
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.pandaindustry.co/legal/#privacy'); }}
        style={styles.footer} hitSlop={8}>
        <View style={styles.goldDot} />
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Private and secure · Privacy and terms</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 380, alignSelf: 'center' },
  orbit: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  orbitOne: { width: 380, height: 380, top: -220, right: -170, borderColor: 'rgba(7,91,67,0.1)' },
  orbitTwo: { width: 440, height: 440, bottom: -290, left: -220, borderColor: 'rgba(200,154,67,0.18)' },
  logoRing: { padding: 6, borderRadius: 36, backgroundColor: '#FBF9F1', borderWidth: 1, borderColor: 'rgba(200,154,67,0.35)',
    shadowColor: '#063F30', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  overline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 30 },
  rule: { width: 18, height: 1, backgroundColor: '#C89A43' },
  overlineText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.8 },
  title: { marginTop: 12, fontFamily: 'Inter_700Bold', fontSize: 34, lineHeight: 40, letterSpacing: -1, textAlign: 'center' },
  message: { marginTop: 12, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300 },
  body: { marginTop: 30, width: '100%', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 10, height: 24, alignItems: 'center' },
  dot: { width: 11, height: 11, borderRadius: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, alignSelf: 'center' },
  goldDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#C89A43' },
  footerText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});
