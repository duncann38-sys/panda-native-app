import { Feather, Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Venue } from '@/data/venues';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { admissionLabel, nonHospitalityActions, openNonHospitalityAction } from '@/utils/non-hospitality-actions';
import { venuePresentationCategory } from '@/utils/venue-presentation-category';
import { VenuePhoto } from '@/components/VenuePhoto';
import { PandaIcon } from '@/components/PandaIcon';
import type { PandaIconName } from '@/components/PandaIcon';

type NonHospitalityCardProps = {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
  compact?: boolean;
  activitySurface?: 'banging' | 'discovery' | 'saved';
};

type Action = ReturnType<typeof nonHospitalityActions>[number];

const actionIcon: Record<Action['kind'], PandaIconName> = {
  website: 'globe',
  directions: 'navigate',
  transit: 'map',
  dining: 'globe',
  tickets: 'calendar',
};

function statusFor(venue: Venue): { label: string; tone: 'muted' | 'open' | 'closed' } {
  if (venue.source === 'openstreetmap') return { label: 'Hours not listed', tone: 'muted' };
  if (venue.cached || venue.detailsDeferred) return { label: 'Hours unverified', tone: 'muted' };
  return venue.openNow ? { label: 'Open now', tone: 'open' } : { label: 'Closed', tone: 'closed' };
}

export function NonHospitalityCard({
  venue,
  saved,
  onPress,
  onToggleSaved,
  compact = false,
  activitySurface,
}: NonHospitalityCardProps) {
  const colors = useColors();
  const isShop = venuePresentationCategory(venue) === 'Shop';
  const [busy, setBusy] = useState<Action['kind'] | null>(null);
  const actions = nonHospitalityActions(venue);
  const status = statusFor(venue);

  const accent = isShop ? colors.honey : colors.green700;
  const accentSoft = isShop ? colors.honeySoft : colors.mint100;
  const accentInk = isShop ? colors.honeyInk : colors.green800;
  const statusColor = status.tone === 'muted'
    ? colors.mutedForeground
    : status.tone === 'open' ? colors.openForeground : colors.closedForeground;
  const statusBg = status.tone === 'muted'
    ? colors.muted
    : status.tone === 'open' ? colors.openBackground : colors.closedBackground;

  const runAction = async (event: GestureResponderEvent, action: Action) => {
    event.stopPropagation();
    if (busy) return;
    setBusy(action.kind);
    try {
      await openNonHospitalityAction(venue, action, activitySurface);
    } catch (error) {
      Alert.alert(
        `Couldn't open ${action.label.toLowerCase()}`,
        error instanceof Error && error.message ? error.message : `Please try again in a moment.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const onSave = (event: GestureResponderEvent) => {
    event.stopPropagation();
    recordVenueActivity('save_click', venue, activitySurface);
    onToggleSaved();
  };

  if (isShop) {
    const shopActions = actions.filter((action) => action.kind === 'directions' || action.kind === 'transit' || action.kind === 'website');
    const thumb = compact ? 92 : 112;
    const meta = [venue.rating ? `${venue.rating} rating` : '', venue.walkingTime || '', status.label].filter(Boolean).join(', ');
    return (
      <Pressable
        testID={`non-hospitality-card-${venue.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, shop, ${venue.type || venue.category}${meta ? `, ${meta}` : ''}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          shopStyles.card,
          compact && styles.compactCard,
          { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.green950 },
          pressed && styles.pressed,
        ]}
      >
        <View style={shopStyles.top}>
          <View style={[shopStyles.thumb, { width: thumb, height: thumb, backgroundColor: colors.secondary }]}>
            <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={thumb} />
          </View>
          <View style={shopStyles.info}>
            <View style={shopStyles.eyebrowRow}>
              <View style={[shopStyles.eyebrowDot, { backgroundColor: colors.honey }]} />
              <Text numberOfLines={1} style={[shopStyles.eyebrow, { color: colors.honeyInk }]}>
                {(venue.type || venue.category || 'Shop').toUpperCase()}
              </Text>
            </View>
            <Text
              numberOfLines={compact ? 2 : 3}
              ellipsizeMode="tail"
              style={[shopStyles.name, compact && shopStyles.compactName, { color: colors.foreground }]}
            >
              {venue.name}
            </Text>
            <View style={shopStyles.metaRow}>
              {venue.rating ? (
                <View style={styles.metaItem}>
                  <PandaIcon name="star" size={12} color={colors.honey} strokeWidth={2.2} />
                  <Text style={[shopStyles.metaText, { color: colors.foreground }]}>{venue.rating}</Text>
                </View>
              ) : null}
              {venue.walkingTime ? (
                <View style={[styles.metaItem, styles.shrink]}>
                  <PandaIcon name="walk" size={12} color={colors.mutedForeground} />
                  <Text numberOfLines={1} style={[shopStyles.metaText, styles.shrink, { color: colors.mutedForeground }]}>
                    {venue.walkingTime}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.metaItem}>
              <View style={[shopStyles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[shopStyles.status, { color: statusColor }]}>{status.label}</Text>
            </View>
          </View>
          <Pressable
            testID={`save-${venue.id}`}
            accessibilityLabel={saved ? `Remove ${venue.name} from saved places` : `Save ${venue.name}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSave}
            style={({ pressed }) => [
              shopStyles.save,
              { backgroundColor: saved ? colors.closedBackground : colors.secondary },
              pressed && styles.iconPressed,
            ]}
          >
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={18} color={saved ? colors.destructive : colors.honeyInk} />
          </Pressable>
        </View>

        {venue.sourceAttribution ? (
          <Text numberOfLines={1} style={[shopStyles.attribution, { color: colors.mutedForeground }]}>
            {venue.sourceAttribution}
          </Text>
        ) : null}

        {shopActions.length ? (
          <View style={[shopStyles.actions, { borderTopColor: colors.border }]}>
            {shopActions.map((action, index) => {
              const isBusy = busy === action.kind;
              const primary = index === 0;
              const fg = primary ? colors.primaryForeground : colors.green800;
              return (
                <Pressable
                  key={`${action.kind}-${action.url}`}
                  testID={`nh-action-${action.kind}-${venue.id}`}
                  accessibilityRole="link"
                  accessibilityLabel={`${action.label} for ${venue.name}`}
                  accessibilityState={{ busy: isBusy, disabled: !!busy }}
                  disabled={!!busy}
                  onPress={(event) => { void runAction(event, action); }}
                  style={({ pressed }) => [
                    shopStyles.action,
                    primary
                      ? { backgroundColor: colors.green800 }
                      : { backgroundColor: colors.secondary },
                    (pressed || isBusy) && styles.iconPressed,
                  ]}
                >
                  <PandaIcon name={actionIcon[action.kind]} size={13} color={fg} strokeWidth={2} />
                  <Text numberOfLines={1} style={[shopStyles.actionText, { color: fg }]}>
                    {isBusy ? 'Opening' : action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Pressable>
    );
  }

  const photoHeight = compact ? 96 : isShop ? 124 : 140;

  return (
    <Pressable
      testID={`non-hospitality-card-${venue.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${isShop ? 'shop' : 'place of interest'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        {
          backgroundColor: isShop ? colors.card : colors.secondary,
          borderColor: isShop ? colors.goldLine : colors.mint300,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.photo}>
        <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={photoHeight} />
        <View
          style={[
            styles.kindTag,
            compact && styles.compactKindTag,
            isShop
              ? { backgroundColor: colors.goldSoft, borderColor: colors.goldLine }
              : { backgroundColor: colors.photoOverlay, borderColor: colors.mint300 },
          ]}
        >
          {isShop
            ? <Feather name="shopping-bag" size={compact ? 9 : 11} color={colors.honeyInk} />
            : <PandaIcon name="map-pin" size={compact ? 10 : 12} color={colors.photoCredit} strokeWidth={2.2} />}
          <Text
            numberOfLines={1}
            style={[styles.kindText, compact && styles.compactKindText, { color: isShop ? colors.honeyInk : colors.photoCredit }]}
          >
            {isShop ? 'SHOP' : 'SIGHTSEEING'}
          </Text>
        </View>
        <Pressable
          testID={`save-${venue.id}`}
          accessibilityLabel={saved ? `Remove ${venue.name} from saved places` : `Save ${venue.name}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onSave}
          style={({ pressed }) => [
            styles.heartButton,
            compact && styles.compactHeart,
            { backgroundColor: colors.ivory },
            pressed && styles.iconPressed,
          ]}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={compact ? 16 : 19} color={saved ? colors.destructive : accent} />
        </Pressable>
      </View>

      {!isShop ? <View style={[styles.band, { backgroundColor: colors.goldLine }]} /> : null}

      <View style={[styles.body, compact && styles.compactBody, isShop && { borderLeftWidth: 4, borderLeftColor: colors.honey }]}>
        <Text
          numberOfLines={compact ? 2 : 3}
          ellipsizeMode="tail"
          style={[styles.name, compact && styles.compactName, { color: colors.foreground }]}
        >
          {venue.name}
        </Text>

        <Text numberOfLines={1} style={[styles.typeText, compact && styles.compactMeta, { color: accentInk }]}>
          {venue.type || venue.category}
        </Text>

        <View style={[styles.metaRow, compact && styles.compactMetaRow]}>
          {venue.rating ? (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={compact ? 11 : 13} color={colors.honey} />
              <Text style={[styles.metaText, compact && styles.compactMeta, { color: colors.foreground }]}>{venue.rating}</Text>
            </View>
          ) : null}
          {venue.walkingTime ? (
            <View style={[styles.metaItem, styles.shrink]}>
              <PandaIcon name="walk" size={compact ? 11 : 13} color={colors.mutedForeground} />
              <Text numberOfLines={1} style={[styles.metaText, compact && styles.compactMeta, styles.shrink, { color: colors.mutedForeground }]}>
                {venue.walkingTime}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.statusPill, compact && styles.compactStatus, { backgroundColor: statusBg }]}>
          <PandaIcon name="clock" size={compact ? 10 : 11} color={statusColor} strokeWidth={2.2} />
          <Text style={[styles.statusText, compact && styles.compactMeta, { color: statusColor }]}>{status.label}</Text>
        </View>

        {venue.sourceAttribution ? (
          <Text numberOfLines={2} style={[styles.attribution, { color: colors.mutedForeground }]}>
            {venue.sourceAttribution}
          </Text>
        ) : null}

        {!!admissionLabel(venue) && <Text numberOfLines={3} style={{ color: colors.green800, fontSize: 12, lineHeight: 17, marginBottom: 8 }}>{admissionLabel(venue)}</Text>}
        {actions.length ? (
          <View style={[styles.actions, compact && styles.compactActions]}>
            {actions.map((action, index) => {
              const primary = index === 0;
              const isBusy = busy === action.kind;
              const fg = primary ? (isShop ? colors.honeyInk : colors.primaryForeground) : accentInk;
              return (
                <Pressable
                  key={`${action.kind}-${action.url}`}
                  testID={`nh-action-${action.kind}-${venue.id}`}
                  accessibilityRole="link"
                  accessibilityLabel={`${action.label} for ${venue.name}`}
                  accessibilityState={{ busy: isBusy, disabled: !!busy }}
                  disabled={!!busy}
                  onPress={(event) => { void runAction(event, action); }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    compact && styles.compactAction,
                    primary
                      ? { backgroundColor: isShop ? colors.honeySoft : colors.green700, borderColor: isShop ? colors.honey : colors.green700 }
                      : { backgroundColor: accentSoft, borderColor: colors.border },
                    (pressed || isBusy) && styles.iconPressed,
                  ]}
                >
                  <PandaIcon name={actionIcon[action.kind]} size={compact ? 12 : 14} color={fg} strokeWidth={2} />
                  <Text numberOfLines={1} style={[styles.actionText, compact && styles.compactActionText, { color: fg }]}>
                    {isBusy ? 'Opening' : action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    elevation: 3,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    width: '100%',
  },
  compactCard: { borderRadius: 16 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  photo: { overflow: 'hidden', position: 'relative' },
  kindTag: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    left: 10,
    maxWidth: '70%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    top: 10,
    zIndex: 10,
  },
  compactKindTag: { gap: 3, left: 7, paddingHorizontal: 6, paddingVertical: 3, top: 7 },
  kindText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1 },
  compactKindText: { fontSize: 7.5, letterSpacing: 0.8 },
  heartButton: {
    alignItems: 'center',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 9,
    top: 8,
    width: 34,
    zIndex: 12,
  },
  compactHeart: { borderRadius: 14, height: 28, right: 6, top: 6, width: 28 },
  iconPressed: { opacity: 0.6, transform: [{ scale: 0.95 }] },
  band: { height: 3, width: '100%' },
  body: { padding: 13 },
  compactBody: { padding: 9 },
  name: { fontFamily: 'serif', fontSize: 18, letterSpacing: -0.4, lineHeight: 22 },
  compactName: { fontSize: 15, lineHeight: 18.5 },
  typeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3, marginTop: 4 },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 7 },
  compactMetaRow: { gap: 6, marginTop: 5 },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  shrink: { flexShrink: 1 },
  metaText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  compactMeta: { fontSize: 10 },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  compactStatus: { marginTop: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  attribution: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  compactActions: { gap: 5, marginTop: 8 },
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 0,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 92,
    paddingHorizontal: 9,
  },
  compactAction: { borderRadius: 10, gap: 4, minHeight: 32, minWidth: 0, paddingHorizontal: 6 },
  actionText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  compactActionText: { fontSize: 10.5 },
});


const shopStyles = StyleSheet.create({
  card: { borderRadius: 18, padding: 10, elevation: 2, shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { borderRadius: 13, overflow: 'hidden' },
  info: { flex: 1, minWidth: 0, gap: 5, paddingTop: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  eyebrowDot: { width: 5, height: 5, borderRadius: 3 },
  eyebrow: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 9.5, letterSpacing: 1 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  compactName: { fontSize: 14, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  metaText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5 },
  save: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  attribution: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6 },
  actionText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
});
