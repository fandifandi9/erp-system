import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  department?: string;
  shift_start?: string;
  shift_end?: string;
  avatar?: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const uid = user?.id ?? "";
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const row = await pb.collection("profiles").getFirstListItem(
        `user="${uid.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
        { requestKey: null }
      );
      setProfile(row as unknown as ProfileRow);
    } catch {
      setProfile(null);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

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
    try {
      const formData = new FormData();
      const uri =
        Platform.OS === "android"
          ? file.uri
          : file.uri.replace("file://", "");
      formData.append(
        "avatar",
        {
          uri,
          name: "avatar.jpg",
          type: "image/jpeg",
        } as unknown as Blob
      );
      await pb.collection("profiles").update(profile.id, formData);
      await load();
      Alert.alert("OK", "Foto profil diperbarui.");
    } catch (e: unknown) {
      Alert.alert("Gagal", getErrorMessage(e, "Upload avatar gagal"));
    }
  }

  const avatarUrl =
    profile?.avatar && profile.avatar.length > 0 && profile.id
      ? `${pb.baseUrl}/api/files/profiles/${profile.id}/${encodeURIComponent(profile.avatar)}`
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <View style={styles.card}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPh]}>
            <Text style={styles.avatarPhText}>
              {(profile?.name || user?.name || "?").slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <Pressable style={styles.outline} onPress={changeAvatar}>
          <Text style={styles.outlineText}>Ganti foto</Text>
        </Pressable>
        <Field label="Nama" value={profile?.name || user?.name || "—"} />
        <Field label="Email" value={profile?.email || user?.email || "—"} />
        <Field label="Divisi" value={profile?.department || "—"} />
        <Field label="Jabatan" value={profile?.position || "—"} />
        <Field
          label="Shift"
          value={
            profile?.shift_start && profile?.shift_end
              ? `${profile.shift_start} – ${profile.shift_end}`
              : "—"
          }
        />
        <Field label="User ID" value={uid} />
      </View>

      <Pressable
        style={styles.logout}
        onPress={() => {
          void signOut().then(() => {
            router.replace("/(auth)/login");
          });
        }}
      >
        <Text style={styles.logoutText}>Keluar</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#0f172a",
    flexGrow: 1,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#f8fafc", marginBottom: 16 },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: "center",
  },
  avatarPh: {
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPhText: { fontSize: 36, color: "#f8fafc", fontWeight: "700" },
  outline: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#475569",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  outlineText: { color: "#e2e8f0", fontWeight: "600" },
  field: { gap: 4 },
  fieldLabel: { color: "#64748b", fontSize: 12 },
  fieldValue: { color: "#f8fafc", fontSize: 16 },
  logout: {
    marginTop: 28,
    backgroundColor: "#7f1d1d",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  logoutText: { color: "#fecaca", fontWeight: "700", fontSize: 16 },
});
