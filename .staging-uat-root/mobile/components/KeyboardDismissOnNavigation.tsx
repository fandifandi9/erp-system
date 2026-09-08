import { usePathname } from "expo-router";
import { useEffect } from "react";
import { Keyboard } from "react-native";

export function KeyboardDismissOnNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    Keyboard.dismiss();
  }, [pathname]);
  return null;
}
