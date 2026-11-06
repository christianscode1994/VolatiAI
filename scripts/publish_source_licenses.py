"""Publish config/source_licenses.json to Worker KV."""
import json, subprocess, sys
from pathlib import Path

src = Path("config/source_licenses.json")
if not src.exists():
    sys.exit("✗ config/source_licenses.json not found")

data = json.loads(src.read_text())
# Strip REMOVED entries from published version
data = {k: v for k, v in data.items() if v.get("status") != "REMOVED"}
print(f"Publishing {len(data)} active sector entries to KV")

tmp = Path("/tmp/source_licenses_kv.json")
tmp.write_text(json.dumps(data))

cmd = [
    "npx", "wrangler", "kv", "key", "put",
    "source_licenses",
    "--path", str(tmp),
    "--namespace-id", "5a2afb46033e49dc8d2ddefac347ddb5",
    "--remote"
]

result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("stderr:", result.stderr)
    sys.exit(1)
print("✓ Published")
print("Test: curl https://sector-slow.fourieranalys.workers.dev/_sources | jq 'length'")
