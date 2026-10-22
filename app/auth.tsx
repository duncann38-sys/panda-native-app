import { Redirect } from 'expo-router';
import { useAuth } from '@/context/auth';
import { AuthWelcome, LoadingDots } from '@/components/AuthWelcome';
import { canEnterPanda } from '@/utils/auth-access';

export default function NativeAuthReturnScreen() {
  const { account, ready, signingIn } = useAuth();
  if (ready && !signingIn) {
    return <Redirect href={canEnterPanda(ready, account) ? '/' : '/sign-in'} />;
  }
  return (
    <AuthWelcome eyebrow="SIGNING YOU IN" message="We're securely connecting your Panda account.">
      <LoadingDots label="Completing your secure sign-in" />
    </AuthWelcome>
  );
}
