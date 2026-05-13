import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/context/auth";
import { usePushRegistration } from "@/lib/notifications";

export default function TabsLayout() {
  const { hydrated, user } = useAuth();
  usePushRegistration(!!user);

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" size="large" />
      </View>
    );
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f8fafc",
        tabBarStyle: { backgroundColor: "#0f172a", borderTopColor: "#1e293b" },
        tabBarActiveTintColor: "#38bdf8",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Absensi",
          tabBarLabel: "Absensi",
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{ title: "Cuti", tabBarLabel: "Cuti" }}
      />
      <Tabs.Screen
        name="field"
        options={{ title: "Luar kantor", tabBarLabel: "Luar" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profil", tabBarLabel: "Profil" }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
});
