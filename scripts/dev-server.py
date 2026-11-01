"""Local static preview with CSS HMR and state-preserving reload."""

import argparse
import hashlib
import io
import json
import os
import re
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def manifest():
    files = {}
    for path in sorted(PUBLIC.rglob("*")):
        try:
            if path.is_file():
                stat = path.stat()
                files[path.relative_to(PUBLIC).as_posix()] = f"{stat.st_mtime_ns}:{stat.st_size}"
        except FileNotFoundError:
            pass  # Editors may replace a file while we scan.
    return {"revision": hashlib.sha256(repr(files).encode()).hexdigest(), "files": files}


def revision():
    return manifest()["revision"]


def reload_script(current):
    # Escape '<' so even unusual asset filenames cannot end the script element.
    config = json.dumps(current).replace("<", "\\u003c")
    return (f'<script>window.__finjixDevPreview = {config};</script>'
            '<script src="/__dev_client.js"></script>').encode()


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_file(self, path):
        """Stream real byte ranges so browsers can seek without downloading a video first."""
        try:
            source = path.open("rb")
        except OSError:
            return super().send_head()
        stat = os.fstat(source.fileno())
        size = stat.st_size
        start, end = 0, size - 1
        # Unknown/invalid or multipart ranges may be ignored; If-Range falls back
        # to a complete response since we do not implement validator matching.
        requested = self.headers.get("Range", "") if not self.headers.get("If-Range") else ""
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
        partial = bool(match and any(match.groups()))
        if partial:
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                start = max(0, size - int(last))
            if start > end or start >= size:
                source.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
        length = max(0, end - start + 1)
        source.seek(start)
        self._file_remaining = length
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        return source

    def copyfile(self, source, outputfile):
        remaining = self._file_remaining
        try:
            if remaining is None:
                return super().copyfile(source, outputfile)
            while remaining:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Browsers cancel old media requests when seeking or closing.

    def send_head(self):
        self._file_remaining = None
        route = urlsplit(self.path).path
        if route == "/__dev_revision":
            data = revision().encode()
            content_type = "text/plain; charset=utf-8"
        elif route == "/__dev_manifest":
            data = json.dumps(manifest()).encode()
            content_type = "application/json; charset=utf-8"
        elif route == "/__dev_client.js":
            data = Path(__file__).with_name("dev-client.js").read_bytes()
            content_type = "text/javascript; charset=utf-8"
        else:
            path = Path(self.translate_path(self.path))
            if path.is_dir():
                if not route.endswith("/"):
                    return super().send_head()  # Preserve redirects for relative asset URLs.
                path = path / "index.html"
            if not path.is_file():
                return super().send_head()
            if path.suffix.lower() != ".html":
                return self.send_file(path)
            data = path.read_bytes()
            # Only the main application needs HMR, not sandboxed playable HTML.
            if path.resolve() == (PUBLIC / "index.html").resolve():
                script = reload_script(manifest())
                data = data.replace(b"</body>", script + b"</body>") if b"</body>" in data else data + script
            content_type = "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        return io.BytesIO(data)

    def log_message(self, format, *args):
        if urlsplit(self.path).path not in {"/__dev_revision", "/__dev_manifest"}:
            super().log_message(format, *args)


class PreviewServer(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR can let two servers bind the same active port.
    allow_reuse_address = os.name != "nt"
    allow_reuse_port = False


def preview_running(url):
    """Only reuse this preview service, not an unrelated service on the port."""
    try:
        with urlopen(url + "__dev_revision", timeout=2) as response:
            return response.status == 200 and response.read(65).decode("ascii") == revision()
    except (OSError, URLError, UnicodeError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--open-browser", action="store_true")
    args = parser.parse_args()
    url = "http://127.0.0.1:8000/"
    try:
        server = PreviewServer(("127.0.0.1", 8000), partial(PreviewHandler, directory=str(PUBLIC)))
    except OSError as error:
        if args.open_browser and preview_running(url):
            print(f"Using existing preview: {url}", flush=True)
            webbrowser.open(url)
            return 0
        print(f"Could not start preview: {error}. Port 8000 may be occupied; no process was stopped.", flush=True)
        return 1
    print(f"Preview with CSS HMR and state-preserving reload: {url}", flush=True)
    if args.open_browser:
        timer = threading.Timer(0.5, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
