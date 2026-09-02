import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const profilePhoto = require('../assets/duncan-profile.png');

export function ProfileAvatar({
  size,
  active = false,
  showAdd = false,
}: {
  size: number;
  active?: boolean;
  showAdd?: boolean;
}) {
  const colors = useColors();
  const addSize = Math.max(22, Math.round(size * 0.28));

  return (
    <View style={{ height: size + (showAdd ? 2 : 0), width: size + (showAdd ? 2 : 0) }}>
      <Image
        source={profilePhoto}
        contentFit="cover"
        accessibilityLabel="Duncan Nyanzi profile photo"
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
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: '#DDF0DE' },
  addBadge: { borderWidth: 1.5, bottom: -1, position: 'absolute' },
});