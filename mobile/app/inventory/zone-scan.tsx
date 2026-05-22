import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { zoneCheckInOrQueue } from "@/lib/inventory/offline-resilient";
import { isZoneQrPayload } from "@/lib/inventory/zone-qr";
import { PWA } from "@/constants/pwaTheme";

export default function ZoneScanScreen() {
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
        const r = await zoneCheckInOrQueue({ qr_payload: trimmed });
        if (r.queued) {
          setMessage(`Check-in disimpan — akan disinkron saat jaringan pulih.`);
        } else {
          setMessage(`Check-in berhasil: ${trimmed}`);
        }
        setTimeout(() => router.back(), 1200);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check-in gagal.");
      } finally {
        setBusy(false);
      }
    },
    [busy, router]
  );

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (now - cooldownRef.current < 2500) return;
      if (data === lastScanRef.current) return;
      if (!isZoneQrPayload(data)) {
        setError("Bukan QR zona SERBA (serba:zone:...).");
        return;
      }
      lastScanRef.current = data;
      cooldownRef.current = now;
      void doCheckIn(data);
    },
    [doCheckIn]
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
        <Text style={styles.msg}>Izin kamera diperlukan untuk scan QR zona.</Text>
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
        <Text style={styles.hint}>Arahkan kamera ke QR zona di dinding/rak</Text>
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
          placeholder="serba:zone:GD-2245:KODE"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.btn, !manual.trim() && styles.btnDisabled]}
          disabled={!manual.trim() || busy}
          onPress={() => void doCheckIn(manual)}
        >
          <Text style={styles.btnTxt}>Check-in manual</Text>
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
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: 12,
    padding: 12,
  },
  hint: { color: "#fff", fontSize: 14, fontWeight: "600" },
  ok: { color: "#6ee7b7", marginTop: 8, fontSize: 13 },
  err: { color: "#fca5a5", marginTop: 8, fontSize: 13 },
  manualBox: {
    backgroundColor: PWA.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: PWA.border,
  },
  manualLabel: { fontSize: 12, color: PWA.textMuted, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    fontFamily: "monospace",
    marginBottom: 10,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  msg: { textAlign: "center", color: PWA.textMuted },
  btn: {
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: "#fff", fontWeight: "700" },
});
