"""Phase 28 — staging overlay package (server-side bugfix files only)."""
import os, tarfile, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/inventory/pb-service-error.ts",
    "lib/inventory/pb-server.ts",
    "lib/hr/api-auth.ts",
]
out = os.path.join(ROOT, "erp-phase28-bugfix-deploy.tar.gz")
with tarfile.open(out, "w:gz") as tar:
    for f in FILES:
        full = os.path.join(ROOT, f.replace("/", os.sep))
        if not os.path.exists(full):
            print("MISSING:", f)
            sys.exit(1)
        tar.add(full, arcname=f)
print("OK", out, os.path.getsize(out))
