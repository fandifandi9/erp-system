import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/auth";
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  type AttendanceRecord,
} from "@/lib/attendance";
import { useFocusEffect } from "@react-navigation/native";

export default function AttendanceScreen() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const r = await getTodayAttendance(uid);
      setRecord(r);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function pickSelfie() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin kamera", "Aktifkan kamera di pengaturan.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!shot.canceled && shot.assets[0]) {
      setSelfieUri(shot.assets[0].uri);
    }
  }

  async function onCheckIn() {
    if (!uid) return;
    setBusy(true);
    try {
      const res = await checkIn(uid);
      if (!res.success) {
        Alert.alert("Check-in", res.message);
        return;
      }
      Alert.alert("Berhasil", res.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onCheckOut() {
    if (!uid) return;
    setBusy(true);
    try {
      const res = await checkOut(uid);
      if (!res.success) {
        Alert.alert("Check-out", res.message);
        return;
      }
      Alert.alert("Berhasil", res.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = !!(record?.check_in && !record?.check_out);
  const doneDay = !!(record?.check_in && record?.check_out);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Absensi hari ini</Text>
      {loading ? (
        <ActivityIndicator color="#38bdf8" style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.card}>
          <Row label="Status" value={doneDay ? "Selesai" : checkedIn ? "Di kantor" : "Belum check-in"} />
          {record?.check_in ? (
            <Row label="Check-in" value={new Date(record.check_in).toLocaleString("id-ID")} />
          ) : null}
          {record?.check_out ? (
            <Row label="Check-out" value={new Date(record.check_out).toLocaleString("id-ID")} />
          ) : null}
          {record?.late_minutes != null && record.late_minutes > 0 ? (
            <Row label="Terlambat" value={`${record.late_minutes} menit`} />
          ) : null}
        </View>
      )}

      <View style={styles.actions}>
        {!doneDay && !checkedIn ? (
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={onCheckIn}
          >
            <Text style={styles.primaryText}>Check-in (GPS)</Text>
          </Pressable>
        ) : null}
        {checkedIn ? (
          <Pressable
            style={[styles.secondary, busy && styles.disabled]}
            disabled={busy}
            onPress={onCheckOut}
          >
            <Text style={styles.secondaryText}>Check-out</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.section}>Foto selfie (opsional, audit lokal)</Text>
      <Pressable style={styles.outline} onPress={pickSelfie}>
        <Text style={styles.outlineText}>Ambil foto</Text>
      </Pressable>
      {selfieUri ? (
        <Image source={{ uri: selfieUri }} style={styles.preview} />
      ) : null}
      <Text style={styles.note}>
        Unggah ke PocketBase dapat ditambahkan jika koleksi punya field file;
        saat ini foto hanya di perangkat sebagai bukti visual sebelum HR
        menambahkan endpoint lampiran.
      </Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#0f172a",
    flexGrow: 1,
  },
  h1: { fontSize: 22, fontWeight: "700", color: "#f8fafc", marginBottom: 12 },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: "#94a3b8", fontSize: 14 },
  rowValue: { color: "#f8fafc", fontSize: 14, flex: 1, textAlign: "right" },
  actions: { marginTop: 20, gap: 12 },
  primary: {
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#0f172a", fontWeight: "700", fontSize: 16 },
  secondary: {
    backgroundColor: "#334155",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: { color: "#f8fafc", fontWeight: "600", fontSize: 16 },
  disabled: { opacity: 0.5 },
  section: {
    marginTop: 28,
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  outline: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  outlineText: { color: "#e2e8f0", fontWeight: "600" },
  preview: {
    marginTop: 12,
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#1e293b",
  },
  note: { marginTop: 10, color: "#64748b", fontSize: 12, lineHeight: 18 },
});
