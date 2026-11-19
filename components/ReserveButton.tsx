import { useRouter } from 'expo-router';
import { venuePresentationCategory } from '@/utils/venue-presentation-category';
import { Pressable, StyleSheet, Text, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { PandaIcon } from '@/components/PandaIcon';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { withVenueActivityContext } from '@/utils/record-venue-activity';
import type { VenueActivitySurface } from '@/utils/venue-activity';

export const RESERVE_SURFACES: readonly VenueActivitySurface[] = ['discovery', 'banging', 'panda_ai', 'map', 'planner', 'saved'];
export function isReserveSurface(value: unknown): value is VenueActivitySurface {
  return typeof value === 'string' && (RESERVE_SURFACES as readonly string[]).includes(value);
}
export type ReserveButtonProps = {
  venue: Venue;
  activitySurface?: VenueActivitySurface;
  compact?: boolean;
  tone?: 'solid' | 'soft';
  style?: StyleProp<ViewStyle>;
  onBeforeNavigate?: () => void;
};
// Navigation only: never fetch reservation details while rendering cards.
export function ReserveButton({ venue, activitySurface, compact = false, tone = 'solid', style, onBeforeNavigate }: ReserveButtonProps) {
  const colors = useColors();
  const router = useRouter();
  if (['Shop', 'Place of Interest'].includes(venuePresentationCategory(venue))) return null;
  const surface = isReserveSurface(activitySurface) ? activitySurface : undefined;
  const bg = tone === 'soft' ? colors.mint100 : colors.green800;
  const fg = tone === 'soft' ? colors.green900 : colors.primaryForeground;
  const onPress = (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (!venue?.id) return;
    const payload = surface ? withVenueActivityContext(venue, surface) : venue;
    onBeforeNavigate?.();
    router.push({
      pathname: '/venue/[id]/reservation',
      params: { id: venue.id, venueData: JSON.stringify(payload), ...(surface ? { activitySurface: surface } : {}) },
    });
  };
  return (
    <Pressable testID={`reserve-${venue.id}`} accessibilityRole="button" accessibilityLabel={`Reserve at ${venue.name}`}
      hitSlop={compact ? 6 : 0} onPress={onPress}
      style={({ pressed }) => [styles.button, compact && styles.compact, { backgroundColor: bg }, pressed && styles.pressed, style]}>
      <PandaIcon name="calendar" size={compact ? 13 : 15} color={fg} />
      <Text style={[styles.text, compact && styles.compactText, { color: fg }]}>Reserve</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  compact: { borderRadius: 999, gap: 5, minHeight: 32, paddingHorizontal: 11 },
  text: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.2 },
  compactText: { fontSize: 11.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
