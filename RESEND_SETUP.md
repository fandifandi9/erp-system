# Resend — email SERBA ERP

Semua email dikirim **server-side** lewat [Resend](https://resend.com). Tidak ada `mailto:` atau aplikasi email lokal.

## Variabel environment (`.env.local`)

```env
# Wajib — API key Resend (mis. "SERBA ERP")
RESEND_API_KEY=re_xxxxxxxx

# Wajib — alamat From (domain harus diverifikasi di Resend)
RESEND_FROM_EMAIL=penjualan@domain-anda.com

# Opsional — nama pengirim default jika toko belum punya override
RESEND_FROM_NAME=SERBA ERP

# Wajib — link di email (production, bukan localhost untuk pelanggan)
NEXT_PUBLIC_APP_URL=https://erp.domain-anda.com

# Wajib — reset password (min. 16 karakter, rahasia)
PASSWORD_RESET_SECRET=buat-string-acak-panjang-min-16-karakter

# Sudah ada — baca dokumen & update password user
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...

NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
```

**Tes Resend:** `RESEND_FROM_EMAIL=onboarding@resend.dev` (hanya ke email yang terdaftar di akun Resend).

## Fitur

| Fitur | Lokasi UI | API |
|--------|-----------|-----|
| Reset password | Login → Lupa password? | `POST /api/auth/forgot-password` |
| Atur kata sandi baru | `/login/reset-password?token=…` | `POST /api/auth/reset-password` |
| Invoice | Penjualan → Bagikan → Email | `POST /api/email/send` |
| Penawaran (SO draf) | Penjualan → Pesanan (status Draf) | `kind: quotation` |
| Sales Order | Penjualan → Pesanan (bukan draf) | `kind: sales_order` |
| Purchase Order | Pembelian → tab Pesanan → Bagikan | `kind: purchase_order` |

Toast sukses/gagal: `ShareFeedbackToast` (sama untuk login dan dokumen).

## Pratinjau publik (tanpa login)

- `/share/invoice/[id]`
- `/share/so/[id]`
- `/share/quotation/[id]` (data sama SO)
- `/share/po/[id]`

## From Name / Email per toko (nanti)

Di PocketBase collection `biz_stores`, tambahkan field opsional (Text):

- `email_from_name` — nama tampilan pengirim
- `email_from_address` — alamat From (harus domain terverifikasi Resend)

Jika kosong → pakai `RESEND_FROM_NAME` + `RESEND_FROM_EMAIL`.  
`reply_to` tetap memakai `email` toko jika diisi.

## Body API kirim dokumen

`POST /api/email/send` (cookie login)

```json
{
  "kind": "invoice | sales_order | quotation | purchase_order",
  "id": "record_id_pocketbase",
  "to": "penerima@email.com"
}
```

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| Toast "Resend belum dikonfigurasi" | Isi `RESEND_API_KEY` + restart dev server |
| Reset password gagal | Isi `PASSWORD_RESET_SECRET` + admin PB |
| Email tidak sampai | Cek domain Resend, spam, email penerima di master Kontak/Supplier |
| Link 404 di email | Set `NEXT_PUBLIC_APP_URL` ke URL production |
