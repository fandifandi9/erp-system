import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  StaffHubSegmentBar,
  type StaffHubKey,
} from "@/components/StaffHubSegmentBar";
import { AttendanceCheckInPanel } from "@/components/attendance/AttendanceCheckInPanel";
import { AttendanceHistoryPanel } from "@/components/attendance/AttendanceHistoryPanel";
import { LeaveStaffPanel } from "./leave";
import { OvertimeStaffPanel } from "./overtime";
import { FieldStaffPanel } from "./field";
import IzinOffScreen from "./izin";
import MySubmissionsScreen from "./my-submissions";
import { useMobileLocale } from "@/lib/i18n";
import { PWA } from "@/constants/pwaTheme";

export default function AttendanceScreen() {
  const { t } = useMobileLocale();
  const [hub, setHub] = useState<StaffHubKey>("attendance");
  const [attendanceTick, setAttendanceTick] = useState(0);
  const [attTab, setAttTab] = useState<"today" | "history">("today");

  useFocusEffect(
    useCallback(() => {
      if (hub === "attendance") {
        setAttendanceTick((n) => n + 1);
      }
    }, [hub])
  );

  return (
    <View style={styles.root}>
      <StaffHubSegmentBar value={hub} onChange={setHub} />
      {hub === "attendance" ? (
        <View style={styles.subTabs}>
          <Pressable
            onPress={() => setAttTab("today")}
            style={[styles.subTab, attTab === "today" && styles.subTabOn]}
          >
            <Text style={styles.subTabText}>{t("attendance.today")}</Text>
          </Pressable>
          <Pressable
            onPress={() => setAttTab("history")}
            style={[styles.subTab, attTab === "history" && styles.subTabOn]}
          >
            <Text style={styles.subTabText}>{t("attendance.history")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.body}>
        {hub === "attendance" && attTab === "today" ? (
          <AttendanceCheckInPanel key={attendanceTick} />
        ) : null}
        {hub === "attendance" && attTab === "history" ? <AttendanceHistoryPanel /> : null}
        {hub === "leave" ? <LeaveStaffPanel embedded /> : null}
        {hub === "overtime" ? <OvertimeStaffPanel embedded /> : null}
        {hub === "field" ? <FieldStaffPanel embedded /> : null}
        {hub === "izin" ? <IzinOffScreen /> : null}
        {hub === "submissions" ? <MySubmissionsScreen /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PWA.screenBg },
  body: { flex: 1 },
  subTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  subTab: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: PWA.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PWA.border,
    justifyContent: "center",
  },
  subTabOn: { backgroundColor: "#e0e7ff" },
  subTabText: { textAlign: "center", fontWeight: "700", color: PWA.text, fontSize: 14 },
});
