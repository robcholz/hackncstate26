import base64
import os
import queue
import threading

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from playwright.sync_api import sync_playwright


app = FastAPI()

# job queue
jobs = queue.Queue()
worker_bootstrap_lock = threading.Lock()
workers_started = False


class Item(BaseModel):
    url: str
    timeout: int = 30000


def require_auth(authorization: str | None) -> None:
    expected = os.environ.get("WEBSITE_RENDERER_TOKEN", "").strip()
    if not expected:
        raise HTTPException(
            status_code=500, detail="WEBSITE_RENDERER_TOKEN is not configured"
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="Bearer token mismatch")


@app.post("/api/v1/render")
def take_screenshot(item: Item, authorization: str | None = Header(default=None)):
    require_auth(authorization)

    # each request gets its own result queue
    result_queue = queue.Queue(maxsize=1)

    jobs.put({"url": item.url, "timeout": item.timeout, "result_queue": result_queue})

    # wait for worker result
    result = result_queue.get()
    if isinstance(result, dict) and result.get("status") == "error":
        raise HTTPException(
            status_code=502, detail=result.get("message", "Render failed")
        )

    return {"status": "success", "data": {"image": result}}


def worker():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        while True:
            job = jobs.get()  # blocks until job exists

            try:
                page.goto(job["url"], timeout=job["timeout"])
                screenshot = page.screenshot()

                encoded = base64.b64encode(screenshot).decode()
                job["result_queue"].put(encoded)

            except Exception as e:
                job["result_queue"].put({"status": "error", "message": str(e)})


def main():
    global workers_started
    with worker_bootstrap_lock:
        if workers_started:
            return
        # start workers
        for _ in range(20):
            threading.Thread(target=worker, daemon=True).start()
        workers_started = True


@app.on_event("startup")
def startup():
    main()


if __name__ == "__main__":
    import uvicorn

    main()
    uvicorn.run(app, host="0.0.0.0", port=8000)
