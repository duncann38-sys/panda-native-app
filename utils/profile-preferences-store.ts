import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createProfilePreferenceStorage } from '@/utils/profile-preferences';

export const profilePreferenceStore = createProfilePreferenceStorage(
  Platform.OS === 'web'
    ? AsyncStorage
    : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
      },
  AsyncStorage,
  Platform.OS !== 'web',
);
