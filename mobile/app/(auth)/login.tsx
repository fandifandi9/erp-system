import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth";
import { getPocketBaseUrl } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";

type Step = "password" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithPassword, signInWithOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("password");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [mfaId, setMfaId] = useState<string | null>(null);
  const baseUrl = getPocketBaseUrl();

  async function onPasswordSubmit() {
    setErr(null);
    setLoading(true);
    try {
      const res = await signInWithPassword(email, password);
      if (res.kind === "success") {
        router.replace("/(tabs)/attendance");
        return;
      }
      setOtpId(res.otpId);
      setMfaId(res.mfaId);
      setStep("otp");
      setOtpCode("");
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "Login gagal"));
    } finally {
      setLoading(false);
    }
  }

  async function onOtpSubmit() {
    if (!otpId || !mfaId) return;
    setErr(null);
    setLoading(true);
    try {
      await signInWithOtp(otpId, otpCode, mfaId);
      router.replace("/(tabs)/attendance");
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "Kode OTP salah atau kedaluwarsa"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>ERP Staff</Text>
        <Text style={styles.sub}>
          {step === "otp"
            ? "Masukkan kode OTP dari email (MFA)."
            : "Masuk dengan akun PocketBase (email staff)"}
        </Text>
        {!baseUrl ? (
          <Text style={styles.warn}>
            Atur EXPO_PUBLIC_POCKETBASE_URL di file `.env` pada folder mobile
            (salin dari .env.example).
          </Text>
        ) : (
          <Text style={styles.url} numberOfLines={1}>
            Server: {baseUrl}
          </Text>
        )}
        {err ? <Text style={styles.err}>{err}</Text> : null}

        {step === "password" ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={onPasswordSubmit}
              disabled={loading || !email.trim() || !password}
            >
              {loading ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text style={styles.btnText}>Masuk</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.otpHint}>
              Kode dikirim ke {email}. Periksa inbox & spam.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Kode OTP"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              value={otpCode}
              onChangeText={setOtpCode}
            />
            <View style={styles.row}>
              <Pressable
                style={styles.secondary}
                onPress={() => {
                  setStep("password");
                  setOtpCode("");
                  setOtpId(null);
                  setMfaId(null);
                  setErr(null);
                }}
              >
                <Text style={styles.secondaryText}>Kembali</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnFlex, loading && styles.btnDisabled]}
                onPress={onOtpSubmit}
                disabled={loading || !otpCode.trim()}
              >
                {loading ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.btnText}>Verifikasi</Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.hint}>
          Token sesi di SecureStore. Jika akun masuk di perangkat lain, sesi ini
          akan logout otomatis.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#f8fafc",
  },
  sub: { color: "#94a3b8", fontSize: 14 },
  warn: { color: "#fbbf24", fontSize: 13 },
  url: { color: "#64748b", fontSize: 12 },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  err: { color: "#f87171", fontSize: 14 },
  otpHint: { color: "#94a3b8", fontSize: 13 },
  row: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: {
    backgroundColor: "#38bdf8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnFlex: { flex: 1, marginTop: 0 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#0f172a", fontWeight: "700", fontSize: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#e2e8f0", fontWeight: "600" },
  hint: { color: "#64748b", fontSize: 12, marginTop: 8 },
});
