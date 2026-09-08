/** Data contoh ekspedisi Indonesia — dipakai seed awal. */
export const DEFAULT_COURIER_CATALOG: {
  code: string;
  name: string;
  services: { name: string; sort_order: number }[];
}[] = [
  {
    code: "JNE",
    name: "JNE",
    services: [
      { name: "Reguler", sort_order: 1 },
      { name: "YES", sort_order: 2 },
      { name: "Cargo", sort_order: 3 },
    ],
  },
  {
    code: "JNT",
    name: "J&T",
    services: [
      { name: "Reguler", sort_order: 1 },
      { name: "Express", sort_order: 2 },
      { name: "Cargo", sort_order: 3 },
    ],
  },
  {
    code: "SICEPAT",
    name: "SiCepat",
    services: [
      { name: "Reguler", sort_order: 1 },
      { name: "BEST", sort_order: 2 },
      { name: "Cargo", sort_order: 3 },
    ],
  },
  {
    code: "ANTERAJA",
    name: "AnterAja",
    services: [
      { name: "Reguler", sort_order: 1 },
      { name: "Same day", sort_order: 2 },
      { name: "Next day", sort_order: 3 },
    ],
  },
  {
    code: "NINJA",
    name: "Ninja",
    services: [
      { name: "Reguler", sort_order: 1 },
      { name: "Express", sort_order: 2 },
    ],
  },
  {
    code: "GOSEND",
    name: "GOSEND",
    services: [
      { name: "Instant", sort_order: 1 },
      { name: "Same day", sort_order: 2 },
      { name: "Intercity", sort_order: 3 },
    ],
  },
  {
    code: "GRAB",
    name: "Grab",
    services: [
      { name: "Instant", sort_order: 1 },
      { name: "Same day", sort_order: 2 },
    ],
  },
  {
    code: "PICKUP",
    name: "Pickup toko",
    services: [{ name: "Ambil di toko", sort_order: 1 }],
  },
];
