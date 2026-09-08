import * as Location from "expo-location";

const GPS_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export async function getCurrentLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== Location.PermissionStatus.GRANTED) {
    throw new Error(
      "Izin lokasi ditolak. Aktifkan lokasi untuk aplikasi ini di pengaturan.",
    );
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error(
      "GPS tidak aktif. Aktifkan layanan lokasi di pengaturan perangkat lalu coba lagi.",
    );
  }

  const pos = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }),
    GPS_TIMEOUT_MS,
    "Waktu habis saat mengambil lokasi GPS. Coba di area terbuka lalu ulangi.",
  );

  const acc = pos.coords.accuracy;
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy:
      typeof acc === "number" && Number.isFinite(acc) && acc > 0 ? acc : 50,
  };
}
