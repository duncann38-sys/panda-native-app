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
  return `@panda-mobile/profile-preferences:${userId || 'guest'}`;
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
