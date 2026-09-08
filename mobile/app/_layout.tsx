import "react-native-gesture-handler";
import "react-native-reanimated";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KeyboardDismissOnNavigation } from "@/components/KeyboardDismissOnNavigation";
import { AuthProvider } from "@/context/auth";
import { OfflineQueueProvider } from "@/context/offline-queue";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { useAllowScreenSleep } from "@/lib/screen-behavior";
import { MobileLocaleProvider } from "@/lib/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export default function RootLayout() {
  useAllowScreenSleep();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MobileLocaleProvider>
            <AppErrorBoundary>
              <OfflineQueueProvider>
                <KeyboardDismissOnNavigation />
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="hr" options={{ headerShown: false }} />
                  <Stack.Screen name="inventory" options={{ headerShown: false }} />
                  <Stack.Screen name="wms" options={{ headerShown: false }} />
                </Stack>
              </OfflineQueueProvider>
            </AppErrorBoundary>
            </MobileLocaleProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
