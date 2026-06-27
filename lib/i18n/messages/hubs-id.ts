import type { MessageTree } from "../types";

export const hubsId: MessageTree = {
  pembelian: {
    subtitle: "Supplier, purchase order, tagihan, dan penerimaan barang",
  },
  sdm: {
    subtitle: "Karyawan, absensi, jadwal, cuti, dan payroll",
  },
  keuangan: {
    subtitle: "Ringkasan piutang, hutang, dan arus kas SERBA System",
    totalReceivables: "Total Piutang",
    totalPayables: "Total Hutang",
    cashInMonth: "Kas Masuk Bulan Ini",
    expenseMonth: "Pengeluaran Bulan Ini",
    unpaidInvoices: "{count} invoice belum lunas",
    unpaidBills: "{count} tagihan belum lunas",
    paymentAlert: "Perhatian pembayaran",
    alertInvoices: "Ada {count} invoice belum lunas ({amount}).",
    alertBills: "Ada {count} tagihan pembelian belum lunas ({amount}).",
    viewReceivables: "Lihat piutang",
    viewPayables: "Lihat hutang",
  },
  laporan: {
    subtitle: "Akses cepat ke laporan operasional dan keuangan",
    importMp: "Import Penjualan MP",
    importMpDesc: "Upload Excel penjualan marketplace",
  },
  pengaturan: {
    subtitle: "Master data dan konfigurasi sistem SERBA",
  },
};
