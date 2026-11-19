const PRIORITIES = {
  morning: ['Breakfast', 'Coffee', 'Brunch'],
  brunch: ['Brunch', 'Coffee', 'Bottomless', 'Lunch'],
  lunch: ['Lunch', 'Brunch', 'Bottomless', 'Coffee'],
  afternoon: ['Dinner', 'Drinks', 'Bar', 'Pubs'],
  evening: ['Dinner', 'Bar', 'Pubs', 'Drinks', 'Live Music'],
  late: ['Nightlife', 'Bar', 'Pubs', 'Live Music'],
};
export function discoveryDayPart(date = new Date()): keyof typeof PRIORITIES {
  const hour = date.getHours();
  return hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 12 ? 'brunch'
    : hour >= 12 && hour < 16 ? 'lunch' : hour >= 16 && hour < 18 ? 'afternoon'
      : hour >= 18 && hour < 22 ? 'evening' : 'late';
}
export function orderDiscoveryCategories<T extends { label: string }>(categories: T[], part: keyof typeof PRIORITIES) {
  const priority: readonly string[] = ['All', ...PRIORITIES[part]];
  const rank = (item: T) => { const index = priority.indexOf(item.label); return index < 0 ? 100 : index; };
  return categories.map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(entry => entry.item);
}
