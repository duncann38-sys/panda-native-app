import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@/context/auth';
import { useColors } from '@/hooks/useColors';
import { PandaMark } from '@/components/PandaMark';
import { canEnterPanda } from '@/utils/auth-access';

export default function NativeAuthReturnScreen() {
  const colors = useColors();
  const { account, ready, signingIn } = useAuth();
  if (ready && !signingIn) {
    return <Redirect href={canEnterPanda(ready, account) ? '/' : '/sign-in'} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 28 }}>
      <PandaMark compact />
      <ActivityIndicator size="large" color={colors.green700} />
      <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontSize: 16, textAlign: 'center' }}>
        Completing your secure sign-in…
      </Text>
    </View>
  );
}
