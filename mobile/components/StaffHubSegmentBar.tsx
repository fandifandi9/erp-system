import { ScrollView, Pressable, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PWA } from "@/constants/pwaTheme";

export type StaffHubKey =
  | "attendance"
  | "leave"
  | "overtime"
  | "field"
  | "izin"
  | "submissions";

const ITEMS: {
  key: StaffHubKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "attendance", label: "Absensi", icon: "today-outline" },
  { key: "leave", label: "Cuti", icon: "calendar-outline" },
  { key: "overtime", label: "Lembur", icon: "moon-outline" },
  { key: "field", label: "Luar kantor", icon: "navigate-outline" },
  { key: "izin", label: "Off", icon: "hand-left-outline" },
  { key: "submissions", label: "Pengajuan", icon: "file-tray-full-outline" },
];

type Props = {
  value: StaffHubKey;
  onChange: (key: StaffHubKey) => void;
};

export function StaffHubSegmentBar({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ITEMS.map((item) => {
          const active = value === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? "#fff" : PWA.textSecondary}
              />
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: PWA.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PWA.border,
    paddingVertical: 10,
  },
  row: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.slate50,
  },
  chipActive: {
    backgroundColor: PWA.indigo,
    borderColor: PWA.indigo,
  },
  chipTxt: { fontSize: 13, fontWeight: "700", color: PWA.textSecondary },
  chipTxtActive: { color: "#fff" },
});
