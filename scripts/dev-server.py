"""Local static preview with automatic reload; production files stay untouched."""

import argparse
import hashlib
import io
import json
import os
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def revision():
    entries = []
    for path in sorted(PUBLIC.rglob("*")):
        try:
            if path.is_file():
                stat = path.stat()
                entries.append((str(path.relative_to(PUBLIC)), stat.st_mtime_ns, stat.st_size))
        except FileNotFoundError:
            pass  # Editors may replace a file while we scan.
    return hashlib.sha256(repr(entries).encode()).hexdigest()


def reload_script(current):
    return ("""<script>
(() => {
  const initial = INITIAL;
  let pending = null;
  async function check() {
    try {
      const response = await fetch('/__dev_revision', { cache: 'no-store' });
      if (response.ok) {
        const current = await response.text();
        if (current !== initial && current === pending) {
          location.reload();
          return;
        }
        pending = current;
      }
    } catch { /* Keep checking while the local server restarts. */ }
    setTimeout(check, 600);
  }
  setTimeout(check, 600);
})();
</script>""".replace("INITIAL", json.dumps(current))).encode()


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        route = urlsplit(self.path).path
        if route == "/__dev_revision":
            data = revision().encode()
            content_type = "text/plain; charset=utf-8"
        else:
            path = Path(self.translate_path(self.path))
            if path.is_dir():
                if not route.endswith("/"):
                    return super().send_head()  # Preserve redirects for relative asset URLs.
                path = path / "index.html"
            if not path.is_file() or path.suffix.lower() != ".html":
                return super().send_head()
            current = revision()
            data = path.read_bytes()
            script = reload_script(current)
            data = data.replace(b"</body>", script + b"</body>") if b"</body>" in data else data + script
            content_type = "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        return io.BytesIO(data)

    def log_message(self, format, *args):
        if urlsplit(self.path).path != "/__dev_revision":
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
    print(f"Preview with auto reload: {url}", flush=True)
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
