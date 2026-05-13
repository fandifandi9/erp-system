import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/context/auth";
import {
  createFieldActivityRequest,
  listMyFieldActivity,
  type FieldActivityRow,
  type FieldActivityType,
} from "@/lib/field_activity";
import { getErrorMessage } from "@/lib/errors";

const TYPES: { id: FieldActivityType; label: string }[] = [
  { id: "meeting", label: "Meeting" },
  { id: "visit", label: "Kunjungan" },
  { id: "out_of_town", label: "Dinas luar" },
  { id: "other", label: "Lainnya" },
];

export default function FieldActivityScreen() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [items, setItems] = useState<FieldActivityRow[]>([]);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<FieldActivityType>("meeting");

  const load = useCallback(async () => {
    if (!uid) return;
    setItems(await listMyFieldActivity(uid));
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function submit() {
    if (!uid) return;
    try {
      await createFieldActivityRequest({
        userId: uid,
        start_date: start.trim().slice(0, 10),
        end_date: end.trim().slice(0, 10),
        activity_type: type,
        destination,
        reason,
      });
      setOpen(false);
      setDestination("");
      setReason("");
      await load();
      Alert.alert("Terkirim", "Menunggu persetujuan HR.");
    } catch (e: unknown) {
      Alert.alert("Gagal", getErrorMessage(e, "Pengajuan gagal"));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Aktivitas luar</Text>
        <Pressable style={styles.add} onPress={() => setOpen(true)}>
          <Text style={styles.addText}>+ Ajukan</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ListEmptyComponent={
          <Text style={styles.empty}>Belum ada pengajuan.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.range}>
              {item.start_date} → {item.end_date}
            </Text>
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.dest}>{item.destination}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
          </View>
        )}
      />

      <Modal visible={open} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pengajuan baru</Text>
            <Text style={styles.label}>Mulai (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={start}
              onChangeText={setStart}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Selesai</Text>
            <TextInput
              style={styles.input}
              value={end}
              onChangeText={setEnd}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Tujuan</Text>
            <TextInput
              style={styles.input}
              value={destination}
              onChangeText={setDestination}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Alasan</Text>
            <TextInput
              style={[styles.input, { minHeight: 72 }]}
              multiline
              value={reason}
              onChangeText={setReason}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Jenis</Text>
            <View style={styles.typeRow}>
              {TYPES.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setType(t.id)}
                  style={[
                    styles.typeChip,
                    type === t.id && styles.typeChipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      type === t.id && styles.typeChipTextOn,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
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
  range: { color: "#f8fafc", fontWeight: "600" },
  status: { color: "#38bdf8", marginTop: 4, textTransform: "capitalize" },
  dest: { color: "#e2e8f0", marginTop: 6 },
  reason: { color: "#94a3b8", marginTop: 4 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 18,
    gap: 6,
    maxHeight: "92%",
  },
  modalTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  label: { color: "#94a3b8", fontSize: 13, marginTop: 4 },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    color: "#f8fafc",
    borderWidth: 1,
    borderColor: "#334155",
  },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#475569",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeChipOn: { backgroundColor: "#38bdf8", borderColor: "#38bdf8" },
  typeChipText: { color: "#94a3b8", fontSize: 12 },
  typeChipTextOn: { color: "#0f172a", fontWeight: "700" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 12,
  },
  cancel: { paddingVertical: 10, paddingHorizontal: 12 },
  cancelText: { color: "#94a3b8" },
  ok: {
    backgroundColor: "#38bdf8",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  okText: { color: "#0f172a", fontWeight: "700" },
});
