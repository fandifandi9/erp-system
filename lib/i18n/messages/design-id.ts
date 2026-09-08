import type { MessageTree } from "../types";

export const designId: MessageTree = {
  design: {
    empty: {
      title: "Belum ada data",
      description: "Data akan muncul di sini setelah tersedia.",
    },
    error: {
      title: "Terjadi kesalahan",
      retry: "Coba lagi",
    },
    permission: {
      title: "Akses ditolak",
      description: "Akun Anda tidak memiliki izin untuk melihat halaman ini.",
    },
    pagination: {
      showing: "Menampilkan {from}–{to} dari {total}",
      prev: "Halaman sebelumnya",
      next: "Halaman berikutnya",
    },
    filter: {
      search: "Cari…",
      reset: "Reset",
    },
    form: {
      cancel: "Batal",
      save: "Simpan",
    },
    table: {
      actions: "Aksi",
      selectAll: "Pilih semua",
    },
    loading: "Memuat…",
  },
  profile: {
    tabs: {
      ringkasan: "Ringkasan",
      pribadi: "Pribadi",
      dokumen: "Dokumen",
      keamanan: "Keamanan",
    },
    saveChanges: "Simpan perubahan",
    saving: "Menyimpan…",
    updatePassword: "Perbarui kata sandi",
    changePhoto: "Ganti foto",
    removePhoto: "Hapus foto",
    emailLogin: "Email / Login",
    saveSuccess: "Perubahan berhasil disimpan",
    saveError: "Perubahan gagal disimpan",
    sections: {
      personalData: "Data pribadi",
      contact: "Kontak",
    },
    preferences: {
      title: "Preferensi Akun",
      language: "Bahasa",
      languageDesc: "Pilihan disimpan ke akun Anda dan berlaku di seluruh aplikasi.",
    },
  },
  workspace: {
    desk: {
      title: "Meja Kerja",
      subtitle:
        "Akses pekerjaan, kehadiran, penggajian, informasi perusahaan, dan modul yang relevan dengan Anda.",
    },
    hr: {
      dashboard: {
        title: "HR / SDM",
        subtitle: "Workspace operasional HR Desktop",
      },
      section: {
        workspace: "Workspace",
        sdm: "SDM",
        attendanceWork: "Kehadiran & Pekerjaan",
        reports: "Laporan",
      },
      shellLabel: "Workspace Desktop",
  mobileAccess: "Akses Mobile",
  mobileAccessHint: "Companion operasional — tab baru; Desktop workspace tetap di tempat.",
      action: {
        dashboard: "Dasbor",
        employees: "Karyawan",
        org: "Organisasi",
        recruitment: "Rekrutmen",
        attendance: "Kehadiran",
        leave: "Cuti",
        overtime: "Lembur",
        izinOff: "Off",
        field: "Aktivitas Luar Kantor",
        findings: "Temuan",
        rating: "Penilaian / Rating",
        reports: "Laporan SDM",
        suspicious: "Absensi Mencurigakan",
        schedule: "Jadwal Kerja",
        myAttendance: "Absensi Saya",
        myLeave: "Cuti Saya",
        myOvertime: "Lembur Saya",
        myIzinOff: "Off Saya",
        mySubmissions: "Pengajuan Saya",
      },
    },
    staff: {
      title: "Meja Kerja",
      subtitle:
        "Akses pekerjaan, kehadiran, penggajian, informasi perusahaan, dan modul yang relevan dengan Anda.",
      greeting: {
        morning: "Selamat pagi, {name}.",
        afternoon: "Selamat siang, {name}.",
        evening: "Selamat malam, {name}.",
      },
      rail: {
        today: "Hari ini",
        status: "Status absensi",
        schedule: "Jadwal kerja",
        workingDay: "Status hari",
        checkIn: "Check-in",
        checkOut: "Check-out",
        notCheckedIn: "Belum check-in",
        working: "Sedang bekerja",
        done: "Selesai",
        dayOff: "Hari libur",
        workingDayYes: "Hari kerja",
        noSchedule: "Belum ditentukan",
        agenda: "Agenda",
        agendaEmpty: "Belum ada agenda",
        agendaEmptyDesc: "Cuti atau lembur yang disetujui akan muncul di sini.",
        leavePending: "Cuti — menunggu HR",
        leaveApproved: "Cuti disetujui",
        kindLeave: "Cuti",
        kindOvertime: "Lembur",
        quickActions: "Aksi cepat",
      },
      noAccess: {
        title: "Akses terbatas",
        desc: "Gunakan menu Profil dari nama Anda di kanan atas.",
      },
      sidebar: {
        dashboard: "Dasbor",
      },
      dashboard: {
        title: "Dasbor",
        subtitle: "Berikut ringkasan aktivitas dan informasi penting untuk Anda.",
        kpi: {
          attendance: "Status Kehadiran",
          activeRequests: "Pengajuan Aktif",
          activeRequestsSub: "Cuti & lembor menunggu",
          overtimeMonth: "Lembur Bulan Ini",
          overtimeMonthSub: "Jam disetujui",
          hours: "jam",
          payslip: "Slip Gaji",
          payslipUnavailable: "Belum tersedia",
          payslipAvailable: "Slip terbaru tersedia",
          dayOff: "Hari libur",
        },
        summary: {
          attendance: "Ringkasan Kehadiran",
          period: "Periode",
          present: "Hadir",
          leave: "Cuti",
          sick: "Sakit",
          pending: "Belum check-in",
          alpha: "Alpha",
          required: "Hari kerja wajib",
          totalDays: "Total hari",
          dataAsOf: "Data per {date}",
          emptyTitle: "Belum ada ringkasan",
          emptyDesc: "Data kehadiran bulan ini akan muncul setelah tersedia.",
        },
        trend: {
          title: "Tren Kehadiran",
          present: "Hadir",
          leave: "Off",
          sick: "Sakit",
          alpha: "Alfa",
          late: "Terlambat",
          unknown: "—",
          emptyTitle: "Belum ada tren",
          emptyDesc: "Riwayat absensi akan ditampilkan di sini.",
        },
        activity: {
          title: "Aktivitas Terbaru",
          checkIn: "Check-in hari ini",
          leave: "Pengajuan cuti",
          payslip: "Slip gaji tersedia",
          emptyTitle: "Belum ada aktivitas",
          emptyDesc: "Aktivitas cuti, lembur, dan notifikasi akan muncul di sini.",
        },
        shortcuts: {
          title: "Shortcut Cepat",
          leave: "Ajukan Cuti",
          overtime: "Ajukan Lembur",
          attendance: "Check-in / Absensi",
          payroll: "Lihat Slip Gaji",
          reports: "Laporan & Temuan",
          emptyTitle: "Tidak ada shortcut",
          emptyDesc: "Shortcut muncul sesuai modul yang boleh Anda akses.",
        },
      },
      desk: {
        empty: "Belum ada modul tambahan untuk peran Anda. Modul akan muncul sesuai permission.",
        section: {
          priority: "Prioritas / Perlu Tindakan",
          fullModule: "Akses Modul",
          noTasks: "Tidak ada pekerjaan yang perlu tindakan saat ini.",
        },
        module: {
          hr: "HR",
          finance: "Finance",
          warehouse: "Warehouse",
        },
        open: {
          hr: "Buka HR Lengkap",
          finance: "Buka Finance",
          warehouse: "Buka Warehouse",
        },
        hr: {
          recruitmentApprove: {
            title: "Recruitment Baru",
            desc: "Pengangkatan jabatan menunggu persetujuan Anda",
          },
          leaveReview: {
            title: "Review Cuti",
            desc: "Pengajuan cuti menunggu persetujuan",
          },
          overtimeReview: {
            title: "Approval Lembur",
            desc: "Pengajuan lembur menunggu persetujuan",
          },
          attendanceReview: {
            title: "Review Absensi",
            desc: "Anomali absensi perlu diperiksa",
          },
          findings: {
            title: "Temuan HR",
            desc: "Laporan dan temuan terbaru",
          },
          employees: {
            title: "Kelola Karyawan",
            desc: "Akses administrasi karyawan",
          },
        },
        finance: {
          invoice: {
            title: "Invoice",
            desc: "Piutang dan dokumen perlu diproses",
          },
          payment: {
            title: "Pembayaran",
            desc: "Kas & bank — transaksi menunggu",
          },
          reconciliation: {
            title: "Rekonsiliasi",
            desc: "Item rekonsiliasi perlu diperiksa",
          },
        },
        warehouse: {
          opname: {
            title: "Stock Opname",
            desc: "Sesi opname stok gudang",
          },
          transfer: {
            title: "Transfer Gudang",
            desc: "Perpindahan barang antar lokasi",
          },
          receiving: {
            title: "Barang Masuk",
            desc: "Penerimaan barang ke gudang",
          },
          picking: {
            title: "Picking",
            desc: "Persiapan pengambilan barang",
          },
        },
      },
      section: {
        personal: "Personal",
        attendance: "Kehadiran & Pekerjaan",
        payroll: "Penggajian",
        company: "Informasi Perusahaan",
        desk: "Meja Kerja",
      },
      action: {
        profile: {
          title: "Profil",
          desc: "Data pribadi, kepegawaian, dan dokumen",
        },
        reports: {
          title: "Laporan & Temuan",
          desc: "Buat dan pantau laporan ke HR",
        },
        mySubmissions: {
          title: "Pengajuan Saya",
          desc: "Status cuti, lembur, off, dan aktivitas lapangan",
        },
        attendance: {
          title: "Absensi",
          desc: "Check-in/out web, jadwal & status hari ini",
        },
        leave: {
          title: "Cuti",
          desc: "Pengajuan dan riwayat cuti",
        },
        overtime: {
          title: "Lembur",
          desc: "Penunjukan & pengajuan lembur",
        },
        izinOff: {
          title: "Off",
          desc: "Pengajuan tidak masuk kerja (bukan cuti)",
        },
        field: {
          title: "Aktivitas luar kantor",
          desc: "Meeting, kunjungan, dinas",
        },
        payroll: {
          title: "Slip gaji",
          desc: "Slip periode setelah HR menyetujui — rahasia",
        },
        policies: {
          title: "Aturan & Informasi HR",
          desc: "Kebijakan keterlambatan, cuti, potongan gaji",
        },
        holidays: {
          title: "Kalender & Hari Libur",
          desc: "Libur nasional dan perusahaan",
        },
      },
    },
  },
};
