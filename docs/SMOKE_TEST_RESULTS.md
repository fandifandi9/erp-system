# Smoke Test Results — SERBA ERP

**Run:** 2026-07-07T09:41:10.050Z
**App:** http://localhost:3001
**PocketBase:** https://pb.serba.space

## Summary

| Outcome | Count |
| --- | --- |
| Pass | 102 |
| Fail | 0 |
| Warn | 0 |
| Skip | 6 |

_Login API/page tests dijalankan dengan SMOKE_PASSWORD._

## Data integrity

| Collection | Total | Status |
| --- | --- | --- |
| Users | 23 | ✅ |
| HR Profiles | 23 | ✅ |
| Offices (GPS) | 2 | ✅ |
| Customers | 30 | ✅ |
| Suppliers | 2 | ✅ |
| Products | 6 | ✅ |
| Purchase Orders | 11 | ✅ |
| Sales Orders | 56 | ✅ |
| Warehouses | 10 | ✅ |
| Attendance | 5 | ✅ |
| Leave Requests | 28 | ✅ |
| Overtime Requests | 4 | ✅ |
| WMS Packing Sessions | 0 | ✅ |
| Stock Movements | 46 | ✅ |

## Module workflows

| Module | Check | Total | |
| --- | --- | --- | --- |
| HR | Active users with profile | 23 | ✅ |
| HR | Leave requests (any status) | 28 | ✅ |
| ERP | Purchase orders (non-cancelled) | 11 | ✅ |
| ERP | Sales orders (non-cancelled) | 53 | ✅ |
| ERP | Invoices | 31 | ✅ |
| WMS | PO sent to warehouse | 7 | ✅ |
| WMS | SO sent to warehouse | 27 | ✅ |
| WMS | Stock balances | 16 | ✅ |

## Role distribution

| Persona | Users |
| --- | --- |
| hr | 4 |
| Super Admin (owner) | 2 |
| staff | 12 |
| staff-basic | 1 |
| staff + inventory_staff | 1 |
| staff + inventory_supervisor | 1 |
| staff + inventory_admin | 1 |

## Per role

### hr
- Email: `smoke-hr@serba.test`
- Login: **OK**
- role: hr | inventory: none | web_access: true

| Route (RBAC) | Expected | Actual | |
| --- | --- | --- | --- |
| /hr/employees | allow | allow | ✅ |
| /dashboard-staff | deny | deny | ✅ |
| /bisnis/penjualan | deny | deny | ✅ |
| /bisnis/pembelian | deny | deny | ✅ |
| /wms/receiving | deny | deny | ✅ |
| /inventory/products | deny | deny | ✅ |
| /profile | allow | allow | ✅ |

| API | Status | Expected | |
| --- | --- | --- | --- |
| /api/user/locale | 200 | 200 | ✅ |
| /api/tenant/work-context | 200 | 200 | ✅ |
| /api/inventory/products?perPage=1 | skip | - | ✅ |
| /api/catalog/products?perPage=1 | skip | - | ✅ |
| /api/bisnis/couriers | 403 | 403 | ✅ |
| /api/wms/workstations/sessions/active | skip | - | ✅ |

| Page | HTTP | Allow? | |
| --- | --- | --- | --- |
| /hr/employees | 200 | yes | ✅ |
| /bisnis/penjualan | 307 | no | ✅ |
| /wms/receiving | 307 | no | ✅ |
| /profile | 200 | yes | ✅ |

### staff
- Email: `smoke-employee@serba.test`
- Login: **OK**
- role: staff | inventory: none | web_access: true

| Route (RBAC) | Expected | Actual | |
| --- | --- | --- | --- |
| /hr/employees | deny | deny | ✅ |
| /dashboard-staff | allow | allow | ✅ |
| /bisnis/penjualan | deny | deny | ✅ |
| /bisnis/pembelian | deny | deny | ✅ |
| /wms/receiving | deny | deny | ✅ |
| /inventory/products | deny | deny | ✅ |
| /profile | allow | allow | ✅ |

| API | Status | Expected | |
| --- | --- | --- | --- |
| /api/user/locale | 200 | 200 | ✅ |
| /api/tenant/work-context | 200 | 200 | ✅ |
| /api/inventory/products?perPage=1 | skip | - | ✅ |
| /api/catalog/products?perPage=1 | skip | - | ✅ |
| /api/bisnis/couriers | 403 | 403 | ✅ |
| /api/wms/workstations/sessions/active | skip | - | ✅ |

| Page | HTTP | Allow? | |
| --- | --- | --- | --- |
| /hr/employees | 307 | no | ✅ |
| /bisnis/penjualan | 307 | no | ✅ |
| /wms/receiving | 307 | no | ✅ |
| /profile | 200 | yes | ✅ |

### staff + inventory_staff
- Email: `smoke-warehouse@serba.test`
- Login: **OK**
- role: staff | inventory: staff | web_access: true

| Route (RBAC) | Expected | Actual | |
| --- | --- | --- | --- |
| /hr/employees | deny | deny | ✅ |
| /dashboard-staff | allow | allow | ✅ |
| /bisnis/penjualan | allow | allow | ✅ |
| /bisnis/pembelian | allow | allow | ✅ |
| /wms/receiving | allow | allow | ✅ |
| /inventory/products | allow | allow | ✅ |
| /profile | allow | allow | ✅ |

| API | Status | Expected | |
| --- | --- | --- | --- |
| /api/user/locale | 200 | 200 | ✅ |
| /api/tenant/work-context | 200 | 200 | ✅ |
| /api/inventory/products?perPage=1 | 200 | 200,403 | ✅ |
| /api/catalog/products?perPage=1 | 200 | 200,403 | ✅ |
| /api/bisnis/couriers | 200 | 200,403 | ✅ |
| /api/wms/workstations/sessions/active | 200 | 200,403,400 | ✅ |

| Page | HTTP | Allow? | |
| --- | --- | --- | --- |
| /hr/employees | 307 | no | ✅ |
| /bisnis/penjualan | 200 | yes | ✅ |
| /wms/receiving | 200 | yes | ✅ |
| /profile | 200 | yes | ✅ |

### staff + inventory_supervisor
- Email: `smoke-supervisor@serba.test`
- Login: **OK**
- role: staff | inventory: supervisor | web_access: true

| Route (RBAC) | Expected | Actual | |
| --- | --- | --- | --- |
| /hr/employees | deny | deny | ✅ |
| /dashboard-staff | allow | allow | ✅ |
| /bisnis/penjualan | allow | allow | ✅ |
| /bisnis/pembelian | allow | allow | ✅ |
| /wms/receiving | allow | allow | ✅ |
| /inventory/products | allow | allow | ✅ |
| /profile | allow | allow | ✅ |

| API | Status | Expected | |
| --- | --- | --- | --- |
| /api/user/locale | 200 | 200 | ✅ |
| /api/tenant/work-context | 200 | 200 | ✅ |
| /api/inventory/products?perPage=1 | 200 | 200,403 | ✅ |
| /api/catalog/products?perPage=1 | 200 | 200,403 | ✅ |
| /api/bisnis/couriers | 200 | 200,403 | ✅ |
| /api/wms/workstations/sessions/active | 200 | 200,403,400 | ✅ |

| Page | HTTP | Allow? | |
| --- | --- | --- | --- |
| /hr/employees | 307 | no | ✅ |
| /bisnis/penjualan | 200 | yes | ✅ |
| /wms/receiving | 200 | yes | ✅ |
| /profile | 200 | yes | ✅ |

### staff + inventory_admin
- Email: `smoke-admin-bisnis@serba.test`
- Login: **OK**
- role: staff | inventory: admin | web_access: true

| Route (RBAC) | Expected | Actual | |
| --- | --- | --- | --- |
| /hr/employees | deny | deny | ✅ |
| /dashboard-staff | allow | allow | ✅ |
| /bisnis/penjualan | allow | allow | ✅ |
| /bisnis/pembelian | allow | allow | ✅ |
| /wms/receiving | allow | allow | ✅ |
| /inventory/products | allow | allow | ✅ |
| /profile | allow | allow | ✅ |

| API | Status | Expected | |
| --- | --- | --- | --- |
| /api/user/locale | 200 | 200 | ✅ |
| /api/tenant/work-context | 200 | 200 | ✅ |
| /api/inventory/products?perPage=1 | 200 | 200,403 | ✅ |
| /api/catalog/products?perPage=1 | 200 | 200,403 | ✅ |
| /api/bisnis/couriers | 200 | 200,403 | ✅ |
| /api/wms/workstations/sessions/active | 200 | 200,403,400 | ✅ |

| Page | HTTP | Allow? | |
| --- | --- | --- | --- |
| /hr/employees | 307 | no | ✅ |
| /bisnis/penjualan | 200 | yes | ✅ |
| /wms/receiving | 200 | yes | ✅ |
| /profile | 200 | yes | ✅ |
