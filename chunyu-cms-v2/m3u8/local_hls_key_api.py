# -*- coding: utf-8 -*-
"""
Local HLS server + Key API (no extra deps).

- Serves HLS files (m3u8/ts/jpg/json/txt) from --root (default: ./output)
- Serves AES-128 key from --key (default: ./enc.key) via:
    GET /keys/enc.key
  or token-protected:
    GET /keys/enc.key?token=YOURTOKEN
- Optional: rewrite m3u8 on-the-fly so EXT-X-KEY URI points to local key API
  (use --rewrite-key-uri)

Usage (PowerShell):
  python local_hls_key_api.py --root .\output --key .\enc.key --port 8080 --rewrite-key-uri

Then open in VLC:
  http://127.0.0.1:8080/hls/<asset_id>/<playlist_name>.m3u8
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

# HLS key tag regex
KEY_LINE_RE = re.compile(r'(#EXT-X-KEY:.*?URI=")([^"]+)(".*)', re.IGNORECASE)


def guess_type(path: str) -> str:
    ctype, _ = mimetypes.guess_type(path)
    return ctype or "application/octet-stream"


class HLSKeyHandler(SimpleHTTPRequestHandler):
    """
    Routes:
      /hls/<...>  -> static file from root
      /keys/enc.key -> key bytes (optional token check)
      /           -> simple index
    """

    server_version = "LocalHLSKeyAPI/1.0"

    def end_headers(self):
        # CORS (helps with hls.js in browser)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "":
            return self._serve_index()

        if path.startswith("/keys/enc.key"):
            return self._serve_key(parsed)

        if path.startswith("/hls/"):
            return self._serve_hls_file(parsed)

        self.send_error(404, "Not Found")

    def _serve_index(self):
        body = (
            "Local HLS + Key API is running.\n\n"
            "HLS files:\n"
            "  GET /hls/<asset_id>/<playlist>.m3u8\n\n"
            "Key API:\n"
            "  GET /keys/enc.key\n"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_key(self, parsed):
        qs = parse_qs(parsed.query or "")
        token = (qs.get("token") or [""])[0]

        required = self.server.required_token  # type: ignore[attr-defined]
        if required and token != required:
            self.send_error(403, "Forbidden: invalid token")
            return

        key_path: Path = self.server.key_path  # type: ignore[attr-defined]
        if not key_path.exists():
            self.send_error(500, f"Key file not found: {key_path}")
            return

        data = key_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _serve_hls_file(self, parsed):
        # Map /hls/... to <root>/...
        rel = unquote(parsed.path[len("/hls/"):]).lstrip("/")

        root: Path = self.server.root_dir  # type: ignore[attr-defined]
        full_path = (root / rel).resolve()

        # Security: prevent escaping root
        try:
            full_path.relative_to(root.resolve())
        except Exception:
            self.send_error(403, "Forbidden")
            return

        if not full_path.exists() or not full_path.is_file():
            self.send_error(404, f"File not found: {full_path}")
            return

        # If it's an m3u8 and rewrite enabled, rewrite EXT-X-KEY URI to local key endpoint
        rewrite = self.server.rewrite_key_uri  # type: ignore[attr-defined]
        if rewrite and full_path.suffix.lower() in [".m3u8"]:
            text = full_path.read_text(encoding="utf-8", errors="replace")
            key_uri = self.server.local_key_uri  # type: ignore[attr-defined]
            # Replace URI in key line(s)
            def _repl(m):
                return m.group(1) + key_uri + m.group(3)

            new_text = KEY_LINE_RE.sub(_repl, text)
            data = new_text.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.apple.mpegurl")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        # Otherwise, use SimpleHTTPRequestHandler static serving (supports Range)
        # Trick: change directory base for this request
        self.path = "/hls/" + rel  # keep for logs
        return self._send_file(full_path)

    def _send_file(self, full_path: Path):
        # Implement static serving with Range support by delegating to SimpleHTTPRequestHandler internals
        # We need a filesystem path - simplest: open and send ourselves with range handling
        # BUT Python's SimpleHTTPRequestHandler has range support via send_head() in newer versions.
        # We'll temporarily set self.path to a fake path and use translate_path override.
        self._full_path_override = full_path  # type: ignore[attr-defined]
        try:
            f = self.send_head()
            if f:
                try:
                    shutil_copyfileobj = getattr(__import__("shutil"), "copyfileobj")
                    shutil_copyfileobj(f, self.wfile)
                finally:
                    f.close()
        finally:
            delattr(self, "_full_path_override")

    def translate_path(self, path: str) -> str:
        # Override translate_path so send_head() serves our resolved full path
        if hasattr(self, "_full_path_override"):
            return str(getattr(self, "_full_path_override"))
        return super().translate_path(path)

    def guess_type(self, path: str) -> str:
        # Ensure correct mime for m3u8/ts
        if path.lower().endswith(".m3u8"):
            return "application/vnd.apple.mpegurl"
        if path.lower().endswith(".ts"):
            return "video/mp2t"
        return guess_type(path)


def main():
    ap = argparse.ArgumentParser("Local HLS server + Key API")
    ap.add_argument("--root", default="output", help="HLS root folder (default: ./output)")
    ap.add_argument("--key", default="enc.key", help="Path to enc.key (default: ./enc.key)")
    ap.add_argument("--host", default="127.0.0.1", help="Host (default: 127.0.0.1)")
    ap.add_argument("--port", type=int, default=8080, help="Port (default: 8080)")
    ap.add_argument("--token", default="", help="Optional token required for key API")
    ap.add_argument("--rewrite-key-uri", action="store_true",
                    help="Rewrite m3u8 EXT-X-KEY URI to local /keys/enc.key (recommended for local test)")
    args = ap.parse_args()

    root_dir = Path(args.root).resolve()
    key_path = Path(args.key).resolve()

    root_dir.mkdir(parents=True, exist_ok=True)
    if not key_path.exists():
        raise SystemExit(f"Key not found: {key_path}")

    httpd = ThreadingHTTPServer((args.host, args.port), HLSKeyHandler)
    httpd.root_dir = root_dir  # type: ignore[attr-defined]
    httpd.key_path = key_path  # type: ignore[attr-defined]
    httpd.required_token = args.token  # type: ignore[attr-defined]

    # local key URI for rewriting
    if args.token:
        local_key_uri = f"http://{args.host}:{args.port}/keys/enc.key?token={args.token}"
    else:
        local_key_uri = f"http://{args.host}:{args.port}/keys/enc.key"
    httpd.local_key_uri = local_key_uri  # type: ignore[attr-defined]
    httpd.rewrite_key_uri = bool(args.rewrite_key_uri)  # type: ignore[attr-defined]

    print("Local HLS + Key API running")
    print(f"  Root: {root_dir}")
    print(f"  Key : {key_path}")
    print(f"  Key URL (local): {local_key_uri}")
    print(f"  Rewrite m3u8 key URI: {args.rewrite_key_uri}")
    print("")
    print("Play URL format:")
    print("  http://127.0.0.1:8080/hls/<asset_id>/<playlist>.m3u8")
    print("")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
