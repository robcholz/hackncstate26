import json
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request as urllib_request


class RenderHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/v1/render":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(content_length)
        body = json.loads(payload.decode("utf-8"))

        if "url" not in body or "timeout" not in body:
            self.send_response(400)
            self.end_headers()
            return

        # Simulate per-request work so concurrency is measurable.
        time.sleep(0.1)

        response = json.dumps(
            {"status": "success", "data": {"image": "base64-image"}}
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, _format: str, *_args: object) -> None:
        return


class RendererConcurrencyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), RenderHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=1)

    def _post_render(self) -> tuple[int, dict]:
        data = json.dumps({"url": "http://apple.com", "timeout": 3000}).encode("utf-8")
        req = urllib_request.Request(
            f"http://127.0.0.1:{self.port}/api/v1/render",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib_request.urlopen(req, timeout=5) as resp:
            status = resp.status
            body = json.loads(resp.read().decode("utf-8"))
        return status, body

    def test_handles_concurrent_render_requests(self) -> None:
        request_count = 8

        started_at = time.perf_counter()
        with ThreadPoolExecutor(max_workers=request_count) as pool:
            results = list(
                pool.map(lambda _: self._post_render(), range(request_count))
            )
        elapsed = time.perf_counter() - started_at

        for status, body in results:
            self.assertEqual(status, 200)
            self.assertEqual(body.get("status"), "success")
            self.assertIn("data", body)
            self.assertIn("image", body["data"])

        # Sequentially this would take around request_count * 0.1 seconds.
        self.assertLess(elapsed, 0.5)


if __name__ == "__main__":
    unittest.main()
