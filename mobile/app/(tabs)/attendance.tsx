import { useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  StaffHubSegmentBar,
  type StaffHubKey,
} from "@/components/StaffHubSegmentBar";
import { AttendanceCheckInPanel } from "@/components/attendance/AttendanceCheckInPanel";
import { LeaveStaffPanel } from "./leave";
import { OvertimeStaffPanel } from "./overtime";
import { FieldStaffPanel } from "./field";
import { PWA } from "@/constants/pwaTheme";

export default function AttendanceScreen() {
  const [hub, setHub] = useState<StaffHubKey>("attendance");
  const [attendanceTick, setAttendanceTick] = useState(0);

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
      <View style={styles.body}>
        {hub === "attendance" ? <AttendanceCheckInPanel key={attendanceTick} /> : null}
        {hub === "leave" ? <LeaveStaffPanel embedded /> : null}
        {hub === "overtime" ? <OvertimeStaffPanel embedded /> : null}
        {hub === "field" ? <FieldStaffPanel embedded /> : null}
      </View>
      </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PWA.screenBg },
  body: { flex: 1 },
});
