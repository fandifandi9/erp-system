import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { useAuth } from "@/context/auth";
import { canAccessInventory } from "@/lib/inventory/access";
import { PWA } from "@/constants/pwaTheme";

export default function InventoryLayout() {
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
  if (!canAccessInventory(user as Record<string, unknown>)) {
    return <Redirect href="/(tabs)/kerja" />;
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
      <Stack.Screen name="index" options={{ title: "Gudang" }} />
      <Stack.Screen name="zone-scan" options={{ title: "Scan zona" }} />
      <Stack.Screen name="product-scan" options={{ title: "Cek stok" }} />
      <Stack.Screen name="packing" options={{ title: "Kemasan" }} />
      <Stack.Screen name="opname" options={{ title: "Opname stok" }} />
      <Stack.Screen name="movement-new" options={{ title: "Draf mutasi" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: PWA.screenBg, gap: 10 },
  muted: { fontSize: 14, color: PWA.textMuted },
});
