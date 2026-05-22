import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PWA } from "@/constants/pwaTheme";

type RowProps = {
  href: "/hr/leave-queue" | "/hr/overtime-queue" | "/hr/field-queue";
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

function Row({ href, title, subtitle, icon, color, bg }: RowProps) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={PWA.textMuted} />
      </Pressable>
    </Link>
  );
}

/** Daftar antrean — tile utama ada di tab Meja kerja. */
export default function HrHomeScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>
        Respons cepat ke pengajuan staf. Pengaturan lengkap (karyawan, payroll, GPS) tetap di dashboard laptop.
      </Text>
      <Row
        href="/hr/leave-queue"
        title="Antrean cuti"
        subtitle="Setujui atau tolak"
        icon="calendar-outline"
        color="#b45309"
        bg="#fef3c7"
      />
      <Row
        href="/hr/overtime-queue"
        title="Lembur"
        subtitle="Pengajuan staf & penunjukan HR"
        icon="moon-outline"
        color="#4338ca"
        bg="#e0e7ff"
      />
      <Row
        href="/hr/field-queue"
        title="Luar kantor"
        subtitle="Meeting, kunjungan, dinas"
        icon="navigate-outline"
        color="#0f766e"
        bg="#ccfbf1"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg, padding: 16, gap: 12 },
  lead: { fontSize: 13, lineHeight: 20, color: PWA.textSecondary, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
  },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: "800", color: PWA.text },
  rowSub: { marginTop: 4, fontSize: 12, lineHeight: 17, color: PWA.textSecondary },
});
