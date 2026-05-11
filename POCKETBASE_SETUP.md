# 📦 POCKETBASE COLLECTIONS SETUP GUIDE
## Advanced ERP Attendance System with GPS + Anti-Cheat

**Last Updated:** April 28, 2026  
**Version:** 1.0.0

---

## 🎯 OVERVIEW

This guide provides complete PocketBase database schema for the Advanced Attendance System with GPS validation and anti-cheat mechanisms.

---

## 📊 COLLECTIONS STRUCTURE

### 1. ✅ **attendance_logs** (Main Collection)

**Purpose:** Store all attendance check-in/check-out records with GPS and device tracking.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user` | Relation (users) | ✅ Yes | Reference to user who checked in |
| `date` | Text | ✅ Yes | Date in YYYY-MM-DD format |
| `check_in` | DateTime | ❌ No | Check-in timestamp (ISO 8601) |
| `check_out` | DateTime | ❌ No | Check-out timestamp (ISO 8601) |
| `status` | Select | ✅ Yes | Options: present, late, absent, leave |
| `late_minutes` | Number | ✅ Yes | Minutes late (0 if on time) |
| `work_hours` | Number | ✅ Yes | Total work hours (calculated on check-out) |
| `lat` | Number | ❌ No | User's GPS latitude |
| `lng` | Number | ❌ No | User's GPS longitude |
| `distance_meter` | Number | ❌ No | Distance from office in meters |
| `device_id` | Text | ❌ No | Device fingerprint hash |
| `ip_address` | Text | ❌ No | User's IP address |
| `is_suspicious` | Bool | ✅ Yes | Flag for suspicious activity |

**Indexes:**
- `user` + `date` (Unique)
- `date` (For date queries)
- `is_suspicious` (For admin monitoring)

**API Rules:**

```javascript
// List/View Rule (Users can only see their own records, HR & Owner can see all)
@request.auth.id != "" && (
  @request.auth.id = user ||
  @request.auth.role = "hr" ||
  @request.auth.role = "owner"
)

// Create Rule (Users can only create for themselves)
@request.auth.id != "" && @request.auth.id = @request.data.user

// Update Rule (Users can only update their own check-out, HR can update all)
@request.auth.id != "" && (
  (@request.auth.id = user && @request.data.check_out:isset) ||
  @request.auth.role = "hr" ||
  @request.auth.role = "owner"
)

// Delete Rule (Only owner)
@request.auth.role = "owner"
```

---

### 2. 🏢 **offices** (NEW Collection)

**Purpose:** Store office locations for GPS validation.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | Text | ✅ Yes | Office name (e.g., "Head Office") |
| `lat` | Number | ✅ Yes | Office GPS latitude |
| `lng` | Number | ✅ Yes | Office GPS longitude |
| `radius_meter` | Number | ✅ Yes | Allowed radius in meters (e.g., 100) |
| `is_active` | Bool | ✅ Yes | Office active status |

**Default Values:**
- `radius_meter`: 100
- `is_active`: true

**API Rules:**

```javascript
// List/View Rule (All authenticated users)
@request.auth.id != ""

// Create Rule (Only HR & Owner)
@request.auth.role = "hr" || @request.auth.role = "owner"

// Update Rule (Only HR & Owner)
@request.auth.role = "hr" || @request.auth.role = "owner"

// Delete Rule (Only owner)
@request.auth.role = "owner"
```

**Sample Data:**
```json
{
  "name": "Head Office",
  "lat": -6.200000,
  "lng": 106.816666,
  "radius_meter": 100,
  "is_active": true
}
```

---

### 3. 👤 **profiles** (UPDATE Existing)

**Purpose:** User profiles with attendance settings.

**NEW Fields to Add:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `office_id` | Relation (offices) | ✅ Yes | User's assigned office |
| `shift_start` | Text | ✅ Yes | Shift start time (HH:mm format, e.g., "08:00") |
| `shift_end` | Text | ✅ Yes | Shift end time (HH:mm format, e.g., "17:00") |
| `department` | Text | ❌ No | User's department |

**Default Values:**
- `shift_start`: "08:00"
- `shift_end`: "17:00"

**API Rules:**

```javascript
// List/View Rule (Users can see their own, HR & Owner can see all)
@request.auth.id != "" && (
  @request.auth.id = user ||
  @request.auth.role = "hr" ||
  @request.auth.role = "owner"
)

// Create Rule (Only HR & Owner)
@request.auth.role = "hr" || @request.auth.role = "owner"

// Update Rule (Users can update own, HR & Owner can update all)
@request.auth.id != "" && (
  @request.auth.id = user ||
  @request.auth.role = "hr" ||
  @request.auth.role = "owner"
)

// Delete Rule (Only owner)
@request.auth.role = "owner"
```

---

### 4. 🏖️ **leave_requests** (Existing - No Changes)

**Purpose:** Employee leave requests integrated with attendance.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user` | Relation (users) | ✅ Yes | User requesting leave |
| `date` | Text | ✅ Yes | Leave date (YYYY-MM-DD) |
| `reason` | Text | ✅ Yes | Leave reason |
| `status` | Select | ✅ Yes | Options: pending, approved, rejected |
| `approved_by` | Relation (users) | ❌ No | HR/Manager who approved |

**Integration:** When leave is approved, attendance system auto-blocks check-in and sets status to "leave".

---

### 5. ⚙️ **settings_hr** (OPTIONAL - Future)

**Purpose:** System-wide attendance settings.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `max_late_minutes` | Number | ✅ Yes | Max minutes late before penalty |
| `max_radius_meter` | Number | ✅ Yes | Default office radius |
| `allow_remote` | Bool | ✅ Yes | Allow remote check-in |
| `require_gps` | Bool | ✅ Yes | GPS validation required |

---

## 🔧 SETUP INSTRUCTIONS

### Step 1: Create Collections

1. Open PocketBase Admin Panel (http://your-server:8091/_/)
2. Go to **Collections** → **New Collection**
3. Create each collection above with exact field names and types

### Step 2: Configure Relations

- `attendance_logs.user` → `users.id`
- `attendance_logs` → Enable expand for `user` field
- `profiles.office_id` → `offices.id`
- `profiles` → Enable expand for `office_id` field

### Step 3: Set API Rules

Copy-paste the API Rules provided above for each collection. This ensures:
- ✅ Users can only see their own attendance
- ✅ HR can manage all attendance
- ✅ Server-side validation
- ✅ Prevent unauthorized access

### Step 4: Create Sample Office

```bash
# Via PocketBase Admin or API
POST /api/collections/offices/records

{
  "name": "Head Office",
  "lat": -6.200000,
  "lng": 106.816666,
  "radius_meter": 100,
  "is_active": true
}
```

### Step 5: Update User Profiles

For each user, add:
```json
{
  "office_id": "RECORD_ID_OF_OFFICE",
  "shift_start": "08:00",
  "shift_end": "17:00",
  "department": "Engineering"
}
```

---

## 🔐 SECURITY CHECKLIST

### Server-Side Validation ✅

All validations MUST be done in PocketBase rules, NOT just client-side:

- [ ] User can only create attendance for themselves
- [ ] GPS coordinates are required for check-in
- [ ] Distance validation (within radius)
- [ ] Check-in blocked if already checked in
- [ ] Check-in blocked if on approved leave
- [ ] Only owner can delete attendance records
- [ ] Device tracking enabled
- [ ] Suspicious activity flagged

### API Rules Testing

Test each rule:

```bash
# 1. User tries to check-in for another user (should FAIL)
# 2. User tries to view other user's attendance (should FAIL)
# 3. HR views all attendance (should SUCCEED)
# 4. User checks in outside radius (should be flagged)
```

---

## 📍 GPS CONFIGURATION

### Office Location Setup

**How to get coordinates:**

1. **Google Maps Method:**
   - Right-click on location → "What's here?"
   - Copy lat/lng (e.g., -6.200000, 106.816666)

2. **Mobile GPS:**
   - Use "GPS Status & Toolbox" app
   - Stand at office entrance
   - Note exact coordinates

**Recommended Radius:**
- Small office: 50-100 meters
- Large office: 100-200 meters
- Campus/Complex: 200-500 meters

**Testing GPS:**
```javascript
// Test distance calculation
const distance = getDistance(
  userLat, userLng,
  officeLat, officeLng
);
console.log(`Distance: ${distance}m`);
```

---

## 🛡️ ANTI-CHEAT DETECTION

### Automatic Flags

System automatically flags as suspicious:

1. **Device Change:** Device ID changes within same day
2. **GPS Jump:** Location moves >5km in <5 minutes
3. **Edge Case:** Consistently near radius limit (95-100%)
4. **IP Change:** Dramatic IP address changes

### Manual Review (HR Dashboard)

HR can review at `/hr/attendance/suspicious`:
- See all flagged records
- View device IDs
- Check IP addresses
- Inspect GPS coordinates

---

## 📊 DATA FLOW

```
User Clicks "Check In"
    ↓
1. Get GPS Location (browser API)
    ↓
2. Calculate Distance (Haversine)
    ↓
3. Validate Radius (≤ office.radius_meter)
    ↓
4. Check Existing Record (prevent duplicate)
    ↓
5. Check Approved Leave (block if on leave)
    ↓
6. Generate Device Fingerprint
    ↓
7. Detect Suspicious Activity
    ↓
8. Calculate Late Minutes
    ↓
9. Create attendance_logs Record
    ↓
✅ Success or ❌ Error Message
```

---

## 🧪 TESTING GUIDE

### Test Cases

**1. Normal Check-in ✅**
- User at office location
- Within radius
- Expected: Success

**2. Outside Radius ❌**
- User 500m from office
- Expected: "Outside office area" error

**3. Double Check-in ❌**
- User already checked in today
- Expected: "Already checked in" error

**4. On Leave ❌**
- User has approved leave
- Expected: "On approved leave" error

**5. GPS Denied ❌**
- User denies location permission
- Expected: "GPS permission denied" error

**6. Check-out ✅**
- User checked in earlier
- Expected: Calculate work hours

---

## 🚀 MIGRATION FROM OLD SYSTEM

If you have existing `attendance` collection:

```sql
-- Rename collection
attendance → attendance_logs

-- Add new fields (use PocketBase Admin)
ALTER TABLE attendance_logs ADD COLUMN lat REAL;
ALTER TABLE attendance_logs ADD COLUMN lng REAL;
ALTER TABLE attendance_logs ADD COLUMN distance_meter INTEGER;
ALTER TABLE attendance_logs ADD COLUMN device_id TEXT;
ALTER TABLE attendance_logs ADD COLUMN ip_address TEXT;
ALTER TABLE attendance_logs ADD COLUMN is_suspicious BOOLEAN DEFAULT 0;

-- Set default values
UPDATE attendance_logs SET is_suspicious = 0 WHERE is_suspicious IS NULL;
UPDATE attendance_logs SET late_minutes = 0 WHERE late_minutes IS NULL;
UPDATE attendance_logs SET work_hours = 0 WHERE work_hours IS NULL;
```

---

## 📞 TROUBLESHOOTING

### Common Issues

**1. "Collection not found"**
- Solution: Ensure collection name is `attendance_logs` not `attendance`

**2. "GPS permission denied"**
- Solution: User must allow location in browser settings

**3. "Profile not found"**
- Solution: Ensure all users have profiles with office_id

**4. "Office not configured"**
- Solution: Create office record and assign to user profile

**5. "CORS error"**
- Solution: Check PocketBase URL in `.env.local`

---

## ✅ PRODUCTION CHECKLIST

Before deploying to production:

- [ ] All collections created
- [ ] API rules configured
- [ ] All users have profiles with office_id
- [ ] At least one office created
- [ ] GPS testing completed
- [ ] Anti-cheat testing done
- [ ] Backup PocketBase database
- [ ] HTTPS enabled
- [ ] Rate limiting active
- [ ] Monitoring set up

---

## 📚 RELATED DOCUMENTATION

- [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) - Security audit results
- [FIXES_APPLIED.md](./FIXES_APPLIED.md) - Recent security fixes
- [README.md](./README.md) - General project documentation

---

*This guide is part of the Advanced ERP Attendance System*  
*For questions, contact your system administrator*
