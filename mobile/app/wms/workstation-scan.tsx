import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { workstationCheckInMobile } from "@/lib/wms/api";
import { isValidWorkstationCheckInInput } from "@/lib/wms/workstation-qr";
import { PWA } from "@/constants/pwaTheme";

export default function WorkstationScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef(0);

  const doCheckIn = useCallback(
    async (payload: string) => {
      const trimmed = payload.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const s = await workstationCheckInMobile(trimmed);
        setMessage(
          `Meja ${s?.workstation.code ?? trimmed} · CCTV ${s?.workstation.cctv ?? "—"}`,
        );
        setTimeout(() => router.back(), 1400);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check-in meja gagal.");
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (now - cooldownRef.current < 2500) return;
      if (data === lastScanRef.current) return;
      if (!isValidWorkstationCheckInInput(data)) {
        setError("Bukan kode/QR meja (VALIDATOR-01 atau serba:ws:...).");
        return;
      }
      lastScanRef.current = data;
      cooldownRef.current = now;
      void doCheckIn(data);
    },
    [doCheckIn],
  );

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Izin kamera diperlukan untuk scan QR meja.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnTxt}>Izinkan kamera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={busy ? undefined : onBarcode}
      />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Scan QR di meja validator (validasi & packing)</Text>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 8 }} /> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </View>

      <View style={styles.manualBox}>
        <Text style={styles.manualLabel}>Atau tempel payload manual</Text>
        <TextInput
          style={styles.input}
          value={manual}
          onChangeText={setManual}
          placeholder="VALIDATOR-01"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.btn, !manual.trim() && styles.btnDisabled]}
          disabled={!manual.trim() || busy}
          onPress={() => void doCheckIn(manual)}
        >
          <Text style={styles.btnTxt}>Konfirmasi meja</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
  },
  hint: { color: "#fff", fontSize: 14, fontWeight: "600" },
  ok: { color: "#86efac", marginTop: 8, fontSize: 13 },
  err: { color: "#fca5a5", marginTop: 8, fontSize: 13 },
  manualBox: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  manualLabel: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
    fontFamily: "monospace",
    marginBottom: 10,
  },
  btn: {
    backgroundColor: PWA.indigo,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: "#fff", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  msg: { textAlign: "center", marginBottom: 16, color: "#334155" },
});
