import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  fetchBalancesForProduct,
  findProductByBarcode,
  type BalanceHit,
  type ProductHit,
} from "@/lib/inventory/stock";
import { PWA } from "@/constants/pwaTheme";

export default function ProductScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [balances, setBalances] = useState<BalanceHit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(true);
  const cooldownRef = useRef(0);

  const lookup = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    setProduct(null);
    setBalances([]);
    try {
      const p = await findProductByBarcode(trimmed);
      if (!p) {
        setError(`Produk tidak ditemukan: ${trimmed}`);
        return;
      }
      setProduct(p);
      setBalances(await fetchBalancesForProduct(p.id));
      setScanning(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencari produk.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (!scanning || busy) return;
      const now = Date.now();
      if (now - cooldownRef.current < 2000) return;
      cooldownRef.current = now;
      void lookup(data);
    },
    [scanning, busy, lookup]
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
        <Text style={styles.msg}>Izin kamera untuk scan barcode produk.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnTxt}>Izinkan kamera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {scanning ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr"],
          }}
          onBarcodeScanned={onBarcode}
        />
      ) : null}

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {scanning ? (
          <Text style={styles.hint}>Scan barcode / SKU produk</Text>
        ) : (
          <Pressable style={styles.linkBtn} onPress={() => setScanning(true)}>
            <Text style={styles.linkBtnTxt}>Scan lagi</Text>
          </Pressable>
        )}

        <TextInput
          style={styles.input}
          value={manual}
          onChangeText={setManual}
          placeholder="Barcode atau SKU"
          autoCapitalize="characters"
        />
        <Pressable
          style={[styles.btn, !manual.trim() && styles.btnDisabled]}
          disabled={!manual.trim() || busy}
          onPress={() => void lookup(manual)}
        >
          <Text style={styles.btnTxt}>{busy ? "Mencari…" : "Cari manual"}</Text>
        </Pressable>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {product ? (
          <View style={styles.productCard}>
            <Text style={styles.sku}>{product.sku}</Text>
            <Text style={styles.pname}>{product.name}</Text>
            {product.barcode ? (
              <Text style={styles.meta}>Barcode: {product.barcode}</Text>
            ) : null}
          </View>
        ) : null}

        {balances.length > 0
          ? balances.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.wh}>
                  {item.expand?.warehouse?.code} — {item.expand?.warehouse?.name || "Gudang"}
                </Text>
                <Text style={styles.qty}>Stok: {item.qty_on_hand}</Text>
              </View>
            ))
          : product ? (
          <Text style={styles.muted}>Belum ada stok tercatat (mutasi belum diposting).</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  camera: { height: 220 },
  panel: { flex: 1 },
  panelContent: { padding: 16, gap: 10 },
  hint: { fontSize: 14, fontWeight: "600", color: PWA.text },
  input: {
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: PWA.surface,
  },
  btn: {
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: "#fff", fontWeight: "700" },
  linkBtn: { alignSelf: "flex-start" },
  linkBtnTxt: { color: PWA.indigo, fontWeight: "700" },
  err: { color: "#b91c1c", fontSize: 13 },
  productCard: {
    backgroundColor: PWA.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
    padding: 14,
  },
  sku: { fontFamily: "monospace", fontWeight: "700", color: PWA.indigo },
  pname: { marginTop: 4, fontSize: 16, fontWeight: "700", color: PWA.text },
  meta: { marginTop: 4, fontSize: 12, color: PWA.textMuted },
  row: {
    backgroundColor: PWA.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PWA.border,
    padding: 12,
    marginTop: 8,
  },
  wh: { fontSize: 14, fontWeight: "600", color: PWA.text },
  qty: { marginTop: 4, fontSize: 18, fontWeight: "800", color: "#047857" },
  muted: { fontSize: 13, color: PWA.textMuted },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  msg: { textAlign: "center", color: PWA.textMuted },
});
