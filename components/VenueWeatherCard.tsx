import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PANDA_RUNTIME_API } from "@/constants/services";
import { useColors } from "@/hooks/useColors";
import { isVenueWeatherNight, venueWeatherPresentation } from "@/utils/venue-weather-display";

type Weather = {
  observedAt: string;
  condition: string;
  temperatureC: number;
  emoji: string;
};

type Props = {
  placeId: string;
};

const NIGHT_PALETTE = {
  card: "#142B26",
  border: "#35584C",
  icon: "#203C33",
  iconBorder: "#496B5D",
  eyebrow: "#B5D0C3",
  foreground: "#FBF5E6",
  muted: "#C7D7CF",
  accent: "#E4C978",
};

export function VenueWeatherCard({ placeId }: Props) {
  const colors = useColors();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localNow, setLocalNow] = useState(() => new Date());
  const nightMode = isVenueWeatherNight(localNow);
  const presentation = weather ? venueWeatherPresentation(weather, nightMode) : null;

  useEffect(() => {
    const timer = setInterval(() => setLocalNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setWeather(null);
    setIsLoading(true);

    const url = `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(placeId)}/weather`;
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Current weather is unavailable.");
        const payload = await response.json() as Partial<Weather>;
        if (
          typeof payload.observedAt !== "string"
          || typeof payload.condition !== "string"
          || typeof payload.temperatureC !== "number"
          || !Number.isFinite(payload.temperatureC)
          || typeof payload.emoji !== "string"
        ) {
          throw new Error("Current weather response was incomplete.");
        }
        return payload as Weather;
      })
      .then((value) => {
        if (active) setWeather(value);
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof Error && error.name === "AbortError")) {
          setWeather(null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [placeId]);

  return (
    <View
      accessibilityLabel={
        weather
          ? `${nightMode ? "Current nighttime weather" : "Current weather"} at venue: ${Math.round(weather.temperatureC)} degrees Celsius, ${presentation?.condition ?? weather.condition}`
          : isLoading ? "Loading current venue weather" : "Current venue weather unavailable"
      }
      style={[
        styles.card,
        {
          backgroundColor: nightMode ? NIGHT_PALETTE.card : colors.secondary,
          borderColor: nightMode ? NIGHT_PALETTE.border : colors.border,
          borderRadius: colors.radius + 12,
          shadowColor: colors.green950,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: nightMode ? NIGHT_PALETTE.icon : colors.card, borderColor: nightMode ? NIGHT_PALETTE.iconBorder : colors.border, borderRadius: colors.radius + 5 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={nightMode ? NIGHT_PALETTE.accent : colors.green800} />
        ) : (
          <Text style={styles.weatherIcon}>{presentation?.emoji ?? "—"}</Text>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: nightMode ? NIGHT_PALETTE.eyebrow : colors.green700 }]}>AT THE VENUE · {nightMode ? "NIGHT" : "LIVE"} CONDITIONS</Text>
        {weather ? (
          <View style={styles.weatherLine}>
            <Text style={[styles.temperature, { color: nightMode ? NIGHT_PALETTE.foreground : colors.foreground }]}>
              {Math.round(weather.temperatureC)}°C
            </Text>
            <Text style={[styles.condition, { color: nightMode ? NIGHT_PALETTE.muted : colors.mutedForeground }]} numberOfLines={1}>
              {presentation?.condition ?? weather.condition}
            </Text>
          </View>
        ) : (
          <Text style={[styles.statusText, { color: nightMode ? NIGHT_PALETTE.muted : colors.mutedForeground }]}>
            {isLoading ? "Checking the sky…" : "Weather unavailable right now"}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 78,
    marginHorizontal: 24,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherIcon: { fontSize: 23 },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  eyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  weatherLine: { flexDirection: "row", alignItems: "baseline", gap: 9 },
  temperature: { fontSize: 23, fontWeight: "700", lineHeight: 26 },
  condition: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  statusText: { fontSize: 13, fontWeight: "600" },
});
