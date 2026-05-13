import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/context/auth";
import { pb } from "@/lib/pocketbase";
import {
  createLeaveBookingDay,
  listMyLeaveRequests,
  type LeaveRow,
} from "@/lib/leave";
import { getTodayDate } from "@/lib/attendance";
import { getErrorMessage } from "@/lib/errors";

export default function LeaveScreen() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [items, setItems] = useState<LeaveRow[]>([]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(getTodayDate());

  const load = useCallback(async () => {
    if (!uid) return;
    const { items: rows } = await listMyLeaveRequests(uid);
    setItems(rows);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function submit() {
    if (!uid) return;
    try {
      const esc = uid.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const prof = await pb.collection("profiles").getFirstListItem(
        `user="${esc}"`,
        { requestKey: null }
      );
      await createLeaveBookingDay(
        uid,
        date.trim(),
        reason,
        String((prof as { department?: string }).department ?? "—"),
        String((prof as { position?: string }).position ?? "—")
      );
      setOpen(false);
      setReason("");
      await load();
      Alert.alert("Terkirim", "Pengajuan cuti menunggu persetujuan HR.");
    } catch (e: unknown) {
      Alert.alert("Gagal", getErrorMessage(e, "Tidak bisa mengajukan cuti"));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Cuti</Text>
        <Pressable style={styles.add} onPress={() => setOpen(true)}>
          <Text style={styles.addText}>+ Hari</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Belum ada pengajuan.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.date}>
              {item.booking_date || item.start_date}
            </Text>
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
          </View>
        )}
      />

      <Modal visible={open} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajukan cuti (1 hari)</Text>
            <Text style={styles.label}>Tanggal (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-05-12"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Alasan</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              multiline
              value={reason}
              onChangeText={setReason}
              placeholder="Contoh: keperluan keluarga"
              placeholderTextColor="#64748b"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable style={styles.ok} onPress={submit}>
                <Text style={styles.okText}>Kirim</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#f8fafc" },
  add: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addText: { color: "#0f172a", fontWeight: "700" },
  empty: { color: "#64748b", marginTop: 24, textAlign: "center" },
  card: {
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  date: { color: "#f8fafc", fontWeight: "600", fontSize: 16 },
  status: { color: "#38bdf8", marginTop: 4, textTransform: "capitalize" },
  reason: { color: "#94a3b8", marginTop: 6 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  modalTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  label: { color: "#94a3b8", fontSize: 13, marginTop: 6 },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    color: "#f8fafc",
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  cancel: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: "#94a3b8" },
  ok: {
    backgroundColor: "#38bdf8",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  okText: { color: "#0f172a", fontWeight: "700" },
});
