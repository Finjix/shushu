"""Regression tests for asset conversion and the local preview server."""
import importlib.util
import tempfile
import threading
import unittest
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


preview = load_script("dev-server")


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.public = Path(self.temp.name)
        (self.public / "index.html").write_text("<body>hello</body>", encoding="utf-8")
        (self.public / "folder").mkdir()
        (self.public / "folder" / "index.html").write_text("<body>nested</body>", encoding="utf-8")
        patches = patch.object(preview, "PUBLIC", self.public)
        patches.start()
        self.addCleanup(patches.stop)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(preview.PreviewHandler, directory=str(self.public)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.port = self.server.server_address[1]

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, method="GET"):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_injection_head_and_no_source_changes(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"/__dev_revision", body)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual((self.public / "index.html").read_text(), "<body>hello</body>")
        status, headers, head = self.request("/", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(head, b"")
        self.assertEqual(int(headers["Content-Length"]), len(body))

    def test_directory_redirect(self):
        status, headers, _ = self.request("/folder?test=1")
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "/folder/?test=1")
        self.assertIn(b"/__dev_revision", self.request("/folder/")[2])

    def test_revision_changes_and_reuse_identification(self):
        url = f"http://127.0.0.1:{self.port}/"
        self.assertTrue(preview.preview_running(url))
        initial = self.request("/__dev_revision")[2]
        (self.public / "new.css").write_text("body {}")
        self.assertNotEqual(initial, self.request("/__dev_revision")[2])
        with patch.object(preview, "urlopen") as urlopen:
            response = urlopen.return_value.__enter__.return_value
            response.status = 200
            response.read.return_value = b"different-project"
            self.assertFalse(preview.preview_running(url))

    def test_port_conflict_does_not_stop_a_process(self):
        with patch("sys.argv", ["dev-server.py", "--open-browser"]), \
             patch.object(preview, "PreviewServer", side_effect=OSError("occupied")), \
             patch.object(preview, "preview_running", return_value=False), \
             patch.object(preview.webbrowser, "open") as open_browser:
            self.assertEqual(preview.main(), 1)
            open_browser.assert_not_called()

    def test_existing_preview_is_reused(self):
        with patch("sys.argv", ["dev-server.py", "--open-browser"]), \
             patch.object(preview, "PreviewServer", side_effect=OSError("occupied")), \
             patch.object(preview, "preview_running", return_value=True), \
             patch.object(preview.webbrowser, "open") as open_browser:
            self.assertEqual(preview.main(), 0)
            open_browser.assert_called_once_with("http://127.0.0.1:8000/")


if __name__ == "__main__":
    unittest.main()
