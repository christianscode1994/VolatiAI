#!/usr/bin/env python3
"""Minimal HTTP API over classification data. Stdlib only.

Endpoints:
  GET /                       plain-text help
  GET /health                 {"status":"ok","total":N}
  GET /stats                  full distribution JSON
  GET /categories             ["developer", ...]
  GET /lookup/<sector>        {"sector":"x","category":"y"} or 404
  GET /by-cat/<category>      {"category":"x","sectors":[...]}
  GET /search?q=<substr>      {"query":"x","hits":[{"sector":...},...]}
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

JSON_PATH = Path("config/sector_categories_ollama.json")
HOST, PORT = "127.0.0.1", 8000


def load():
    return json.loads(JSON_PATH.read_text())


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send_json(self, status, obj):
        body = json.dumps(obj, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, status, text):
        body = text.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            u = urlparse(self.path)
            path = u.path.rstrip("/") or "/"
            qs = parse_qs(u.query)
            data = load()

            if path == "/":
                self._send_text(200, __doc__ or "no help")
            elif path == "/health":
                self._send_json(200, {"status": "ok", "total": len(data)})
            elif path == "/stats":
                from collections import Counter
                c = Counter(data.values())
                unknown = c.get("other", 0) + c.get("error", 0) + c.get("unclassified", 0)
                self._send_json(200, {
                    "total": len(data),
                    "categories": dict(c.most_common()),
                    "unknown": unknown,
                })
            elif path == "/categories":
                from collections import Counter
                self._send_json(200, sorted(Counter(data.values()).keys()))
            elif path.startswith("/lookup/"):
                sector = unquote(path[len("/lookup/"):])
                if not sector or "/" in sector or ".." in sector:
                    self._send_json(400, {"error": "invalid sector name"}); return
                if sector not in data:
                    self._send_json(404, {"error": "not found", "sector": sector}); return
                self._send_json(200, {"sector": sector, "category": data[sector]})
            elif path.startswith("/by-cat/"):
                cat = unquote(path[len("/by-cat/"):]).lower()
                if not cat.replace("-", "").replace("_", "").isalnum():
                    self._send_json(400, {"error": "invalid category"}); return
                hits = sorted(k for k, v in data.items() if v == cat)
                self._send_json(200, {"category": cat, "count": len(hits), "sectors": hits})
            elif path == "/search":
                q = (qs.get("q", [""])[0]).lower()
                if not q:
                    self._send_json(400, {"error": "missing ?q="}); return
                hits = [{"sector": k, "category": v}
                        for k, v in sorted(data.items()) if q in k.lower()]
                self._send_json(200, {"query": q, "count": len(hits), "hits": hits})
            else:
                self._send_json(404, {"error": "unknown path", "path": path})
        except Exception as e:
            self._send_json(500, {"error": str(e)})


def main():
    if not JSON_PATH.exists():
        print(f"missing: {JSON_PATH}", file=sys.stderr); sys.exit(1)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"serving {JSON_PATH} on http://{HOST}:{PORT}")
    print("  Ctrl+C to stop")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
