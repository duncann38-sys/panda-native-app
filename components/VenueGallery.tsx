import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Platform, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaIcon } from './PandaIcon';
import type { VenuePhotoItem } from './VenuePhoto';

export function VenueGallery({ photos, venueName, initialIndex, visible, onClose }: {
  photos: VenuePhotoItem[]; venueName: string; initialIndex: number; visible: boolean; onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    const timer = setTimeout(() => scroll.current?.scrollTo({ x: initialIndex * width, animated: false }), 50);
    return () => clearTimeout(timer);
  }, [visible, initialIndex, width]);
  const top = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0) + 16;
  return <Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent={false}>
    <View style={{ flex: 1, backgroundColor: '#071b14' }}>
      <Image source={{ uri: photos[index]?.uri }} contentFit="cover" blurRadius={30}
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.75 }} />
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={event => setIndex(Math.min(photos.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)))}>
        {photos.map((photo, i) => <View key={photo.uri} style={{ width, height: '100%', paddingTop: top + 60, paddingBottom: Math.max(insets.bottom, 20) + 94 }}>
          {Math.abs(i - index) <= 1 ? <Image source={{ uri: photo.uri }} contentFit="contain"
            accessibilityLabel={`${venueName} full photo ${i + 1} of ${photos.length}`}
            style={{ width, flex: 1 }} /> : null}
        </View>)}
      </ScrollView>
      <Pressable testID="gallery-close" accessibilityLabel="Close gallery" accessibilityRole="button"
        hitSlop={12} onPress={onClose} style={{ position: 'absolute', top, right: 20, width: 52, height: 52,
          borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffdf2', elevation: 8 }}>
        <PandaIcon name="x" size={25} color="#07553e" />
      </Pressable>
      <View pointerEvents="none" style={{ position: 'absolute', bottom: Math.max(insets.bottom, 20) + 12, left: 20,
        right: 20, padding: 16, borderRadius: 18, backgroundColor: '#000b' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{venueName} · {index + 1}/{photos.length}</Text>
        <Text style={{ color: '#fff', marginTop: 5 }} numberOfLines={2}>{photos[index]?.attribution ? `Photo by ${photos[index].attribution}` : 'Google Maps photo'}</Text>
      </View>
    </View>
  </Modal>;
}
