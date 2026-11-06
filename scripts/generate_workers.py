#!/usr/bin/env python3
"""Generate sector workers from config/sectors.json"""

import json
import sys
from pathlib import Path

VALUE_TMPL = open("templates/value.js.tmpl").read()
EVENT_TMPL = open("templates/event.js.tmpl").read()


def build_worker(sector, cfg):
    tmpl = VALUE_TMPL if cfg["type"] == "value" else EVENT_TMPL

    collectors = ",\n      ".join(
        '{name}: await fetchSafe(async () => {{\n        {code}\n      }})'.format(name=name, code=code)
        for name, code in cfg["collectors"].items()
    )

    if cfg["type"] == "value":
        ctx_keys = cfg.get("context_keys", [])
        context = ",\n        ".join(
            '{k}: result.sources["{k}"] && result.sources["{k}"].ok ? result.sources["{k}"].data : null'.format(k=k)
            for k in ctx_keys
        ) if ctx_keys else ""
        js = (tmpl
              .replace("{{SECTOR}}", sector)
              .replace("{{DENSITY}}", cfg["density"])
              .replace("{{METRIC}}", cfg["metric"])
              .replace("{{THRESHOLD_PCT}}", str(cfg["threshold_pct"]))
              .replace("{{THRESHOLD_ABS}}", str(cfg["threshold_abs"]))
              .replace("{{WINDOW}}", cfg["window"])
              .replace("{{TTL}}", str(cfg["ttl"]))
              .replace("{{COLLECTORS}}", collectors)
              .replace("{{CONTEXT}}", context))
    else:
        js = (tmpl
              .replace("{{SECTOR}}", sector)
              .replace("{{EVENT_SOURCE}}", cfg["event_source"])
              .replace("{{TTL}}", str(cfg["ttl"]))
              .replace("{{COLLECTORS}}", collectors))

    worker_dir = Path("workers/sector-{}/src".format(sector))
    worker_dir.mkdir(parents=True, exist_ok=True)
    (worker_dir / "index.js").write_text(js)
    (worker_dir.parent / "wrangler.toml").write_text(
        'name = "sector-{}"\n'
        'account_id = "79ba1829ed66ef2a9aac49c430e11df1"\n'
        'main = "src/index.js"\n'
        'compatibility_date = "2024-10-01"\n\n'
        '[[kv_namespaces]]\n'
        'binding = "SECTOR_KV"\n'
        'id = "5a2afb46033e49dc8d2ddefac347ddb5"\n\n'
        '[vars]\n'
        'SECTOR_TEMPLATE = "{}"\n'.format(sector, cfg["density"])
    )
    print("OK sector-{} ({}, {} lines)".format(sector, cfg["density"], len(js.splitlines())))


def main():
    cfg_path = Path("config/sectors.json")
    if not cfg_path.exists():
        print("ERROR: {} saknas".format(cfg_path))
        sys.exit(1)

    config = json.loads(cfg_path.read_text())
    print("Generating {} workers from {}\n".format(len(config), cfg_path))

    for sector, cfg in config.items():
        try:
            build_worker(sector, cfg)
        except KeyError as e:
            print("ERROR {}: missing field {}".format(sector, e))
            sys.exit(1)

    print("\nDone. Deploy each with: cd workers/sector-X && wrangler deploy")


if __name__ == "__main__":
    main()
