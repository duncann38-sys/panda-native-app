export type VenueWeatherInput = {
  condition: string;
  temperatureC: number;
  emoji: string;
};

export type VenueWeatherPresentation = {
  emoji: string;
  condition: string;
};

export function venueWeatherNightStartHour(date: Date): number {
  const month = date.getMonth();
  if ([10, 11, 0, 1].includes(month)) return 16;
  if ([2, 3, 4, 8, 9].includes(month)) return 18;
  return 20;
}

export function isVenueWeatherNight(date: Date): boolean {
  const hour = date.getHours();
  return hour < 6 || hour >= venueWeatherNightStartHour(date);
}

export function venueWeatherPresentation(weather: VenueWeatherInput, nightMode: boolean): VenueWeatherPresentation {
  if (!nightMode) return { emoji: weather.emoji, condition: weather.condition };

  const condition = weather.condition.trim();
  const normalized = condition.toLowerCase();
  if (/thunder|storm|lightning/.test(normalized)) return { emoji: '⛈️', condition: 'Stormy night' };
  if (/snow|sleet|ice/.test(normalized)) return { emoji: '🌨️', condition: 'Snowy night' };
  if (/rain|drizzle|shower/.test(normalized)) {
    const label = condition || 'Rain';
    return { emoji: '🌧️', condition: /night|tonight/i.test(label) ? label : label + ' tonight' };
  }
  if (/fog|mist|haze/.test(normalized)) return { emoji: '🌫️', condition: 'Foggy night' };
  if (/cloud|overcast/.test(normalized)) {
    const partly = /partly|some|broken/.test(normalized);
    return { emoji: partly ? '🌙☁️' : '☁️', condition: partly ? 'Partly cloudy night' : 'Cloudy night' };
  }
  if (/clear|sun|fair/.test(normalized)) {
    if (weather.temperatureC >= 20) return { emoji: '🌙', condition: 'Warm night' };
    if (weather.temperatureC >= 12) return { emoji: '🌙', condition: 'Mild night' };
    return { emoji: '🌙', condition: 'Clear night' };
  }

  const fallback = condition ? condition[0].toUpperCase() + condition.slice(1) + ' tonight' : 'Nighttime conditions';
  return { emoji: '🌙', condition: fallback };
}
