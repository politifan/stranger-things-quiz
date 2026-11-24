import json
import mimetypes
import os
from pathlib import Path
from threading import Lock
from time import monotonic
from urllib.error import URLError
from urllib.request import Request as ApiRequest, urlopen

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

ROOT = Path(__file__).resolve().parent
QUIZ = json.loads((ROOT / "quiz.json").read_text(encoding="utf-8"))
mimetypes.add_type("image/webp", ".webp")
app = FastAPI(title="Хокинс · Психологический портрет")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
templates = Jinja2Templates(directory=ROOT / "templates")

SETTINGS = {
    key: os.getenv(key, "").strip()
    for key in ("SITE_ANNOUNCEMENT", "SITE_EVENT", "SITE_RESULT_NOTE", "SITE_CONTACT")
}
SHOW_ID = os.getenv("TVMAZE_SHOW_ID", "").strip()
TVMAZE_ENABLED = SHOW_ID.isascii() and SHOW_ID.isdecimal() and 0 < len(SHOW_ID) <= 9
show_lock = Lock()
show_expires = 0.0
show_cache = None


@app.get("/", response_class=HTMLResponse)
def homepage(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"quiz": QUIZ, "settings": SETTINGS, "show_enabled": TVMAZE_ENABLED},
    )


@app.get("/api/show")
def show_metadata():
    global show_cache, show_expires
    if not TVMAZE_ENABLED:
        return {"available": False}

    with show_lock:
        if monotonic() < show_expires:
            return show_cache

        show_cache = {"available": False}
        show_expires = monotonic() + 60
        try:
            request = ApiRequest(
                f"https://api.tvmaze.com/shows/{int(SHOW_ID)}",
                headers={"User-Agent": "HawkinsPersonalityQuiz/1.0"},
            )
            with urlopen(request, timeout=3) as response:
                payload = json.loads(response.read(262_144))
            show_cache = {
                "available": True,
                "name": payload["name"],
                "premiered": payload.get("premiered"),
                "rating": payload.get("rating", {}).get("average"),
                "url": f"https://www.tvmaze.com/shows/{int(SHOW_ID)}",
            }
            show_expires = monotonic() + 3600
        except (URLError, TimeoutError, ValueError, TypeError, KeyError, AttributeError):
            pass

        return show_cache
