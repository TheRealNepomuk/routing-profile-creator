#!/usr/bin/env python3
"""Dev server for the layout editor.

Serves the whole site (so the editor can embed index.html as a live preview) and stores the
layout you build in dev/layout.json.

    python3 dev/server.py            # http://localhost:8001/dev/editor.html
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAYOUT = ROOT / "dev" / "layout.json"
API = "/dev/api/layout"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8001


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always the latest code while editing
        super().end_headers()

    def _json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == API:
            if LAYOUT.exists():
                return self._json(200, json.loads(LAYOUT.read_text()))
            return self._json(404, {"error": "no saved layout"})
        return super().do_GET()

    def do_POST(self):
        if self.path != API:
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", 0))
        if n > 1_000_000:
            return self._json(413, {"error": "too large"})
        try:
            layout = json.loads(self.rfile.read(n))
            assert isinstance(layout, dict) and isinstance(layout.get("sections"), list)
        except Exception:
            return self._json(400, {"error": "invalid layout"})
        LAYOUT.write_text(json.dumps(layout, indent=2, ensure_ascii=False) + "\n")
        return self._json(200, {"saved": str(LAYOUT.relative_to(ROOT))})

    def do_DELETE(self):
        if self.path != API:
            return self._json(404, {"error": "not found"})
        LAYOUT.unlink(missing_ok=True)
        return self._json(200, {"deleted": True})

    def log_message(self, fmt, *args):
        if self.command != "GET" or self.path == API:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"Layout editor: http://localhost:{PORT}/dev/editor.html", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
