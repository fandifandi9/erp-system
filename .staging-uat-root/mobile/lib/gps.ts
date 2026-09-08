/** Haversine distance in meters (same formula as ERP web). */
export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const DEFAULT_MAX_GPS_ACCURACY_METERS = 200;

export function enforceMaxGpsAccuracy(
  accuracyMeters: number | undefined | null,
  maxAllowed = DEFAULT_MAX_GPS_ACCURACY_METERS
): void {
  if (
    accuracyMeters == null ||
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters <= 0
  ) {
    return;
  }
  if (accuracyMeters > maxAllowed) {
    throw new Error(
      `Sinyal GPS terlalu tidak pasti (${Math.round(accuracyMeters)} m). Bergerak ke area lebih terbuka lalu coba lagi (ketat ±${maxAllowed} m).`
    );
  }
}

/** Format distance in meters for UI (aligned with web `lib/gps.ts`). */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

export function validateGPSRadius(
  userLat: number,
  userLng: number,
  officeLat: number,
  officeLng: number,
  radiusMeter: number | undefined,
  accuracyMeters?: number | null
): { isValid: boolean; distance: number; message: string } {
  const safeRadius =
    radiusMeter && !Number.isNaN(radiusMeter) ? radiusMeter : 100;
  const uncertainty =
    accuracyMeters != null &&
    typeof accuracyMeters === "number" &&
    Number.isFinite(accuracyMeters) &&
    accuracyMeters > 0
      ? accuracyMeters
      : 0;
  const distance = getDistance(userLat, userLng, officeLat, officeLng);
  const isValid = distance + uncertainty <= safeRadius;
  const distRounded = Math.round(distance);
  return {
    isValid,
    distance: distRounded,
    message: isValid
      ? `Dalam radius kantor (${distRounded} m${uncertainty ? `; toleransi GPS ±${Math.round(uncertainty)} m` : ""})`
      : `Di luar zona absensi (${distRounded} m + ketidakpastian ${Math.round(uncertainty)} m melebihi radius ${safeRadius} m)`,
  };
}

export function detectSuspiciousGPSJump(
  previousLat: number,
  previousLng: number,
  currentLat: number,
  currentLng: number,
  timeDiffMinutes: number
): boolean {
  const distance = getDistance(
    previousLat,
    previousLng,
    currentLat,
    currentLng
  );
  return distance > 5000 && timeDiffMinutes < 5;
}
