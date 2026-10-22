import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthWelcome, LoadingDots } from '@/components/AuthWelcome';
import { useAuth } from '@/context/auth';
import { useColors } from '@/hooks/useColors';

export default function GoogleSignInScreen() {
  const colors = useColors('light');
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

  if (busy) {
    const status = !ready ? 'Checking your sign-in' : 'Opening secure Google sign-in';
    return (
      <AuthWelcome eyebrow="YOUR ACCOUNT, SECURELY" message={`${status}. Your discovery is waiting.`}>
        <LoadingDots label={status} />
      </AuthWelcome>
    );
  }

  return (
    <AuthWelcome eyebrow="YOUR ACCOUNT, SECURELY"
      message={error ? 'We could not finish signing you in. You can try again below.' : 'Continue with Google to pick up where you left off.'}>
      {error ? (
        <View accessibilityRole="alert" style={{ alignSelf: 'stretch', marginBottom: 14, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" testID="google-continue"
        onPress={() => { void signIn('Google'); }}
        style={({ pressed }) => ({ minHeight: 58, alignSelf: 'stretch', flexDirection: 'row', gap: 12, backgroundColor: colors.green800, borderRadius: 16,
          alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: colors.green950, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 })}>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#4285F4', fontFamily: 'Inter_700Bold', fontSize: 16 }}>G</Text>
        </View>
        <Text style={{ color: colors.card, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Continue with Google</Text>
      </Pressable>
      <Text style={{ marginTop: 14, color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }}>
        Your password is never shared with Panda.
      </Text>
    </AuthWelcome>
  );
}
