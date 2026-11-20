import { StyleSheet } from 'react-native';
import type { useColors } from '@/hooks/useColors';

export type ConciergePalette = ReturnType<typeof useColors>;

/**
 * Small, additive refinements for the existing Panda AI chat.
 * Spread each key into the matching style array in app/ai.tsx, directly
 * after the base `styles.<key>` and before any inline colour object, so the
 * existing per-role / day-night colours still win.
 * Only layout, borders, type rhythm and soft tinted shadows are touched.
 */
export function conciergeChatPolish(colors: ConciergePalette) {
  return StyleSheet.create({
    header: {
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.green900,
      paddingBottom: 16,
      shadowColor: colors.green950,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 14,
      elevation: 6,
    },
    pandaAvatar: {
      borderWidth: 1.5,
      borderColor: colors.goldLine,
    },
    headerTitle: {
      fontFamily: 'serif',
      fontSize: 19,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      letterSpacing: 0.9,
      marginTop: 3,
      textTransform: 'uppercase',
    },
    messageRow: {
      paddingVertical: 2,
    },
    speaker: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      marginLeft: 6,
      marginBottom: 4,
      marginTop: 6,
    },
    modelBubble: {
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderBottomRightRadius: 22,
    },
    userBubble: {
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderBottomLeftRadius: 22,
      borderWidth: 0,
    },
    bubbleText: {
      fontSize: 15.5,
      lineHeight: 23,
      letterSpacing: 0.05,
    },
    suggestionText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
    },
    bubble: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 17,
      paddingVertical: 12,
      shadowColor: colors.green950,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 1,
    },
    suggestion: {
      paddingHorizontal: 15,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: 'center',
      shadowColor: colors.green950,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    composer: {
      paddingTop: 12,
      shadowColor: colors.green950,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
    },
    input: {
      borderRadius: 22,
      borderColor: colors.mint300,
      minHeight: 48,
      paddingHorizontal: 18,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
    },
  });
}
