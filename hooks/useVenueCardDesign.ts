import { useFonts } from 'expo-font';
import { useColorScheme } from 'react-native';
import { venueCardPalette } from '@/constants/venue-card-design';
import { useColors } from '@/hooks/useColors';

export type VenueCardFonts = { display: string; medium: string; bold: string };

export function useVenueCardDesign(preferredScheme?: 'light' | 'dark') {
  const deviceScheme = useColorScheme();
  const scheme = preferredScheme ?? deviceScheme;
  const colors = useColors(preferredScheme);
  const [fontsLoaded] = useFonts({
    PandaVenueSerif: require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    PandaVenueMedium: require('../assets/fonts/DMSans-Medium.ttf'),
    PandaVenueBold: require('../assets/fonts/DMSans-Bold.ttf'),
  });
  // Font loading never blocks the screen; the established fonts also handle a
  // failed load. The new families are used only by Discover rows/venue details.
  const fonts: VenueCardFonts = fontsLoaded
    ? { display: 'PandaVenueSerif', medium: 'PandaVenueMedium', bold: 'PandaVenueBold' }
    : { display: 'serif', medium: 'Inter_500Medium', bold: 'Inter_700Bold' };
  const cardColors = scheme === 'dark' ? {
    ...venueCardPalette,
    surface: colors.card,
    row: colors.card,
    premiumSurface: colors.ivory,
    ink: colors.foreground,
    muted: colors.mutedForeground,
    border: colors.border,
    rule: colors.border,
    soft: colors.muted,
    gold: colors.gold,
    goldSoft: colors.goldSoft,
    goldInk: colors.honeyInk,
    primaryAction: colors.honey,
    secondaryAction: colors.goldSoft,
    savedSurface: colors.closedBackground,
  } : venueCardPalette;
  return { cardColors, fonts };
}
