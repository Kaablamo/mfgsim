"""
PyInstaller entry point.

Launcher mode:
- if the local MfgSim server is already healthy, open the browser and exit
- otherwise start a detached server process, wait for readiness, then open
  the browser and exit

Server mode:
- run the FastAPI/Uvicorn app on localhost until the user shuts it down from
  the UI or terminates the process
"""
from __future__ import annotations

import multiprocessing
import os
import subprocess
import sys
import time
import webbrowser
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}"
HEALTH_URL = f"{BASE_URL}/api/system/health"
SERVER_MODE_FLAG = "--server"
STARTUP_TIMEOUT_SECONDS = 20.0
POLL_INTERVAL_SECONDS = 0.2


def _prepare_stdio() -> None:
    # PyInstaller windowed builds (console=False) set sys.stdout/stderr to None.
    # Redirect to devnull so libraries that call stream.isatty() do not crash.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")


def _prepare_import_path() -> None:
    if getattr(sys, "frozen", False):
        sys.path.insert(0, sys._MEIPASS)  # type: ignore[attr-defined]
    else:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _show_error(message: str) -> None:
    if os.name == "nt":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(0, message, "MfgSim", 0x10)
            return
        except Exception:
            pass
    print(message, file=sys.stderr)


def _is_server_healthy(timeout_seconds: float = 0.5) -> bool:
    try:
        with urlopen(HEALTH_URL, timeout=timeout_seconds) as response:
            return response.status == 200
    except (HTTPError, URLError, OSError):
        return False


def _child_process_kwargs() -> dict[str, object]:
    kwargs: dict[str, object] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if os.name == "nt":
        kwargs["creationflags"] = (
            getattr(subprocess, "DETACHED_PROCESS", 0)
            | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            | getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
    else:
        kwargs["start_new_session"] = True
    return kwargs


def _spawn_server_process() -> subprocess.Popen[bytes]:
    if getattr(sys, "frozen", False):
        cmd = [sys.executable, SERVER_MODE_FLAG]
    else:
        cmd = [sys.executable, os.path.abspath(__file__), SERVER_MODE_FLAG]
    return subprocess.Popen(cmd, **_child_process_kwargs())


def _wait_for_server_ready(timeout_seconds: float = STARTUP_TIMEOUT_SECONDS) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if _is_server_healthy():
            return True
        time.sleep(POLL_INTERVAL_SECONDS)
    return False


def _terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=2)
    except Exception:
        pass


def _run_server() -> None:
    _prepare_stdio()
    _prepare_import_path()

    import uvicorn

    from app.main import create_app

    app = create_app()
    server = None

    def request_shutdown() -> None:
        if server is not None:
            server.should_exit = True

    app.state.shutdown_handler = request_shutdown

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=PORT,
        reload=False,
        log_level="warning",
        log_config=None,
    )
    server = uvicorn.Server(config)
    server.run()


def main() -> None:
    multiprocessing.freeze_support()
    _prepare_stdio()

    if SERVER_MODE_FLAG in sys.argv[1:]:
        _run_server()
        return

    if _is_server_healthy():
        webbrowser.open(BASE_URL)
        return

    process = _spawn_server_process()
    if _wait_for_server_ready():
        webbrowser.open(BASE_URL)
        return

    exit_code = process.poll()
    _terminate_process(process)
    detail = f" (exit code {exit_code})" if exit_code is not None else ""
    _show_error(
        "MfgSim could not start the local server."
        f"{detail} Close any process already using port {PORT} and try again."
    )


if __name__ == "__main__":
    main()
