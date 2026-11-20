import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

type Props = { dotColor: string; labelColor: string; backgroundColor: string; borderColor: string };

function Dot({ color, delay, still }: { color: string; delay: number; still: boolean }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    if (still) {
      cancelAnimation(lift);
      lift.value = 0;
      return;
    }
    lift.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 })), -1),
    );
    return () => cancelAnimation(lift);
  }, [delay, lift, still]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + lift.value * 0.65,
    transform: [{ translateY: -3 * lift.value }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, still && styles.stillDot, style]} />;
}

/** Quiet "Panda is thinking" bubble. Static dots when the OS asks for reduced motion. */
export function ConciergeTypingIndicator({ dotColor, labelColor, backgroundColor, borderColor }: Props) {
  const still = useReducedMotion();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Panda is thinking"
      accessibilityLiveRegion="polite"
      style={[styles.bubble, { backgroundColor, borderColor }]}
    >
      <View style={styles.dots}>
        {[0, 140, 280].map((delay) => <Dot key={delay} color={dotColor} delay={delay} still={still} />)}
      </View>
      <Text style={[styles.label, { color: labelColor }]}>Panda is thinking</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 20,
    borderBottomLeftRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center', height: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stillDot: { opacity: 0.7 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.2 },
});
