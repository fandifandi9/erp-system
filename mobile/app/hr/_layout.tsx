import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { useAuth } from "@/context/auth";
import { canAccessHrNativeModule } from "@/lib/hr-native-access";
import { PWA } from "@/constants/pwaTheme";

export default function HrLayout() {
  const { hydrated, user } = useAuth();

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} size="large" />
        <Text style={styles.muted}>Memuat…</Text>
      </View>
    );
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  if (!canAccessHrNativeModule(user as Record<string, unknown>)) {
    return <Redirect href="/(tabs)/attendance" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: PWA.surface },
        headerTintColor: PWA.text,
        headerTitleStyle: { fontWeight: "700", fontSize: 17, color: PWA.text },
        headerBackTitle: "Kembali",
        contentStyle: { backgroundColor: PWA.screenBg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Antrean HR" }} />
      <Stack.Screen name="leave-queue" options={{ title: "Antrean cuti" }} />
      <Stack.Screen name="overtime-queue" options={{ title: "Lembur" }} />
      <Stack.Screen name="field-queue" options={{ title: "Luar kantor" }} />
      <Stack.Screen name="recruitment-queue" options={{ title: "Recruitment" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: PWA.screenBg, gap: 10 },
  muted: { fontSize: 14, color: PWA.textMuted },
});
