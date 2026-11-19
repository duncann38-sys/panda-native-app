import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PandaIcon } from '@/components/PandaIcon';
import { PandaLogo } from '@/components/PandaLogo';
import { useColors } from '@/hooks/useColors';
import { useSandboxReservations } from '@/hooks/useSandboxReservations';
import {
  SANDBOX_RESTAURANT_NAME, SandboxBookingError, sandboxBookingErrorText, confirmationEmailLabel,
  type SandboxConfirmation, type SandboxReview,
} from '@/utils/sandbox-reservations';

type Phase = 'pick' | 'review' | 'done' | 'uncertain';
const TEST_PHONE = '7700900123';
const TEST_COUNTRY = 'GB';
const MAX_DATES = 21;

function parseDay(d: string) {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, dd || 1));
}
function dayKey(d: Date) { return d.toISOString().slice(0, 10); }
function buildDates(min: string, max: string) {
  const out: string[] = [];
  const start = parseDay(min), end = parseDay(max);
  for (let d = start; d <= end && out.length < MAX_DATES; d = new Date(d.getTime() + 86_400_000)) out.push(dayKey(d));
  return out;
}
function dateLabel(key: string) {
  const d = parseDay(key);
  return {
    dow: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    day: String(d.getUTCDate()),
    mon: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  };
}
function timeOf(t: string) { const m = t.match(/(\d{2}:\d{2})/g); return m ? m[m.length - 1] : t; }
function toStart(date: string, t: string) { return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) ? t.slice(0, 16) : `${date}T${timeOf(t)}`; }
function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}
function errText(e: unknown) {
  return e instanceof SandboxBookingError ? e.message : sandboxBookingErrorText('unknown');
}

export function SandboxBookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { account, capabilities, availability, review, confirm, history } = useSandboxReservations();
  const caps = capabilities.data;
  const topInset = insets.top;
  const bottomInset = insets.bottom;

  const dates = useMemo(() => (caps ? buildDates(caps.minDate, caps.maxDate) : []), [caps?.minDate, caps?.maxDate]);
  const [date, setDate] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [times, setTimes] = useState<string[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const initialName = splitName(account?.name ?? '');
  const [firstName, setFirstName] = useState(initialName.first);
  const [lastName, setLastName] = useState(initialName.last);
  const [phone, setPhone] = useState(TEST_PHONE);
  const [editPhone, setEditPhone] = useState(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [reviewed, setReviewed] = useState<SandboxReview | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [result, setResult] = useState<SandboxConfirmation | null>(null);
  const [now, setNow] = useState(Date.now());
  const pending = confirm.isPending;
  const pendingRef = useRef(false);
  pendingRef.current = pending;

  useEffect(() => { if (!date && dates.length) setDate(dates[0]); }, [dates, date]);

  // Block leaving while confirmation is in flight.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (pendingRef.current) e.preventDefault();
    });
    const sub = BackHandler.addEventListener('hardwareBackPress', () => pendingRef.current);
    return () => { unsub(); sub.remove(); };
  }, [navigation]);

  useEffect(() => {
    if (phase !== 'review') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const expired = phase === 'review' && !!reviewed && reviewed.expiresAt <= now;

  const search = async (d = date, p = party) => {
    if (!d) return;
    setTimes(null); setTime(null); setSlotError(null);
    try {
      const r = await availability.mutateAsync({ rid: 264001, partySize: p, startDateTime: `${d}T19:00` });
      setTimes(r.times);
    } catch (e) { setSlotError(errText(e)); }
  };

  const goBack = () => {
    if (pending) return;
    if (router.canGoBack()) router.back(); else router.replace('/ai');
  };

  const email = account?.email ?? '';
  const guestValid = firstName.trim().length > 0 && lastName.trim().length > 0 && phone.replace(/\D/g, '').length >= 7 && !!email;

  const doReview = async () => {
    if (!date || !time || !guestValid) return;
    setStepError(null);
    try {
      const r = await review.mutateAsync({
        rid: 264001, partySize: party, startDateTime: toStart(date, time),
        guest: { firstName: firstName.trim(), lastName: lastName.trim(), email, phoneNumber: phone.replace(/\D/g, ''), phoneCountry: TEST_COUNTRY },
      });
      setReviewed(r); setNow(Date.now()); setPhase('review');
    } catch (e) { setStepError(errText(e)); }
  };

  const doConfirm = async () => {
    if (!reviewed || pending || expired) return;
    setStepError(null);
    try {
      const c = await confirm.mutateAsync(reviewed.reviewId);
      if (c?.status === 'confirmed' && c.confirmationNumber) { setResult(c); setPhase('done'); }
      else { setStepError(sandboxBookingErrorText('booking_status_requires_verification_do_not_retry')); setPhase('uncertain'); }
    } catch (e) {
      const err = e instanceof SandboxBookingError ? e : null;
      if (err?.code === 'review_expired' || err?.code === 'slot_no_longer_available') {
        setStepError(err.message); setPhase('pick'); setReviewed(null); void search();
      } else if (err && !err.uncertain) {
        setStepError(err.message);
      } else {
        setStepError(errText(e)); setPhase('uncertain');
      }
    }
  };

  const restart = () => {
    setPhase('pick'); setReviewed(null); setResult(null); setStepError(null); setTime(null); setTimes(null);
  };

  const s = makeStyles(colors);

  const header = (
    <View style={[styles.header, { paddingTop: Math.max(12, topInset + 6), backgroundColor: colors.ivory, borderBottomColor: colors.border }]}>
      <Pressable testID="sandbox-back" accessibilityRole="button" accessibilityLabel="Back to Panda AI" disabled={pending} onPress={goBack}
        style={({ pressed }) => [styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: pending ? 0.4 : 1 }, pressed && styles.pressed]}>
        <PandaIcon name="arrow-left" size={18} color={colors.green800} />
        <Text style={[styles.backText, { color: colors.green800 }]}>Panda AI</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color: colors.green700 }]}>SANDBOX TEST</Text>
        <Text numberOfLines={1} style={[styles.headerName, { color: colors.foreground }]}>{SANDBOX_RESTAURANT_NAME}</Text>
      </View>
      <PandaLogo size={32} />
    </View>
  );

  const banner = (
    <View style={[styles.banner, { backgroundColor: colors.honeySoft, borderColor: colors.goldLine }]}>
      <Text style={[styles.bannerText, { color: colors.honeyInk }]}>
        Sandbox only. Not a real table, no payments taken. Cancellations are not available in this test.
      </Text>
    </View>
  );

  const historyBlock = (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowBetween}>
        <Text style={s.kicker}>YOUR SANDBOX CONFIRMATIONS</Text>
        <Pressable accessibilityRole="button" onPress={() => void history.refetch()} hitSlop={8} disabled={history.isFetching}>
          <Text style={[styles.link, { color: colors.green800 }]}>{history.isFetching ? 'Checking' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {history.isLoading ? (
        <View style={{ gap: 8 }}>
          <View style={[styles.skel, { backgroundColor: colors.muted, width: '70%' }]} />
          <View style={[styles.skel, { backgroundColor: colors.muted, width: '45%' }]} />
        </View>
      ) : history.isError ? (
        <Text style={s.muted}>Could not load confirmations. Try refresh.</Text>
      ) : !history.data?.length ? (
        <Text style={s.muted}>No sandbox bookings yet.</Text>
      ) : history.data.map((h) => (
        <View key={h.id} style={[styles.histRow, { borderTopColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.body}>{dateLabel(h.startDateTime.slice(0, 10)).long}, {timeOf(h.startDateTime)}</Text>
            <Text style={s.muted}>Party of {h.partySize} · restaurant-local time</Text>
          </View>
          <Text style={[styles.mono, { color: colors.green800 }]}>#{h.confirmationNumber}</Text>
        </View>
      ))}
    </View>
  );

  const shell = (children: React.ReactNode) => (
    <View style={[styles.screen, { backgroundColor: colors.secondary }]}>
      {header}
      <KeyboardAwareScrollViewCompat bottomOffset={24} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(28, bottomInset + 20) }]}>
        {banner}
        {children}
      </KeyboardAwareScrollViewCompat>
    </View>
  );

  if (!account) return shell(
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={s.title}>Sign in first</Text>
      <Text style={s.muted}>This test books under your Panda account email.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={[styles.primary, { backgroundColor: colors.green800 }]}>
        <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Sign in</Text>
      </Pressable>
    </View>,
  );

  if (capabilities.isLoading) return shell(
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.skel, { backgroundColor: colors.muted, width: '50%', height: 20 }]} />
      <View style={[styles.skel, { backgroundColor: colors.muted, width: '85%' }]} />
      <View style={styles.chipRow}>{[0, 1, 2, 3].map((i) => <View key={i} style={[styles.skelChip, { backgroundColor: colors.muted }]} />)}</View>
    </View>,
  );

  if (capabilities.isError || !caps?.enabled) return shell(
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={s.title}>Test booking unavailable</Text>
      <Text style={s.muted}>{capabilities.error ? errText(capabilities.error) : sandboxBookingErrorText('sandbox_not_ready')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void capabilities.refetch()} style={[styles.secondary, { borderColor: colors.green800 }]}>
        <Text style={[styles.primaryText, { color: colors.green800 }]}>Try again</Text>
      </Pressable>
    </View>,
  );

  const venue = caps.venueName || SANDBOX_RESTAURANT_NAME;
  const tzNote = caps.timeZone ? `${caps.timeZone} time` : 'restaurant-local time';

  if (phase === 'done' && result) return shell(<>
    <View style={[styles.hero, { backgroundColor: colors.green800 }]}>
      <Text style={[styles.kickerHero, { color: colors.mint300 }]}>CONFIRMED · SANDBOX</Text>
      <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>You’re booked in.</Text>
      <Text style={[styles.heroMeta, { color: colors.mint100 }]}>
        {dateLabel(result.startDateTime.slice(0, 10)).long} at {timeOf(result.startDateTime)} ({tzNote}), party of {result.partySize}
      </Text>
      <View style={[styles.confBox, { backgroundColor: colors.green950 }]}>
        <Text style={[styles.kickerHero, { color: colors.mint300 }]}>CONFIRMATION NUMBER</Text>
        <Text selectable style={[styles.confNum, { color: colors.primaryForeground }]}>{result.confirmationNumber}</Text>
      </View>
      <Text style={[styles.heroMeta, { color: colors.mint100 }]}>
        {confirmationEmailLabel(result.emailStatus)} Find this confirmation in Profile → My bookings.
      </Text>
    </View>
    {historyBlock}
    <Pressable accessibilityRole="button" onPress={goBack} style={[styles.secondary, { borderColor: colors.green800 }]}>
      <Text style={[styles.primaryText, { color: colors.green800 }]}>Back to Panda AI</Text>
    </Pressable>
  </>);

  if (phase === 'uncertain') return shell(<>
    <View style={[styles.card, { backgroundColor: colors.closedBackground, borderColor: colors.closedForeground }]}>
      <Text style={[s.title, { color: colors.closedForeground }]}>Don’t book again yet</Text>
      <Text style={s.body}>{stepError}</Text>
      <Text style={s.muted}>Refresh your confirmations below. Only a confirmation number means it’s booked.</Text>
    </View>
    {historyBlock}
    <Pressable accessibilityRole="button" onPress={goBack} style={[styles.secondary, { borderColor: colors.green800 }]}>
      <Text style={[styles.primaryText, { color: colors.green800 }]}>Back to Panda AI</Text>
    </Pressable>
  </>);

  if (phase === 'review' && reviewed) {
    const left = Math.max(0, Math.round((reviewed.expiresAt - now) / 1000));
    return shell(<>
      <View style={[styles.hero, { backgroundColor: colors.green800 }]}>
        <Text style={[styles.kickerHero, { color: colors.mint300 }]}>CHECK AND CONFIRM</Text>
        <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>{venue}</Text>
        <Text style={[styles.heroMeta, { color: colors.mint100 }]}>
          {dateLabel(reviewed.startDateTime.slice(0, 10)).long}{'\n'}{timeOf(reviewed.startDateTime)} {tzNote} · party of {reviewed.partySize}
        </Text>
        <Text style={[styles.heroMeta, { color: colors.mint100 }]}>
          {reviewed.guest.firstName} {reviewed.guest.lastName} · {reviewed.guest.email}{'\n'}Test phone +44 {reviewed.guest.phoneNumber}
        </Text>
      </View>
      {expired ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={s.body}>{sandboxBookingErrorText('review_expired')}</Text>
          <Pressable accessibilityRole="button" onPress={() => { restart(); void search(); }} style={[styles.primary, { backgroundColor: colors.green800 }]}>
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Check times again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[s.muted, { textAlign: 'center' }]}>Review expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · Time rechecked on confirmation</Text>
          {stepError ? <Text style={[s.body, { color: colors.destructive }]}>{stepError}</Text> : null}
          <Pressable testID="sandbox-confirm" accessibilityRole="button" disabled={pending} onPress={() => void doConfirm()}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.green800, opacity: pending ? 0.7 : 1 }, pressed && styles.pressed]}>
            {pending ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{pending ? 'Confirming — stay here' : 'Confirm test booking'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={pending} onPress={() => { setPhase('pick'); setReviewed(null); setStepError(null); }}
            style={[styles.secondary, { borderColor: colors.green800, opacity: pending ? 0.4 : 1 }]}>
            <Text style={[styles.primaryText, { color: colors.green800 }]}>Change details</Text>
          </Pressable>
        </>
      )}
    </>);
  }

  return shell(<>
    <View style={styles.intro}>
      <Text style={s.title}>When shall I book?</Text>
      <Text style={s.muted}>{venue} · times shown in {tzNote}</Text>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {dates.map((d) => {
        const l = dateLabel(d), on = d === date;
        return (
          <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={l.long}
            onPress={() => { setDate(d); setTimes(null); setTime(null); setSlotError(null); }}
            style={[styles.dateChip, { backgroundColor: on ? colors.green800 : colors.card, borderColor: on ? colors.green800 : colors.border }]}>
            <Text style={[styles.dow, { color: on ? colors.mint300 : colors.mutedForeground }]}>{l.dow.toUpperCase()}</Text>
            <Text style={[styles.dayNum, { color: on ? colors.primaryForeground : colors.foreground }]}>{l.day}</Text>
            <Text style={[styles.dow, { color: on ? colors.mint100 : colors.mutedForeground }]}>{l.mon}</Text>
          </Pressable>
        );
      })}
    </ScrollView>

    <View style={[styles.partyRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fewer guests" disabled={party <= 1}
        onPress={() => { setParty((p) => Math.max(1, p - 1)); setTimes(null); setTime(null); }}
        style={[styles.stepBtn, { backgroundColor: colors.secondary, opacity: party <= 1 ? 0.4 : 1 }]}>
        <Text style={[styles.stepText, { color: colors.green800 }]}>−</Text>
      </Pressable>
      <Text style={[s.body, { fontSize: 16 }]}>{party} {party === 1 ? 'guest' : 'guests'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="More guests" disabled={party >= 20}
        onPress={() => { setParty((p) => Math.min(20, p + 1)); setTimes(null); setTime(null); }}
        style={[styles.stepBtn, { backgroundColor: colors.secondary, opacity: party >= 20 ? 0.4 : 1 }]}>
        <Text style={[styles.stepText, { color: colors.green800 }]}>+</Text>
      </Pressable>
    </View>

    {times === null && !availability.isPending ? (
      <Pressable testID="sandbox-search" accessibilityRole="button" disabled={!date} onPress={() => void search()}
        style={({ pressed }) => [styles.primary, { backgroundColor: colors.green800 }, pressed && styles.pressed]}>
        <PandaIcon name="clock" size={18} color={colors.primaryForeground} />
        <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Find times around 19:00</Text>
      </Pressable>
    ) : null}

    {availability.isPending ? (
      <View style={styles.chipRowWrap}>{[0, 1, 2, 3, 4].map((i) => <View key={i} style={[styles.skelChip, { backgroundColor: colors.muted }]} />)}</View>
    ) : null}

    {slotError ? (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={s.body}>{slotError}</Text>
        <Pressable accessibilityRole="button" onPress={() => void search()}><Text style={[styles.link, { color: colors.green800 }]}>Try again</Text></Pressable>
      </View>
    ) : null}

    {times && times.length === 0 ? (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={s.body}>Nothing free near 19:00 that day.</Text>
        <Text style={s.muted}>Try another date or party size.</Text>
      </View>
    ) : null}

    {times && times.length > 0 ? (
      <View style={styles.chipRowWrap}>
        {times.map((t) => {
          const on = t === time;
          return (
            <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setTime(t)}
              style={[styles.timeChip, { backgroundColor: on ? colors.green800 : colors.card, borderColor: on ? colors.green800 : colors.border }]}>
              <Text style={[styles.timeText, { color: on ? colors.primaryForeground : colors.foreground }]}>{timeOf(t)}</Text>
            </Pressable>
          );
        })}
      </View>
    ) : null}

    {time ? (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={s.kicker}>BOOKING FOR</Text>
        <View style={styles.nameRow}>
          <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.mutedForeground}
            autoComplete="given-name" style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground }]} />
          <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.mutedForeground}
            autoComplete="family-name" style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground }]} />
        </View>
        <Text style={s.muted}>{email} · your Panda account</Text>
        {editPhone ? (
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="UK phone number"
            placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground }]} />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setEditPhone(true)} style={styles.rowBetween}>
            <Text style={s.muted}>Test contact +44 {phone} (fictional)</Text>
            <Text style={[styles.link, { color: colors.green800 }]}>Edit</Text>
          </Pressable>
        )}
        {stepError ? <Text style={[s.body, { color: colors.destructive }]}>{stepError}</Text> : null}
        <Pressable testID="sandbox-review" accessibilityRole="button" disabled={!guestValid || review.isPending} onPress={() => void doReview()}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.green800, opacity: !guestValid || review.isPending ? 0.5 : 1 }, pressed && styles.pressed]}>
          {review.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Review {timeOf(time)}</Text>
        </Pressable>
      </View>
    ) : null}

    {historyBlock}
  </>);
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return {
    title: { fontFamily: 'serif', fontSize: 24, letterSpacing: -0.4, color: c.foreground } as const,
    body: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20, color: c.foreground } as const,
    muted: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, color: c.mutedForeground } as const,
    kicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3, color: c.green700 } as const,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 10, paddingHorizontal: 14 },
  backBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  backText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  headerName: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 2 },
  content: { gap: 14, padding: 16 },
  banner: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  bannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
  intro: { gap: 4, marginTop: 4 },
  card: { borderRadius: 20, borderWidth: 1, gap: 10, padding: 18 },
  hero: { borderRadius: 22, gap: 10, padding: 20 },
  kickerHero: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.4 },
  heroTitle: { fontFamily: 'serif', fontSize: 28, letterSpacing: -0.6, lineHeight: 33 },
  heroMeta: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  confBox: { borderRadius: 14, gap: 4, padding: 14 },
  confNum: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 26, letterSpacing: 1.5 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChip: { alignItems: 'center', borderRadius: 16, borderWidth: 1, minWidth: 58, paddingVertical: 10 },
  dow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6 },
  dayNum: { fontFamily: 'serif', fontSize: 22, marginVertical: 1 },
  partyRow: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 8 },
  stepBtn: { alignItems: 'center', borderRadius: 14, height: 48, justifyContent: 'center', width: 56 },
  stepText: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  timeChip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, minHeight: 48, justifyContent: 'center', minWidth: 84, paddingHorizontal: 16 },
  timeText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  nameRow: { flexDirection: 'row', gap: 8 },
  input: { borderRadius: 12, flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, minHeight: 48, paddingHorizontal: 12 },
  primary: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  secondary: { alignItems: 'center', borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', minHeight: 48, paddingHorizontal: 18 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  histRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingTop: 10 },
  skel: { borderRadius: 6, height: 14 },
  skelChip: { borderRadius: 14, height: 48, width: 80 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});
