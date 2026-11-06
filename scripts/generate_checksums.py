"""Write SHA-256 checksums for published data files.

Run after the runner writes intel.json / attribution.json. Writes a plain
hex digest (no filename) so readers can compare it directly with
`sha256sum` output from any shell.
"""
import hashlib
from pathlib import Path

FILES = ["public/intel.json", "public/attribution.json"]

for f in FILES:
    p = Path(f)
    if not p.exists():
        print(f"⚠  {f}: missing, skipping")
        continue
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    out = p.with_suffix(p.suffix + ".sha256")
    out.write_text(digest + "\n")
    print(f"✅ {out.name}: {digest[:16]}…")
