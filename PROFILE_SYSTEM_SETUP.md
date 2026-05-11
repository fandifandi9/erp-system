# 📝 PROFILE SYSTEM - Setup Guide

## ✨ Fitur Baru: Profile Staff dengan Avatar & Biodata

Staff sekarang bisa:
- ✅ Upload foto profil/avatar
- ✅ Edit informasi personal (phone, address, date of birth, bio)
- ✅ Lihat informasi kepegawaian (read-only)

---

## 🔧 STEP 1: Update Schema PocketBase

### Collection: `profiles`

Tambah field-field baru:

**1. avatar (File)**
- Name: `avatar`
- Type: `File`
- Max Select: `1`
- Max Size: `5MB`
- Mime Types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Thumbs: `200x200`

**2. phone (Text)**
- Name: `phone`
- Type: `Text`
- Optional: ✅

**3. address (Text)**
- Name: `address`
- Type: `Text`
- Optional: ✅

**4. date_of_birth (Date)**
- Name: `date_of_birth`
- Type: `Date`
- Optional: ✅

**5. bio (Text)**
- Name: `bio`
- Type: `Text`
- Optional: ✅
- Max Length: `500`

**6. join_date (Date)**
- Name: `join_date`
- Type: `Date`
- Optional: ✅
- Note: Tanggal bergabung karyawan (diisi oleh HR)

---

## 📍 STEP 2: Update API Rules (Collection profiles)

**Update Rules:**
```
@request.auth.id != "" && (
  user = @request.auth.id || 
  @request.auth.role = "hr" || 
  @request.auth.role = "owner"
)
```

Ini memastikan:
- Staff bisa update profile sendiri
- HR & Owner bisa update semua profile

---

## 🎯 STEP 3: Akses Halaman Profile

**URL untuk Staff:**
```
http://localhost:3000/dashboard-staff/profile
```

**Fitur:**
1. **Upload Avatar**
   - Klik icon camera di foto profil
   - Pilih file gambar (max 5MB)
   - Otomatis upload dan tampil

2. **Edit Biodata**
   - Phone number
   - Address (textarea)
   - Date of birth (date picker)
   - Bio/Tentang Saya (textarea 500 karakter)

3. **Info Kepegawaian (Read-Only)**
   - Division
   - Position
   - Salary
   - Role

---

## 🔥 STEP 4: Cara Penggunaan

### Untuk Staff:
1. Login ke dashboard
2. Klik menu **"Profil Saya"** di sidebar
3. Upload foto dengan klik icon camera
4. Isi/edit biodata personal
5. Klik **"Simpan Perubahan"**

### Untuk HR/Admin:
- Bisa lihat avatar staff di dashboard
- Bisa lihat detail profile saat klik employee
- Avatar akan muncul di semua tempat yang menampilkan user

---

## 💡 Tips & Best Practices

**Upload Avatar:**
- Gunakan foto profesional
- Resolusi minimal 200x200px
- Format: JPG/PNG (rekomendasi)
- Ukuran file < 2MB untuk performa

**Biodata:**
- Phone: Format +62 atau 08xxx
- Address: Tulis lengkap untuk keperluan administrasi
- Bio: Jelaskan skill, hobi, atau background singkat

---

## 🐛 Troubleshooting

**Error: "Failed to upload avatar"**
- Check ukuran file (max 5MB)
- Check format file (harus image)
- Check koneksi internet

**Error: "Gagal update profil"**
- Check apakah ada required field yang kosong
- Refresh halaman dan coba lagi

**Avatar tidak muncul:**
- Clear browser cache
- Check apakah file benar-benar terupload di PocketBase
- Check API rules collection profiles

---

## 📊 Schema Lengkap Collection Profiles

```javascript
{
  // Existing fields
  id: auto,
  user: relation → users,
  division: text,
  position: text,
  salary: number,
  
  // New fields
  avatar: file (max 5MB, image only),
  phone: text (optional),
  address: text (optional),
  date_of_birth: date (optional),
  bio: text (optional, max 500),
  join_date: date (optional), // Tanggal bergabung
  
  created: auto,
  updated: auto
}
```

---

## ✅ Checklist Setup

- [ ] Buka PocketBase Admin (http://72.62.194.224:8091/_/)
- [ ] Buka collection `profiles`
- [ ] Tambah field `avatar` (File, max 5MB, thumbs 200x200)
- [ ] Tambah field `phone` (Text, optional)
- [ ] Tambah field `address` (Text, optional)
- [ ] Tambah field `date_of_birth` (Date, optional)
- [ ] Tambah field `bio` (Text, optional, max 500)
- [ ] Tambah field `join_date` (Date, optional)
- [ ] Update API rules untuk allow user update profile sendiri
- [ ] Test upload avatar
- [ ] Test edit biodata

---

**Setelah semua setup selesai, fitur profile sudah siap digunakan!** ✨
