import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

  const photoHeight = compact ? 116 : 188;
  const attractionMeta = [
    venue.type || venue.category,
    venue.neighborhood,
    venue.rating ? `${venue.rating} stars` : '',
    status.label,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      testID={`non-hospitality-card-${venue.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, place of interest${attractionMeta ? `, ${attractionMeta}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        attractionStyles.card,
        compact && attractionStyles.compactCard,
        { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.green950 },
        pressed && styles.pressed,
      ]}
    >
      <View style={[attractionStyles.hero, { height: photoHeight, backgroundColor: colors.secondary }]}>
        <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={photoHeight} />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', colors.photoOverlay]}
          locations={[0.38, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={attractionStyles.heroTop}>
          <View style={[attractionStyles.kindTag, { backgroundColor: colors.photoOverlay, borderColor: colors.photoCredit }]}>
            <PandaIcon name="map-pin" size={compact ? 11 : 13} color={colors.photoCredit} strokeWidth={2.2} />
            <Text style={[attractionStyles.kindText, compact && attractionStyles.compactKindText, { color: colors.photoCredit }]}>
              SIGHTSEEING
            </Text>
          </View>
          <Pressable
            testID={`save-${venue.id}`}
            accessibilityLabel={saved ? `Remove ${venue.name} from saved places` : `Save ${venue.name}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onSave}
            style={({ pressed }) => [
              attractionStyles.heartButton,
              compact && attractionStyles.compactHeart,
              { backgroundColor: colors.ivory },
              pressed && styles.iconPressed,
            ]}
          >
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={compact ? 17 : 19} color={saved ? colors.destructive : colors.green800} />
          </Pressable>
        </View>
        {(venue.rating || venue.walkingTime) ? (
          <View style={attractionStyles.heroFacts}>
            {venue.rating ? (
              <View style={[attractionStyles.heroFact, { backgroundColor: colors.photoOverlay, borderColor: colors.photoCredit }]}>
                <PandaIcon name="star" size={compact ? 12 : 14} color={colors.honey} strokeWidth={2.2} />
                <Text style={[attractionStyles.heroFactText, compact && attractionStyles.compactHeroFactText, { color: colors.photoCredit }]}>
                  {venue.rating}
                  {venue.ratingCount > 0 ? ` · ${venue.ratingCount.toLocaleString()}` : ''}
                </Text>
              </View>
            ) : null}
            {venue.walkingTime ? (
              <View style={[attractionStyles.heroFact, { backgroundColor: colors.photoOverlay, borderColor: colors.photoCredit }]}>
                <PandaIcon name="walk" size={compact ? 12 : 14} color={colors.photoCredit} strokeWidth={2} />
                <Text numberOfLines={1} style={[attractionStyles.heroFactText, compact && attractionStyles.compactHeroFactText, { color: colors.photoCredit }]}>
                  {venue.walkingTime}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[attractionStyles.body, compact && attractionStyles.compactBody]}>
        <View style={attractionStyles.titleRow}>
          <View style={attractionStyles.titleBlock}>
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={[attractionStyles.name, compact && attractionStyles.compactName, { color: colors.foreground }]}
            >
              {venue.name}
            </Text>
            <Text numberOfLines={1} style={[attractionStyles.typeText, compact && attractionStyles.compactTypeText, { color: colors.green700 }]}>
              {venue.type || 'Place to visit'}
            </Text>
          </View>
          <View style={[attractionStyles.detailCue, compact && attractionStyles.compactDetailCue, { backgroundColor: colors.secondary }]}>
            <Feather name="arrow-up-right" size={compact ? 15 : 17} color={colors.green800} />
          </View>
        </View>

        <View style={attractionStyles.infoRow}>
          {(venue.neighborhood || venue.fullAddress) ? (
            <View style={[attractionStyles.location, { backgroundColor: colors.secondary }]}>
              <PandaIcon name="map-pin" size={12} color={colors.green800} strokeWidth={2.1} />
              <Text numberOfLines={1} style={[attractionStyles.locationText, { color: colors.foreground }]}>
                {venue.neighborhood || venue.fullAddress}
              </Text>
            </View>
          ) : null}
          <View style={[attractionStyles.statusPill, { backgroundColor: statusBg }]}>
            <View style={[attractionStyles.statusDot, { backgroundColor: statusColor }]} />
            <Text numberOfLines={1} style={[attractionStyles.statusText, { color: statusColor }]}>{status.label}</Text>
          </View>
        </View>

        {!!admissionLabel(venue) && (
          <View style={[attractionStyles.admission, { backgroundColor: colors.honeySoft }]}>
            <PandaIcon name="calendar" size={13} color={colors.honeyInk} strokeWidth={2} />
            <Text numberOfLines={2} style={[attractionStyles.admissionText, { color: colors.honeyInk }]}>
              {admissionLabel(venue)}
            </Text>
          </View>
        )}

        {actions.length ? (
          <View style={[attractionStyles.actions, compact && attractionStyles.compactActions]}>
            {actions.map((action, index) => {
              const primary = action.kind === 'directions' || (index === 0 && !actions.some(item => item.kind === 'directions'));
              const isBusy = busy === action.kind;
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
                    attractionStyles.actionButton,
                    compact && attractionStyles.compactAction,
                    primary && attractionStyles.primaryAction,
                    primary
                      ? { backgroundColor: colors.green800, borderColor: colors.green800 }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                    (pressed || isBusy) && styles.iconPressed,
                  ]}
                >
                  <PandaIcon name={actionIcon[action.kind]} size={compact ? 13 : 15} color={fg} strokeWidth={2} />
                  <Text numberOfLines={1} style={[attractionStyles.actionText, compact && attractionStyles.compactActionText, { color: fg }]}>
                    {isBusy ? 'Opening' : action.label}
                  </Text>
                  {primary ? <Feather name="arrow-right" size={14} color={fg} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {venue.sourceAttribution ? (
          <Text numberOfLines={1} style={[attractionStyles.attribution, { color: colors.mutedForeground }]}>
            {venue.sourceAttribution}
          </Text>
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

const attractionStyles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    elevation: 4,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    width: '100%',
  },
  compactCard: { borderRadius: 18, shadowOpacity: 0.08, shadowRadius: 12 },
  hero: { overflow: 'hidden', position: 'relative', width: '100%' },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 12,
    position: 'absolute',
    right: 12,
    top: 12,
  },
  kindTag: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  kindText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.15 },
  compactKindText: { fontSize: 8, letterSpacing: 0.8 },
  heartButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  compactHeart: { borderRadius: 18, height: 36, width: 36 },
  heroFacts: { alignItems: 'center', bottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, left: 13, position: 'absolute', right: 13 },
  heroFact: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroFactText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5 },
  compactHeroFactText: { fontSize: 10 },
  body: { gap: 12, padding: 16 },
  compactBody: { gap: 8, padding: 11 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.55, lineHeight: 25 },
  compactName: { fontSize: 16, lineHeight: 20 },
  typeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.2, marginTop: 4, textTransform: 'uppercase' },
  compactTypeText: { fontSize: 10.5, marginTop: 2 },
  detailCue: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  compactDetailCue: { borderRadius: 15, height: 30, width: 30 },
  infoRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  location: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', flex: 1, gap: 5, minWidth: 120, paddingHorizontal: 10, paddingVertical: 7 },
  locationText: { flexShrink: 1, fontFamily: 'Inter_500Medium', fontSize: 11.5 },
  statusPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  admission: { alignItems: 'flex-start', borderRadius: 13, flexDirection: 'row', gap: 8, paddingHorizontal: 11, paddingVertical: 9 },
  admissionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11.5, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactActions: { gap: 6 },
  actionButton: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: 10,
  },
  primaryAction: { flexBasis: '100%', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 15 },
  compactAction: { borderRadius: 11, gap: 5, minHeight: 38, minWidth: 120, paddingHorizontal: 8 },
  actionText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  compactActionText: { fontSize: 10.5 },
  attribution: { fontFamily: 'Inter_400Regular', fontSize: 9.5, marginTop: -2 },
});
