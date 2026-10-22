import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaMark } from '@/components/PandaMark';
import { useAuth } from '@/context/auth';
import { useColors } from '@/hooks/useColors';

export default function GoogleSignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ready, signingIn, error, signIn } = useAuth();
  const started = useRef(false);
  const signInRef = useRef(signIn);
  signInRef.current = signIn;

  useEffect(() => {
    if (!ready || signingIn || error || started.current) return;
    started.current = true;
    void signInRef.current('Google');
  }, [ready, signingIn, error]);

  const busy = !ready || signingIn || (!started.current && !error);
  const status = !ready ? 'Checking your sign-in…' : 'Opening Google sign-in…';

  return (
    <View style={{ flex: 1, backgroundColor: '#DDF0DE', paddingHorizontal: 28, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, alignItems: 'center', justifyContent: 'center' }}>
      <PandaMark compact />
      {busy ? (
        <View accessibilityRole="progressbar" accessibilityLabel={status} accessibilityState={{ busy: true }}
          style={{ marginTop: 36, alignItems: 'center', gap: 14 }}>
          <ActivityIndicator color={colors.green700} />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>{status}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
            Your secure Panda sign-in will open in a moment.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 36, alignItems: 'center', gap: 14, width: '100%', maxWidth: 340 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, textAlign: 'center' }}>
            Sign-in wasn't completed
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>{error}</Text>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Open Google sign-in again"
            onPress={() => { void signIn('Google'); }}
            style={({ pressed }) => ({ marginTop: 6, minHeight: 52, alignSelf: 'stretch', backgroundColor: colors.green800, borderRadius: 16, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Try Google sign-in again</Text>
          </Pressable>
        </View>
      )}
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.pandaindustry.co/legal/#privacy'); }}
        style={{ marginTop: 28, padding: 12 }}>
        <Text style={{ color: colors.green700, textDecorationLine: 'underline', fontSize: 13 }}>Privacy and terms</Text>
      </Pressable>
    </View>
  );
}
