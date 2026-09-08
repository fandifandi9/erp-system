# API Route Audit — SERBA ERP

Generated: 2026-07-07T08:48:39.753Z

## Summary

- Total routes: 103
- Protected: 101
- Public (intentional): 2
- Needs review: 0
- Debug flagged: 0

## Routes needing review (no auth pattern detected)

_None — all non-public routes match an auth pattern._

## Full inventory

| Method | Route | Status | Auth |
| --- | --- | --- | --- |
| POST | `/api/auth/forgot-password` | PROTECTED | admin-only (implicit) |
| POST | `/api/auth/reset-password` | PROTECTED | admin-only (implicit) |
| POST/DELETE | `/api/auth/session` | PUBLIC (intentional) | — |
| PATCH/DELETE | `/api/bisnis/courier-services/:id` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/bisnis/courier-services` | PROTECTED | module api-auth, admin-only (implicit) |
| PATCH/DELETE | `/api/bisnis/couriers/:id` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/bisnis/couriers/catalog` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/bisnis/couriers` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/couriers/seed` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/bisnis/import-batches/:id/awb-zip` | PROTECTED | module api-auth, admin-only (implicit) |
| PATCH/DELETE | `/api/bisnis/mp-fees/product-fees/:id` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/mp-fees/product-fees/bulk` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/bisnis/mp-fees/product-fees` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/mp-fees/resolve` | PROTECTED | module api-auth, admin-only (implicit) |
| PATCH/DELETE | `/api/bisnis/mp-fees/tags/:id` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/bisnis/mp-fees/tags` | PROTECTED | module api-auth, admin-only (implicit) |
| PATCH/DELETE | `/api/bisnis/mp-fees/tier-defaults/:id` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/bisnis/mp-fees/tier-defaults` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/purchase-orders/:id/finalize-receiving` | PROTECTED | module api-auth |
| POST | `/api/bisnis/purchase-orders/:id/retur` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/returs/:id/cancel` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/returs/:id/complete` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/returs/:id/settle` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/returs/:id/wms-receive` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST/DELETE | `/api/bisnis/sales-orders/:id/awb` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/bisnis/sales-orders/:id/invoice-qr` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/sales-orders/:id/retur` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/bisnis/sales-orders/:id/send-to-warehouse` | PROTECTED | module api-auth |
| GET | `/api/bisnis/share/invoice/:id` | PROTECTED | assertShareAccess, admin-only (implicit) |
| GET | `/api/bisnis/share/invoice/token/:token` | PROTECTED | admin-only (implicit) |
| GET | `/api/bisnis/share/purchase-order/:id` | PROTECTED | assertShareAccess, admin-only (implicit) |
| GET | `/api/bisnis/share/sales-order/:id` | PROTECTED | assertShareAccess, admin-only (implicit) |
| POST | `/api/bisnis/share/send-email` | PROTECTED | delegates to protected route |
| POST | `/api/catalog/bundles/estimated-stock` | PROTECTED | module api-auth |
| PATCH/DELETE | `/api/catalog/mp-mappings/:id` | PROTECTED | module api-auth |
| GET/POST | `/api/catalog/mp-mappings` | PROTECTED | module api-auth |
| POST | `/api/catalog/products/:id/activate` | PROTECTED | module api-auth |
| POST | `/api/catalog/products/:id/archive` | PROTECTED | module api-auth |
| GET | `/api/catalog/products/:id/availability` | PROTECTED | module api-auth |
| GET/PUT | `/api/catalog/products/:id/bundle-lines` | PROTECTED | module api-auth |
| GET/PUT | `/api/catalog/products/:id/prices` | PROTECTED | module api-auth |
| GET/PATCH | `/api/catalog/products/:id` | PROTECTED | module api-auth |
| GET/POST | `/api/catalog/products` | PROTECTED | module api-auth |
| GET/POST | `/api/catalog/resolve-price` | PROTECTED | module api-auth |
| GET | `/api/catalog/store-channel-accounts` | PROTECTED | module api-auth |
| GET/PUT | `/api/catalog/store-prices` | PROTECTED | module api-auth |
| POST | `/api/email/send` | PROTECTED | module api-auth |
| GET | `/api/health` | PUBLIC (intentional) | — |
| POST | `/api/inventory/damaged-disposition` | PROTECTED | module api-auth |
| GET | `/api/inventory/damaged-stock` | PROTECTED | module api-auth, admin-only (implicit) |
| PATCH/DELETE | `/api/inventory/locations/:id` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/locations/assign-product` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| GET | `/api/inventory/locations/assignments` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/inventory/locations/batch` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/locations/rack` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/locations/room` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/locations` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/locations/slot-assign` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| GET | `/api/inventory/locations/slots` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/inventory/movements/:id/post` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/inventory/movements/:id/void` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/inventory/movements/auto-stock` | PROTECTED | getApiAuthUser |
| POST | `/api/inventory/movements/auto-transfer` | PROTECTED | getApiAuthUser |
| POST | `/api/inventory/movements` | PROTECTED | admin-only (implicit), role/permission helper |
| POST | `/api/inventory/movements/void-by-reference` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| POST | `/api/inventory/opname/sessions/:id/approve` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/inventory/opname/sessions/:id/count` | PROTECTED | module api-auth |
| GET | `/api/inventory/opname/sessions/:id` | PROTECTED | module api-auth |
| POST | `/api/inventory/opname/sessions/:id/start` | PROTECTED | module api-auth |
| POST | `/api/inventory/opname/sessions/:id/submit-review` | PROTECTED | module api-auth |
| POST | `/api/inventory/opname/sessions` | PROTECTED | module api-auth |
| POST | `/api/inventory/packing/sessions/:id/complete` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/inventory/packing/sessions/:id` | PROTECTED | module api-auth |
| POST | `/api/inventory/packing/sessions/:id/scan` | PROTECTED | module api-auth |
| POST | `/api/inventory/packing/sessions` | PROTECTED | module api-auth |
| GET | `/api/inventory/products` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/inventory/warehouses` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/zones/checkin` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| POST | `/api/inventory/zones/checkout` | PROTECTED | module api-auth, admin-only (implicit), role/permission helper |
| GET | `/api/inventory/zones/sessions/active` | PROTECTED | module api-auth, admin-only (implicit) |
| POST | `/api/pos/complete-direct` | PROTECTED | module api-auth |
| POST | `/api/pos/complete-wms` | PROTECTED | module api-auth |
| GET | `/api/pos/products` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/pos/receipt` | PROTECTED | module api-auth, admin-only (implicit) |
| PATCH/DELETE | `/api/pos/registers/:id` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/pos/registers` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/pos/scan` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/pos/transactions` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/pos/validate-awb` | PROTECTED | module api-auth, admin-only (implicit) |
| GET | `/api/pos/validate-order-no` | PROTECTED | module api-auth, admin-only (implicit) |
| GET/POST | `/api/tenant/activity` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| GET | `/api/tenant/audit` | PROTECTED | getApiAuthUser, admin-only (implicit), role/permission helper |
| GET | `/api/tenant/company-access` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| GET/PUT | `/api/tenant/users/company-access` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| GET/POST | `/api/tenant/work-context` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| GET/POST | `/api/user/locale` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| POST | `/api/wms/photos` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| POST | `/api/wms/unboxing-video` | PROTECTED | getApiAuthUser |
| POST | `/api/wms/workstations/checkin` | PROTECTED | getApiAuthUser, admin-only (implicit), role/permission helper |
| POST | `/api/wms/workstations/checkout` | PROTECTED | getApiAuthUser, admin-only (implicit), role/permission helper |
| GET | `/api/wms/workstations/config` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| GET | `/api/wms/workstations/sessions/active` | PROTECTED | getApiAuthUser, admin-only (implicit) |
| POST | `/api/wms/workstations/sessions/bind` | PROTECTED | getApiAuthUser, admin-only (implicit), role/permission helper |