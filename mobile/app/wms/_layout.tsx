import { Stack } from "expo-router";

export default function WmsMobileLayout() {
  return (
    <Stack>
      <Stack.Screen name="workstation-scan" options={{ title: "Scan meja validasi" }} />
    </Stack>
  );
}
