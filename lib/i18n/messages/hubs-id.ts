import type { MessageTree } from "../types";

export const hubsId: MessageTree = {
  pembelian: {
    subtitle: "Pemasok, pesanan pembelian, tagihan, dan penerimaan barang",
  },
  sdm: {
    subtitle: "Karyawan, absensi, jadwal, cuti, dan penggajian",
  },
  keuangan: {
    subtitle: "Ringkasan piutang, hutang, dan arus kas SERBA System",
    totalReceivables: "Total Piutang",
    totalPayables: "Total Hutang",
    cashInMonth: "Kas Masuk Bulan Ini",
    expenseMonth: "Pengeluaran Bulan Ini",
    unpaidInvoices: "{count} faktur belum lunas",
    unpaidBills: "{count} tagihan belum lunas",
    paymentAlert: "Perhatian pembayaran",
    alertInvoices: "Ada {count} faktur belum lunas ({amount}).",
    alertBills: "Ada {count} tagihan pembelian belum lunas ({amount}).",
    viewReceivables: "Lihat piutang",
    viewPayables: "Lihat hutang",
  },
  laporan: {
    subtitle: "Akses cepat ke laporan operasional dan keuangan",
    subtitleHr: "Laporan kepegawaian: absensi, cuti, gaji, dan ringkasan SDM",
    importMp: "Impor Penjualan MP",
    importMpDesc: "Unggah Excel penjualan marketplace",
  },
  pengaturan: {
    subtitle: "Master data dan konfigurasi sistem SERBA",
    subtitleHr: "Pengaturan SDM: peran, izin, dan notifikasi",
  },
};
