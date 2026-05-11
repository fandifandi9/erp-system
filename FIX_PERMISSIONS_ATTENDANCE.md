# 🔐 PERBAIKAN PERMISSIONS ATTENDANCE_LOGS

**Tanggal**: 5 Mei 2026, 18:37 WIB  
**Status**: ⚠️ BUTUH ACTION - UPDATE POCKETBASE RULES

---

## ❌ MASALAH ROOT CAUSE YANG SEBENARNYA

### CONNECTION: ✅ SUDAH BENAR
- URL PocketBase: `http://72.62.194.224:8091` ✅
- Auth Store: Valid ✅
- Query berhasil ✅

### DATA: ❌ KOSONG (0 records)
```
Total records: 0
Raw data: []
```

### ROOT CAUSE: **PERMISSION RULES TERLALU KETAT**

**Current Rule di PocketBase**:
```
List/Search rule: user = @request.auth.id
```

**Masalah**: Rule ini berarti user **HANYA BISA LIHAT DATA MILIK SENDIRI**!

Ketika user HR (role: "hr") login dan membuka halaman monitoring, PocketBase memfilter:
- `user = @request.auth.id` → Cari attendance_logs dimana field `user` = ID HR yang login
- HR staff tidak punya attendance record → Return kosong []
- Staff biasa punya attendance record, tapi HR tidak bisa lihat karena bukan milik dia

---

## ✅ SOLUSI: UPDATE PERMISSION RULES

### 1. **Buka PocketBase Admin**
```
http://72.62.194.224:8091/_/
```

### 2. **Navigasi ke Collection**
- Collections → **attendance_logs**
- Klik tab **"API Rules"**

### 3. **Update List/Search Rule**

**❌ RULE LAMA (SALAH)**:
```
user = @request.auth.id
```

**✅ RULE BARU (BENAR)**:
```
@request.auth.role = "hr" || @request.auth.role = "admin" || user = @request.auth.id
```

### 4. **Penjelasan Rule Baru**

| Kondisi | Akses | Keterangan |
|---------|-------|------------|
| `@request.auth.role = "hr"` | ✅ Lihat SEMUA data | HR bisa monitor semua karyawan |
| `@request.auth.role = "admin"` | ✅ Lihat SEMUA data | Admin full access |
| `user = @request.auth.id` | ✅ Lihat data sendiri | Staff biasa hanya lihat milik sendiri |

**Operator `||`** = OR (salah satu kondisi terpenuhi = akses granted)

### 5. **Klik "Save changes"**
Tombol ada di pojok kanan bawah modal

### 6. **Refresh Halaman Monitoring**
```
http://localhost:3000/hr/attendance
```
Tekan **Ctrl+Shift+R** (hard refresh)

---

## 🎯 HASIL YANG DIHARAPKAN

### ✅ Setelah Update Rules:

**Console Browser**:
```
📊 FETCHING ATTENDANCE DATA
✅ DATA LOADED SUCCESSFULLY
Total records: 13  ← HARUS MUNCUL 13!
First record: {id: "...", user: "...", ...}
Raw data: [{...}, {...}, ...] ← Array dengan 13 items
```

**Halaman Monitoring**:
```
Total: 13
Hadir: X
Terlambat: X
[Table dengan 13 baris data]
```

---

## 🔍 VERIFIKASI RULES LAINNYA

Pastikan juga rules lain sudah benar:

### **View rule**:
```
@request.auth.role = "hr" || @request.auth.role = "admin" || user = @request.auth.id
```

### **Create rule** (untuk check-in):
```
user = @request.auth.id
```
*Staff hanya bisa create attendance untuk diri sendiri*

### **Update rule** (untuk check-out):
```
user = @request.auth.id
```
*Staff hanya bisa update attendance milik sendiri*

### **Delete rule**:
```
@request.auth.role = "owner"
```
*Hanya owner/super admin yang bisa delete (untuk keamanan audit trail)*

---

## 📋 CHECKLIST

- [ ] **Buka PocketBase Admin** (`http://72.62.194.224:8091/_/`)
- [ ] **Login ke admin panel**
- [ ] **Buka Collections → attendance_logs**
- [ ] **Klik tab "API Rules"**
- [ ] **Update "List/Search rule"** menjadi: `@request.auth.role = "hr" || @request.auth.role = "admin" || user = @request.auth.id`
- [ ] **Update "View rule"** dengan rule yang sama (jika perlu)
- [ ] **Klik "Save changes"**
- [ ] **Refresh halaman monitoring** (Ctrl+Shift+R)
- [ ] **Verifikasi data muncul** (Total: 13)

---

## 🧪 TEST SCENARIOS

### Test 1: HR User
- Login sebagai HR (`fandifandi9@gmail.com`)
- Buka `/hr/attendance`
- **Expected**: Lihat SEMUA 13 records dari semua karyawan ✅

### Test 2: Staff User
- Login sebagai staff biasa (bukan HR/admin)
- Buka `/attendance` (staff dashboard)
- **Expected**: Hanya lihat attendance milik sendiri ✅

### Test 3: Admin User
- Login sebagai admin
- Buka `/hr/attendance`
- **Expected**: Lihat SEMUA records ✅

---

## ⚠️ CATATAN KEAMANAN

### Mengapa Rule Ini Aman?

1. **Role-based Access Control (RBAC)**:
   - Hanya user dengan role "hr" atau "admin" yang bisa lihat semua data
   - Role disimpan di database, tidak bisa diubah dari client-side

2. **Staff Protection**:
   - Staff biasa tetap hanya bisa lihat data sendiri
   - Tidak bisa lihat attendance staff lain

3. **Audit Trail**:
   - Delete rule sangat ketat (hanya owner)
   - Semua perubahan data ter-track di PocketBase

### Best Practices:
- ✅ Gunakan role-based rules, bukan hardcoded user IDs
- ✅ Selalu test dengan different roles
- ✅ Review rules secara berkala
- ✅ Document setiap perubahan rules

---

## 🚨 TROUBLESHOOTING

### Issue: Setelah update rule masih kosong

**Solution 1**: Hard refresh browser
```bash
Ctrl + Shift + R (Chrome/Edge)
Cmd + Shift + R (Mac)
```

**Solution 2**: Clear PocketBase cache
- Di PocketBase Admin → Settings → Clear cache
- Restart PocketBase server (jika perlu)

**Solution 3**: Verify user role
```javascript
// Di browser console
console.log(pb.authStore.model?.role)
// Harus return: "hr" atau "admin"
```

**Solution 4**: Test manual query
```javascript
// Di browser console
const test = await pb.collection("attendance_logs").getList(1, 10)
console.log("Total:", test.totalItems)
console.log("Items:", test.items)
```

---

## 📞 NEXT STEPS

1. **UPDATE RULE SEKARANG** di PocketBase Admin
2. **REFRESH halaman** monitoring
3. **SCREENSHOT hasil** jika berhasil (untuk dokumentasi)
4. **REPORT** jika masih ada masalah

---

**Status**: ⏳ **MENUNGGU USER UPDATE RULE DI POCKETBASE**
