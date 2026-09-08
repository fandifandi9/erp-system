# 🏖️ SISTEM BOOKING CUTI - AUTO APPROVAL WITH DEPARTMENT LOCK

## 📋 Overview

Sistem booking cuti dengan konsep **first-come-first-served** dan **auto-approval**. Staff dapat langsung booking cuti tanpa menunggu persetujuan HR. Sistem ini dilengkapi dengan **department lock** untuk membatasi jumlah orang cuti per department per hari.

---

## ✨ Fitur Utama

### 🎯 Untuk Staff

1. **Cuti Only**
   - Hanya ada opsi CUTI (tidak ada izin, sakit, dll)
   - Fokus pada leave management yang simple

2. **Auto-Approval**
   - Semua booking cuti langsung approved
   - Tidak perlu menunggu persetujuan HR
   - Siapa cepat dia dapat (first-come-first-served)

3. **Durasi Maksimal 3 Bulan**
   - Bisa booking hingga 3 bulan durasi dalam 1 pengajuan
   - Validasi otomatis saat pengajuan

4. **Department Lock**
   - Maksimal 2 orang (default) dari department yang sama per hari
   - Staff bisa melihat ketersediaan department saat booking
   - Warning jika kuota department penuh

5. **Pembatalan**
   - Staff bisa membatalkan booking sendiri
   - Hanya bisa dibatalkan sebelum tanggal cuti dimulai
   - Status berubah dari "approved" ke "cancelled"

### 👔 Untuk HR

1. **Monitoring Only**
   - HR hanya memantau, tidak approve/reject
   - Dashboard menampilkan semua booking
   - Filter by status dan department
   - Search by nama atau email karyawan

2. **Department Lock Management**
   - HR bisa mengatur maksimal orang per department
   - Customizable per department
   - Default: 2 orang per department per hari
   - Halaman khusus untuk manage settings

---

## 🔧 Technical Implementation

### Database Schema

#### Collection: leave_requests
```
- id: string (auto)
- user: relation (users)
- start_date: date (tanggal mulai cuti)
- end_date: date (tanggal selesai cuti)
- reason: text (minimal 10 karakter)
- status: select ["approved", "cancelled"]
- department: text (from user profile)
- position: text (from user profile)
- booking_date: datetime (kapan booking dilakukan)
- created: datetime (auto)
- updated: datetime (auto)
```

#### Collection: department_locks (NEW)
```
- id: string (auto)
- department: text (nama department, unique)
- max_people_per_day: number (default: 2)
- created: datetime (auto)
- updated: datetime (auto)
```

### Validasi Rules

1. **Duration Check**
   ```typescript
   // Maksimal 3 bulan durasi
   const durationMonths =
     (endDate.getFullYear() - startDate.getFullYear()) * 12 +
     (endDate.getMonth() - startDate.getMonth());

   if (durationMonths > 3) {
     return error("Durasi cuti maksimal 3 bulan");
   }
   ```

2. **Department Quota Check**
   ```typescript
   // Cek setiap tanggal dalam range
   for (const date of dates) {
     const count = await countLeaveOnDate(department, date);
     if (count >= maxPeople) {
       blockedDates.push(date);
     }
   }
   ```

3. **No Double Booking**
   ```typescript
   // Cek overlap dengan booking yang sudah approved
   if (hasOverlappingDates) {
     return error("Anda sudah memiliki booking cuti untuk periode ini");
   }
   ```

4. **Cancellation Rules**
   ```typescript
   // Hanya bisa cancel jika belum dimulai
   if (startDate <= today) {
     return error("Tidak dapat membatalkan cuti yang sudah dimulai");
   }
   ```

---

## 📱 User Interface

### Staff Pages

#### 1. Booking Cuti (`/dashboard-staff/leave-request`)
- Form booking cuti dengan date range picker
- Info durasi maksimal (3 bulan) & department lock
- Warning real-time jika kuota department penuh
- Auto-calculate durasi (hari & bulan)
- Validation real-time
- Success message dengan auto-redirect

#### 2. Riwayat Booking (`/dashboard-staff/leave-history`)
- List semua booking (approved & cancelled)
- Badge status dengan icon
- Info department dan durasi
- Tombol "Batalkan Booking" (conditional)
- Stats: Active Bookings vs Cancelled
- Pagination support

### HR Pages

#### 3. Monitoring Cuti (`/hr/leave`)
- Dashboard monitoring semua booking staff
- Info banner: sistem auto-approval
- Stats: Active, Cancelled, Total
- Filter by status
- Filter by department (dropdown)
- Search by nama/email
- Detail booking dengan department & position
- Link ke Department Lock Settings

#### 4. Department Lock Settings (`/hr/leave/settings`)
- Manage department locks
- Add new department lock
- Edit max people per department
- Delete department lock
- Info tentang default setting (2 orang)
- Real-time update

---

## 🚀 Migration Guide

### Database Changes Required

1. **Update leave_requests collection**:
   - Remove field: `type` (tidak dipakai lagi)
   - Remove status option: `"pending"` and `"rejected"`
   - Add field: `department` (text, required)
   - Add field: `position` (text, required)
   - Update field: `status` - only `["approved", "cancelled"]`

2. **Create new collection: department_locks**:
   ```json
   {
     "name": "department_locks",
     "type": "base",
     "schema": [
       {
         "name": "department",
         "type": "text",
         "required": true,
         "unique": true
       },
       {
         "name": "max_people_per_day",
         "type": "number",
         "required": true,
         "min": 1,
         "max": 10
       }
     ]
   }
   ```

### Migration Steps

1. **Backup existing data**
2. **Update PocketBase schema** via Admin UI
3. **Migrate existing records**:
   - Set `department` and `position` from user profiles
   - Convert `status="pending"` to `status="approved"`
   - Convert `status="rejected"` to `status="cancelled"`
   - Set `booking_date` = `created` for existing records
4. **Create default department locks** (optional)

---

## 📊 Business Rules Summary

| Rule | Value | Description |
|------|-------|-------------|
| **Durasi Maksimal** | 3 bulan | Per 1 pengajuan |
| **Department Lock** | 2 orang | Default per department per hari (customizable) |
| **Min Reason Length** | 10 char | Minimal panjang alasan |
| **Auto Approval** | Yes | Langsung approved |
| **Type** | Cuti only | Tidak ada izin/sakit |
| **Cancellation** | Before start | Hanya sebelum cuti dimulai |

---

## 🎨 UI/UX Highlights

### Design Principles

1. **Clear Feedback**
   - Department quota indicator yang jelas
   - Warning jika kuota penuh
   - Success/Error messages yang informatif
   - Real-time validation

2. **Self-Service**
   - Staff bisa manage sendiri tanpa HR
   - Tombol cancel yang mudah diakses
   - Status yang transparan
   - Department info visible

3. **First-Come-First-Served**
   - Booking langsung approved
   - Siapa cepat dia dapat
   - Fair untuk semua staff
   - Department lock untuk balance

### Color Coding

- 🟢 **Green**: Active bookings (approved)
- ⚫ **Gray**: Cancelled bookings
- 🟠 **Orange**: Department warnings
- � **Blue**: Info dan system messages

---

## 🔐 Security & Permissions

### Access Control

- **Staff**: 
  - Create leave (own)
  - Read own bookings
  - Cancel own (before start date)
  - View own department quota

- **HR/Owner**: 
  - Read all bookings
  - Monitor only (no approval power)
  - Manage department locks
  - View all stats

### Validation Layers

1. **Frontend**: Real-time form validation
2. **Backend**: Server-side validation in `lib/leave.ts`
3. **Database**: Schema validation & rules

---

## 📝 Testing Checklist

### Staff Testing
- [ ] Staff dapat booking cuti dengan auto-approval
- [ ] Validasi 3 bulan durasi berfungsi
- [ ] Tidak bisa double booking
- [ ] Department lock validation berfungsi
- [ ] Warning muncul jika kuota department penuh
- [ ] Staff bisa cancel booking (sebelum mulai)
- [ ] Staff tidak bisa cancel setelah cuti dimulai
- [ ] Mobile responsive

### HR Testing
- [ ] HR bisa lihat semua booking
- [ ] Filter by status berfungsi
- [ ] Filter by department berfungsi
- [ ] Search berfungsi
- [ ] HR bisa akses Department Lock Settings
- [ ] HR bisa add/edit/delete department locks
- [ ] Changes langsung terrefleksi di staff booking

---

## 🎯 Key Features Summary

### 🚀 Quick Reference

**Staff:**
- ✅ Booking cuti langsung approved
- ✅ Maksimal 3 bulan durasi per pengajuan
- ✅ Department lock: max 2 orang/hari (default)
- ✅ Bisa cancel sebelum dimulai
- ✅ Tidak perlu approval HR

**HR:**
- ✅ Monitoring semua booking
- ✅ Filter & search
- ✅ Manage department locks (customizable)
- ✅ No approval needed (auto-system)

---

## 📞 Support & Contact

Jika ada pertanyaan atau issue:
- Development Team
- HR Department

---

## 🔄 Changelog

### Version 2.1 (Current - 5 Mei 2026)
- ✅ Removed leave types (cuti only)
- ✅ Changed to 3 months duration in single submission
- ✅ Added department lock feature
- ✅ HR can customize department locks
- ✅ Real-time department quota check
- ✅ Department filter in HR monitoring

### Version 2.0 
- Auto-approval system
- First-come-first-served
- Monthly quota (deprecated)

---

**Last Updated**: 5 Mei 2026, 20:17 WIB  
**Version**: 2.1 (Department Lock System)  
**Status**: ✅ Production Ready
