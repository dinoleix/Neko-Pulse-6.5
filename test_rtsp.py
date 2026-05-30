"""
Quick RTSP tester for Neko Pulse table monitoring.

Examples:
  python test_rtsp.py "rtsp://admin:pass@192.168.1.110:554/Streaming/Channels/101"
  python test_rtsp.py --ip 192.168.1.110 --user admin --password pass --ezykam
  python test_rtsp.py --ip 192.168.1.101 --xiaomi
"""

import argparse
import time
from pathlib import Path

import cv2


EZYKAM_PATHS = [
    "/Streaming/Channels/101",
    "/Streaming/Channels/102",
    "/live/ch0",
    "/h264/ch1/main/av_stream",
]

XIAOMI_PATHS = [
    "/live",
    "/ch0_0.h264",
]


def build_urls(args) -> list[str]:
    if args.url:
        return [args.url]

    auth = f"{args.user}:{args.password}@" if args.user and args.password else ""
    paths = EZYKAM_PATHS if args.ezykam else XIAOMI_PATHS
    return [f"rtsp://{auth}{args.ip}:554{path}" for path in paths]


def test_url(url: str, timeout_seconds: int) -> bool:
    print(f"Testing {url}")
    cap = cv2.VideoCapture(url)
    deadline = time.time() + timeout_seconds
    ok = False
    frame = None

    while time.time() < deadline:
        ok, frame = cap.read()
        if ok and frame is not None:
            break
        time.sleep(0.25)

    cap.release()

    if not ok or frame is None:
        print("  failed: no readable frame")
        return False

    output = Path("rtsp_test_frame.jpg")
    cv2.imwrite(str(output), frame)
    print(f"  success: saved {output.resolve()}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Test camera RTSP URLs for Neko Pulse.")
    parser.add_argument("url", nargs="?", help="Full RTSP URL to test.")
    parser.add_argument("--ip", help="Camera IP address.")
    parser.add_argument("--user", default="admin", help="Camera username.")
    parser.add_argument("--password", help="Camera password.")
    parser.add_argument("--ezykam", action="store_true", help="Try common Ezykam+ RTSP paths.")
    parser.add_argument("--xiaomi", action="store_true", help="Try common Xiaomi RTSP paths.")
    parser.add_argument("--timeout", type=int, default=8, help="Seconds to wait for each URL.")
    args = parser.parse_args()

    if not args.url and not args.ip:
        parser.error("Provide either a full RTSP URL or --ip.")

    if not args.url and not args.ezykam and not args.xiaomi:
        args.ezykam = True

    for url in build_urls(args):
        if test_url(url, args.timeout):
            return

    raise SystemExit("No working RTSP URL found.")


if __name__ == "__main__":
    main()
