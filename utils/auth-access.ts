type AccountIdentity = { uid: string; provider: string };
type RestorableAuth = {
  currentUser: { uid: string; getIdToken: () => Promise<string> } | null;
  authStateReady?: () => Promise<void>;
};

export function canEnterPanda(ready: boolean, account: AccountIdentity | null): boolean {
  return ready && Boolean(account?.uid && account.provider === 'Google');
}

/** Cached labels alone never grant access; require the matching Firebase session. */
export async function restoreVerifiedPandaAccount<T extends AccountIdentity>(
  saved: T,
  auth: RestorableAuth,
  removeCached: () => Promise<void>,
): Promise<T | null> {
  await auth.authStateReady?.();
  if (saved.provider !== 'Google' || !auth.currentUser || auth.currentUser.uid !== saved.uid) {
    await removeCached();
    return null;
  }
  await auth.currentUser.getIdToken();
  if (auth.currentUser?.uid !== saved.uid) {
    await removeCached();
    return null;
  }
  return saved;
}
