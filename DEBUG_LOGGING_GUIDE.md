# 🔍 DEBUG LOGGING GUIDE - GPS Attendance System

**Updated:** 30 April 2026  
**Purpose:** Comprehensive debugging untuk sistem absensi GPS

---

## 📋 **CARA MENGGUNAKAN DEBUG LOGS**

### **Step 1: Buka Browser Console**
1. Tekan `F12` di browser
2. Pilih tab **Console**
3. Klik "Check In" di aplikasi
4. Lihat logs yang muncul

### **Step 2: Baca Output Logs**

Setiap check-in akan menampilkan **9 STEPS** berurutan:

---

## 📊 **FORMAT LOG OUTPUT**

```
═══════════════════════════════════════════════════
🚀 CHECK-IN PROCESS STARTED
═══════════════════════════════════════════════════

📌 STEP 1: USER VALIDATION
├─ User ID: xxx
├─ User Role: staff/hr/owner
└─ ✅ User validated

📌 STEP 2: EXISTING ATTENDANCE CHECK
├─ Today: 2026-04-30
├─ Already checked in: YES/NO
└─ ✅ No existing check-in

📌 STEP 3: LEAVE REQUEST CHECK
├─ Has approved leave: YES/NO
└─ ✅ Not on leave

📌 STEP 4: PROFILE & OFFICE DATA
├─ 📋 PROFILE DATA:
│  ├─ Profile ID: xxx
│  ├─ Office ID: xxx
│  ├─ Department: Engineering
│  ├─ Shift Start: 08:00
│  └─ Shift End: 17:00
├─ 🏢 OFFICE DATA (from PocketBase):
│  ├─ Office ID: xxx
│  ├─ Name: Head Office
│  ├─ Latitude: -6.212332
│  ├─ Longitude: 106.454443
│  ├─ Radius (field: radius_meter): 200
│  ├─ Radius (field: radius): undefined
│  ├─ Is Active: true
│  └─ 🎯 RADIUS USED: 200 meters
└─ ✅ Profile & Office loaded

📌 STEP 5: GPS LOCATION
├─ 📍 USER GPS DATA:
│  ├─ Latitude: -6.212345
│  ├─ Longitude: 106.454456
│  └─ Accuracy: 20 meters
└─ ✅ GPS acquired

📌 STEP 6: GPS VALIDATION
├─ 📊 VALIDATION RESULT:
│  ├─ Distance: 15 meters
│  ├─ Max Radius: 200 meters
│  ├─ Is Valid: ✅ YES
│  └─ Message: Within office area (15m from office)
└─ ✅ Within radius

📌 STEP 7: DEVICE INFO
├─ Device ID: a1b2c3d4e5f6g7h8i9j0...
├─ IP Address: 192.168.1.10
└─ Is Suspicious: ✅ NO

📌 STEP 8: STATUS CALCULATION
├─ Check-in Time: 09:15:30
├─ Shift Start: 08:00
├─ Late Minutes: 75
└─ Status: ⏰ LATE

📌 STEP 9: SAVE TO DATABASE
├─ 💾 DATA YANG DISIMPAN KE attendance_logs:
│  ├─ user: xxx
│  ├─ date: 2026-04-30
│  ├─ check_in: 2026-04-30T09:15:30.123Z
│  ├─ status: late
│  ├─ late_minutes: 75
│  ├─ lat: -6.212345
│  ├─ lng: 106.454456
│  ├─ distance_meter: 15
│  ├─ device_id: a1b2c3d4e5f6g7h8i9j0...
│  ├─ ip_address: 192.168.1.10
│  └─ is_suspicious: false
└─ ✅ Saved to database (ID: xxx)

═══════════════════════════════════════════════════
✅ CHECK-IN SUCCESS!
═══════════════════════════════════════════════════
```

---

## 🔍 **CARA ANALISIS LOGS**

### **1. Check User Data**
**Lokasi:** STEP 1
```
├─ User ID: xxx
├─ User Role: staff/hr/owner
```

**Verify:**
- User ID harus ada (bukan null/undefined)
- Role harus valid (staff/hr/owner)

---

### **2. Check Profile & Office**
**Lokasi:** STEP 4

**PROFILE DATA:**
```
│  ├─ Profile ID: xxx
│  ├─ Office ID: xxx        ← Harus match dengan Office ID di bawah
│  ├─ Department: xxx
│  ├─ Shift Start: 08:00
│  └─ Shift End: 17:00
```

**OFFICE DATA:**
```
│  ├─ Office ID: xxx         ← Harus sama dengan Profile.office_id
│  ├─ Name: xxx
│  ├─ Latitude: -6.xxx
│  ├─ Longitude: 106.xxx
│  ├─ Radius (field: radius_meter): 200  ← Check mana yang ada
│  ├─ Radius (field: radius): undefined  ← Atau ini
│  ├─ Is Active: true
│  └─ 🎯 RADIUS USED: 200 meters        ← Final radius yang dipakai
```

**Verify:**
- Profile.office_id === Office.id
- Office harus punya lat/lng valid
- Radius harus ada (tidak undefined)
- Is Active harus true

---

### **3. Check GPS Data**
**Lokasi:** STEP 5

```
├─ 📍 USER GPS DATA:
│  ├─ Latitude: -6.xxx      ← Koordinat user
│  ├─ Longitude: 106.xxx
│  └─ Accuracy: 20 meters   ← Akurasi GPS (lebih kecil = lebih baik)
```

**Verify:**
- Lat/Lng harus ada (bukan null)
- Accuracy < 100m (idealnya < 50m)
- Koordinat masuk akal (misalnya untuk Indonesia: lat -11 s/d 6, lng 95 s/d 141)

---

### **4. Check Validation Result**
**Lokasi:** STEP 6

```
├─ 📊 VALIDATION RESULT:
│  ├─ Distance: 15 meters         ← Jarak dari kantor
│  ├─ Max Radius: 200 meters      ← Batas maksimal
│  ├─ Is Valid: ✅ YES            ← Pass atau tidak
│  └─ Message: Within office area (15m from office)
```

**Verify:**
- Distance harus < Max Radius
- Is Valid harus ✅ YES
- Message harus "Within office area"

**Troubleshooting:**
- Jika Distance > Max Radius → User di luar area
- Jika Radius = undefined → Check PocketBase field name
- Jika GPS tidak akurat → Coba ulang atau pindah lokasi

---

### **5. Check Saved Data**
**Lokasi:** STEP 9

```
├─ 💾 DATA YANG DISIMPAN KE attendance_logs:
│  ├─ user: xxx
│  ├─ date: 2026-04-30
│  ├─ lat: -6.212345          ← Harus sama dengan GPS Data
│  ├─ lng: 106.454456         ← Harus sama dengan GPS Data
│  ├─ distance_meter: 15      ← Harus sama dengan Validation Result
│  ├─ status: late/present
│  └─ is_suspicious: false
```

**Verify:**
- lat/lng sama dengan USER GPS DATA
- distance_meter sama dengan Validation Result Distance
- status sesuai (late jika telat, present jika ontime)

---

## 🐛 **COMMON ISSUES & SOLUTIONS**

### **Issue 1: GPS Permission Denied**
**Log:**
```
📌 STEP 5: GPS LOCATION
└─ ❌ FAILED: GPS error - Location permission denied
```

**Solutions:**
1. Allow location di browser settings
2. Atau gunakan **Debug Mode**:
   ```javascript
   localStorage.setItem("debug_lat", "-6.212332");
   localStorage.setItem("debug_lng", "106.454443");
   ```

---

### **Issue 2: Radius Undefined**
**Log:**
```
│  ├─ Radius (field: radius_meter): undefined
│  ├─ Radius (field: radius): undefined
│  └─ 🎯 RADIUS USED: 100 meters  ← Fallback
```

**Solutions:**
1. Check PocketBase collection "offices"
2. Pastikan field `radius_meter` atau `radius` ada dan terisi
3. Update field di PocketBase Admin Panel

---

### **Issue 3: Outside Office Area**
**Log:**
```
│  ├─ Distance: 350 meters
│  ├─ Max Radius: 200 meters
│  ├─ Is Valid: ❌ NO
│  └─ Message: Outside office area (350m from office, max 200m)
```

**Solutions:**
1. User harus lebih dekat ke kantor
2. Atau perbesar radius di PocketBase
3. Atau gunakan debug mode dengan koordinat yang benar

---

### **Issue 4: Profile Not Found**
**Log:**
```
📌 STEP 4: PROFILE & OFFICE DATA
└─ ❌ FAILED: Profile not found
```

**Solutions:**
1. Check collection "profiles" di PocketBase
2. Pastikan ada record dengan user = current user ID
3. Create profile untuk user tersebut

---

### **Issue 5: Already Checked In**
**Log:**
```
📌 STEP 2: EXISTING ATTENDANCE CHECK
├─ Already checked in: YES
└─ ❌ FAILED: Already checked in
```

**Solutions:**
1. Normal behavior - user sudah check-in hari ini
2. Jika ingin test lagi, hapus record di attendance_logs untuk hari ini
3. Atau tunggu besok

---

## 📊 **VERIFY DATA SYNC**

### **Checklist:**

- [ ] **User ID** di log = user ID di PocketBase users table
- [ ] **Profile.office_id** di log = Office ID yang ada di PocketBase offices table
- [ ] **Office.lat/lng** di log = koordinat di PocketBase offices table
- [ ] **Office.radius** di log = radius di PocketBase (radius_meter atau radius field)
- [ ] **User GPS** lat/lng masuk akal dan dekat dengan office
- [ ] **Distance** < Max Radius
- [ ] **Saved data** di attendance_logs match dengan log

### **Cara Verify di PocketBase:**

1. Buka PocketBase Admin: `http://localhost:8091/_/`
2. Check **Collections → offices** → lihat radius field
3. Check **Collections → profiles** → lihat office_id
4. Check **Collections → attendance_logs** → lihat data tersimpan
5. Compare dengan console logs

---

## 🎯 **EXAMPLE: Perfect Check-in**

```
═══════════════════════════════════════════════════
🚀 CHECK-IN PROCESS STARTED
═══════════════════════════════════════════════════

✅ STEP 1: User validated (ID: abc123, Role: staff)
✅ STEP 2: No existing check-in
✅ STEP 3: Not on leave
✅ STEP 4: Profile & Office loaded
   - Office: Head Office
   - Radius: 200m
✅ STEP 5: GPS acquired (Accuracy: 15m)
✅ STEP 6: Within radius (Distance: 45m)
✅ STEP 7: Device info collected
✅ STEP 8: Status: ON TIME
✅ STEP 9: Saved to database

═══════════════════════════════════════════════════
✅ CHECK-IN SUCCESS!
═══════════════════════════════════════════════════
```

---

## 🚀 **TIPS PRO**

1. **Copy All Logs**: Select semua console output, copy, save ke file .txt
2. **Compare**: Bandingkan dengan data di PocketBase Admin Panel
3. **Screenshot**: Ambil screenshot console untuk dokumentasi
4. **Filter**: Di console, filter by "CHECK-IN" untuk fokus ke logs ini
5. **Clear**: Clear console sebelum test untuk output yang bersih

---

## 📞 **TROUBLESHOOTING WORKFLOW**

```
1. Buka Console (F12)
   ↓
2. Clear Console
   ↓
3. Klik Check-In
   ↓
4. Baca logs dari STEP 1-9
   ↓
5. Cari symbol ❌ (error)
   ↓
6. Baca pesan error
   ↓
7. Apply solution dari guide ini
   ↓
8. Test lagi
```

---

*Last Updated: 30 April 2026, 17:34 WIB*
