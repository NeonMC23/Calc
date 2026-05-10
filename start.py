from __future__ import annotations

import argparse
import os
import threading
import webbrowser
from pathlib import Path

from backend.server import run
from port_manager import get_port, set_port


def main() -> None:
    parser = argparse.ArgumentParser(prog="calc", description="Local web server for Calc (UI + API)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Override the port (also updates port.json).",
    )
    parser.add_argument(
        "--api-only",
        action="store_true",
        help="Serve the API only.",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Do not auto-open the page in a browser.",
    )
    args = parser.parse_args()

    # Stable execution even if start.py is launched from another directory.
    project_root = Path(__file__).resolve().parent
    os.chdir(project_root)

    default_port = 5173
    if args.port is None:
        port = get_port(default=default_port)
    else:
        port = int(args.port)
        set_port(port)

    if not args.api_only and not args.no_open:
        url = f"http://{args.host}:{port}"
        # Open the browser after a short delay, so the server has time to start.
        threading.Timer(0.25, lambda: webbrowser.open(url, new=1)).start()

    run(host=args.host, port=port, serve_static=not args.api_only)


if __name__ == "__main__":
    main()
