export type PandaTimeMode = 'morning' | 'lunch' | 'night';

/**
 * Keep the planner shortcut and Panda's greeting on the same day-part boundaries.
 * Morning starts at 05:00, lunch at 12:00, and evening/night at 16:00.
 * The overnight window stays in night mode until the morning begins.
 */
export function getPandaTimeMode(date = new Date()): PandaTimeMode {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 16) return 'lunch';
  return 'night';
}

export function getPandaTimeLabel(mode: PandaTimeMode) {
  return mode[0].toUpperCase() + mode.slice(1);
}

export function getPandaTimeEmoji(mode: PandaTimeMode) {
  return mode === 'morning' ? '🌅' : mode === 'lunch' ? '🍽️' : '🌙';
}