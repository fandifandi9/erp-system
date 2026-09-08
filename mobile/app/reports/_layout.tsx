import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/context/auth";
import { useMobileLocale } from "@/lib/i18n";
import { PWA } from "@/constants/pwaTheme";

export default function ReportsLayout() {
  const { hydrated, user } = useAuth();
  const { t } = useMobileLocale();
  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8 }}>
        <ActivityIndicator color={PWA.indigo} />
        <Text style={{ color: PWA.textMuted }}>{t("common.sessionLoading")}</Text>
      </View>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: PWA.surface },
        headerTintColor: PWA.text,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="index" options={{ title: t("reporting.reportsTitle") }} />
      <Stack.Screen name="new" options={{ title: t("reporting.newReport") }} />
      <Stack.Screen name="[id]" options={{ title: t("reporting.detail") }} />
    </Stack>
  );
}
