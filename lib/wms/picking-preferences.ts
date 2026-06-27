const AUTO_PRINT_PK_KEY = "wms_auto_print_pk";

/** Default OFF — manual cetak seperti sebelumnya. */
export function getAutoPrintPkEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTO_PRINT_PK_KEY) === "1";
}

export function setAutoPrintPkEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_PRINT_PK_KEY, enabled ? "1" : "0");
}
