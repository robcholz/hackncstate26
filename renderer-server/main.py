import base64
import queue
import threading

from fastapi import FastAPI
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


@app.post("/api/v1/render")
def take_screenshot(item: Item):
    print("req")
    # each request gets its own result queue
    result_queue = queue.Queue(maxsize=1)

    jobs.put({"url": item.url, "timeout": item.timeout, "result_queue": result_queue})

    print("got url")

    # wait for worker result
    return {"image": result_queue.get()}


def worker():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        while True:
            job = jobs.get()  # blocks until job exists

            try:
                page.goto(job["url"], timeout=job["timeout"])
                screenshot = page.screenshot()
                page.screenshot(path="screenshot.png")

                encoded = base64.b64encode(screenshot).decode()
                job["result_queue"].put(encoded)

            except Exception as e:
                job["result_queue"].put(f"error: {e}")


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
