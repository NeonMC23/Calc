import json
import os

# port.json lives at the project root (same folder as this file).
PORT_FILE = "port.json"


def _safe_write_port(path, port):
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump({"port": port}, f)
    os.replace(tmp_path, path)


def get_port(default=5000):
    """
    Read the port from port.json or return the default.
    Creates port.json if it doesn't exist.
    If the file is missing/corrupted/invalid -> recreates it with the default.
    """
    if default is None:
        return None

    if not os.path.exists(PORT_FILE):
        _safe_write_port(PORT_FILE, default)
        return default

    try:
        with open(PORT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        port = int(data["port"])
        if not (1 <= port <= 65535):
            raise ValueError("port out of range")
        return port
    except (OSError, json.JSONDecodeError, KeyError, ValueError, TypeError):
        _safe_write_port(PORT_FILE, default)
        return default


def set_port(port):
    """Update port.json with the given port."""
    if port is None:
        return
    port = int(port)
    if not (1 <= port <= 65535):
        raise ValueError("port must be in 1..65535")
    _safe_write_port(PORT_FILE, port)

