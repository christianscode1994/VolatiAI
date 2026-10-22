#!/usr/bin/env python3
"""doctor.py — one-command pipeline health check.

Aggregates the four audit scripts + latest briefing + git state into
a single status report. Run this before pushing, after pulling, or
whenever you want to know "is the pipeline OK?"

Exits:
  0 = healthy (may have warnings)
  1 = degraded (hard check failed)

Usage:
    python3 scripts/doctor.py
    python3 scripts/doctor.py --quiet   # failures only
"""
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
os.chdir(REPO_ROOT)

AUDITS = [
    ("Structural", "scripts/audit_sectors.py"),
    ("Compliance", "scripts/audit_licenses.py"),
    ("Health",     "scripts/audit_health.py"),
    ("Coverage",   "scripts/audit_coverage.py"),
]

BRIEFING = Path("docs/briefing.json")


def run_audit(script):
    try:
        r = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True, timeout=30,
        )
        return r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "timeout after 30s"
    except FileNotFoundError:
        return 1, "", f"script not found: {script}"


def extract(out, key):
    for line in out.split("\n"):
        if key in line:
            return line.strip()
    return ""


def extract_all(out, key):
    return [l.strip() for l in out.split("\n") if key in l]


def check_git():
    try:
        r = subprocess.run(
            ["git", "status", "--porcelain", "-b"],
            capture_output=True, text=True, timeout=5,
        )
        lines = r.stdout.strip().split("\n")
        if not lines or not lines[0]:
            return "unknown"
        head = lines[0]
        if "ahead" in head:
            n = head.split("ahead")[1].split("]")[0].split(",")[0].strip()
            return f"ahead by {n}"
        if "behind" in head:
            n = head.split("behind")[1].split("]")[0].strip()
            return f"behind by {n}"
        uncommitted = len(lines) - 1
        if uncommitted:
            return f"{uncommitted} uncommitted"
        return "clean"
    except Exception:
        return "unknown"


def get_briefing():
    if not BRIEFING.exists():
        return None
    try:
        return json.load(BRIEFING.open())
    except json.JSONDecodeError:
        return None


def main():
    quiet = "--quiet" in sys.argv

    if not quiet:
        print("VolatiAI Pipeline Doctor")
        print("=" * 56)

    hard_fail = False
    warnings = []

    for name, script in AUDITS:
        code, out, err = run_audit(script)
        if code != 0:
            hard_fail = True
            if not quiet:
                print(f"  ✗ {name:<12} FAIL (exit {code})")
                for line in (out + err).strip().split("\n")[-3:]:
                    if line.strip():
                        print(f"      {line.strip()[:100]}")
        else:
            if name == "Structural":
                active = extract(out, "active:")
                missing = extract(out, "active with NO")
                if not quiet:
                    print(f"  ✓ {name:<12} {active}")
                if "NO worker block: 0" not in missing:
                    warnings.append(missing)
            elif name == "Compliance":
                if not quiet:
                    print(f"  ✓ {name:<12} clean")
            elif name == "Health":
                red = extract_all(out, "[RED]")
                yl = extract_all(out, "[YELLOW]")
                if red:
                    hard_fail = True
                    if not quiet:
                        print(f"  ✗ {name:<12} {len(red)} critical")
                        for r in red:
                            print(f"      {r}")
                elif yl:
                    warnings.extend(yl)
                    if not quiet:
                        print(f"  ⚠ {name:<12} {len(yl)} warning(s)")
                        for w in yl[:3]:
                            print(f"      {w}")
                else:
                    if not quiet:
                        print(f"  ✓ {name:<12} fresh")
            elif name == "Coverage":
                broken = extract(out, "BROKEN")
                if not quiet:
                    print(f"  ✓ {name:<12} {broken}")

    # Git state
    git_state = check_git()
    if not quiet:
        print(f"  {'✓' if git_state == 'clean' else '⚠'} Git          {git_state}")

    # Briefing summary
    briefing = get_briefing()
    if briefing:
        ts = briefing.get("ts", "?")
        sigs = briefing.get("signals", [])
        stats = briefing.get("stats", {})
        if not quiet:
            print()
            print(f"  Briefing @ {ts}")
            print(f"  Signals: {len(sigs)}  ({stats.get('total_sectors', '?')} sectors · {stats.get('fire_rate_pct', '?')}% fire rate)")
            for sig in sigs[:5]:
                sector = sig.get("sector", "?")
                summ = (sig.get("summary") or "")[:60]
                print(f"    • {sector}: {summ}")
    else:
        warnings.append("briefing.json unreadable")
        if not quiet:
            print(f"  ⚠ Briefing    unavailable ({BRIEFING})")

    if not quiet:
        print()
        print("=" * 56)

    if hard_fail:
        print("Overall: DEGRADED — hard check failed")
        return 1
    elif warnings:
        print(f"Overall: HEALTHY ({len(warnings)} warning(s) — see above)")
        return 0
    else:
        print("Overall: HEALTHY")
        return 0


if __name__ == "__main__":
    sys.exit(main())
