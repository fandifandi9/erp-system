import { useMemo } from "react";
import { ActivityIndicator, View, Text, StyleSheet, Platform } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useAuth } from "@/context/auth";
import { shouldShowMejaKerjaTab } from "@/lib/work-dashboard-menu";
import { usePushRegistration } from "@/lib/notifications";
import { getAppVersionDisplay } from "@/lib/app-version";
import { PWA } from "@/constants/pwaTheme";

const TAB_ICON_SIZE = 24;

type IonName = ComponentProps<typeof Ionicons>["name"];

function tabBarIconPair(outline: IonName, solid: IonName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={styles.tabIconWrap}>
      <Ionicons name={focused ? solid : outline} color={color} size={TAB_ICON_SIZE} />
    </View>
  );
}

const TAB_BAR_BASE_HEIGHT = 56;

export default function TabsLayout() {
  const { hydrated, user } = useAuth();
  const insets = useSafeAreaInsets();
  usePushRegistration(!!user);
  const showMejaKerjaTab = useMemo(() => shouldShowMejaKerjaTab(user), [user]);

  const tabBarBottom = Math.max(insets.bottom, Platform.OS === "android" ? 10 : 8);
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + tabBarBottom;

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PWA.indigo} size="large" />
        <Text style={styles.loadingLabel}>Memuat…</Text>
      </View>
    );
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerRight: () => (
          <Text style={styles.versionBadge}>{getAppVersionDisplay()}</Text>
        ),
        headerStyle: {
          backgroundColor: PWA.surfaceGlass,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: PWA.border,
        },
        headerTintColor: PWA.text,
        headerTitleStyle: { fontWeight: "700", color: PWA.text, fontSize: 17 },
        tabBarStyle: {
          backgroundColor: PWA.surface,
          borderTopColor: PWA.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 12,
          height: tabBarHeight,
          paddingBottom: tabBarBottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor: PWA.indigo,
        tabBarInactiveTintColor: PWA.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginBottom: 0,
          marginTop: 2,
        },
        tabBarIconStyle: { marginTop: 0 },
        tabBarItemStyle: {
          paddingTop: 4,
          paddingBottom: 2,
        },
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Absensi",
          tabBarLabel: "Absensi",
          tabBarIcon: tabBarIconPair("today-outline", "today"),
        }}
      />
      <Tabs.Screen
        name="kerja"
        options={{
          title: "Meja kerja",
          tabBarLabel: "Meja kerja",
          href: showMejaKerjaTab ? undefined : null,
          tabBarIcon: tabBarIconPair("briefcase-outline", "briefcase"),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          href: null,
          title: "Cuti",
        }}
      />
      <Tabs.Screen
        name="overtime"
        options={{
          href: null,
          title: "Lembur",
        }}
      />
      <Tabs.Screen
        name="field"
        options={{
          href: null,
          title: "Luar kantor",
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          href: null,
          title: "Slip gaji",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarLabel: "Profil",
          tabBarIcon: tabBarIconPair("person-circle-outline", "person-circle"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PWA.screenBg,
    gap: 12,
  },
  loadingLabel: { color: PWA.textMuted, fontSize: 14 },
  versionBadge: {
    marginRight: 14,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: PWA.textMuted,
  },
  tabIconWrap: {
    height: 28,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
