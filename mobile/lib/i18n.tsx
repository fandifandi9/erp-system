import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type MobileLocale = "id" | "en";

type Tree = { [key: string]: string | Tree };

const idMessages: Tree = {
  common: {
    loading: "Memuat…",
    error: "Terjadi kesalahan. Silakan coba lagi.",
    serverUrlMissing: "Server belum dikonfigurasi.",
    language: "Bahasa",
    close: "Tutup",
    sessionLoading: "Memuat sesi…",
  },
  attendance: {
    title: "Absensi",
    today: "Hari Ini",
    history: "Riwayat",
    statusToday: "Status hari ini",
    checkIn: "Absen masuk",
    checkOut: "Absen pulang",
    emptyHistory: "Belum ada riwayat absensi.",
    stillWorking: "Masih bekerja",
    statusPresent: "Hadir",
    statusLate: "Terlambat",
    statusAbsent: "Tidak hadir",
    statusLeave: "Cuti",
    gpsHint: "Pastikan GPS aktif dan izin lokasi diberikan.",
    gpsDenied: "Izin lokasi ditolak. Aktifkan lokasi untuk aplikasi ini di pengaturan.",
    gpsVerified: "Lokasi berhasil diverifikasi.",
    gpsOutside: "Anda berada di luar area kantor.",
    gpsWeak: "Sinyal lokasi kurang jelas. Coba di area lebih terbuka.",
    officeIncomplete: "Data lokasi kantor belum lengkap. Hubungi HR.",
    offline: "Koneksi diperlukan untuk absensi. Mode offline tidak dipakai.",
    serviceUnavailable: "Layanan absensi sementara tidak tersedia. Coba lagi beberapa saat atau hubungi HR.",
    gpsTimeout: "Gagal mendapatkan lokasi GPS. Pastikan GPS aktif dan coba di area terbuka.",
    gpsRequired: "Koordinat GPS wajib untuk absensi. Aktifkan lokasi lalu coba lagi.",
    checkInTime: "Masuk",
    checkOutTime: "Pulang",
    scheduleToday: "Jadwal",
  },
  rating: {
    title: "Penilaian / Rating",
    tabLabel: "Rating",
    myResult: "Hasil Penilaian Saya",
    myTasks: "Tugas Penilaian Saya",
    resultTab: "Hasil",
    tasksTab: "Tugas",
    emptyResult: "Belum ada hasil penilaian untuk Anda.",
    emptyTasks: "Belum ada tugas penilaian untuk Anda.",
    privacy: "Identitas penilai, komentar individu, dan skor per penilai tidak ditampilkan.",
    currentAggregate: "Agregat sementara (belum semua penilai selesai).",
    finalAggregate: "Hasil akhir.",
    summary: "Ringkasan",
    strengths: "Kekuatan",
    improvements: "Peningkatan",
    suggestion: "Saran",
    respondents: "Jumlah penilai",
    score: "Skor",
    scoreHelp: "Pilih skor 1–5. 1 sangat kurang, 5 sangat baik.",
    comment: "Komentar (opsional)",
    commentPlaceholder: "Catatan singkat (opsional)",
    submit: "Kirim Penilaian",
    submitted: "Penilaian terkirim dan terkunci.",
    loadError: "Gagal memuat penilaian.",
    serverUrlMissing: "Server belum dikonfigurasi.",
    incompleteAspects: "Lengkapi semua aspek sebelum mengirim.",
    scoreRange: "Skor harus 1–5.",
    locked: "Terkunci",
    assigned: "Ditugaskan",
    draft: "Draf",
    submittedStatus: "Terkirim",
    lockedHint: "Penilaian ini sudah dikirim dan terkunci. Jawaban tidak dapat diubah.",
    alreadyLocked: "Sudah dikirim dan terkunci.",
    offline: "Tidak ada koneksi. Penilaian belum dikirim.",
    subject: "Dinilai",
    aspect: {
      discipline: "Disiplin",
      responsibility: "Tanggung Jawab",
      teamwork: "Kerja Sama",
      communication: "Komunikasi",
      work_quality: "Kualitas Kerja",
    },
  },
  reporting: {
    reportsTitle: "Laporan Saya",
    findingsTitle: "Temuan HR",
    newReport: "Buat Laporan",
    newFinding: "Buat Temuan",
    titleField: "Judul",
    bodyField: "Uraian",
    category: "Kategori",
    priority: "Prioritas",
    location: "Lokasi",
    evidence: "Bukti",
    evidenceCount: "Bukti: {x} / {y}",
    noEvidence: "Belum ada foto bukti.",
    takePhoto: "Ambil Foto",
    pickGallery: "Pilih dari Galeri",
    submit: "Kirim",
    empty: "Belum ada data.",
    offline: "Tidak ada koneksi. Laporan belum dikirim.",
    serviceUnavailable: "Layanan laporan/temuan sementara tidak tersedia. Coba lagi beberapa saat atau hubungi HR.",
    cameraDenied: "Izin kamera diperlukan untuk mengambil foto.",
    galleryDenied: "Izin galeri diperlukan untuk memilih gambar.",
    maxEvidence: "Maksimal 5 gambar. Bukti sudah 5 / 5.",
    fileTooLarge: "Ukuran file melebihi 10 MB.",
    fileType: "Tipe file tidak diizinkan. Gunakan JPEG, PNG, atau WebP.",
    fileEmpty: "File kosong.",
    fileMismatch: "Tipe file tidak sesuai isi file.",
    hubTitle: "Laporan & Temuan",
    hubHint: "Tidak perlu absen masuk.",
    required: "Field ini wajib diisi.",
    titlePlaceholder: "Ringkas masalahnya",
    bodyPlaceholder: "Jelaskan secara singkat",
    locationPlaceholder: "Lokasi (opsional)",
    detail: "Detail",
    draft: "Draf",
    submittedStatus: "Terkirim",
    inReview: "Ditinjau",
    closed: "Ditutup",
    facility: "Fasilitas",
    safety: "Keselamatan",
    misconduct: "Pelanggaran",
    operations: "Operasional",
    other: "Lainnya",
    low: "Rendah",
    medium: "Sedang",
    high: "Tinggi",
  },
};

const enMessages: Tree = {
  common: {
    loading: "Loading…",
    error: "Something went wrong. Please try again.",
    serverUrlMissing: "The server is not configured.",
    language: "Language",
    close: "Close",
    sessionLoading: "Loading session…",
  },
  attendance: {
    title: "Attendance",
    today: "Today",
    history: "History",
    statusToday: "Today's status",
    checkIn: "Check in",
    checkOut: "Check out",
    emptyHistory: "No attendance history yet.",
    stillWorking: "Still working",
    statusPresent: "Present",
    statusLate: "Late",
    statusAbsent: "Absent",
    statusLeave: "Leave",
    gpsHint: "Turn on GPS and allow location permission.",
    gpsDenied: "Location permission denied. Enable it in Settings.",
    gpsVerified: "Location verified.",
    gpsOutside: "You are outside the office area.",
    gpsWeak: "Location signal is too weak. Try a more open area.",
    officeIncomplete: "Office location data is incomplete. Contact HR.",
    offline: "A connection is required for attendance. Offline mode is off.",
    serviceUnavailable: "Attendance service is temporarily unavailable. Try again later or contact HR.",
    gpsTimeout: "Timed out getting GPS location. Enable GPS and try in an open area.",
    gpsRequired: "GPS coordinates are required for check-in. Enable location and try again.",
    checkInTime: "In",
    checkOutTime: "Out",
    scheduleToday: "Schedule",
  },
  rating: {
    title: "Rating",
    tabLabel: "Rating",
    myResult: "My Rating Result",
    myTasks: "My Rating Tasks",
    resultTab: "Result",
    tasksTab: "Tasks",
    emptyResult: "You have no rating results yet.",
    emptyTasks: "You have no rating tasks.",
    privacy: "Rater identity, individual comments, and per-rater scores are not shown.",
    currentAggregate: "Current aggregate (not all raters have finished).",
    finalAggregate: "Final result.",
    summary: "Summary",
    strengths: "Strengths",
    improvements: "Improvements",
    suggestion: "Suggestion",
    respondents: "Number of raters",
    score: "Score",
    scoreHelp: "Choose a score from 1–5. 1 is very poor, 5 is excellent.",
    comment: "Comment (optional)",
    commentPlaceholder: "Short note (optional)",
    submit: "Submit Rating",
    submitted: "Rating submitted and locked.",
    loadError: "Failed to load rating.",
    serverUrlMissing: "The server is not configured.",
    incompleteAspects: "Complete all aspects before submitting.",
    scoreRange: "Score must be 1–5.",
    locked: "Locked",
    assigned: "Assigned",
    draft: "Draft",
    submittedStatus: "Submitted",
    lockedHint: "This rating has been submitted and locked. Answers cannot be changed.",
    alreadyLocked: "Already submitted and locked.",
    offline: "No connection. The rating has not been sent.",
    subject: "Subject",
    aspect: {
      discipline: "Discipline",
      responsibility: "Responsibility",
      teamwork: "Teamwork",
      communication: "Communication",
      work_quality: "Work Quality",
    },
  },
  reporting: {
    reportsTitle: "My Reports",
    findingsTitle: "HR Findings",
    newReport: "Create Report",
    newFinding: "Create Finding",
    titleField: "Title",
    bodyField: "Description",
    category: "Category",
    priority: "Priority",
    location: "Location",
    evidence: "Evidence",
    evidenceCount: "Evidence: {x} / {y}",
    noEvidence: "No evidence photos yet.",
    takePhoto: "Take Photo",
    pickGallery: "Choose from Gallery",
    submit: "Submit",
    empty: "No records yet.",
    offline: "No connection. The report has not been sent.",
    serviceUnavailable: "Reporting service is temporarily unavailable. Try again later or contact HR.",
    cameraDenied: "Camera permission is required to take a photo.",
    galleryDenied: "Photo library permission is required to choose an image.",
    maxEvidence: "Maximum 5 images. Evidence is already 5 / 5.",
    fileTooLarge: "The file is larger than 10 MB.",
    fileType: "File type is not allowed. Use JPEG, PNG, or WebP.",
    fileEmpty: "The file is empty.",
    fileMismatch: "The file type does not match the file contents.",
    hubTitle: "Reports & Findings",
    hubHint: "Check-in is not required.",
    required: "This field is required.",
    titlePlaceholder: "Short title",
    bodyPlaceholder: "Describe briefly",
    locationPlaceholder: "Location (optional)",
    detail: "Detail",
    draft: "Draft",
    submittedStatus: "Submitted",
    inReview: "In review",
    closed: "Closed",
    facility: "Facility",
    safety: "Safety",
    misconduct: "Misconduct",
    operations: "Operations",
    other: "Other",
    low: "Low",
    medium: "Medium",
    high: "High",
  },
};

const catalogs: Record<MobileLocale, Tree> = { id: idMessages, en: enMessages };
const STORAGE_KEY = "erp.mobile.locale";

function getNested(tree: Tree, path: string): string | undefined {
  const parts = path.split(".");
  let cur: string | Tree | undefined = tree;
  for (const p of parts) {
    if (typeof cur !== "object" || cur == null) return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function createMobileTranslator(locale: MobileLocale) {
  const catalog = catalogs[locale] ?? catalogs.id;
  return function t(path: string, vars?: Record<string, string | number>): string {
    const val = getNested(catalog, path) ?? getNested(catalogs.id, path) ?? path;
    if (!vars) return val;
    return val.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
  };
}

type Ctx = {
  locale: MobileLocale;
  t: ReturnType<typeof createMobileTranslator>;
  setLocale: (locale: MobileLocale) => void;
};

const LocaleContext = createContext<Ctx | null>(null);

export function MobileLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<MobileLocale>("id");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "en" || v === "id") setLocaleState(v);
    });
  }, []);

  const setLocale = useCallback((next: MobileLocale) => {
    setLocaleState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ locale, t: createMobileTranslator(locale), setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useMobileLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    const t = createMobileTranslator("id");
    return { locale: "id" as MobileLocale, t, setLocale: (_: MobileLocale) => undefined };
  }
  return ctx;
}
