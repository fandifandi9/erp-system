import os, tarfile, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/notifications/types.ts", "lib/notifications/push.ts",
    "lib/notifications/recipients.ts", "lib/notifications/dispatch.ts",
    "app/api/notifications/route.ts",
    "app/api/notifications/[id]/read/route.ts",
    "app/api/push-tokens/route.ts",
    "app/api/hr/leave/route.ts",
    "app/api/hr/leave/[id]/approve/route.ts",
    "app/api/hr/leave/[id]/reject/route.ts",
    "lib/hr/reporting-http.ts", "package.json",
]
out = os.path.join(ROOT, "erp-phase24-deploy.tar.gz")
with tarfile.open(out, "w:gz") as tar:
    for f in FILES:
        full = os.path.join(ROOT, f.replace("/", os.sep))
        if not os.path.exists(full):
            print("MISSING:", f); sys.exit(1)
        tar.add(full, arcname=f)
print("OK", out, os.path.getsize(out))
