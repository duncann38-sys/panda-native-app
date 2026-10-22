import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaMark } from '@/components/PandaMark';
import { useAuth } from '@/context/auth';
import { useColors } from '@/hooks/useColors';

export default function GoogleSignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ready, signingIn, error, signIn } = useAuth();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#DDF0DE' }}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: insets.top + 42, paddingBottom: insets.bottom + 30, justifyContent: 'center' }}>
      <PandaMark compact />
      <Text style={{ marginTop: 38, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1 }}>Welcome to Panda</Text>
      <Text style={{ marginTop: 14, color: colors.mutedForeground, fontSize: 16, lineHeight: 25 }}>
        Sign in with Google to discover places, save your favourites and manage your Panda profile.
      </Text>
      <View style={{ marginTop: 32, backgroundColor: colors.card, borderRadius: 24, padding: 22 }}>
        {!ready ? <View accessibilityRole="progressbar" style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.green700} /><Text style={{ color: colors.foreground }}>Checking your sign-in…</Text>
        </View> : <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google"
          accessibilityState={{ disabled: signingIn, busy: signingIn }} disabled={signingIn}
          onPress={() => { void signIn('Google'); }}
          style={({ pressed }) => ({ minHeight: 56, backgroundColor: colors.green800, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, opacity: pressed || signingIn ? 0.7 : 1 })}>
          {signingIn ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>G</Text>}
          <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{signingIn ? 'Connecting to Google…' : 'Continue with Google'}</Text>
        </Pressable>}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, marginTop: 16, lineHeight: 21 }}>{error}</Text> : null}
        <Text style={{ color: colors.mutedForeground, textAlign: 'center', marginTop: 18, fontSize: 13, lineHeight: 20 }}>Sign-in is required to use Panda.</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.pandaindustry.co/legal/#privacy'); }} style={{ alignSelf: 'center', padding: 20 }}>
        <Text style={{ color: colors.green700, textDecorationLine: 'underline' }}>Privacy and terms</Text>
      </Pressable>
    </ScrollView>
  );
}
