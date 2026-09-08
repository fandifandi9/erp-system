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
import { pb } from "@/lib/pocketbase";
import {
  completePackingMobile,
  createPackingSessionMobile,
  fetchActiveZoneSession,
  fetchPackingDetailMobile,
  scanPackingMobile,
} from "@/lib/inventory/api";
import { findProductByBarcode } from "@/lib/inventory/stock";
import { PWA } from "@/constants/pwaTheme";

type Station = { id: string; code: string; name?: string };
type LineRow = { product: string; sku: string; name: string; expected_qty: number };

export default function PackingScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [zoneOk, setZoneOk] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<
    Array<{ id: string; expected_qty: number; scanned_qty: number; is_complete?: boolean; sku_snapshot?: string }>
  >([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const cooldownRef = useRef(0);

  const loadZone = useCallback(async () => {
    setError("");
    try {
      const zs = await fetchActiveZoneSession();
      if (!zs?.expand?.zone) {
        setZoneOk(false);
        setError("Masuk zona kemasan dulu.");
        return;
      }
      const zoneType = (await pb.collection("inv_zones").getOne(zs.zone)) as { zone_type?: string };
      if (zoneType.zone_type !== "packing") {
        setZoneOk(false);
        setError("Zona aktif bukan kemasan.");
        return;
      }
      setZoneOk(true);
      const st = await pb.collection("inv_packing_stations").getList(1, 20, {
        filter: `zone = "${zs.zone}" && is_active = true`,
        sort: "code",
      });
      const list = st.items as unknown as Station[];
      setStations(list);
      if (list[0]) setStationId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat zona.");
    }
  }, []);

  useEffect(() => {
    void loadZone();
  }, [loadZone]);

  const addProduct = async (code: string) => {
    const p = await findProductByBarcode(code);
    if (!p) {
      setError(`Produk tidak ditemukan: ${code}`);
      return;
    }
    setLines((prev) => {
      const hit = prev.find((x) => x.product === p.id);
      if (hit) {
        return prev.map((x) =>
          x.product === p.id ? { ...x, expected_qty: x.expected_qty + 1 } : x
        );
      }
      return [...prev, { product: p.id, sku: p.sku, name: p.name, expected_qty: 1 }];
    });
    setNotice(`${p.sku} ditambahkan.`);
    setError("");
  };

  const startSession = async () => {
    if (!stationId || !orderRef.trim() || lines.length === 0) {
      setError("Meja, nomor order, dan minimal 1 produk wajib.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await createPackingSessionMobile({
        packing_station_id: stationId,
        order_ref: orderRef.trim(),
        lines: lines.map((l) => ({ product: l.product, expected_qty: l.expected_qty })),
      });
      setSessionId(r.id);
      setNotice("Sesi kemasan dimulai — scan item.");
      await refreshDetail(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mulai kemasan.");
    } finally {
      setBusy(false);
    }
  };

  const refreshDetail = async (sid: string) => {
    const d = await fetchPackingDetailMobile(sid);
    setDetailLines(d.lines as typeof detailLines);
  };

  const onScan = useCallback(
    async (data: string) => {
      if (!sessionId || busy) return;
      const now = Date.now();
      if (now - cooldownRef.current < 1500) return;
      cooldownRef.current = now;
      setBusy(true);
      setError("");
      try {
        const r = await scanPackingMobile(sessionId, data);
        setNotice(`Scan OK: ${r.productName}`);
        await refreshDetail(sessionId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Scan gagal.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy]
  );

  const finish = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await completePackingMobile(sessionId, false);
      setNotice("Kemasan selesai.");
      setSessionId(null);
      setLines([]);
      setOrderRef("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyelesaikan.");
    } finally {
      setBusy(false);
    }
  };

  if (!permission?.granted && sessionId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Izinkan kamera untuk scan kemasan.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnTxt}>Izinkan kamera</Text>
        </Pressable>
      </View>
    );
  }

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

      {!sessionId ? (
        <>
          {!zoneOk ? (
            <Text style={styles.muted}>Masuk zona kemasan via menu Scan zona.</Text>
          ) : (
            <>
              <Text style={styles.label}>Meja kemasan</Text>
              {stations.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.chip, stationId === s.id && styles.chipOn]}
                  onPress={() => setStationId(s.id)}
                >
                  <Text style={stationId === s.id ? styles.chipOnTxt : styles.chipTxt}>
                    {s.code}
                  </Text>
                </Pressable>
              ))}
              <Text style={styles.label}>Nomor order</Text>
              <TextInput
                style={styles.input}
                value={orderRef}
                onChangeText={setOrderRef}
                placeholder="ORD-..."
              />
              <Text style={styles.label}>Checklist ({lines.length} SKU)</Text>
              {lines.map((l) => (
                <Text key={l.product} style={styles.lineItem}>
                  {l.sku} × {l.expected_qty} — {l.name}
                </Text>
              ))}
              <Pressable style={styles.btnOutline} onPress={() => setScanning((v) => !v)}>
                <Text style={styles.btnOutlineTxt}>
                  {scanning ? "Tutup kamera" : "Scan produk ke checklist"}
                </Text>
              </Pressable>
              {scanning && permission?.granted ? (
                <CameraView
                  style={styles.camera}
                  barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "qr"] }}
                  onBarcodeScanned={({ data }) => void addProduct(data)}
                />
              ) : null}
              <Pressable
                style={[styles.btn, busy && styles.disabled]}
                disabled={busy}
                onPress={() => void startSession()}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnTxt}>Mulai sesi kemasan</Text>
                )}
              </Pressable>
            </>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title}>Scan item order</Text>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "qr"] }}
              onBarcodeScanned={({ data }) => void onScan(data)}
            />
          ) : null}
          {detailLines.map((l) => (
            <Text key={l.id} style={styles.lineItem}>
              {l.sku_snapshot} — {l.scanned_qty}/{l.expected_qty} {l.is_complete ? "✓" : ""}
            </Text>
          ))}
          <Pressable
            style={[styles.btn, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void finish()}
          >
            <Text style={styles.btnTxt}>Selesai kemasan</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  errBox: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12 },
  errTxt: { color: "#b91c1c", fontSize: 13 },
  okBox: { backgroundColor: "#ecfdf5", borderRadius: 12, padding: 12 },
  okTxt: { color: "#047857", fontSize: 13 },
  muted: { color: PWA.textMuted, fontSize: 14 },
  label: { fontSize: 12, fontWeight: "700", color: PWA.textMuted, marginTop: 8 },
  input: {
    backgroundColor: PWA.surface,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PWA.border,
    marginRight: 8,
    marginTop: 6,
  },
  chipOn: { backgroundColor: PWA.indigo, borderColor: PWA.indigo },
  chipTxt: { color: PWA.text, fontWeight: "600" },
  chipOnTxt: { color: "#fff", fontWeight: "600" },
  lineItem: { fontSize: 14, color: PWA.text },
  title: { fontSize: 17, fontWeight: "800", color: PWA.text },
  camera: { height: 220, borderRadius: 12, overflow: "hidden" },
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
  },
  btnOutlineTxt: { color: PWA.indigo, fontWeight: "700" },
  disabled: { opacity: 0.6 },
});
