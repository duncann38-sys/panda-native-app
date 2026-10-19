import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const profilePhoto = require('../assets/duncan-profile.png');

export function ProfileAvatar({
  size,
  active = false,
  showAdd = false,
  name,
  imageUri,
  onPress,
}: {
  size: number;
  active?: boolean;
  showAdd?: boolean;
  name?: string | null;
  imageUri?: string | null;
  onPress?: () => void;
}) {
  const colors = useColors();
  const addSize = Math.max(22, Math.round(size * 0.28));
  const cleanName = name?.trim() ?? '';
  const initials = cleanName
    ? cleanName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : 'P';
  const source = imageUri
    ? { uri: imageUri }
    : cleanName.toLocaleLowerCase('en-GB') === 'duncan nyanzi'
      ? profilePhoto
      : null;

  return (
    <Pressable
      accessibilityLabel={onPress ? 'Change profile photo' : `${cleanName || 'Panda'} profile photo`}
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{ height: size + (showAdd ? 2 : 0), width: size + (showAdd ? 2 : 0) }}
    >
      <View style={{ height: size + (showAdd ? 2 : 0), width: size + (showAdd ? 2 : 0) }}>
        {source ? (
          <Image
            source={source}
            contentFit="cover"
            accessibilityLabel={`${cleanName || 'Panda'} profile photo`}
            style={[
              styles.photo,
              {
                borderColor: active ? colors.gold : colors.card,
                borderWidth: active ? 2 : 1,
                borderRadius: size / 2,
                height: size,
                width: size,
              },
            ]}
          />
        ) : (
          <View
            style={[
              styles.initials,
              {
                backgroundColor: colors.secondary,
                borderColor: active ? colors.gold : colors.card,
                borderRadius: size / 2,
                borderWidth: active ? 2 : 1,
                height: size,
                width: size,
              },
            ]}
          >
            <Text style={[styles.initialsText, { color: colors.green800, fontSize: size * 0.34 }]}>
              {initials}
            </Text>
          </View>
        )}
        {showAdd ? (
          <View
            style={[
              styles.addBadge,
              {
                backgroundColor: colors.honeySoft,
                borderColor: colors.green700,
                borderRadius: addSize / 2,
                height: addSize,
                right: -1,
                width: addSize,
              },
            ]}
          >
            <Ionicons name="add" size={Math.max(14, Math.round(addSize * 0.65))} color={colors.honeyInk} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: '#DDF0DE' },
  initials: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  initialsText: { fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  addBadge: { borderWidth: 1.5, bottom: -1, position: 'absolute' },
});