import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { PWA } from "@/constants/pwaTheme";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Tangkap error JS fatal agar APK tidak langsung close tanpa pesan (release build).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error.message, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Aplikasi terhenti</Text>
            <Text style={styles.body}>
              Terjadi error internal. Tutup aplikasi dari recent apps, buka lagi, atau hubungi
              IT jika berulang.
            </Text>
            <Text style={styles.tech} selectable>
              {this.state.error.message}
            </Text>
            <Pressable style={styles.btn} onPress={this.reset}>
              <Text style={styles.btnTxt}>Coba tampilkan lagi</Text>
            </Pressable>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: PWA.screenBg },
  scroll: { padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: "800", color: PWA.text },
  body: { fontSize: 14, color: PWA.textMuted, lineHeight: 20 },
  tech: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
  },
  btn: {
    marginTop: 8,
    backgroundColor: PWA.indigo,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnTxt: { color: "#fff", fontWeight: "700" },
});
