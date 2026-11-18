import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { PandaIcon } from './PandaIcon';

type Props = {
  venue: Venue;
  surface: Parameters<typeof recordVenueActivity>[2];
  contacts: { website: string | null; phone: string | null; maps: string | null };
  onWebsite: () => void;
  showWebsite?: boolean;
};

export function ReservationContactActions({ venue, surface, contacts, onWebsite, showWebsite = true }: Props) {
  const colors = useColors();
  const [launchFailed, setLaunchFailed] = useState(false);
  const open = async (url: string, call = false) => {
    setLaunchFailed(false);
    if (call) recordVenueActivity('call_click', venue, surface);
    try { await Linking.openURL(url); } catch { setLaunchFailed(true); }
  };
  return <View style={styles.actions}>
    {showWebsite && contacts.website ? <Pressable testID="reservation-website" accessibilityRole="link"
      onPress={onWebsite} style={[styles.button, { backgroundColor: colors.green800 }]}>
      <PandaIcon name="globe" size={17} color={colors.primaryForeground} />
      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Visit venue website</Text>
    </Pressable> : null}
    {contacts.phone ? <>
      <Pressable testID="reservation-call" accessibilityRole="button"
        accessibilityLabel={`Call ${venue.name} to reserve on ${contacts.phone}`}
        onPress={() => void open(`tel:${contacts.phone}`, true)}
        style={[styles.button, { backgroundColor: colors.green800 }]}>
        <PandaIcon name="phone" size={17} color={colors.primaryForeground} />
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Call to reserve</Text>
      </Pressable>
      <Text selectable testID="reservation-phone-number" style={[styles.detail, { color: colors.foreground }]}>{contacts.phone}</Text>
    </> : null}
    {contacts.maps ? <Pressable testID="reservation-maps" accessibilityRole="link"
      onPress={() => void open(contacts.maps!)}
      style={[styles.button, { borderColor: colors.green800, borderWidth: 1 }]}>
      <PandaIcon name="map-pin" size={17} color={colors.green800} />
      <Text style={[styles.buttonText, { color: colors.green800 }]}>View on Google Maps</Text>
    </Pressable> : null}
    {launchFailed ? <View testID="reservation-contact-error">
      <Text accessibilityRole="alert" style={[styles.detail, { color: colors.closedForeground }]}>
        Your phone couldn’t open that app. You can select and copy the number or listing address below.
      </Text>
      {contacts.maps ? <Text selectable style={[styles.detail, { color: colors.foreground }]}>{contacts.maps}</Text> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 10 },
  button: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  detail: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
