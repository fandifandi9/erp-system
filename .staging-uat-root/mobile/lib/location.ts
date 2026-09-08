import * as Location from "expo-location";

export async function getCurrentLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== Location.PermissionStatus.GRANTED) {
    throw new Error(
      "Izin lokasi ditolak. Aktifkan lokasi untuk aplikasi ini di pengaturan."
    );
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
  });
  const acc = pos.coords.accuracy;
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy:
      typeof acc === "number" && Number.isFinite(acc) && acc > 0 ? acc : 50,
  };
}
