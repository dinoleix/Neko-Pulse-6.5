"""
Neko Pulse — Table Monitor Backend
===================================
Monitors cafe tables via RTSP camera streams or desktop screen regions.
Uses OpenCV MOG2 motion detection to detect customer departures,
then calls Gemini Vision to check for dirty dishes/cups.
Writes table state and alerts to Firestore in real time.

Setup:
  1. pip install -r requirements_monitor.txt
  2. Place firebase-service-account.json at this directory
  3. Copy table_monitor_config.example.json to table_monitor_config.local.json
  4. Edit the local config with your camera IPs and credentials
  5. Run: GEMINI_API_KEY=... python table_monitor.py
"""

import cv2
import os
import json
import base64
import time
import threading
import logging
from enum import Enum
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import firebase_admin
from firebase_admin import credentials, firestore

import google.generativeai as genai

try:
    import mss
except ImportError:
    mss = None

# =============================================================================
# CONFIGURATION
# =============================================================================

DEFAULT_TABLES = [
    {
        "tableId": "T1",
        "tableName": "Window Table 1",
        "outletId": "NEKO_MG",
        "sourceType": "RTSP",
        "rtspUrl": "rtsp://192.168.1.101:554/live",
        "cameraType": "XIAOMI",
    },
    # Ezykam example — try these URL formats in order until one works:
    # rtsp://admin:[password]@[ip]:554/Streaming/Channels/101  (most common)
    # rtsp://admin:[password]@[ip]:554/Streaming/Channels/102  (sub stream)
    # rtsp://admin:[password]@[ip]:554/live/ch0
    # rtsp://admin:[password]@[ip]:554/h264/ch1/main/av_stream
    {
        "tableId": "T2",
        "tableName": "Counter Table 2",
        "outletId": "NEKO_MG",
        "sourceType": "RTSP",
        "rtspUrl": "rtsp://admin:YOUR_PASSWORD@192.168.1.110:554/Streaming/Channels/101",
        "cameraType": "EZYKAM",
    },
    {
        "tableId": "T3",
        "tableName": "Desktop Client Crop",
        "outletId": "NEKO_MG",
        "sourceType": "SCREEN",
        "cameraType": "EZYKAM",
        "screenRegion": {"x": 100, "y": 200, "width": 640, "height": 360},
    },
]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
FIREBASE_CREDS_PATH = os.environ.get("FIREBASE_CREDS_PATH", "./firebase-service-account.json")
TABLE_MONITOR_CONFIG_PATH = os.environ.get("TABLE_MONITOR_CONFIG", "./table_monitor_config.local.json")

# How many minutes a table must stay DIRTY before an alert fires
DIRTY_ALERT_THRESHOLD_MINUTES = 3
# Seconds of no motion after occupancy before we suspect the table is dirty
MOTION_STILLNESS_SECONDS = 60
# Sample a frame from each camera every N seconds
FRAME_SAMPLE_INTERVAL = 2
# Motion score (0.0–1.0) above which a table is considered occupied
OCCUPIED_THRESHOLD = 0.02
# Motion score below which a table is considered empty/still
EMPTY_THRESHOLD = 0.008
# Minimum seconds a table must have been occupied before triggering dirty check
MIN_OCCUPANCY_SECONDS = 30
# Gemini rescan interval while a table is DIRTY or ALERT_SENT (seconds)
RESCAN_INTERVAL_SECONDS = 90


def load_tables() -> list[dict]:
    if os.path.exists(TABLE_MONITOR_CONFIG_PATH):
        with open(TABLE_MONITOR_CONFIG_PATH, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        tables = config.get("tables", [])
        if not tables:
            raise ValueError(f"{TABLE_MONITOR_CONFIG_PATH} must contain a non-empty tables array")
        return tables

    logging.getLogger("config").warning(
        "No %s found; using built-in example camera config", TABLE_MONITOR_CONFIG_PATH
    )
    return DEFAULT_TABLES

# =============================================================================
# GEMINI PROMPT
# =============================================================================

DIRTY_CHECK_PROMPT = (
    "Look at this cafe table. Are there any dirty dishes, cups, food waste, "
    "or used items left on the table that need to be cleared by staff? "
    "Answer with just YES or NO, then one sentence explaining what you see."
)

# =============================================================================
# LOGGING
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

# =============================================================================
# FIRESTORE WRITER
# =============================================================================

class FirestoreWriter:
    def __init__(self, db):
        self._db = db
        self._log = logging.getLogger("FirestoreWriter")

    def upsert_table_state(self, outlet_id: str, table_id: str, data: dict):
        doc_id = f"{outlet_id}_{table_id}"
        data["lastUpdatedAt"] = firestore.SERVER_TIMESTAMP
        self._db.collection("tableMonitoring").document(doc_id).set(data, merge=True)
        self._log.debug("upsert %s → %s", doc_id, data.get("state"))

    def create_alert(self, outlet_id: str, table_id: str, table_name: str,
                     gemini_reason: str, dirty_since_minutes: float) -> str:
        alert_ref = self._db.collection("tableAlerts").document()
        alert_data = {
            "alertId": alert_ref.id,
            "tableId": table_id,
            "tableName": table_name,
            "outletId": outlet_id,
            "status": "ACTIVE",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "acknowledgedAt": None,
            "acknowledgedBy": None,
            "clearedAt": None,
            "autoCleared": False,
            "geminiReason": gemini_reason,
            "dirtySinceMinutes": round(dirty_since_minutes, 1),
        }
        alert_ref.set(alert_data)
        doc_id = f"{outlet_id}_{table_id}"
        self._db.collection("tableMonitoring").document(doc_id).update(
            {"activeAlertId": alert_ref.id, "state": "ALERT_SENT",
             "lastUpdatedAt": firestore.SERVER_TIMESTAMP}
        )
        self._log.info("ALERT created for %s_%s (%.1f min dirty)", outlet_id, table_id, dirty_since_minutes)
        return alert_ref.id

    def resolve_alert(self, alert_id: str, method: str):
        self._db.collection("tableAlerts").document(alert_id).update({
            "status": "AUTO_CLEARED",
            "autoCleared": True,
            "clearedAt": firestore.SERVER_TIMESTAMP,
        })
        self._log.info("Alert %s resolved (%s)", alert_id, method)

    def get_alert_threshold(self, outlet_id: str) -> int:
        doc = self._db.collection("settings").document("tableMonitorConfig").get()
        if doc.exists:
            return doc.to_dict().get("alertThresholdMinutes", DIRTY_ALERT_THRESHOLD_MINUTES)
        return DIRTY_ALERT_THRESHOLD_MINUTES


# =============================================================================
# GEMINI ANALYZER  (singleton with simple token bucket)
# =============================================================================

class GeminiAnalyzer:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init()
        return cls._instance

    def _init(self):
        genai.configure(api_key=GEMINI_API_KEY)
        self._model = genai.GenerativeModel("gemini-2.0-flash")
        self._log = logging.getLogger("GeminiAnalyzer")
        # Token bucket: max 10 calls per 60 seconds
        self._tokens = 10
        self._last_refill = time.monotonic()
        self._bucket_lock = threading.Lock()

    def _acquire_token(self):
        while True:
            with self._bucket_lock:
                now = time.monotonic()
                elapsed = now - self._last_refill
                refill = int(elapsed / 6)  # 1 token per 6s = 10/min
                if refill > 0:
                    self._tokens = min(10, self._tokens + refill)
                    self._last_refill = now
                if self._tokens > 0:
                    self._tokens -= 1
                    return
            time.sleep(1)

    def analyze_frame(self, frame_bgr) -> tuple[bool, str]:
        self._acquire_token()
        _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
        b64 = base64.b64encode(buf.tobytes()).decode()
        try:
            response = self._model.generate_content([
                DIRTY_CHECK_PROMPT,
                {"mime_type": "image/jpeg", "data": b64},
            ])
            text = response.text.strip()
            is_dirty = text.upper().startswith("YES")
            reason = text[4:].strip() if len(text) > 4 else text
            self._log.info("Gemini → dirty=%s  reason=%s", is_dirty, reason[:80])
            return is_dirty, reason
        except Exception as e:
            self._log.warning("Gemini call failed: %s", e)
            raise


# =============================================================================
# TABLE STATE MACHINE
# =============================================================================

class TableState(Enum):
    EMPTY             = "EMPTY"
    OCCUPIED          = "OCCUPIED"
    POTENTIALLY_DIRTY = "POTENTIALLY_DIRTY"
    DIRTY             = "DIRTY"
    ALERT_SENT        = "ALERT_SENT"


class TableMonitor:
    def __init__(self, config: dict, writer: FirestoreWriter):
        self._cfg = config
        self._writer = writer
        self._gemini = GeminiAnalyzer()
        self._log = logging.getLogger(f"Table[{config['tableId']}]")
        self._source_type = self._cfg.get("sourceType", "RTSP").upper()
        self._screen_capture = None

        self._state = TableState.EMPTY
        self._occupied_since: float | None = None
        self._still_since: float | None = None
        self._dirty_since: float | None = None
        self._active_alert_id: str | None = None
        self._last_rescan: float = 0.0
        self._last_frame = None

        self._bg_sub = cv2.createBackgroundSubtractorMOG2(
            history=200, varThreshold=50, detectShadows=False
        )

        # Push initial state to Firestore
        self._writer.upsert_table_state(
            self._cfg["outletId"], self._cfg["tableId"],
            {
                "tableId": self._cfg["tableId"],
                "tableName": self._cfg["tableName"],
                "outletId": self._cfg["outletId"],
                "sourceType": self._source_type,
                "rtspUrl": self._cfg.get("rtspUrl", ""),
                "screenRegion": self._cfg.get("screenRegion"),
                "cameraType": self._cfg.get("cameraType", "EZYKAM"),
                "state": "EMPTY",
                "occupiedSince": None,
                "dirtySince": None,
                "lastGeminiReason": "",
                "lastGeminiAt": None,
                "activeAlertId": None,
                "isActive": True,
            }
        )

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run(self):
        if self._source_type == "SCREEN":
            self._run_screen()
            return

        self._log.info("Starting RTSP monitor → %s", self._cfg["rtspUrl"])
        while True:
            cap = self._open_capture()
            if cap is None:
                time.sleep(10)
                continue
            try:
                self._loop(cap)
            except Exception as e:
                self._log.error("Stream error: %s — reconnecting in 5s", e)
                time.sleep(5)
            finally:
                cap.release()

    def _run_screen(self):
        if mss is None:
            raise RuntimeError("SCREEN sourceType requires mss. Run: pip install -r requirements_monitor.txt")
        if not self._cfg.get("screenRegion"):
            raise ValueError(f"{self._cfg['tableId']} sourceType SCREEN requires screenRegion")

        self._screen_capture = mss.mss()
        self._log.info("Starting SCREEN monitor → %s", self._cfg["screenRegion"])
        while True:
            try:
                frame = self._capture_screen_frame()
                self._last_frame = frame
                score = self._compute_motion_score(frame)
                self._drive_state_machine(score)
            except Exception as e:
                self._log.error("Screen capture error: %s", e)
                time.sleep(5)
            time.sleep(FRAME_SAMPLE_INTERVAL)

    def _capture_screen_frame(self):
        region = self._cfg["screenRegion"]
        monitor = {
            "left": int(region["x"]),
            "top": int(region["y"]),
            "width": int(region["width"]),
            "height": int(region["height"]),
        }
        raw = np.array(self._screen_capture.grab(monitor))
        return cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)

    def _open_capture(self):
        cap = cv2.VideoCapture(self._cfg["rtspUrl"])
        if not cap.isOpened():
            self._log.warning("Cannot open RTSP stream, will retry")
            return None
        self._log.info("Stream connected")
        return cap

    def _loop(self, cap):
        while True:
            ret, frame = cap.read()
            if not ret:
                self._log.warning("Frame read failed — stream may have dropped")
                break

            self._last_frame = frame
            score = self._compute_motion_score(frame)
            self._drive_state_machine(score)
            time.sleep(FRAME_SAMPLE_INTERVAL)

    # ------------------------------------------------------------------
    # Motion detection
    # ------------------------------------------------------------------

    def _compute_motion_score(self, frame) -> float:
        small = cv2.resize(frame, (320, 240))
        mask = self._bg_sub.apply(small)
        non_zero = cv2.countNonZero(mask)
        return non_zero / (320 * 240)

    # ------------------------------------------------------------------
    # State machine driver
    # ------------------------------------------------------------------

    def _drive_state_machine(self, motion_score: float):
        now = time.monotonic()

        if self._state == TableState.EMPTY:
            if motion_score > OCCUPIED_THRESHOLD:
                self._transition(TableState.OCCUPIED)

        elif self._state == TableState.OCCUPIED:
            if motion_score < EMPTY_THRESHOLD:
                if self._still_since is None:
                    self._still_since = now
                elif (now - self._still_since) >= MOTION_STILLNESS_SECONDS:
                    occupied_duration = (now - self._occupied_since) if self._occupied_since else 0
                    if occupied_duration >= MIN_OCCUPANCY_SECONDS:
                        self._transition(TableState.POTENTIALLY_DIRTY)
                    else:
                        self._transition(TableState.EMPTY)
            else:
                self._still_since = None  # reset stillness timer on motion

        elif self._state == TableState.POTENTIALLY_DIRTY:
            self._analyze_and_transition()

        elif self._state in (TableState.DIRTY, TableState.ALERT_SENT):
            # Check if alert threshold exceeded
            if self._state == TableState.DIRTY and self._dirty_since:
                threshold = self._writer.get_alert_threshold(self._cfg["outletId"])
                dirty_minutes = (now - self._dirty_since) / 60.0
                if dirty_minutes >= threshold:
                    self._fire_alert(dirty_minutes)

            # Periodic rescan to see if crew cleaned up
            if (now - self._last_rescan) >= RESCAN_INTERVAL_SECONDS and self._last_frame is not None:
                self._last_rescan = now
                try:
                    is_dirty, reason = self._gemini.analyze_frame(self._last_frame)
                    if not is_dirty:
                        self._on_cleaned(reason)
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------

    def _transition(self, new_state: TableState):
        self._log.info("%s → %s", self._state.value, new_state.value)
        self._state = new_state
        now = time.monotonic()

        if new_state == TableState.OCCUPIED:
            self._occupied_since = now
            self._still_since = None
            self._writer.upsert_table_state(
                self._cfg["outletId"], self._cfg["tableId"],
                {"state": "OCCUPIED", "occupiedSince": datetime.now(timezone.utc).isoformat()}
            )

        elif new_state == TableState.POTENTIALLY_DIRTY:
            self._writer.upsert_table_state(
                self._cfg["outletId"], self._cfg["tableId"],
                {"state": "POTENTIALLY_DIRTY"}
            )

        elif new_state == TableState.EMPTY:
            self._occupied_since = None
            self._still_since = None
            self._dirty_since = None
            self._active_alert_id = None
            self._writer.upsert_table_state(
                self._cfg["outletId"], self._cfg["tableId"],
                {"state": "EMPTY", "occupiedSince": None, "dirtySince": None, "activeAlertId": None}
            )

    def _analyze_and_transition(self):
        if self._last_frame is None:
            self._transition(TableState.EMPTY)
            return
        try:
            is_dirty, reason = self._gemini.analyze_frame(self._last_frame)
            now_iso = datetime.now(timezone.utc).isoformat()
            if is_dirty:
                self._dirty_since = time.monotonic()
                self._state = TableState.DIRTY
                self._log.info("Table DIRTY: %s", reason)
                self._writer.upsert_table_state(
                    self._cfg["outletId"], self._cfg["tableId"],
                    {
                        "state": "DIRTY",
                        "dirtySince": now_iso,
                        "lastGeminiReason": reason,
                        "lastGeminiAt": now_iso,
                    }
                )
            else:
                self._log.info("Table clean (Gemini): %s", reason)
                self._transition(TableState.EMPTY)
                self._writer.upsert_table_state(
                    self._cfg["outletId"], self._cfg["tableId"],
                    {"lastGeminiReason": reason, "lastGeminiAt": now_iso}
                )
        except Exception as e:
            self._log.warning("Gemini analysis failed, assuming clean: %s", e)
            self._transition(TableState.EMPTY)

    def _fire_alert(self, dirty_minutes: float):
        self._log.warning("ALERT: %s dirty for %.1f min", self._cfg["tableName"], dirty_minutes)
        reason = self._writer._db.collection("tableMonitoring") \
            .document(f"{self._cfg['outletId']}_{self._cfg['tableId']}") \
            .get().to_dict().get("lastGeminiReason", "Dirty table detected")
        alert_id = self._writer.create_alert(
            self._cfg["outletId"], self._cfg["tableId"],
            self._cfg["tableName"], reason, dirty_minutes
        )
        self._active_alert_id = alert_id
        self._state = TableState.ALERT_SENT

    def _on_cleaned(self, reason: str):
        self._log.info("Table cleaned (auto-detected): %s", reason)
        if self._active_alert_id:
            self._writer.resolve_alert(self._active_alert_id, "AUTO_RESCAN")
        self._transition(TableState.EMPTY)
        self._writer.upsert_table_state(
            self._cfg["outletId"], self._cfg["tableId"],
            {
                "lastGeminiReason": reason,
                "lastGeminiAt": datetime.now(timezone.utc).isoformat(),
            }
        )


# =============================================================================
# MAIN
# =============================================================================

def main():
    # Initialize Firebase Admin
    cred = credentials.Certificate(FIREBASE_CREDS_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    writer = FirestoreWriter(db)

    log = logging.getLogger("main")
    tables = load_tables()
    log.info("Starting Neko Pulse Table Monitor — %d tables", len(tables))

    monitors = [TableMonitor(cfg, writer) for cfg in tables]

    with ThreadPoolExecutor(max_workers=len(tables), thread_name_prefix="table") as pool:
        futures = [pool.submit(m.run) for m in monitors]
        try:
            for f in futures:
                f.result()
        except KeyboardInterrupt:
            log.info("Shutting down...")


if __name__ == "__main__":
    main()
