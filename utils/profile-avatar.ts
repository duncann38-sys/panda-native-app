type AvatarFiles = {
  documentDirectory: string | null;
  makeDirectoryAsync: (uri: string, options: { intermediates: boolean }) => Promise<void>;
  copyAsync: (options: { from: string; to: string }) => Promise<void>;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; size?: number }>;
  deleteAsync: (uri: string, options: { idempotent: boolean }) => Promise<void>;
};

export async function removeProfileAvatar(uri: string, files: AvatarFiles): Promise<void> {
  const prefix = `${files.documentDirectory}panda-profile-avatars/`;
  if (files.documentDirectory && uri.startsWith(prefix) && /^[a-z0-9-]+\.jpg$/.test(uri.slice(prefix.length))) {
    await files.deleteAsync(uri, { idempotent: true });
  }
}

/** Picker URIs live in a reclaimable cache. Copy before committing the preference. */
export async function persistProfileAvatar(uri: string, files: AvatarFiles): Promise<string> {
  if (!files.documentDirectory) throw new Error('Private photo storage is unavailable.');
  const directory = `${files.documentDirectory}panda-profile-avatars/`;
  await files.makeDirectoryAsync(directory, { intermediates: true });
  const target = `${directory}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`;
  try {
    await files.copyAsync({ from: uri, to: target });
    const info = await files.getInfoAsync(target);
    if (!info.exists || info.size === 0) throw new Error('The profile photo could not be copied.');
    return target;
  } catch (error) {
    await removeProfileAvatar(target, files).catch(() => {});
    throw error;
  }
}
