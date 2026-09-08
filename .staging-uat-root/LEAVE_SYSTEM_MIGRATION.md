# 🔧 MIGRASI SISTEM CUTI - DATABASE SCHEMA FIX

## 📅 Update: 6 Mei 2026, 08:43 WIB

---

## ⚠️ MASALAH YANG DITEMUKAN

### 1. Schema Database Tidak Sesuai

**Collection `leave_requests` yang ada sekarang:**
```javascript
{
  id: string,
  user: relation,
  date: date,           // ❌ SALAH - harusnya start_date & end_date
  devision: text,       // ❌ SALAH - typo, harusnya division
  status: text,         // ❌ SALAH - harusnya select dengan options spesifik
  note: text            // ❌ SALAH - harusnya reason
}
```

**Schema yang BENAR (dibutuhkan oleh sistem):**
```javascript
{
  id: string (auto),
  user: relation (users),
  start_date: date,
  end_date: date,
  reason: text,
  status: select ["approved", "cancelled"],
  division: text,
  position: text,
  booking_date: datetime,
  created: datetime (auto),
  updated: datetime (auto)
}
```

### 2. Collection `division_quotas` Belum Ada

Collection ini diperlukan untuk HR manage kuota cuti per division:
```javascript
{
  id: string (auto),
  division: text (unique),
  max_people_per_day: number (1-10),
  created: datetime (auto),
  updated: datetime (auto)
}
```

---

## 🔄 PERUBAHAN REQUIREMENT BARU

### ❌ Requirement Lama:
- User bisa booking maksimal **3 bulan** durasi dalam 1 pengajuan
- Tidak ada batasan berapa kali booking

### ✅ Requirement Baru:
- User bisa booking **1-9 hari** per pengajuan
- Total **maksimal 3 bulan** (90 hari) dalam setahun
- HR bisa setting **kuota per division** (max berapa orang per hari)

**Contoh:**
- Booking 1: 3 hari (1-3 Mei) ✅
- Booking 2: 5 hari (10-14 Juni) ✅
- Booking 3: 9 hari (1-9 Juli) ✅
- Total: 17 hari (masih bisa booking lagi sampai total 90 hari)

---

## 🛠️ LANGKAH MIGRASI

### STEP 1: Backup Data Existing

```bash
# Backup PocketBase data folder
# Copy folder: pocketbase/pb_data
```

### STEP 2: Update Collection `leave_requests`

**Via PocketBase Admin UI** (http://72.62.194.224:8091/_/):

1. Buka collection `leave_requests`
2. **HAPUS field lama:**
   - Delete field `date`
   - Delete field `devision`
   - Delete field `note`
   
3. **TAMBAH field baru:**
   - Add field: `start_date` (type: Date, required: true)
   - Add field: `end_date` (type: Date, required: true)
   - Add field: `reason` (type: Text, required: true, min: 10)
   - Add field: `division` (type: Text, required: true)
   - Add field: `position` (type: Text, required: true)
   - Add field: `booking_date` (type: DateTime, required: true)

4. **UPDATE field status:**
   - Type: Select
   - Options: `approved`, `cancelled`
   - Required: true
   - Default: `approved`

### STEP 3: Create Collection `division_quotas`

**Via PocketBase Admin UI:**

1. Click "New collection"
2. Name: `division_quotas`
3. Type: Base collection
4. Add fields:
   ```
   - division (Text, required, unique)
   - max_people_per_day (Number, required, min: 1, max: 10)
   ```
5. API Rules:
   - List/View: `@request.auth.id != "" && (@request.auth.role = "hr" || @request.auth.role = "owner")`
   - Create/Update/Delete: `@request.auth.id != "" && (@request.auth.role = "hr" || @request.auth.role = "owner")`

### STEP 4: Add Default Data

Insert beberapa division quotas default:
```javascript
// Via PocketBase Admin > division_quotas > New record
{
  division: "IT",
  max_people_per_day: 2
}
{
  division: "Marketing",
  max_people_per_day: 2
}
{
  division: "Sales",
  max_people_per_day: 3
}
```

### STEP 5: Update Collection API Rules

**Collection `leave_requests` - API Rules:**

```javascript
// List/View
@request.auth.id != "" && (
  @request.auth.role = "hr" || 
  @request.auth.role = "owner" || 
  user = @request.auth.id
)

// Create
@request.auth.id != "" && 
@request.auth.role = "staff" && 
@request.data.user = @request.auth.id

// Update (hanya untuk cancel)
@request.auth.id != "" && 
user = @request.auth.id && 
@request.data.status = "cancelled"

// Delete
@request.auth.id != "" && (
  @request.auth.role = "hr" || 
  @request.auth.role = "owner"
)
```

---

## 📊 INDEXES UNTUK PERFORMANCE

Tambahkan indexes di PocketBase:

**Collection `leave_requests`:**
1. Index: `user` + `status` (untuk query user's active leaves)
2. Index: `division` + `start_date` + `end_date` (untuk quota check)
3. Index: `user` + `created` (untuk history pagination)

**Collection `division_quotas`:**
1. Index: `division` (unique)

---

## 🔄 PERUBAHAN NAMING CONVENTION

### Ubah dari "Department" ke "Division"

| Before | After |
|--------|-------|
| department_locks | division_quotas |
| department | division |
| checkDepartmentQuota | checkDivisionQuota |
| getDepartmentLock | getDivisionQuota |
| getDepartmentAvailability | getDivisionAvailability |

**Alasan:** User menggunakan istilah "division" bukan "department"

---

## 🎯 LOGIC BARU - ANNUAL QUOTA SYSTEM

### Konsep Baru:

1. **Per Booking:** Maksimal 9 hari
2. **Per Tahun:** Total maksimal 90 hari (3 bulan)
3. **Division Quota:** Max X orang per division per hari (customizable)

### Implementation:

```typescript
// Check annual quota usage
async function getAnnualQuotaUsage(userId: string, year: number) {
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;
  
  const leaves = await pb.collection("leave_requests").getFullList({
    filter: `user="${userId}" && status="approved" && start_date>="${startOfYear}" && end_date<="${endOfYear}"`,
  });
  
  let totalDays = 0;
  for (const leave of leaves) {
    totalDays += calculateDays(leave.start_date, leave.end_date);
  }
  
  return {
    used: totalDays,
    remaining: 90 - totalDays,
    maxPerYear: 90,
  };
}

// Validate booking
function validateBooking(startDate, endDate, userId, currentYear) {
  const days = calculateDays(startDate, endDate);
  
  // Rule 1: Max 9 days per booking
  if (days > 9) {
    return { valid: false, message: "Maksimal 9 hari per booking" };
  }
  
  // Rule 2: Check annual quota
  const quota = await getAnnualQuotaUsage(userId, currentYear);
  if (quota.used + days > 90) {
    return { 
      valid: false, 
      message: `Kuota tahunan tidak cukup. Sisa: ${quota.remaining} hari, dibutuhkan: ${days} hari` 
    };
  }
  
  return { valid: true };
}
```

---

## ✅ TESTING CHECKLIST

Setelah migrasi, test:

- [ ] Staff bisa booking 1-9 hari
- [ ] Error jika booking > 9 hari
- [ ] Annual quota tracking berfungsi
- [ ] Error jika exceed 90 hari per tahun
- [ ] Division quota check berfungsi
- [ ] HR bisa manage division quotas
- [ ] Cancel booking berfungsi
- [ ] No more 404 errors di console

---

## 🚨 IMPORTANT NOTES

1. **Data Loss:** Jika ada data existing di `leave_requests`, data akan hilang saat hapus field. Backup dulu!
2. **Naming:** Pastikan konsisten gunakan "division" bukan "department"
3. **Testing:** Test dengan user role berbeda (staff, hr, owner)
4. **Production:** Lakukan migrasi di maintenance window

---

## 📞 NEXT STEPS

Setelah selesai migration:

1. Update frontend code (ubah department → division)
2. Update backend logic (annual quota system)
3. Update dokumentasi
4. Test end-to-end
5. Deploy ke production

---

**Status:** 🔄 **MIGRATION REQUIRED**  
**Priority:** 🔴 **HIGH - System Broken**  
**ETA:** ~2 hours untuk migration + testing
