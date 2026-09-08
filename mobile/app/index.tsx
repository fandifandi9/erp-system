import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth";
import { PWA } from "@/constants/pwaTheme";
import { getNativeHomeHref } from "@/lib/work-dashboard-menu";
import { useMobileLocale } from "@/lib/i18n";

export default function Index() {
  const { hydrated, user } = useAuth();
  const { t } = useMobileLocale();
  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} size="large" />
        <Text style={styles.hint}>{t("common.sessionLoading")}</Text>
      </View>
    );
  }
  if (user) {
    return <Redirect href={getNativeHomeHref(user)} />;
  }
  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PWA.screenBg,
    gap: 12,
  },
  hint: { color: PWA.textMuted, fontSize: 14 },
});
