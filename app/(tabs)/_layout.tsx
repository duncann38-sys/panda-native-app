import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { PandaLogo } from '@/components/PandaLogo';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { PandaIcon } from '@/components/PandaIcon';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="map">
        <Icon sf={{ default: 'map', selected: 'map.fill' }} />
        <Label>Map</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="credit">
        <Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />
        <Label>Credit</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ai">
        <Icon sf={{ default: 'face.smiling', selected: 'face.smiling.fill' }} />
        <Label>Panda AI</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.goldDeep,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.ivory,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
           height: isWeb ? 84 : 78 + androidBottomInset,
          overflow: 'visible',
           paddingBottom: isWeb ? 10 : 7 + androidBottomInset,
          paddingTop: 6,
          shadowColor: colors.green900,
          shadowOffset: { width: 0, height: -7 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
        },
        tabBarItemStyle: {
          height: 65,
          paddingTop: 2,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          marginTop: 1,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.ivory },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <PandaIcon name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="map" tintColor={color} size={24} />
            ) : (
              <PandaIcon name="map" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="credit"
        options={{
          title: 'Credit',
          tabBarIcon: () => <CreditCardTabIcon />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'Panda AI',
          tabBarIcon: () => <PandaLogo size={25} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <ProfileTabIcon color={color} focused={focused} />
            ),
        }}
      />
      <Tabs.Screen name="saved" options={{ href: null }} />
    </Tabs>
  );
}

function CreditCardTabIcon() {
  const colors = useColors();

  return (
    <LinearGradient
      colors={[colors.pandaCardHighlight, colors.pandaCard]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.creditCardTabIcon}
    >
      <View style={styles.creditCardTabTop}>
        <View style={[styles.creditCardTabMark, { backgroundColor: '#FFFDF8' }]}>
          <PandaLogo size={10} />
        </View>
      </View>
      <View style={[styles.creditCardTabChip, { backgroundColor: colors.mastercardYellow }]}>
        <View style={styles.creditCardTabChipLine} />
        <View style={styles.creditCardTabChipLine} />
      </View>
      <View style={styles.creditCardTabNumber}>
        <View style={[styles.creditCardTabDot, { backgroundColor: colors.pandaCardInk }]} />
        <View style={[styles.creditCardTabDot, { backgroundColor: colors.pandaCardInk }]} />
        <View style={[styles.creditCardTabDot, { backgroundColor: colors.pandaCardInk }]} />
        <View style={[styles.creditCardTabDot, { backgroundColor: colors.pandaCardInk }]} />
        <View style={[styles.creditCardTabNumberText, { backgroundColor: colors.pandaCardInk }]} />
      </View>
    </LinearGradient>
  );
}

function ProfileTabIcon({ color, focused }: { color: string; focused: boolean }) {
  return <ProfileAvatar size={31} active={focused} />;
}

const styles = StyleSheet.create({
  creditCardTabIcon: {
    borderRadius: 4,
    height: 22,
    overflow: 'hidden',
    padding: 2,
    width: 31,
  },
  creditCardTabTop: { alignItems: 'flex-end', height: 8 },
  creditCardTabMark: { borderRadius: 2, height: 8, overflow: 'hidden', width: 8 },
  creditCardTabChip: {
    borderRadius: 1.5,
    height: 5,
    justifyContent: 'space-evenly',
    marginTop: 1,
    paddingHorizontal: 1,
    width: 7,
  },
  creditCardTabChipLine: { backgroundColor: '#A90F2B', height: 0.8, width: '100%' },
  creditCardTabNumber: { alignItems: 'center', flexDirection: 'row', gap: 1.5, marginTop: 1.5 },
  creditCardTabDot: { borderRadius: 99, height: 1.5, width: 1.5 },
  creditCardTabNumberText: { height: 1.5, marginLeft: 1, width: 5 },
});

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
