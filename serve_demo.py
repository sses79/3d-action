#!/usr/bin/env python3
"""Serve the demos and explicit public assets; never expose source or keys."""

import argparse
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

DEMO = Path(__file__).resolve().with_name("index.html")
PUBLIC_CA = None
WATCH = DEMO.parent / "watch"
WATCH_FILES = {
    "index.html": "text/html; charset=utf-8",
    "style.css": "text/css; charset=utf-8",
    "app.js": "text/javascript; charset=utf-8",
    "assets/watch.glb": "model/gltf-binary",
}
EDITOR = DEMO.parent / "editor"
EDITOR_FILES = {
    "index.html": "text/html; charset=utf-8",
    "style.css": "text/css; charset=utf-8",
    "app.js": "text/javascript; charset=utf-8",
    "assets/character.glb": "model/gltf-binary",
}


class DemoHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.respond(send_body=True)

    def do_HEAD(self):
        self.respond(send_body=False)

    def respond(self, send_body):
        route = urlsplit(self.path).path
        if route in ("/watch", "/editor"):
            self.send_response(308)
            self.send_header("Location", route + "/")
            self.end_headers()
            return
        if route in ("/", "/index.html"):
            source = DEMO
            content_type = "text/html; charset=utf-8"
        elif route in ("/watch", "/watch/"):
            source = WATCH / "index.html"
            content_type = WATCH_FILES["index.html"]
        elif route.startswith("/watch/") and route[7:] in WATCH_FILES:
            source = WATCH / route[7:]
            content_type = WATCH_FILES[route[7:]]
        elif route == "/editor/":
            source = EDITOR / "index.html"
            content_type = EDITOR_FILES["index.html"]
        elif route.startswith("/editor/") and route[8:] in EDITOR_FILES:
            source = EDITOR / route[8:]
            content_type = EDITOR_FILES[route[8:]]
        elif route == "/citrus-local-ca.cer" and PUBLIC_CA:
            source = PUBLIC_CA
            content_type = "application/x-x509-ca-cert"
        else:
            self.send_error(404, "Only the demo is available")
            return
        try:
            content = source.read_bytes()
        except OSError:
            self.send_error(503, "The demo file is unavailable")
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if send_body:
            self.wfile.write(content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--cert", type=Path, help="TLS server certificate")
    parser.add_argument("--key", type=Path, help="TLS server private key")
    parser.add_argument("--ca-cert", type=Path, help="Optional public CA certificate download")
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("--cert and --key must be supplied together")
    PUBLIC_CA = args.ca_cert
    with ThreadingHTTPServer((args.host, args.port), DemoHandler) as server:
        scheme = "http"
        if args.cert:
            tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            tls.minimum_version = ssl.TLSVersion.TLSv1_2
            tls.load_cert_chain(args.cert, args.key)
            server.socket = tls.wrap_socket(server.socket, server_side=True)
            scheme = "https"
        print(f"Demo only: {scheme}://{args.host}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
