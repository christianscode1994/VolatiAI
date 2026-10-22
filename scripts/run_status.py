#!/usr/bin/env python3
"""run_status.py — accurate workflow run status.

GitHub's top-level run status lags job-level status. This queries
both and shows the truth: run completed iff every job is completed
and none failed.

Usage:
    python3 scripts/run_status.py                # latest digest run
    python3 scripts/run_status.py --all          # all workflows
    python3 scripts/run_status.py <run-id>       # specific run
"""
import argparse
import json
import subprocess
import sys


def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return None
    return r.stdout


def latest_run(workflow="epistemic_digest.yml"):
    out = gh("run", "list", "--workflow", workflow, "--limit", "1",
             "--json", "databaseId,status,conclusion,headSha,createdAt")
    if not out:
        return None
    runs = json.loads(out)
    return runs[0] if runs else None


def job_detail(run_id):
    out = gh("run", "view", str(run_id), "--json", "jobs")
    if not out:
        return []
    jobs = json.loads(out).get("jobs", [])
    return [(j["name"], j["status"], j["conclusion"], j.get("startedAt", "")) for j in jobs]


def render(run_id, workflow_label=""):
    detail = job_detail(run_id)
    if not detail:
        print(f"  run {run_id}: could not fetch job detail")
        return

    print(f"  Run {run_id} {workflow_label}")
    all_complete = True
    any_failed = False
    for name, status, conclusion, started in detail:
        mark = "✓" if conclusion == "success" else ("✗" if conclusion == "failure" else "?")
        if status != "completed":
            all_complete = False
        if conclusion == "failure":
            any_failed = True
        started_short = started[11:19] if started else "—"
        print(f"    {mark} {name:<24} {status:<12} {conclusion or '—':<12} started {started_short}")

    if all_complete and not any_failed:
        print(f"  → Run complete (job-level). Top-level API may still say 'in_progress'.")
    elif all_complete and any_failed:
        print(f"  → Run complete with FAILURES.")
    else:
        print(f"  → Still running.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_id", nargs="?", help="specific run ID")
    ap.add_argument("--all", action="store_true", help="list all workflows")
    args = ap.parse_args()

    if args.run_id:
        render(args.run_id)
        return 0

    if args.all:
        out = gh("run", "list", "--limit", "5",
                 "--json", "databaseId,workflowName,status,conclusion")
        if not out:
            print("could not list runs")
            return 1
        for r in json.loads(out):
            print(f"  {r['databaseId']}  {r['workflowName']:<24}  "
                  f"{r['status']:<12}  {r['conclusion'] or '—'}")
        return 0

    run = latest_run()
    if not run:
        print("no runs found")
        return 1
    print(f"\nLatest run ({run['createdAt'][:19]}):\n")
    render(run["databaseId"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
