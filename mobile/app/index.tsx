import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth";

export default function Index() {
  const { hydrated, user } = useAuth();
  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0f172a",
        }}
      >
        <ActivityIndicator color="#38bdf8" size="large" />
      </View>
    );
  }
  if (user) {
    return <Redirect href="/(tabs)/attendance" />;
  }
  return <Redirect href="/(auth)/login" />;
}
