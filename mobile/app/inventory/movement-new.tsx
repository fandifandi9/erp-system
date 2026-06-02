import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { createMovementDraftMobile } from "@/lib/inventory/api";
import { findProductByBarcode } from "@/lib/inventory/stock";
import { labelMovementType, MOVEMENT_TYPE_LABELS } from "@/lib/inventory/labels";
import { pb } from "@/lib/pocketbase";
import { PWA } from "@/constants/pwaTheme";

type Wh = { id: string; code: string; name: string };
type Line = { product: string; sku: string; name: string; qty: number };

export default function MovementNewScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [movementType, setMovementType] = useState<"IN" | "OUT">("IN");
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cooldownRef = useRef(0);

  useEffect(() => {
    void pb.collection("inv_warehouses").getList(1, 50, { filter: "is_active = true", sort: "code" }).then((res) => {
      const list = res.items as unknown as Wh[];
      setWarehouses(list);
      if (list[0]) setWarehouseId(list[0].id);
    });
  }, []);

  const addScan = useCallback(async (code: string) => {
    const p = await findProductByBarcode(code);
    if (!p) {
      setError(`Produk tidak ditemukan: ${code}`);
      return;
    }
    setLines((prev) => {
      const hit = prev.find((x) => x.product === p.id);
      if (hit) {
        return prev.map((x) => (x.product === p.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...prev, { product: p.id, sku: p.sku, name: p.name, qty: 1 }];
    });
    setNotice(`${p.sku} +1`);
    setError("");
  }, []);

  const submit = async () => {
    if (!warehouseId || lines.length === 0) {
      setError("Pilih gudang dan minimal 1 produk.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await createMovementDraftMobile({
        movement_type: movementType,
        warehouse: warehouseId,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({ product: l.product, qty: l.qty })),
      });
      setNotice(`Draf ${labelMovementType(movementType)} dibuat (${r.movement_no || r.id}). Posting via web supervisor.`);
      setLines([]);
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal buat mutasi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? (
        <View style={styles.errBox}>
          <Text style={styles.errTxt}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.okBox}>
          <Text style={styles.okTxt}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        {(["IN", "OUT"] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, movementType === t && styles.chipOn]}
            onPress={() => setMovementType(t)}
          >
            <Text style={movementType === t ? styles.chipOnTxt : styles.chipTxt}>
              {MOVEMENT_TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Gudang</Text>
      {warehouses.map((w) => (
        <Pressable
          key={w.id}
          style={[styles.whRow, warehouseId === w.id && styles.whOn]}
          onPress={() => setWarehouseId(w.id)}
        >
          <Text style={styles.whTxt}>
            {w.code} — {w.name}
          </Text>
        </Pressable>
      ))}

      <Pressable style={styles.btnOutline} onPress={() => setScanning((v) => !v)}>
        <Text style={styles.btnOutlineTxt}>{scanning ? "Tutup kamera" : "Scan produk"}</Text>
      </Pressable>
      {!permission?.granted && scanning ? (
        <Pressable style={styles.btnOutline} onPress={() => void requestPermission()}>
          <Text style={styles.btnOutlineTxt}>Izinkan kamera</Text>
        </Pressable>
      ) : null}
      {scanning && permission?.granted ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "qr"] }}
          onBarcodeScanned={({ data }) => {
            const now = Date.now();
            if (now - cooldownRef.current < 1500) return;
            cooldownRef.current = now;
            void addScan(data);
          }}
        />
      ) : null}

      <Text style={styles.label}>Baris ({lines.length})</Text>
      {lines.map((l) => (
        <Text key={l.product} style={styles.line}>
          {l.sku} × {l.qty} — {l.name}
        </Text>
      ))}

      <Text style={styles.label}>Catatan</Text>
      <TextInput style={styles.input} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnTxt}>Simpan draf mutasi</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  errBox: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12 },
  errTxt: { color: "#b91c1c", fontSize: 13 },
  okBox: { backgroundColor: "#ecfdf5", borderRadius: 12, padding: 12 },
  okTxt: { color: "#047857", fontSize: 13 },
  label: { fontSize: 12, fontWeight: "700", color: PWA.textMuted, marginTop: 8 },
  row: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  chipOn: { backgroundColor: PWA.indigo, borderColor: PWA.indigo },
  chipTxt: { fontWeight: "700", color: PWA.text },
  chipOnTxt: { fontWeight: "700", color: "#fff" },
  whRow: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
  },
  whOn: { borderColor: PWA.indigo, backgroundColor: "#eef2ff" },
  whTxt: { fontSize: 14, color: PWA.text },
  camera: { height: 200, borderRadius: 12, overflow: "hidden" },
  line: { fontSize: 14, color: PWA.text },
  input: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
    backgroundColor: PWA.surface,
  },
  btn: {
    marginTop: 12,
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnTxt: { color: "#fff", fontWeight: "700" },
  btnOutline: {
    borderWidth: 1,
    borderColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnOutlineTxt: { color: PWA.indigo, fontWeight: "700" },
  disabled: { opacity: 0.6 },
});
