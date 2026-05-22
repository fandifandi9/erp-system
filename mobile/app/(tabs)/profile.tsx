import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/auth";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import { PWA } from "@/constants/pwaTheme";
import { ensureAndSyncProfileMobile, type MobileProfile } from "@/lib/profileEnsure";
import { PayrollStaffPanel } from "./payroll";

type AuthUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  role_code?: string;
};

function roleLabelStaff(u: AuthUser | null): string {
  if (!u) return "—";
  const raw = String(u.role_code || u.role || "")
    .toLowerCase()
    .trim();
  if (raw === "owner") return "Owner";
  const map: Record<string, string> = {
    hr: "SDM / HR",
    manager: "Manajer",
    staff: "Staff",
    "staff-basic": "Staff",
    security: "Satpam",
    ob: "OB / Kebersihan",
  };
  return map[raw] || u.role_code || u.role || "—";
}

function formatJoinDateId(raw: string | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatSalaryId(n: number | undefined): string {
  if (n == null || Number(n) <= 0) return "—";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

type InfoDef = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string };

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const uid = user?.id ?? "";
  const authUser = user as AuthUser | null;

  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [formData, setFormData] = useState({
    phone: "",
    address: "",
    date_of_birth: "",
    bio: "",
  });

  const [passwordOld, setPasswordOld] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const load = useCallback(async () => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { profile: p } = await ensureAndSyncProfileMobile(uid);
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!profile) return;
    setFormData({
      phone: profile.phone || "",
      address: profile.address || "",
      date_of_birth: profile.date_of_birth || "",
      bio: profile.bio || "",
    });
  }, [profile]);

  async function changeAvatar() {
    if (!profile?.id) {
      Alert.alert("Profil", "Profil belum tersedia.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin", "Aktifkan akses galeri.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      const uri =
        Platform.OS === "android" ? file.uri : file.uri.replace("file://", "");
      fd.append(
        "avatar",
        { uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob
      );
      await pb.collection("profiles").update(profile.id, fd);
      await load();
      Alert.alert("Berhasil", "Foto profil diperbarui.");
    } catch (e: unknown) {
      Alert.alert("Gagal", getErrorMessage(e, "Upload avatar gagal"));
    } finally {
      Keyboard.dismiss();
      setUploadingAvatar(false);
    }
  }

  async function savePersonal() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      await pb.collection("profiles").update(profile.id, {
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        date_of_birth: formData.date_of_birth.trim(),
        bio: formData.bio.trim(),
      });
      await load();
      Alert.alert("Berhasil", "Informasi personal disimpan.");
    } catch (e: unknown) {
      Alert.alert("Gagal", getErrorMessage(e, "Tidak bisa menyimpan profil"));
    } finally {
      Keyboard.dismiss();
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!uid) return;
    if (passwordNew.length < 8) {
      Alert.alert("Kata sandi", "Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (passwordNew !== passwordConfirm) {
      Alert.alert("Kata sandi", "Konfirmasi tidak sama dengan sandi baru.");
      return;
    }
    if (!passwordOld.trim()) {
      Alert.alert("Kata sandi", "Isi kata sandi saat ini.");
      return;
    }
    setPasswordSaving(true);
    try {
      await pb.collection("users").update(uid, {
        oldPassword: passwordOld,
        password: passwordNew,
        passwordConfirm: passwordNew,
      });
      setPasswordOld("");
      setPasswordNew("");
      setPasswordConfirm("");
      Alert.alert("Berhasil", "Kata sandi diubah. Gunakan sandi baru saat login berikutnya.");
    } catch (e: unknown) {
      Alert.alert("Gagal", getErrorMessage(e, "Periksa sandi lama atau aturan PocketBase."));
    } finally {
      Keyboard.dismiss();
      setPasswordSaving(false);
    }
  }

  const avatarUrl =
    profile?.avatar && profile.avatar.length > 0 && profile.id
      ? `${pb.baseUrl}/api/files/profiles/${profile.id}/${encodeURIComponent(profile.avatar)}`
      : null;

  const employmentRows: InfoDef[] = profile
    ? [
        {
          icon: "layers-outline",
          label: "Divisi",
          value: profile.division?.trim() || "—",
        },
        {
          icon: "business-outline",
          label: "Departemen",
          value: profile.department?.trim() || "—",
        },
        {
          icon: "briefcase-outline",
          label: "Jabatan",
          value: profile.position?.trim() || "—",
        },
        {
          icon: "wallet-outline",
          label: "Gaji pokok",
          value: formatSalaryId(profile.salary),
        },
        {
          icon: "shield-checkmark-outline",
          label: "Peran akun",
          value: roleLabelStaff(authUser),
        },
        {
          icon: "calendar-outline",
          label: "Tanggal bergabung",
          value: formatJoinDateId(profile.join_date),
        },
        {
          icon: "time-outline",
          label: "Shift (Sen–Jum)",
          value:
            profile.shift_start && profile.shift_end
              ? `${profile.shift_start} – ${profile.shift_end}`
              : "—",
        },
        {
          icon: "sunny-outline",
          label: "Shift Sabtu",
          value:
            profile.shift_start_saturday?.trim() && profile.shift_end_saturday?.trim()
              ? `${profile.shift_start_saturday} – ${profile.shift_end_saturday}`
              : profile.shift_start_weekend?.trim() && profile.shift_end_weekend?.trim()
                ? `${profile.shift_start_weekend} – ${profile.shift_end_weekend} (sama Minggu)`
                : "Sama dengan Sen–Jum",
        },
        {
          icon: "sunny-outline",
          label: "Shift Minggu",
          value:
            profile.shift_start_sunday?.trim() && profile.shift_end_sunday?.trim()
              ? `${profile.shift_start_sunday} – ${profile.shift_end_sunday}`
              : profile.shift_start_weekend?.trim() && profile.shift_end_weekend?.trim()
                ? `${profile.shift_start_weekend} – ${profile.shift_end_weekend} (sama Sabtu)`
                : "Sama dengan Sen–Jum",
        },
      ]
    : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PWA.indigo} />
        <Text style={styles.loadingText}>Memuat profil…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerPadded}>
        <Ionicons name="alert-circle-outline" size={48} color={PWA.red700} />
        <Text style={styles.errorTitle}>Profil tidak ditemukan</Text>
        <Text style={styles.errorBody}>Silakan hubungi HR atau coba muat ulang.</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>Coba lagi</Text>
        </Pressable>
      </View>
    );
  }

  const displayName = profile.name || authUser?.name || "Pengguna";
  const displayEmail = profile.email || authUser?.email || "—";

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Profil saya</Text>
        <Text style={styles.pageSub}>Kelola informasi profil dan avatar Anda</Text>

        <View style={styles.card}>
          <View style={styles.avatarBlock}>
            <View style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]}>
                  <Ionicons name="person" size={56} color={PWA.indigo} />
                </View>
              )}
              <Pressable
                style={[styles.camFab, uploadingAvatar && styles.camFabDisabled]}
                onPress={() => void changeAvatar()}
                disabled={uploadingAvatar}
                accessibilityLabel="Ganti foto profil"
              >
                {uploadingAvatar ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="camera" size={20} color="#fff" />
                )}
              </Pressable>
            </View>
            <Text style={styles.displayName}>{displayName}</Text>
            <Text style={styles.displayEmail}>{displayEmail}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionKicker}>Data kepegawaian</Text>
          <Text style={styles.sectionHint}>Informasi ini hanya dapat diubah oleh HR.</Text>
          {employmentRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Ionicons name={row.icon} size={20} color={PWA.indigo} style={styles.infoIcon} />
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.payrollSection}>
          <PayrollStaffPanel embedded />
        </View>

        <View style={[styles.card, styles.cardTightTop]}>
          <View style={styles.sectionHead}>
            <Ionicons name="person-circle-outline" size={22} color={PWA.indigo} />
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Informasi personal</Text>
              <Text style={styles.sectionCaption}>Hanya bagian ini yang bisa Anda ubah sendiri.</Text>
            </View>
          </View>

          <LabeledInput
            icon="call-outline"
            label="Nomor telepon"
            value={formData.phone}
            onChangeText={(t) => setFormData((s) => ({ ...s, phone: t }))}
            keyboardType="phone-pad"
            placeholder="08123456789"
          />
          <LabeledInput
            icon="location-outline"
            label="Alamat"
            value={formData.address}
            onChangeText={(t) => setFormData((s) => ({ ...s, address: t }))}
            placeholder="Alamat lengkap"
            multiline
          />
          <LabeledInput
            icon="calendar-outline"
            label="Tanggal lahir (YYYY-MM-DD)"
            value={formData.date_of_birth}
            onChangeText={(t) => setFormData((s) => ({ ...s, date_of_birth: t }))}
            placeholder="1990-01-15"
          />
          <LabeledInput
            icon="document-text-outline"
            label="Bio / tentang saya"
            value={formData.bio}
            onChangeText={(t) => setFormData((s) => ({ ...s, bio: t }))}
            placeholder="Ceritakan singkat tentang Anda…"
            multiline
          />
          <Text style={styles.charCount}>{formData.bio.length} karakter</Text>

          <Pressable
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={() => void savePersonal()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Simpan perubahan</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={[styles.card, styles.cardTightTop]}>
          <View style={styles.sectionHead}>
            <Ionicons name="key-outline" size={22} color={PWA.indigo} />
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Ubah kata sandi</Text>
              <Text style={styles.sectionCaption}>
                Sandi baru minimal 8 karakter. Isi sandi saat ini dari Owner/HR.
              </Text>
            </View>
          </View>

          <SecureField
            label="Kata sandi saat ini"
            value={passwordOld}
            onChangeText={setPasswordOld}
            placeholder="Sandi saat ini"
          />
          <SecureField
            label="Kata sandi baru"
            value={passwordNew}
            onChangeText={setPasswordNew}
            placeholder="Minimal 8 karakter"
          />
          <SecureField
            label="Ulangi sandi baru"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            placeholder="Sama dengan di atas"
          />

          <Pressable
            style={[styles.passwordBtn, passwordSaving && styles.btnDisabled]}
            onPress={() => void savePassword()}
            disabled={passwordSaving}
          >
            {passwordSaving ? (
              <ActivityIndicator color={PWA.indigo} />
            ) : (
              <>
                <Ionicons name="key" size={18} color={PWA.indigo} />
                <Text style={styles.passwordBtnText}>Simpan kata sandi baru</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips</Text>
          <Text style={styles.tipsLine}>• Ukuran foto avatar maksimal 5MB</Text>
          <Text style={styles.tipsLine}>• Format gambar: JPG atau PNG</Text>
          <Text style={styles.tipsLine}>• Perbarui biodata secara berkala</Text>
        </View>

        <Pressable
          style={styles.logout}
          onPress={() => {
            void signOut().then(() => {
              router.replace("/(auth)/login");
            });
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={PWA.red800} />
          <Text style={styles.logoutText}>Keluar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputBlock}>
      <View style={styles.inputLabelRow}>
        <Ionicons name={icon} size={16} color={PWA.textSecondary} />
        <Text style={styles.inputLabel}>{label}</Text>
      </View>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PWA.textMuted}
        keyboardType={keyboardType || "default"}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function SecureField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.inputLabelPlain}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PWA.textMuted}
        secureTextEntry
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PWA.screenBg },
  container: {
    padding: 20,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PWA.screenBg,
    gap: 12,
  },
  centerPadded: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PWA.screenBg,
    padding: 24,
    gap: 12,
  },
  loadingText: { color: PWA.textMuted, fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: "700", color: PWA.text },
  errorBody: { textAlign: "center", color: PWA.textMuted, lineHeight: 20 },
  retryBtn: {
    marginTop: 8,
    backgroundColor: PWA.indigo,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  pageTitle: { fontSize: 26, fontWeight: "700", color: PWA.text, letterSpacing: -0.5 },
  pageSub: { marginTop: 6, fontSize: 14, color: PWA.textMuted, marginBottom: 16, lineHeight: 20 },
  card: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    marginBottom: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTightTop: { paddingTop: 18 },
  payrollSection: {
    backgroundColor: PWA.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    marginBottom: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatarBlock: { alignItems: "center" },
  avatarWrap: {
    width: 128,
    height: 128,
    position: "relative",
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    borderColor: PWA.indigo100,
  },
  avatarPh: {
    backgroundColor: PWA.indigo50,
    justifyContent: "center",
    alignItems: "center",
  },
  camFab: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PWA.indigo,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: PWA.surface,
    elevation: 4,
  },
  camFabDisabled: { opacity: 0.7 },
  displayName: { marginTop: 16, fontSize: 20, fontWeight: "700", color: PWA.text },
  displayEmail: { marginTop: 4, fontSize: 14, color: PWA.textMuted },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PWA.border,
    marginVertical: 18,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: PWA.textMuted,
  },
  sectionHint: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 11,
    lineHeight: 16,
    color: PWA.textMuted,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PWA.borderMuted,
  },
  infoIcon: { marginTop: 2 },
  infoText: { flex: 1, minWidth: 0 },
  infoLabel: { fontSize: 12, color: PWA.textMuted },
  infoValue: { marginTop: 2, fontSize: 15, fontWeight: "600", color: PWA.text, lineHeight: 22 },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 16 },
  sectionHeadText: { flex: 1 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: PWA.text },
  sectionCaption: { marginTop: 4, fontSize: 12, color: PWA.textMuted, lineHeight: 17 },
  inputBlock: { marginBottom: 14 },
  inputLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: PWA.textSecondary },
  inputLabelPlain: { fontSize: 13, fontWeight: "600", color: PWA.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: PWA.slate50,
    borderWidth: 1,
    borderColor: PWA.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: PWA.text,
  },
  inputMultiline: { minHeight: 88, paddingTop: 12 },
  charCount: { fontSize: 11, color: PWA.textMuted, marginTop: -8, marginBottom: 8 },
  saveBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PWA.indigo,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  passwordBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PWA.indigo50,
    borderWidth: 1,
    borderColor: PWA.indigo100,
    paddingVertical: 14,
    borderRadius: 14,
  },
  passwordBtnText: { color: PWA.indigo700, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
  tipsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 14,
    marginBottom: 8,
  },
  tipsTitle: { fontWeight: "700", color: "#1e40af", marginBottom: 8, fontSize: 14 },
  tipsLine: { fontSize: 12, color: "#1d4ed8", lineHeight: 18, marginBottom: 2 },
  logout: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PWA.red50,
    borderWidth: 1,
    borderColor: PWA.red200,
    paddingVertical: 14,
    borderRadius: 14,
  },
  logoutText: { color: PWA.red800, fontWeight: "700", fontSize: 16 },
});
