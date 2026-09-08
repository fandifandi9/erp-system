"""Create production deployment package from local source (excludes node_modules, .next, .git)."""
import os, tarfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "erp-production-deploy.tar.gz")

EXCLUDE_DIRS = {
    "node_modules", ".next", ".git", "pb_data", ".expo",
    ".staging-uat-root", "agent-tools", ".cursor",
}
EXCLUDE_FILES_SUFFIX = {".tar.gz", ".zip"}
EXCLUDE_PREFIXES = ("erp-production-deploy", "erp-phase24-deploy")

count = 0
t0 = time.time()
with tarfile.open(OUT, "w:gz") as tar:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT)
        if rel_dir == ".":
            rel_dir = ""
        for fn in filenames:
            if any(fn.endswith(s) for s in EXCLUDE_FILES_SUFFIX):
                continue
            if any(fn.startswith(p) for p in EXCLUDE_PREFIXES):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.join(rel_dir, fn).replace("\\", "/")
            if rel.startswith("mobile/node_modules"):
                continue
            tar.add(full, arcname=rel)
            count += 1

sz = os.path.getsize(OUT)
print(f"Package: {OUT}")
print(f"Files: {count}")
print(f"Size: {sz/1024/1024:.1f} MB")
print(f"Time: {time.time()-t0:.1f}s")
