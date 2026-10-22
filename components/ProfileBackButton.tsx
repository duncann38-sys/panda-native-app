import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function ProfileBackButton() {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile"
      onPress={() => router.replace('/profile')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, alignSelf: 'flex-start', marginBottom: 12, opacity: pressed ? 0.65 : 1 })}>
      <Svg width={21} height={21} viewBox="0 0 24 24">
        <Path d="M14 6l-6 6 6 6M8 12h12" stroke={colors.green700} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={{ color: colors.green700, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Back to Profile</Text>
    </Pressable>
  );
}
