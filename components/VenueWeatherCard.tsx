import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PANDA_RUNTIME_API } from "@/constants/services";
import { useColors } from "@/hooks/useColors";

type Weather = {
  observedAt: string;
  condition: string;
  temperatureC: number;
  emoji: string;
};

type Props = {
  placeId: string;
};

export function VenueWeatherCard({ placeId }: Props) {
  const colors = useColors();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          ? `Current weather at venue: ${Math.round(weather.temperatureC)} degrees Celsius, ${weather.condition}`
          : isLoading ? "Loading current venue weather" : "Current venue weather unavailable"
      }
      style={[
        styles.card,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
          borderRadius: colors.radius + 12,
          shadowColor: colors.green950,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 5 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.green800} />
        ) : (
          <Text style={styles.weatherIcon}>{weather?.emoji ?? "—"}</Text>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: colors.green700 }]}>AT THE VENUE · LIVE CONDITIONS</Text>
        {weather ? (
          <View style={styles.weatherLine}>
            <Text style={[styles.temperature, { color: colors.foreground }]}>
              {Math.round(weather.temperatureC)}°C
            </Text>
            <Text style={[styles.condition, { color: colors.mutedForeground }]} numberOfLines={1}>
              {weather.condition}
            </Text>
          </View>
        ) : (
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
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
