import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type PandaIconName =
  | 'arrow-left'
  | 'trash'
  | 'mic'
  | 'mic-off'
  | 'send'
  | 'navigate'
  | 'walk'
  | 'map-pin'
  | 'x'
  | 'home'
  | 'map'
  | 'smile'
  | 'image'
  | 'award'
  | 'star'
  | 'clock'
  | 'globe'
  | 'phone'
  | 'calendar';

export function PandaIcon({
  name,
  size = 20,
  color,
  strokeWidth = 1.8,
}: {
  name: PandaIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const strokeProps = {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  };

  const content = (() => {
    switch (name) {
      case 'arrow-left':
        return (
          <>
            <Line {...strokeProps} x1="19" x2="5" y1="12" y2="12" />
            <Polyline {...strokeProps} points="12 19 5 12 12 5" />
          </>
        );
      case 'trash':
        return (
          <>
            <Rect {...strokeProps} height="13" rx="1.5" width="14" x="5" y="7" />
            <Path {...strokeProps} d="M9 7V4h6v3M4 7h16" />
          </>
        );
      case 'mic':
        return (
          <>
            <Rect {...strokeProps} height="12" rx="4" width="8" x="8" y="3" />
            <Path {...strokeProps} d="M5 12a7 7 0 0 0 14 0M12 19v3M9 22h6" />
          </>
        );
      case 'mic-off':
        return (
          <>
            <Rect {...strokeProps} height="12" rx="4" width="8" x="8" y="3" />
            <Path {...strokeProps} d="M5 12a7 7 0 0 0 14 0M12 19v3M9 22h6" />
            <Line {...strokeProps} x1="4" x2="20" y1="4" y2="20" />
          </>
        );
      case 'send':
        return (
          <>
            <Path {...strokeProps} d="m3 11.5 18-8.5-7 18-3-7.5L3 11.5Z" />
            <Line {...strokeProps} x1="11" x2="21" y1="14" y2="3" />
          </>
        );
      case 'navigate':
        return <Path {...strokeProps} d="m12 2 9 19-9-4-9 4 9-19Z" />;
      case 'walk':
        return (
          <>
            <Circle {...strokeProps} cx="13" cy="5" r="2" />
            <Path {...strokeProps} d="m12 8-2 5 3 2 1 5M10 13l-4 3M13 15l4-3M9 20l-2 2M14 20l3 2" />
          </>
        );
      case 'map-pin':
        return (
          <>
            <Path {...strokeProps} d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
            <Circle {...strokeProps} cx="12" cy="10" r="2.2" />
          </>
        );
      case 'x':
        return (
          <>
            <Line {...strokeProps} x1="6" x2="18" y1="6" y2="18" />
            <Line {...strokeProps} x1="18" x2="6" y1="6" y2="18" />
          </>
        );
      case 'home':
        return <Path {...strokeProps} d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" />;
      case 'map':
        return <Path {...strokeProps} d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />;
      case 'smile':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="12" r="9" />
            <Path {...strokeProps} d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
          </>
        );
      case 'image':
        return (
          <>
            <Rect {...strokeProps} height="16" rx="2" width="18" x="3" y="4" />
            <Circle {...strokeProps} cx="8.5" cy="9" r="1.5" />
            <Path {...strokeProps} d="m4 17 5-5 3 3 2-2 6 5" />
          </>
        );
      case 'award':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="9" r="6" />
            <Path {...strokeProps} d="m8.5 14.2-1 6 4.5-2.5 4.5 2.5-1-6M12 6.5l.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3.8-1.7Z" />
          </>
        );
      case 'star':
        return <Path {...strokeProps} d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />;
      case 'clock':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="12" r="9" />
            <Path {...strokeProps} d="M12 7v5l3 2" />
          </>
        );
      case 'globe':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="12" r="9" />
            <Path {...strokeProps} d="M3 12h18M12 3c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21M12 3c-2.2 2.5-3.3 5.5-3.3 9S9.8 18.5 12 21" />
          </>
        );
      case 'phone':
        return <Path {...strokeProps} d="M7 3.5 10 7 8.2 9.4a14.8 14.8 0 0 0 6.4 6.4L17 14l3.5 3c.4.4.5 1 .2 1.5l-1 1.6c-.4.7-1.2 1-2 .8C10.4 19.3 4.7 13.6 3.1 6.3c-.2-.8.1-1.6.8-2l1.6-1c.5-.3 1.1-.2 1.5.2Z" />;
      case 'calendar':
        return (
          <>
            <Rect {...strokeProps} height="16" rx="2" width="18" x="3" y="5" />
            <Line {...strokeProps} x1="3" x2="21" y1="9" y2="9" />
            <Line {...strokeProps} x1="8" x2="8" y1="3" y2="7" />
            <Line {...strokeProps} x1="16" x2="16" y1="3" y2="7" />
            <Line {...strokeProps} x1="7" x2="7.01" y1="13" y2="13" />
            <Line {...strokeProps} x1="12" x2="12.01" y1="13" y2="13" />
            <Line {...strokeProps} x1="17" x2="17.01" y1="13" y2="13" />
          </>
        );
    }
  })();

  return (
    <Svg accessibilityRole="image" height={size} viewBox="0 0 24 24" width={size}>
      {content}
    </Svg>
  );
}