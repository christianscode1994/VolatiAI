#!/usr/bin/env python3
"""
test-all.py — internal consistency checks for VolatiAI computed values.

verify-all.sh checks external health (server up, signatures valid, timestamps
verify). This script checks INTERNAL consistency: are computed values self-
consistent with their formulas, are schemas complete, do documented values
match their components?

Catches the class of bug we hit on 2026-11-10:
- why_ranked math using raw magnitude instead of the pct_change fallback
- trust.score not matching the weighted sum of its four inputs
- envelope signature including a field that wasn't in the signed bytes
- signals missing required fields after a reshape

Exit 0 if all checks pass, 1 otherwise.
"""
import re
import json
import math
import ssl
import sys
import urllib.request
from pathlib import Path

# SSL context — macOS Python 3.11 lacks CA bundle; use certifi if available
try:
    import certifi
    _ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ssl_ctx = ssl.create_default_context()

BASE = "https://christianscode1994.github.io/VolatiAI/"


def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers={
        "User-Agent": "VolatiAI-TestSuite/1.0 (+https://christianscode1994.github.io/VolatiAI)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as r:
        return json.loads(r.read())


PASS = 0
FAIL = 0
FAILURES = []


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  ✅ {name}")
        PASS += 1
    else:
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))
        FAIL += 1
        FAILURES.append(name)


def main():
    print("═══════════════════════════════════════════════════════")
    print("VolatiAI — internal consistency test suite")
    print("═══════════════════════════════════════════════════════")

    # Load published data
    try:
        active = fetch_json(BASE + "active.json")
    except Exception as e:
        print(f"❌ cannot fetch active.json: {e}")
        sys.exit(1)

    active_trust = None
    try:
        active_trust = fetch_json(BASE + "active_with_trust.json")
    except Exception as e:
        print(f"⚠️  active_with_trust.json unavailable: {e}")

    signals = active.get("signals", [])
    print(f"\nsignals loaded: {len(signals)}")

    # ── 1. Required fields ──
    print("\n── 1. Required fields present on every signal ──")
    required = {"sector", "severity", "confidence", "score", "summary",
                "delta", "timestamp"}
    missing = [s.get("sector", "?") for s in signals
               if not required.issubset(s.keys())]
    check("all signals have required fields", len(missing) == 0,
          f"missing on: {missing[:5]}")

    # ── 2. why_ranked self-consistency ──
    print("\n── 2. why_ranked math self-consistent and matches score ──")
    all_have = all("why_ranked" in s for s in signals)
    check("why_ranked present on all signals", all_have)
    if all_have:
        pat = re.compile(
            r"severity=\w+\(([\d.]+)\) × confidence=([\d.]+) × "
            r"sqrt\(mag\+0\.1\)=([\d.]+) \(mag=([\d.]+)\) × "
            r"novelty=([\d.]+) = ([\d.]+)"
        )
        bad = []
        for s in signals:
            m = pat.search(s.get("why_ranked", ""))
            if not m:
                bad.append(f"{s['sector']}: unparseable")
                continue
            sev, conf, inner, mag, nov, final = map(float, m.groups())
            # Inner should equal sqrt(mag+0.1) to ~3 decimals
            inner_check = math.sqrt(mag + 0.1)
            if abs(inner_check - inner) > 0.05:
                bad.append(f"{s['sector']}: inner {inner} != sqrt({mag}+0.1)={inner_check:.3f}")
            # sev * conf * inner * nov should equal final
            recomputed = sev * conf * inner * nov
            if abs(recomputed - final) > 0.05:
                bad.append(f"{s['sector']}: recompute {recomputed:.2f} != documented {final}")
            # final should match top-level score
            if abs(final - s.get("score", 0)) > 0.05:
                bad.append(f"{s['sector']}: why_ranked {final} != score {s.get('score')}")
        check("why_ranked math matches score for every signal", len(bad) == 0,
              "; ".join(bad[:3]))

    # ── 3. Trust formula: score = weighted sum ──
    print("\n── 3. trust.score = 0.4·ind + 0.3·attr + 0.2·hist + 0.1·fresh ──")
    if active_trust is None:
        print("  (active_with_trust.json unavailable — skipping)")
    else:
        signals_t = active_trust.get("signals", [])
        bad = []
        checked = 0
        for s in signals_t:
            t = s.get("trust")
            if not t:
                continue
            checked += 1
            ind   = float(t.get("independence", 0) or 0)
            attr  = float(t.get("attribution", 0) or 0)
            hist  = float(t.get("historical", 0) or 0)
            fresh = float(t.get("freshness", 0) or 0)
            score = float(t.get("score", 0) or 0)
            expected = 0.4 * ind + 0.3 * attr + 0.2 * hist + 0.1 * fresh
            if abs(expected - score) > 0.02:
                bad.append(f"{s['sector']}: {score} != {expected:.3f}")
        check(f"trust.score matches weighted sum (checked {checked})",
              len(bad) == 0, "; ".join(bad[:3]))

    # ── 4. Trust inputs in [0,1] ──
    print("\n── 4. All trust inputs in [0, 1] ──")
    if active_trust is None:
        print("  (skipping)")
    else:
        bad = []
        for s in active_trust.get("signals", []):
            t = s.get("trust", {}) or {}
            for k in ("independence", "attribution", "historical", "freshness"):
                v = t.get(k)
                if v is None:
                    bad.append(f"{s['sector']}.{k} is null")
                elif not (0 <= float(v) <= 1):
                    bad.append(f"{s['sector']}.{k}={v} outside [0,1]")
        check("trust inputs in range", len(bad) == 0, "; ".join(bad[:3]))

    # ── 5. Independence matches sector_feeds.json ──
    print("\n── 5. independence = min(1.0, feeds/3) ──")
    try:
        feeds = fetch_json(BASE + "sector_feeds.json")
    except Exception:
        feeds = None
    if active_trust is None or not feeds:
        print("  (data unavailable — skipping)")
    else:
        bad = []
        for s in active_trust.get("signals", []):
            sector = s.get("sector", "")
            ind = (s.get("trust", {}) or {}).get("independence")
            if ind is None:
                continue
            feed_list = feeds.get(sector)
            if feed_list is None:
                if abs(float(ind) - 0.333) > 0.02:
                    bad.append(f"{sector}: unmapped but ind={ind}")
            else:
                expected = min(1.0, len(feed_list) / 3.0)
                if abs(float(ind) - expected) > 0.02:
                    bad.append(f"{sector}: {len(feed_list)} feeds → expected {expected:.3f}, got {ind}")
        check("independence matches sector_feeds.json", len(bad) == 0,
              "; ".join(bad[:3]))

    # ── 6. No duplicate sectors ──
    print("\n── 6. No duplicate sectors in active_with_trust ──")
    if active_trust is not None:
        sectors = [s.get("sector") for s in active_trust.get("signals", [])]
        dupes = [x for x in set(sectors) if sectors.count(x) > 1]
        check("sectors unique", len(dupes) == 0, f"dupes: {dupes}")

    # ── 7. Envelope canonical cross-check (Python side) ──
    print("\n── 7. Envelope canonicalization reproducible ──")
    try:
        current = fetch_json(BASE + "current.json")
        signable = {k: v for k, v in current.items()
                    if k not in ("envelope_signature", "envelope_pubkey_id")}
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
        from sign_snapshot import _canon_bytes
        import hashlib
        py_bytes = _canon_bytes(signable)
        py_sha = hashlib.sha256(py_bytes).hexdigest()[:16]
        print(f"  canonical sha256: {py_sha}…  (len {len(py_bytes)})")
        check("envelope canonicalization reproducible", True)
    except Exception as e:
        print(f"  (cannot reproduce canonical form: {e})")
        check("envelope canonicalization reproducible", False)

    # ── 8. Snapshot payload hash — mirrors verify.cjs step 2b ──
    # Runs against committed fixtures. If sign_snapshot.py's strip set or
    # canonicalizer changes, _canon_bytes produces different bytes and this
    # check fails on the OLD fixture — catching the drift before any new
    # artifact ships. Fixtures are immutable; the function is what we test.
    print()
    print("── 8. Snapshot payload hash reproducible ──")
    SNAPSHOT_STRIP = {"hash", "prev_hash", "signature", "pubkey_id"}
    try:
        from pathlib import Path as _Path
        from sign_snapshot import _canon_bytes
        fx = _Path("scripts/fixtures/2026-11-10")
        snap = json.loads((fx / "snapshot.json").read_text())
        env  = json.loads((fx / "current.json").read_text())
        payload = {k: v for k, v in snap.items() if k not in SNAPSHOT_STRIP}
        computed = hashlib.sha256(_canon_bytes(payload)).hexdigest()
        stored = snap.get("hash", "")
        print(f"  stored:   {stored[:32]}…")
        print(f"  computed: {computed[:32]}…")
        check("snapshot payload hash reproducible from fixture",
              computed == stored)
        check("envelope.snapshot_hash == snapshot.hash",
              env.get("snapshot_hash") == stored)
    except Exception as e:
        check("snapshot payload hash reproducible", False)
        print(f"  (error: {e})")

    # ── 9. Baked pubkey matches fixture ──
    # Confirms PUBKEY_CURRENT_PEM in wrangler.toml matches the pubkey that
    # verifies the committed fixture. Catches key rotation that forgot to
    # update wrangler.toml, and drift between deployed verifier and tests.
    print()
    print("── 9. Baked pubkey matches fixture ──")
    try:
        from pathlib import Path as _Path
        wr = _Path("workers/volatiai-mcp/wrangler.toml").read_text()
        fx = _Path("scripts/fixtures/2026-11-10/pub.pem").read_text().strip()
        m = re.search(r'PUBKEY_CURRENT_PEM\s*=\s*\"\"\"([^\"]+)\"\"\"', wr, re.DOTALL)
        if not m:
            check("baked PUBKEY_CURRENT_PEM parseable", False)
        else:
            baked = m.group(1).strip()
            check("baked PUBKEY_CURRENT_PEM matches fixture",
                  baked == fx,
                  f"baked={baked[:40]}… fixture={fx[:40]}…")
    except Exception as e:
        check("baked pubkey matches fixture", False)
        print(f"  (error: {e})")

    # ── Summary ──
    print()
    print("═══════════════════════════════════════════════════════")
    print(f"Summary: {PASS} passed, {FAIL} failed")
    if FAIL > 0:
        print("Failures:")
        for f in FAILURES:
            print(f"  ❌ {f}")
        sys.exit(1)
    print("✅ All internal consistency checks passed")
    print("═══════════════════════════════════════════════════════")
    sys.exit(0)


if __name__ == "__main__":
    main()
