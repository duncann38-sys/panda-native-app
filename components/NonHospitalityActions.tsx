import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { PandaIcon, type PandaIconName } from './PandaIcon';
import { admissionLabel, loadVisitInformation, nonHospitalityActions, openNonHospitalityAction, verifiedVisitInfo } from '@/utils/non-hospitality-actions';
const icons: Record<ReturnType<typeof nonHospitalityActions>[number]['kind'], PandaIconName> = {
  directions: 'navigate', transit: 'map', website: 'globe', tickets: 'calendar', dining: 'globe',
};
export function NonHospitalityActions({ venue }: { venue: Venue }) {
  const colors = useColors();
  const [result, setResult] = useState<{ id: string; venue?: Venue; error?: string } | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    void loadVisitInformation(venue, controller.signal).then(
      updated => { if (!controller.signal.aborted) setResult({ id: venue.id, venue: updated }); },
      () => { if (!controller.signal.aborted) setResult({ id: venue.id, error: 'Visitor information could not be verified. Please check the official website.' }); },
    ).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [venue.id]);
  const loaded = result?.id === venue.id ? result : null;
  const current = loaded?.venue ? { ...venue, website: loaded.venue.website, officialVisitInfo: loaded.venue.officialVisitInfo } : venue;
  const entry = admissionLabel(current);
  const source = verifiedVisitInfo(current)?.sourceUrl;
  return <View style={{ marginHorizontal: 18, marginVertical: 12, gap: 12 }}>
    {!!entry && <View style={{ backgroundColor: colors.secondary, borderRadius: 16, padding: 14, gap: 7 }}>
      <Text style={{ color: colors.green800, fontFamily: 'Inter_600SemiBold', lineHeight: 21 }}>{entry}</Text>
      {!!source && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(source).catch(() => Alert.alert('Website unavailable', 'Please try the Website button.')); }}>
        <Text style={{ color: colors.green700, textDecorationLine: 'underline', fontSize: 12 }}>Official visitor information</Text>
      </Pressable>}
      {!!loaded?.error && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{loaded.error}</Text>}
    </View>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {nonHospitalityActions(current).map(action => <Pressable key={action.kind}
        testID={`visit-action-${action.kind}-${venue.id}`} accessibilityRole="button" disabled={!!busy}
        onPress={() => {
          setBusy(action.kind);
          void openNonHospitalityAction(current, action).catch(error =>
            Alert.alert('Link unavailable', error instanceof Error ? error.message : 'Please check the official website.'))
            .finally(() => setBusy(''));
        }}
        style={{ minWidth: '45%', flexGrow: 1, minHeight: 48, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: action.kind === 'website' ? colors.honeySoft : colors.green800, opacity: busy ? 0.65 : 1 }}>
        <PandaIcon name={icons[action.kind]} size={18} color={action.kind === 'website' ? colors.honeyInk : colors.primaryForeground} />
        <Text style={{ color: action.kind === 'website' ? colors.honeyInk : colors.primaryForeground, fontFamily: 'Inter_600SemiBold', flexShrink: 1 }}>
          {busy === action.kind ? 'Opening…' : action.label}
        </Text>
      </Pressable>)}
    </View>
  </View>;
}
