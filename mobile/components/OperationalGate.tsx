import type { ReactNode } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useOperationalAccess } from "@/hooks/useOperationalAccess";
import { OperationalLockBanner } from "@/components/OperationalLockBanner";
import { PWA } from "@/constants/pwaTheme";

type Props = {
  children: ReactNode;
  title?: string;
};

/** Blokir layar modul operasional jika belum check-in / sudah check-out. */
export function OperationalGate({ children, title }: Props) {
  const { locked, bypass } = useOperationalAccess();

  if (!locked || bypass) {
    return <>{children}</>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {title ? <Text style={styles.h1}>{title}</Text> : null}
      <OperationalLockBanner />
      <Text style={styles.hint}>
        Setelah absen masuk dari tab Absensi, tarik layar ke bawah untuk memuat ulang status akses.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PWA.screenBg },
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  h1: { fontSize: 24, fontWeight: "800", color: PWA.text },
  hint: { fontSize: 13, lineHeight: 20, color: PWA.textMuted },
});
