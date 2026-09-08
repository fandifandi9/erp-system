import { useEffect, useState } from "react";
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
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useAuth } from "@/context/auth";
import { getPocketBaseUrl, getMobileEnvHostDiagnostics, isMobileServerConfigured, isStagingOrProductionMobileUrl } from "@/lib/env";
import { getErrorMessage, pocketBaseUnreachableMessage } from "@/lib/errors";
import { consumePendingLoginMessage } from "@/lib/auth-lifecycle";
import { getNativeHomeHref } from "@/lib/work-dashboard-menu";
import {
  APP_DISPLAY_NAME,
  SYSTEM_LOGO_WIDE,
  SYSTEM_LOGO_WIDE_ASPECT,
} from "@/lib/branding";
import { getAppVersionDisplay } from "@/lib/app-version";
import { useMobileLocale } from "@/lib/i18n";
import { PWA } from "@/constants/pwaTheme";

type Step = "password" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useMobileLocale();
  const { hydrated, user, signInWithPassword, signInWithOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("password");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [mfaId, setMfaId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const baseUrl = getPocketBaseUrl();
  const showConfigWarn = !isMobileServerConfigured();
  const envDiag = getMobileEnvHostDiagnostics();
  const showStagingWarn = __DEV__ && isStagingOrProductionMobileUrl();

  useEffect(() => {
    const pending = consumePendingLoginMessage();
    if (pending) setErr(pending);
  }, []);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.bootCenter}>
          <ActivityIndicator color={PWA.indigo} size="large" />
          <Text style={styles.bootHint}>{t("common.sessionLoading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (user) {
    return <Redirect href={getNativeHomeHref(user)} />;
  }

  async function onPasswordSubmit() {
    Keyboard.dismiss();
    setErr(null);
    setLoading(true);
    try {
      const res = await signInWithPassword(email, password);
      if (res.kind === "success") {
        Keyboard.dismiss();
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
      setErr(pocketBaseUnreachableMessage(e, baseUrl) ?? getErrorMessage(e, "Gagal masuk"));
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
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bounces={false}
          >
            <View style={styles.hero}>
              <Image
                source={SYSTEM_LOGO_WIDE}
                style={styles.logoWide}
                resizeMode="contain"
                accessibilityLabel="SDI"
              />
              {/* Nama app tidak diulang — sudah ada di dalam logo. */}
              <Text style={styles.brandSub}>Operasional perusahaan</Text>
              <Text style={styles.version}>{getAppVersionDisplay()}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {step === "otp" ? "Verifikasi OTP" : "Masuk"}
              </Text>

              {showConfigWarn ? (
                <View style={styles.bannerWarn}>
                  <Text style={styles.bannerWarnTxt}>
                    {t("common.serverUrlMissing")}
                  </Text>
                </View>
              ) : null}

              {showStagingWarn ? (
                <View style={styles.bannerWarn}>
                  <Text style={styles.bannerWarnTxt}>
                    Konfigurasi masih mengarah ke staging/production. Untuk UAT lokal, set
                    EXPO_PUBLIC_ERP_WEB_URL dan EXPO_PUBLIC_POCKETBASE_URL ke IP LAN PC di mobile/.env
                    lalu jalankan ulang Expo dengan --clear.
                  </Text>
                </View>
              ) : null}

              {__DEV__ && envDiag.configured ? (
                <Text style={styles.devEnvHint}>
                  Dev: PB {envDiag.pocketBaseHost} · ERP {envDiag.erpWebHost}
                </Text>
              ) : null}

              {err ? (
                <View style={styles.bannerErr}>
                  <Text style={styles.bannerErrTxt}>{err}</Text>
                </View>
              ) : null}

              {step === "password" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={PWA.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.inputPassword}
                      placeholder="Kata sandi"
                      placeholderTextColor={PWA.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="password"
                      textContentType="password"
                      value={password}
                      onChangeText={setPassword}
                    />
                    <Pressable
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color={PWA.textMuted}
                      />
                    </Pressable>
                  </View>
                  <Pressable
                    style={[styles.btn, (loading || !email.trim() || !password) && styles.btnDisabled]}
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
                    placeholderTextColor={PWA.textMuted}
                    keyboardType="number-pad"
                    value={otpCode}
                    onChangeText={setOtpCode}
                  />
                  <View style={styles.otpActions}>
                    <Pressable
                      style={[styles.btn, (loading || !otpCode.trim()) && styles.btnDisabled]}
                      onPress={onOtpSubmit}
                      disabled={loading || !otpCode.trim()}
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.btnText}>Verifikasi</Text>
                      )}
                    </Pressable>
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
                  </View>
                </>
              )}

              <Text style={styles.footerHint}>
                Sesi disimpan aman di perangkat. Login di HP lain akan mengakhiri sesi ini.
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PWA.screenBgTint,
  },
  bootCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  bootHint: { color: PWA.textMuted, fontSize: 14 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  hero: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 20,
  },
  logoWide: {
    width: 220,
    height: Math.round(220 / SYSTEM_LOGO_WIDE_ASPECT),
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: PWA.text,
    letterSpacing: -0.5,
  },
  brandSub: {
    marginTop: 4,
    fontSize: 14,
    color: PWA.textSecondary,
  },
  version: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: PWA.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: PWA.text,
    marginBottom: 4,
  },
  bannerWarn: {
    backgroundColor: PWA.amber50,
    borderWidth: 1,
    borderColor: PWA.amber200,
    borderRadius: 12,
    padding: 12,
  },
  bannerWarnTxt: { color: PWA.amber900, fontSize: 13, lineHeight: 18 },
  devEnvHint: {
    fontSize: 11,
    color: PWA.textMuted,
    lineHeight: 16,
    marginBottom: 4,
  },
  bannerErr: {
    backgroundColor: PWA.red50,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: PWA.red200,
  },
  bannerErrTxt: { color: PWA.red700, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: PWA.slate50,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: PWA.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PWA.slate50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PWA.border,
  },
  inputPassword: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: PWA.text,
    fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  otpHint: { color: PWA.textMuted, fontSize: 13, lineHeight: 18 },
  otpActions: { gap: 10, marginTop: 4 },
  btn: {
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  secondary: {
    borderWidth: 1,
    borderColor: PWA.border,
    backgroundColor: PWA.surface,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: PWA.textSecondary, fontWeight: "600" },
  footerHint: {
    color: PWA.textMuted,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
    textAlign: "center",
  },
});
