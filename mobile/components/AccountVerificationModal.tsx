import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ACCOUNT_VERIFICATION_WINDOW_MINUTES,
  verifyAccountPasswordMobile,
} from "@/lib/account-verification";

type Props = {
  open: boolean;
  onVerified: () => void;
  onClose: () => void;
  context?: "payslip" | "document" | "general";
};

const HINT: Record<string, string> = {
  payslip: "Masukkan kata sandi akun untuk mengakses slip gaji.",
  document: "Verifikasi sekali membuka KTP, NPWP, KK, dan dokumen pribadi lainnya.",
  general: "Masukkan kata sandi akun untuk melanjutkan.",
};

export function AccountVerificationModal({
  open,
  onVerified,
  onClose,
  context = "general",
}: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
    }
  }, [open]);

  async function onSubmit() {
    setLoading(true);
    setError("");
    try {
      await verifyAccountPasswordMobile(password);
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verifikasi gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={22} color="#4f46e5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Verifikasi Akun</Text>
              <Text style={styles.sub}>
                Pastikan Anda pemilik akun ini sebelum membuka data sensitif.
              </Text>
              <Text style={styles.hint}>{HINT[context]}</Text>
            </View>
          </View>

          <Text style={styles.label}>Kata sandi akun</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            placeholder="Kata sandi login"
            placeholderTextColor="#94a3b8"
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.meta}>
            Berlaku {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit. Ulang jika keluar modul atau diam
            tanpa aktivitas selama {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit.
          </Text>

          <View style={styles.row}>
            <Pressable style={styles.btnGhost} onPress={onClose} disabled={loading}>
              <Text style={styles.btnGhostTxt}>Batal</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, (!password.trim() || loading) && styles.btnDis]}
              onPress={() => void onSubmit()}
              disabled={!password.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryTxt}>Verifikasi</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  head: { flexDirection: "row", gap: 12, marginBottom: 16 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  sub: { marginTop: 4, fontSize: 13, color: "#475569", lineHeight: 18 },
  hint: { marginTop: 4, fontSize: 12, color: "#64748b" },
  label: { fontSize: 13, fontWeight: "600", color: "#1e293b", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
  },
  error: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    fontSize: 13,
  },
  meta: { marginTop: 10, fontSize: 11, color: "#64748b", lineHeight: 16 },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnGhostTxt: { fontWeight: "600", color: "#334155" },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryTxt: { fontWeight: "700", color: "#fff" },
  btnDis: { opacity: 0.55 },
});
