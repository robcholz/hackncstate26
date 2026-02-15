import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


API_URL = "http://localhost:3000/api/v1/render"
HAPPY_PAYLOAD = {"url": "https://google.com", "timeout": 3000}
SAD_PAYLOAD = {"url": "https://example.com", "timeout": 0}
OUTPUT_IMAGE_PATH = Path("e2e/output/e2e_render.png")


def post_json(payload: dict) -> tuple[int, dict]:
    req = Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def assert_happy_path() -> None:
    status, body = post_json(HAPPY_PAYLOAD)
    assert status == 200, f"expected 200, got {status}"
    assert body.get("status") == "success", f"unexpected status payload: {body}"
    data = body.get("data")
    assert isinstance(data, dict) and "image" in data, f"missing image payload: {body}"
    image = data["image"]
    assert isinstance(image, str) and image, "image is empty"
    raw_image = base64.b64decode(image)
    OUTPUT_IMAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_IMAGE_PATH.write_bytes(raw_image)


def assert_sad_path() -> None:
    status, body = post_json(SAD_PAYLOAD)
    assert status == 422, f"expected 422, got {status}"
    assert body.get("status") == "error", f"unexpected error payload: {body}"
    error = body.get("error")
    assert isinstance(error, dict), f"missing error object: {body}"
    assert error.get("code") == "invalid_request", f"unexpected error code: {body}"


def wait_for_service(max_seconds: int = 120) -> None:
    deadline = time.time() + max_seconds
    while time.time() < deadline:
        try:
            assert_happy_path()
            return
        except Exception:
            time.sleep(2)
    raise TimeoutError("stack did not become ready within timeout")


def main() -> None:
    wait_for_service()
    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(lambda _: assert_happy_path(), range(5)))
    assert_sad_path()
    print("E2E OK")


if __name__ == "__main__":
    main()
