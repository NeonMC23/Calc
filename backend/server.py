from __future__ import annotations

import json
import mimetypes
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from .evaluator import EvalConfig, EvalError, evaluate, format_result


ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"


def _read_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0 or length > 32_768:
        raise ValueError("invalid length")
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


class CalcHandler(SimpleHTTPRequestHandler):
    server_version = "CalcHTTP/1.0"

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/api/eval":
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
            return

        try:
            data = _read_json(self)
        except Exception:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid JSON"})
            return

        expr = data.get("expr", "")
        angle_unit = (data.get("angleUnit") or "rad").lower()

        try:
            value = evaluate(expr, config=EvalConfig(angle_unit=angle_unit))
            self._send_json(HTTPStatus.OK, {"ok": True, "result": format_result(value)})
        except EvalError as e:
            self._send_json(HTTPStatus.OK, {"ok": False, "error": str(e)})

    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        clean = parsed.path.lstrip("/")
        if clean == "":
            clean = "index.html"

        target = (WEB_DIR / clean).resolve()
        if WEB_DIR not in target.parents and target != WEB_DIR:
            return str(WEB_DIR / "index.html")
        if target.is_dir():
            target = target / "index.html"
        return str(target)

    def end_headers(self) -> None:
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

    def guess_type(self, path: str) -> str:  # noqa: A003
        mime, _ = mimetypes.guess_type(path)
        return mime or "application/octet-stream"

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        # Silence default logging (frontend does its own error reporting).
        return


def run(host: str = "127.0.0.1", port: int = 5173, *, serve_static: bool = True) -> None:
    if serve_static:
        if not WEB_DIR.exists():
            raise RuntimeError(f"Web directory not found: {WEB_DIR}")
        os.chdir(str(WEB_DIR))
    httpd = ThreadingHTTPServer((host, port), CalcHandler)
    url = f"http://{host}:{port}"
    print(f"Calc started: {url}")
    print("Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    run()
