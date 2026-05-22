import { Stack } from "expo-router";
import { PWA } from "@/constants/pwaTheme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: PWA.screenBg },
      }}
    />
  );
}
