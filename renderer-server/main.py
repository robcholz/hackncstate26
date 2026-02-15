import base64
import queue
import threading

from fastapi import FastAPI
from pydantic import BaseModel
from playwright.sync_api import sync_playwright


app = FastAPI()

# job queue
jobs = queue.Queue()


class Item(BaseModel):
    url: str
    timeout: int = 30000


@app.post("/api/v1/render")
def take_screenshot(item: Item):
    # each request gets its own result queue
    result_queue = queue.Queue(maxsize=1)

    jobs.put({
        "url": item.url,
        "timeout": item.timeout,
        "result_queue": result_queue
    })

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

                encoded = base64.b64encode(screenshot).decode()
                job["result_queue"].put(encoded)

            except Exception as e:
                job["result_queue"].put(f"error: {e}")


# start workers
for _ in range(4):
    threading.Thread(target=worker, daemon=True).start()
