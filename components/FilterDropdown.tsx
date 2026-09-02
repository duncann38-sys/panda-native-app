import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function FilterDropdown({
  testID,
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  testID: string;
  label: string;
  value: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const triggerRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 112, height: 38 });
  const menuWidth = 128;

  const handleToggle = () => {
    if (open) {
      onToggle();
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      onToggle();
    });
  };

  const menuLeft = Math.max(12, Math.min(anchor.x + anchor.width - menuWidth, windowWidth - menuWidth - 12));

  return (
    <View ref={triggerRef} collapsable={false} style={styles.wrapper}>
      <Pressable
        testID={testID}
        accessibilityLabel={`Choose ${label}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.triggerText, { color: colors.mutedForeground }]}>{value}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.mutedForeground} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={onToggle}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel={`Close ${label} menu`} onPress={onToggle} style={StyleSheet.absoluteFill} />
          <View
            style={[
              styles.menu,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                left: menuLeft,
                top: anchor.y + anchor.height + 4,
                width: menuWidth,
              },
            ]}
          >
            {options.map((option) => (
              <Pressable
                key={option}
                testID={`${testID}-${option.toLowerCase().replace(/\s/g, '-')}`}
                accessibilityRole="menuitem"
                onPress={() => onChange(option)}
                style={({ pressed }) => [
                  styles.option,
                  option === value && { backgroundColor: colors.secondary },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.optionText, { color: option === value ? colors.green800 : colors.foreground }]}>
                  {option}
                </Text>
                {option === value ? <Ionicons name="checkmark" size={16} color={colors.green700} /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  trigger: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  triggerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    elevation: 7,
    overflow: 'hidden',
    position: 'absolute',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  modalRoot: {
    flex: 1,
  },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  optionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.72,
  },
});