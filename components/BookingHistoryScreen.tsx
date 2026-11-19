import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaIcon } from '@/components/PandaIcon';
import { PandaLogo } from '@/components/PandaLogo';
import { useColors } from '@/hooks/useColors';
import { useSandboxReservations } from '@/hooks/useSandboxReservations';
import { confirmationEmailLabel, type SandboxConfirmation } from '@/utils/sandbox-reservations';

// startDateTime is a floating restaurant-local "YYYY-MM-DDTHH:mm". Never pass it to new Date()
// directly; read the parts and format them as-is (UTC is used only as a neutral carrier).
function localParts(start: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(start ?? '');
  if (!m) return { date: 'Date unavailable', time: '' };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return {
    date: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    time: `${m[4]}:${m[5]}`,
  };
}

function emailLabel(status: string) {
  return confirmationEmailLabel(status);
}

export function BookingHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account, history } = useSandboxReservations({ loadCapabilities: false });
  // Only render records when signed in; query is keyed by account so switching never shows another account's data.
  const records: SandboxConfirmation[] = account && !history.isError ? (history.data ?? []) : [];
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/profile'); };
  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <View style={[styles.screen, { backgroundColor: colors.secondary }]}>
      <View style={[styles.header, { paddingTop: Math.max(12, insets.top + 6), backgroundColor: colors.ivory, borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" onPress={goBack}
          style={({ pressed }) => [styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}>
          <PandaIcon name="arrow-left" size={18} color={colors.green800} />
          <Text style={[styles.backText, { color: colors.green800 }]}>Profile</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.green700 }]}>YOUR PANDA</Text>
          <Text style={[styles.headerName, { color: colors.foreground }]}>My bookings</Text>
        </View>
        <PandaLogo size={32} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(28, insets.bottom + 20) }]}>
        <View style={[styles.banner, { backgroundColor: colors.honeySoft, borderColor: colors.goldLine }]}>
          <Text style={[styles.bannerText, { color: colors.honeyInk }]}>
            Only bookings confirmed inside Panda appear here. Tables booked on a restaurant or external booking website are not imported automatically, and tapping Reserve on a venue does not by itself make a booking.
          </Text>
        </View>

        {!account ? (
          <View style={card}>
            <Text style={styles.title(colors.foreground)}>Sign in to see bookings</Text>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>Bookings are linked to your Panda account.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={[styles.primary, { backgroundColor: colors.green800 }]}>
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Sign in</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.rowBetween}>
              <Text style={[styles.kicker, { color: colors.green700 }]}>CONFIRMED IN PANDA</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh bookings" hitSlop={8}
                disabled={history.isFetching} onPress={() => void history.refetch()}
                style={[styles.refresh, { borderColor: colors.border, backgroundColor: colors.card, opacity: history.isFetching ? 0.6 : 1 }]}>
                <PandaIcon name="clock" size={14} color={colors.green800} />
                <Text style={[styles.link, { color: colors.green800 }]}>{history.isFetching ? 'Checking' : 'Refresh'}</Text>
              </Pressable>
            </View>

            {history.isLoading ? (
              [0, 1].map((i) => (
                <View key={i} style={card}>
                  <View style={[styles.skel, { backgroundColor: colors.muted, width: '35%' }]} />
                  <View style={[styles.skel, { backgroundColor: colors.muted, width: '75%', height: 20 }]} />
                  <View style={[styles.skel, { backgroundColor: colors.muted, width: '55%' }]} />
                </View>
              ))
            ) : history.isError ? (
              <View style={card}>
                <Text style={styles.title(colors.foreground)}>Couldn’t load bookings</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>Check your connection and try again. Nothing has been changed.</Text>
                <Pressable accessibilityRole="button" onPress={() => void history.refetch()} style={[styles.secondary, { borderColor: colors.green800 }]}>
                  <Text style={[styles.primaryText, { color: colors.green800 }]}>Try again</Text>
                </Pressable>
              </View>
            ) : sorted.length === 0 ? (
              <View style={[card, { alignItems: 'center' }]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
                  <PandaIcon name="calendar" size={22} color={colors.green700} />
                </View>
                <Text style={styles.title(colors.foreground)}>No bookings yet</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center' }]}>
                  When a booking is confirmed in Panda, its reference will appear here, even if the email does not arrive.
                </Text>
              </View>
            ) : sorted.map((b) => {
              const p = localParts(b.startDateTime);
              const sandbox = b.environment === 'sandbox';
              return (
                <View key={b.id} style={card}>
                  <View style={styles.rowBetween}>
                    {sandbox ? (
                      <View style={[styles.pill, { backgroundColor: colors.honeySoft, borderColor: colors.goldLine }]}>
                        <Text style={[styles.pillText, { color: colors.honeyInk }]}>SANDBOX TEST · NOT A REAL TABLE</Text>
                      </View>
                    ) : <View />}
                    <Text style={[styles.pillText, { color: colors.green700 }]}>CONFIRMED</Text>
                  </View>
                  <Text style={styles.title(colors.foreground)} numberOfLines={2}>{b.venueName}</Text>
                  <Text style={[styles.body, { color: colors.foreground }]}>{p.date}{p.time ? ` at ${p.time}` : ''}</Text>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                    {b.timeZone ? `Restaurant time (${b.timeZone})` : 'Restaurant-local time'} · party of {b.partySize}
                  </Text>
                  <View style={[styles.refBox, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.kicker, { color: colors.green700 }]}>{sandbox ? 'TEST REFERENCE' : 'REFERENCE'}</Text>
                    <Text selectable style={[styles.mono, { color: colors.green800 }]}>{b.confirmationNumber}</Text>
                  </View>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>{emailLabel(b.emailStatus)}</Text>
                  {sandbox ? (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>Test booking only. No restaurant is expecting you and cancellation is not available here.</Text>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = {
  ...StyleSheet.create({
    screen: { flex: 1 },
    header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 10, paddingHorizontal: 14 },
    backBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12 },
    backText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
    eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
    headerName: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 2 },
    content: { gap: 14, padding: 16 },
    banner: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
    bannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
    card: { borderRadius: 20, borderWidth: 1, gap: 8, padding: 18 },
    body: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
    muted: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
    kicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
    rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
    refresh: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 36, paddingHorizontal: 12 },
    link: { fontFamily: 'Inter_700Bold', fontSize: 13 },
    pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
    pillText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
    refBox: { borderRadius: 14, gap: 4, padding: 12 },
    mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 18, letterSpacing: 1.2 },
    emptyIcon: { alignItems: 'center', borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
    primary: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
    secondary: { alignItems: 'center', borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', minHeight: 48, paddingHorizontal: 18 },
    primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
    skel: { borderRadius: 6, height: 14 },
    pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  }),
  title: (color: string) => ({ fontFamily: 'serif', fontSize: 22, letterSpacing: -0.4, color }) as const,
};
