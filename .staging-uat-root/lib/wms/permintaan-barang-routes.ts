/** Satu modul WMS: permintaan barang keluar (picking → validasi → pickup → selesai). */
export const PERMINTAAN_BARANG = {
  root: "/wms/permintaan-barang",
  picking: "/wms/permintaan-barang/picking",
  validasi: "/wms/permintaan-barang/validasi",
  pickup: "/wms/permintaan-barang/pickup",
  selesai: "/wms/permintaan-barang/selesai",
} as const;
