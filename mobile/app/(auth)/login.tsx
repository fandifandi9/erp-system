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
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth";
import { getPocketBaseUrl } from "@/lib/env";
import { getErrorMessage, pocketBaseUnreachableMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";

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
    Keyboard.dismiss();
    setErr(null);
    setLoading(true);
    try {
      const res = await signInWithPassword(email, password);
      if (res.kind === "success") {
        Keyboard.dismiss();
        // Hindari race navigasi + auth hydrate di release build
        requestAnimationFrame(() => {
          router.replace("/(tabs)/attendance");
        });
        return;
      }
      setOtpId(res.otpId);
      setMfaId(res.mfaId);
      setStep("otp");
      setOtpCode("");
    } catch (e: unknown) {
      setErr(pocketBaseUnreachableMessage(e, baseUrl) ?? getErrorMessage(e, "Login gagal"));
    } finally {
      Keyboard.dismiss();
      setLoading(false);
    }
  }

  async function onOtpSubmit() {
    if (!otpId || !mfaId) return;
    Keyboard.dismiss();
    setErr(null);
    setLoading(true);
    try {
      await signInWithOtp(otpId, otpCode, mfaId);
      Keyboard.dismiss();
      requestAnimationFrame(() => {
        router.replace("/(tabs)/attendance");
      });
    } catch (e: unknown) {
      setErr(
        pocketBaseUnreachableMessage(e, baseUrl) ??
          getErrorMessage(e, "Kode OTP salah atau kedaluwarsa")
      );
    } finally {
      Keyboard.dismiss();
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.tapOuter}>
          <View style={styles.card}>
            <Text style={styles.title}>SERBA ERP</Text>
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
                <ActivityIndicator color="#ffffff" />
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
                  <ActivityIndicator color="#ffffff" />
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
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: PWA.screenBg,
  },
  tapOuter: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    width: "100%",
  },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: PWA.text,
    letterSpacing: -0.3,
  },
  sub: { color: PWA.textSecondary, fontSize: 14, lineHeight: 20 },
  warn: { color: "#b45309", fontSize: 13, fontWeight: "600" },
  url: { color: PWA.textMuted, fontSize: 12 },
  input: {
    backgroundColor: PWA.slate50,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: PWA.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  err: { color: PWA.red700, fontSize: 14 },
  otpHint: { color: PWA.textMuted, fontSize: 13 },
  row: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: {
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnFlex: { flex: 1, marginTop: 0 },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: PWA.textSecondary, fontWeight: "600" },
  hint: { color: PWA.textMuted, fontSize: 12, marginTop: 8, lineHeight: 18 },
});
