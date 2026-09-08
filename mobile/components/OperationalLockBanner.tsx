import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { PWA } from "@/constants/pwaTheme";

type Props = {
  compact?: boolean;
  /** `work-section` = hanya blok pekerjaan operasional; personal tidak ikut terkunci */
  variant?: "default" | "work-section";
};

export function OperationalLockBanner({ compact, variant = "default" }: Props) {
  const isWorkSection = variant === "work-section";

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={compact ? 20 : 24} color={PWA.amber900} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>
          {isWorkSection ? "Meja kerja terkunci" : "Dasbor terkunci"}
        </Text>
        <Text style={styles.msg}>
          {isWorkSection ? (
            <>
              Tab <Text style={styles.bold}>Meja kerja</Text> baru aktif setelah absen masuk di tab{" "}
              <Text style={styles.bold}>Absensi</Text>. Setelah absen pulang, meja kerja tertutup lagi. Tab Absensi
              dan Profil tetap bisa dipakai. Owner dan HR tidak dibatasi.
            </>
          ) : (
            <>
              Hanya <Text style={styles.bold}>meja kerja</Text> yang terkunci. Tab Absensi dan Profil tetap aktif.
              Owner &amp; HR tidak dibatasi.
            </>
          )}
        </Text>
        <Link href="/(tabs)/attendance" asChild>
          <Pressable style={styles.btn}>
            <Ionicons name="today" size={16} color="#fff" />
            <Text style={styles.btnTxt}>Ke absensi — absen masuk</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PWA.amber200,
    backgroundColor: PWA.amber50,
  },
  wrapCompact: { padding: 12, borderRadius: 14 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fde68a",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "800", color: PWA.text },
  msg: { marginTop: 6, fontSize: 13, lineHeight: 19, color: PWA.textSecondary },
  bold: { fontWeight: "700", color: PWA.text },
  btn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: PWA.indigo,
  },
  btnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
