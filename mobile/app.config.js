/**
 * Konfigurasi Expo — memuat app.json + env (`.env` lokal / variabel EAS Build).
 * EXPO_PUBLIC_* harus ada saat `eas build` (lihat eas.json → profil `base`).
 */
const appJson = require("./app.json");

const pbUrl = (process.env.EXPO_PUBLIC_POCKETBASE_URL ?? "").trim();
const erpUrl = (process.env.EXPO_PUBLIC_ERP_WEB_URL ?? "").trim();

if (!pbUrl) {
  console.warn(
    "[app.config] EXPO_PUBLIC_POCKETBASE_URL kosong. Isi mobile/.env (dev) atau eas.json env (EAS Build)."
  );
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      pocketBaseUrl: pbUrl || undefined,
      erpWebUrl: erpUrl || undefined,
    },
  },
};
