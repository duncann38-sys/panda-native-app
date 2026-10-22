export type ProfilePreferences = {
  displayName: string;
  dateOfBirth: string;
  notificationsEnabled: boolean;
  avatarUri: string;
};

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  displayName: '',
  dateOfBirth: '',
  notificationsEnabled: true,
  avatarUri: '',
};

export function profilePreferencesStorageKey(userId?: string | null): string {
  if (!userId) return 'panda.profile-preferences.v2.guest';
  const encoded = userId.split('').map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  return `panda.profile-preferences.v2.user.${encoded}`;
}

type PreferenceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

/** Keep native private fields in SecureStore; migrate older local values only after a successful write. */
export function createProfilePreferenceStorage(primary: PreferenceStorage, legacy: PreferenceStorage, removeLegacy = false) {
  const writes = new Map<string, Promise<ProfilePreferences>>();
  async function readRaw(userId?: string | null): Promise<string | null> {
    const key = profilePreferencesStorageKey(userId);
    const current = await primary.getItem(key);
    if (current !== null) return current;
    const legacyKey = `@panda-mobile/profile-preferences:${userId || 'guest'}`;
    const old = await legacy.getItem(legacyKey);
    if (old === null) return null;
    await primary.setItem(key, old);
    if (removeLegacy) await legacy.removeItem?.(legacyKey).catch(() => {});
    return old;
  }
  return {
    async read(userId?: string | null) {
      await writes.get(profilePreferencesStorageKey(userId))?.catch(() => {});
      return readRaw(userId);
    },
    update(userId: string | null | undefined, patch: Partial<ProfilePreferences>): Promise<ProfilePreferences> {
      const key = profilePreferencesStorageKey(userId);
      const task = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
        const next = { ...parseProfilePreferences(await readRaw(userId)), ...patch };
        await primary.setItem(key, JSON.stringify(next));
        return next;
      });
      writes.set(key, task);
      void task.finally(() => { if (writes.get(key) === task) writes.delete(key); }).catch(() => {});
      return task;
    },
  };
}

export function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function validateDateOfBirth(value: string, today = new Date()): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return 'Enter your date of birth as DD/MM/YYYY.';

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return 'Enter a valid date of birth.';
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date > today
  ) {
    return 'Enter a valid date of birth that is not in the future.';
  }
  return null;
}

export function parseProfilePreferences(value: string | null): ProfilePreferences {
  if (!value) return { ...DEFAULT_PROFILE_PREFERENCES };
  try {
    const parsed = JSON.parse(value) as Partial<ProfilePreferences>;
    const dateOfBirth = typeof parsed.dateOfBirth === 'string' ? parsed.dateOfBirth : '';
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName.trim().slice(0, 60) : '',
      dateOfBirth: validateDateOfBirth(dateOfBirth) ? '' : dateOfBirth,
      notificationsEnabled:
        typeof parsed.notificationsEnabled === 'boolean'
          ? parsed.notificationsEnabled
          : DEFAULT_PROFILE_PREFERENCES.notificationsEnabled,
      avatarUri: typeof parsed.avatarUri === 'string' ? parsed.avatarUri : '',
    };
  } catch {
    return { ...DEFAULT_PROFILE_PREFERENCES };
  }
}
