// ========================================
// 🌍 GPS UTILITIES - HAVERSINE DISTANCE
// ========================================

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 - Latitude of point 1
 * @param lon1 - Longitude of point 1
 * @param lat2 - Latitude of point 2
 * @param lon2 - Longitude of point 2
 * @returns Distance in meters
 */
export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

function readDebugCoordsFromStorage(): {
  lat: number;
  lng: number;
  accuracy: number;
} | null {
  if (typeof window === "undefined") return null;
  const debugLat = localStorage.getItem("debug_lat");
  const debugLng = localStorage.getItem("debug_lng");
  if (!debugLat || !debugLng) return null;
  const lat = parseFloat(debugLat);
  const lng = parseFloat(debugLng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, accuracy: 1 };
}

function requestPosition(
  options: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation!.getCurrentPosition(resolve, reject, options);
  });
}

function coordsFromPosition(p: GeolocationPosition) {
  const acc = p.coords.accuracy;
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: typeof acc === "number" && acc > 0 ? acc : 50,
  };
}

/** Kode standard GeolocationPositionError.PERMISSION_DENIED, dll */
function geolocationMessageId(code: number): string {
  if (code === 1)
    return "Browser menolak akses lokasi. Klik ikon gembok/info di kolom alamat → izinkan Lokasi untuk localhost / situs ini.";
  if (code === 2)
    return "Lokasi tidak tersedia (sering terjadi di PC dalam ruangan). Aktifkan Layanan lokasi Windows (Privasi → Lokasi), izinkan untuk browser Anda; coba HP dengan GPS; atau matikan VPN sementara.";
  if (code === 3)
    return "Ambil lokasi kehabisan waktu. Bergerak ke sinyal lebih baik lalu tap Check-in lagi.";
  return "Tidak bisa mendapatkan koordinat. Coba lagi dari perangkat/browser lain atau cek pengaturan lokasi sistem.";
}

/**
 * Get user's current GPS location with debug fallback
 * @returns Promise with coordinates or error
 */
export function getCurrentLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  return new Promise((resolve, reject) => {
    void (async () => {
      if (
        typeof window !== "undefined" &&
        process.env.NODE_ENV !== "production"
      ) {
        const dbg = readDebugCoordsFromStorage();
        if (dbg) {
          console.warn("🔧 DEBUG MODE: Using debug coordinates", dbg);
          resolve(dbg);
          return;
        }
      }

      if (!navigator.geolocation) {
        reject(
          new Error(
            "Browser tidak mendukung lokasi GPS. Gunakan Chrome/Edge terbaru atau uji dari ponsel."
          )
        );
        return;
      }

      try {
        const pHigh = await requestPosition({
          enableHighAccuracy: true,
          timeout: 16000,
          maximumAge: 0,
        });
        const out = coordsFromPosition(pHigh);
        console.log("✅ GPS Success (high accuracy)", out);
        resolve(out);
        return;
      } catch (highErr: unknown) {
        console.warn("GPS akurasi tinggi gagal, coba lagi dengan mode kasar/Wi‑Fi:", highErr);
      }

      try {
        const pLow = await requestPosition({
          enableHighAccuracy: false,
          timeout: 26000,
          maximumAge: 120000,
        });
        const out = coordsFromPosition(pLow);
        console.log("✅ GPS Success (network / coarse)", out);
        resolve(out);
        return;
      } catch (err: unknown) {
        let code = 2;
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          typeof (err as GeolocationPositionError).code === "number"
        ) {
          code = (err as GeolocationPositionError).code;
        }
        const hint =
          process.env.NODE_ENV !== "production"
            ? " Untuk pengembangan di PC: bisa set localStorage `debug_lat` dan `debug_lng` (koordinat uji)."
            : "";
        reject(new Error(geolocationMessageId(code) + hint));
      }
    })();
  });
}

/** Tolak pembacaan GPS kalau ketidakpastian lokasi lebih dari ini (meter). */
export const DEFAULT_MAX_GPS_ACCURACY_METERS = 200;

/**
 * Gagalkan check-in kalau GPS terlalu lebar ketidakpastiannya (sering spoof / indoor buruk).
 */
export function enforceMaxGpsAccuracy(
  accuracyMeters: number | undefined | null,
  maxAllowed = DEFAULT_MAX_GPS_ACCURACY_METERS
): void {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return;
  }
  if (accuracyMeters > maxAllowed) {
    throw new Error(
      `Sinyal GPS terlalu tidak pasti (${Math.round(accuracyMeters)} m). Bergerak ke area lebih terbuka lalu coba lagi (ketat ±${maxAllowed} m).`
    );
  }
}

/**
 * Validate if user location is within office radius.
 * Optionally account for GPS horizontal accuracy: require `distance + accuracy <= radius`.
 */
export function validateGPSRadius(
  userLat: number,
  userLng: number,
  officeLat: number,
  officeLng: number,
  radiusMeter: number | undefined,
  accuracyMeters?: number | null
): {
  isValid: boolean;
  distance: number;
  message: string;
} {
  const safeRadius = radiusMeter && !isNaN(radiusMeter) ? radiusMeter : 100;

  if (!radiusMeter || isNaN(radiusMeter)) {
    console.warn("⚠️ RADIUS UNDEFINED - using fallback 100m. Check PocketBase 'radius' field configuration.");
  }

  const uncertainty =
    accuracyMeters != null &&
    typeof accuracyMeters === "number" &&
    Number.isFinite(accuracyMeters) &&
    accuracyMeters > 0
      ? accuracyMeters
      : 0;

  console.log("🔍 GPS Validation:", {
    userLat,
    userLng,
    officeLat,
    officeLng,
    radiusMeter_input: radiusMeter,
    safeRadius,
    uncertaintyMeters: uncertainty,
  });

  const distance = getDistance(userLat, userLng, officeLat, officeLng);
  const isValid = distance + uncertainty <= safeRadius;

  const distRounded = Math.round(distance);
  return {
    isValid,
    distance: distRounded,
    message: isValid
      ? `Dalam radius kantor (${distRounded} m dari pusat zona${uncertainty ? `; toleransi ketidakpastian GPS ±${Math.round(uncertainty)} m` : ""})`
      : `Di luar zona absensi (${distRounded} m + ketidakpastian ${Math.round(uncertainty)} m melebihi radius ${safeRadius} m)`,
  };
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}
