# 🔧 FIX DATABASE - PANDUAN MANUAL

## ⚠️ PENTING: Ikuti langkah ini SEBELUM sistem bisa jalan!

---

## 📍 STEP 1: Buka PocketBase Admin

1. Buka browser: `http://72.62.194.224:8091/_/`
2. Login dengan akun admin PocketBase

---

## 📍 STEP 2: Buat Collection `division_quotas` (BARU)

1. Klik **"New collection"** (tombol + di sidebar)
2. Pilih **"Base collection"**
3. Isi form:
   - **Name:** `division_quotas`
   - **Type:** Base collection

4. **Add Fields:**

   **Field 1 - division:**
   - Name: `division`
   - Type: `Text`
   - ✅ Required
   - ✅ Unique
   - ✅ Nonempty
   
   **Field 2 - max_people_per_day:**
   - Name: `max_people_per_day`
   - Type: `Number`
   - ✅ Required
   - Min: `1`
   - Max: `10`

5. **Set API Rules** (tab "API Rules"):
   
   Copy-paste rules ini:
   
   **List/View:**
   ```
   @request.auth.id != "" && (@request.auth.role = "hr" || @request.auth.role = "owner")
   ```
   
   **Create/Update/Delete:**
   ```
   @request.auth.id != "" && (@request.auth.role = "hr" || @request.auth.role = "owner")
   ```

6. Klik **"Create"**

7. **Insert Data Default:**
   - Klik collection `division_quotas`
   - Klik **"New record"**
   - Insert beberapa data:
   
   ```
   division: IT, max_people_per_day: 2
   division: Marketing, max_people_per_day: 2
   division: Sales, max_people_per_day: 3
   division: Finance, max_people_per_day: 2
   division: HR, max_people_per_day: 2
   ```

---

## 📍 STEP 3: Update Collection `leave_requests`

### A. Hapus Records Lama (BACKUP DULU!)

⚠️ **PENTING:** Jika ada data, backup dulu!

1. Buka collection `leave_requests`
2. Jika ada record, export dulu atau catat datanya
3. Hapus semua record yang ada (karena schema akan berubah total)

### B. Update Schema

1. Klik collection `leave_requests`
2. Klik tab **"Fields"**

**Hapus field-field ini:**
- ❌ Delete field: `date`
- ❌ Delete field: `devision` (typo)
- ❌ Delete field: `note`

**Tambah field-field baru:**

**Field 1 - start_date:**
- Name: `start_date`
- Type: `Date`
- ✅ Required

**Field 2 - end_date:**
- Name: `end_date`
- Type: `Date`
- ✅ Required

**Field 3 - reason:**
- Name: `reason`
- Type: `Text`
- ✅ Required
- Min length: `10`

**Field 4 - division:**
- Name: `division`
- Type: `Text`
- ✅ Required

**Field 5 - position:**
- Name: `position`
- Type: `Text`
- ✅ Required

**Field 6 - booking_date:**
- Name: `booking_date`
- Type: `Date`
- ✅ Required

**Update field existing - status:**
- Name: `status` (sudah ada, edit aja)
- Type: `Select` (ubah dari Text ke Select)
- ✅ Required
- Options: `approved`, `cancelled` (2 options aja)
- Max select: `1`

**Field user (sudah ada, pastikan setting ini):**
- Name: `user`
- Type: `Relation`
- Collection: `users`
- ✅ Required

3. Klik **"Save changes"**

### C. Update API Rules

Tab **"API Rules"**:

**List/View:**
```
@request.auth.id != "" && (@request.auth.role = "hr" || @request.auth.role = "owner" || user = @request.auth.id)
```

**Create:**
```
@request.auth.id != "" && @request.auth.role = "staff" && @request.data.user = @request.auth.id
```

**Update:**
```
@request.auth.id != "" && user = @request.auth.id && @request.data.status = "cancelled"
```

**Delete:**
```
@request.auth.id != "" && (@request.auth.role = "hr" || @request.auth.role = "owner")
```

---

## 📍 STEP 4: Update Collection `profiles` (Pastikan ada field division)

1. Buka collection `profiles`
2. Pastikan ada field `division` (type: Text)
3. Jika belum ada, tambahkan:
   - Name: `division`
   - Type: `Text`
   - Required: ✅

---

## ✅ STEP 5: Verify

Setelah selesai, verify:

1. Collection `division_quotas` ✅ ada
2. Collection `leave_requests` schema benar ✅
3. No errors di console browser ✅

---

## 🔄 STEP 6: Refresh Aplikasi

1. Tutup browser
2. Buka lagi: `http://localhost:3000`
3. Login
4. Test booking cuti

---

## 🎯 Hasil Akhir:

Schema `leave_requests` yang BENAR:
```javascript
{
  id: auto,
  user: relation → users,
  start_date: date ✅,
  end_date: date ✅,
  reason: text (min 10) ✅,
  status: select ["approved","cancelled"] ✅,
  division: text ✅,
  position: text ✅,
  booking_date: date ✅,
  created: auto,
  updated: auto
}
```

Schema `division_quotas` (BARU):
```javascript
{
  id: auto,
  division: text (unique) ✅,
  max_people_per_day: number (1-10) ✅,
  created: auto,
  updated: auto
}
```

---

## ❓ Troubleshooting

**Error 404 - The requested resource wasn't found:**
- Collection `division_quotas` belum dibuat
- Ulangi STEP 2

**Error 400 - Bad Request:**
- Schema `leave_requests` masih salah
- Pastikan semua field sudah sesuai STEP 3

**Cannot read property 'division':**
- Profile user belum punya field division
- Ulangi STEP 4

---

**Setelah semua STEP selesai, sistem akan berfungsi normal!** ✅
