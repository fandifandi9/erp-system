/** Map server/GPS errors to short user-facing copy. Does not change GPS rules. */

export function friendlyAttendanceMessage(
  raw: string,
  t: (key: string) => string,
  httpStatus?: number,
): string {
  const msg = String(raw || "").trim();
  if (!msg) return t("common.error");

  if (httpStatus === 401) return "Sesi berakhir. Silakan login ulang.";
  if (httpStatus === 403) return "Akses ditolak. Hubungi HR jika ini tidak seharusnya.";
  if (httpStatus === 503) {
    return /Layanan data sementara/i.test(msg) ? msg : t("attendance.serviceUnavailable");
  }

  if (
    /MOBILE_OFFLINE|koneksi|offline|jaringan|Failed to fetch|fetch failed|ECONN/i.test(msg)
  ) {
    return t("attendance.offline");
  }
  if (/Login admin PocketBase|POCKETBASE_ADMIN|kata sandi admin|superuser/i.test(msg)) {
    return t("attendance.serviceUnavailable");
  }
  if (/EXPO_PUBLIC|HTTP \d+|PocketBase/i.test(msg)) {
    return t("attendance.serviceUnavailable");
  }
  if (/izin lokasi|location permission|ditolak.*lokasi/i.test(msg)) {
    return t("attendance.gpsDenied");
  }
  if (/timeout|waktu habis|lokasi.*lambat/i.test(msg)) {
    return t("attendance.gpsTimeout");
  }
  if (/luar zona|di luar area|melebihi radius/i.test(msg)) return t("attendance.gpsOutside");
  if (/dalam radius|absensi ok/i.test(msg)) return t("attendance.gpsVerified");
  if (/sinyal gps|tidak pasti|akurasi/i.test(msg)) return t("attendance.gpsWeak");
  if (/kantor tidak lengkap|kantor belum|koordinat gps wajib/i.test(msg)) {
    return t("attendance.officeIncomplete");
  }
  if (/Koordinat GPS wajib/i.test(msg)) return t("attendance.gpsRequired");
  return msg;
}
