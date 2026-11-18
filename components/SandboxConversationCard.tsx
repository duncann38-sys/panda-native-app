import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PandaIcon } from '@/components/PandaIcon';
import { useColors } from '@/hooks/useColors';
import { bookingDayLabel, type SandboxChatState } from '@/utils/sandbox-chat';
import { SANDBOX_RESTAURANT_NAME, type SandboxGuest } from '@/utils/sandbox-reservations';

export type SandboxConversationCardProps = {
  state: SandboxChatState;
  onChooseTime: (time: string) => void;
  onGuestChange: (guest: SandboxGuest) => void;
  onReview: () => void;
  onConfirm: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  onHistory: () => void;
};

const INITIAL_SLOTS = 6;
const clock = (iso?: string) => (iso ? (iso.match(/(\d{2}:\d{2})/g) ?? [iso]).slice(-1)[0] : '');
const day = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? bookingDayLabel(iso.slice(0, 10)) : '');
const guests = (n?: number) => (n ? `${n} ${n === 1 ? 'guest' : 'guests'}` : '');

export function SandboxConversationCard(p: SandboxConversationCardProps) {
  const c = useColors();
  const { state } = p;
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(Date.now());
  const expiresAt = state.review?.expiresAt;
  useEffect(() => {
    if (state.phase !== 'review' || !expiresAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.phase, expiresAt]);
  useEffect(() => { setShowAll(false); }, [state.slots]);

  if (!state.active || state.phase === 'collecting') return null;

  const { phase, draft, guest } = state;
  const ink = { color: c.foreground }, muted = { color: c.mutedForeground };
  const context = [day(draft.date ? `${draft.date}` : undefined), guests(draft.partySize)].filter(Boolean).join(' · ');
  const busy = phase === 'loading' || phase === 'reviewing' || phase === 'submitting';
  const busyText = phase === 'loading' ? 'Checking the test book for tables'
    : phase === 'reviewing' ? 'Holding the details for your review' : 'Confirming with the sandbox. Please stay here.';
  const guestValid = !!guest.firstName.trim() && !!guest.lastName.trim() && guest.phoneNumber.replace(/\D/g, '').length >= 7;
  const left = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const expired = phase === 'review' && !!expiresAt && left === 0;

  const Btn = ({ label, onPress, ghost, disabled, testID }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean; testID?: string }) => (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.btn, ghost ? { borderColor: c.green800, borderWidth: 1.5 } : { backgroundColor: c.green800 },
        disabled && s.dim, pressed && s.pressed]}>
      <Text style={[s.btnText, { color: ghost ? c.green800 : c.primaryForeground }]}>{label}</Text>
    </Pressable>
  );
  const Field = ({ label, value, onChange, keyboard }: { label: string; value: string; onChange?: (v: string) => void; keyboard?: 'phone-pad' }) => (
    <View style={s.field}>
      <Text style={[s.label, muted]}>{label}</Text>
      {onChange ? (
        <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} accessibilityLabel={label}
          placeholderTextColor={c.mutedForeground} style={[s.input, { backgroundColor: c.secondary, color: c.foreground }]} />
      ) : <Text selectable style={[s.readonly, ink]}>{value}</Text>}
    </View>
  );

  const slots = showAll ? state.slots : state.slots.slice(0, INITIAL_SLOTS);

  return (
    <View testID="sandbox-conversation-card" style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[s.tag, { backgroundColor: c.honeySoft }]}>
        <PandaIcon name="calendar" size={13} color={c.honeyInk} />
        <Text style={[s.tagText, { color: c.honeyInk }]}>PRIVATE SANDBOX · NOT A REAL TABLE</Text>
      </View>
      <Text style={[s.venue, ink]}>{SANDBOX_RESTAURANT_NAME}</Text>
      {context ? <Text style={[s.small, muted]}>{context}</Text> : null}

      {busy ? (
        <View style={s.row} accessibilityLiveRegion="polite">
          <ActivityIndicator color={c.green800} />
          <Text style={[s.body, ink, { flex: 1 }]}>{busyText}</Text>
        </View>
      ) : null}

      {phase === 'slots' ? (
        state.slots.length === 0 ? (
          <>
            <Text style={[s.body, ink]}>Nothing free near then, I’m afraid.</Text>
            {Btn({ label: "Check again", ghost: true, onPress: p.onRefresh })}
          </>
        ) : (
          <>
            <Text style={[s.small, muted]}>Restaurant-local times; time zone not verified.</Text>
            <View style={s.chips}>
              {slots.map((t) => {
                const on = t === state.selectedTime;
                return (
                  <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${clock(t)}, ${day(t)}`}
                    onPress={() => p.onChooseTime(t)}
                    style={({ pressed }) => [s.chip, { backgroundColor: on ? c.green800 : c.secondary, borderColor: on ? c.green800 : c.border }, pressed && s.pressed]}>
                    <PandaIcon name="clock" size={13} color={on ? c.mint300 : c.green700} />
                    <Text style={[s.chipText, { color: on ? c.primaryForeground : c.foreground }]}>{clock(t)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {state.slots.length > INITIAL_SLOTS ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} hitSlop={8}>
                <Text style={[s.link, { color: c.green800 }]}>{showAll ? 'Show fewer' : `Show all ${state.slots.length} times`}</Text>
              </Pressable>
            ) : null}
          </>
        )
      ) : null}

      {phase === 'guest' ? (
        <>
          <Text style={[s.body, ink]}>{clock(state.selectedTime)} it is. Who’s the table for?</Text>
          <View style={s.pair}>
            {Field({ label: "First name", value: guest.firstName, onChange: (v) => p.onGuestChange({ ...guest, firstName: v }) })}
            {Field({ label: "Last name", value: guest.lastName, onChange: (v) => p.onGuestChange({ ...guest, lastName: v }) })}
          </View>
          {Field({ label: "Email (your Panda account)", value: guest.email })}
          {Field({ label: "Phone (fictional sandbox number, edit if needed)", value: guest.phoneNumber, keyboard: "phone-pad", onChange: (v) => p.onGuestChange({ ...guest, phoneNumber: v }) })}
          <Text style={[s.small, muted]}>No card needed. Nothing is booked until you confirm.</Text>
          {Btn({ testID: "sandbox-chat-review", label: "Review booking", disabled: !guestValid, onPress: p.onReview })}
        </>
      ) : null}

      {phase === 'review' && state.review ? (
        <>
          <View style={[s.summary, { backgroundColor: c.green800 }]}>
            <Text style={[s.sumTime, { color: c.primaryForeground }]}>{clock(state.review.startDateTime)}</Text>
            <Text style={[s.small, { color: c.mint100 }]}>
              {day(state.review.startDateTime)} · {guests(state.review.partySize)} · restaurant-local
            </Text>
            <Text style={[s.small, { color: c.mint100 }]}>
              {state.review.guest.firstName} {state.review.guest.lastName} · {state.review.guest.email} · {state.review.guest.phoneNumber}
            </Text>
          </View>
          {expired ? (
            <>
              <Text style={[s.body, ink]}>This review has expired. Let’s check the times again before confirming.</Text>
              {Btn({ label: "Check times again", onPress: p.onRefresh })}
            </>
          ) : (
            <>
              <Text style={[s.small, muted]}>Review expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Availability is rechecked when you confirm.</Text>
              {Btn({ testID: "sandbox-chat-confirm", label: "Confirm test booking", onPress: p.onConfirm })}
              {Btn({ label: "Edit details", ghost: true, onPress: p.onEdit })}
            </>
          )}
        </>
      ) : null}

      {phase === 'confirmed' && state.confirmation?.confirmationNumber ? (
        <View style={[s.summary, { backgroundColor: c.green800 }]}>
          <Text style={[s.tagText, { color: c.mint300 }]}>CONFIRMED · SANDBOX</Text>
          <Text style={[s.small, { color: c.mint100 }]}>
            {day(state.confirmation.startDateTime)}, {clock(state.confirmation.startDateTime)} · {guests(state.confirmation.partySize)}
          </Text>
          <Text selectable style={[s.conf, { color: c.primaryForeground }]}>{state.confirmation.confirmationNumber}</Text>
          <Text style={[s.small, { color: c.mint100 }]}>Keep this confirmation number for your records.</Text>
        </View>
      ) : null}

      {phase === 'unknown' ? (
        <>
          <Text style={[s.body, { color: c.closedForeground }]}>
            {state.error ?? 'I couldn’t verify the result.'} Please don’t book again.
          </Text>
          {Btn({ label: "View sandbox confirmations", ghost: true, onPress: p.onHistory })}
        </>
      ) : null}

      {phase === 'error' ? (
        <>
          <Text style={[s.body, { color: c.destructive }]}>{state.error ?? 'The sandbox could not complete that step.'}</Text>
          {Btn({ label: "Check availability again", ghost: true, onPress: p.onRefresh })}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: 20, borderWidth: 1, gap: 10, marginTop: 4, padding: 16 },
  tag: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  venue: { fontFamily: 'serif', fontSize: 19, letterSpacing: -0.3 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 14 },
  chipText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  pair: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, gap: 4 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  input: { borderRadius: 12, fontFamily: 'Inter_600SemiBold', fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  readonly: { fontFamily: 'Inter_600SemiBold', fontSize: 14, paddingVertical: 4 },
  summary: { borderRadius: 16, gap: 6, padding: 14 },
  sumTime: { fontFamily: 'serif', fontSize: 30, letterSpacing: -0.5 },
  conf: { fontFamily: 'monospace', fontSize: 24, letterSpacing: 1.5 },
  btn: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 48, paddingHorizontal: 18 },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});
