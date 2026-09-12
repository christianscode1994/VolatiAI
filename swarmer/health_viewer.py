import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from swarmer.health_dashboard import snapshot_health

def start_health_server(port=8080):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            health = snapshot_health()
            body = json.dumps(health, indent=2)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body.encode())

    server = HTTPServer(("0.0.0.0", port), Handler)
    server.serve_forever()
