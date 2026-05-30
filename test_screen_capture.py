"""
Screen capture helper for desktop camera client monitoring.

Examples:
  python test_screen_capture.py --full
  python test_screen_capture.py --x 100 --y 200 --width 640 --height 360

The saved image lets you confirm the crop contains only the table camera view.
On macOS, you may need to allow Terminal/Python screen recording permission.
"""

import argparse
from pathlib import Path

import cv2
import mss
import numpy as np


def main():
    parser = argparse.ArgumentParser(description="Capture a desktop screenshot/crop for table monitoring.")
    parser.add_argument("--full", action="store_true", help="Capture the full primary screen.")
    parser.add_argument("--x", type=int, default=0)
    parser.add_argument("--y", type=int, default=0)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--output", default="screen_capture_test.jpg")
    args = parser.parse_args()

    with mss.mss() as capture:
        if args.full:
            monitor = capture.monitors[1]
        else:
            monitor = {
                "left": args.x,
                "top": args.y,
                "width": args.width,
                "height": args.height,
            }

        raw = np.array(capture.grab(monitor))
        frame = cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)

    output = Path(args.output)
    cv2.imwrite(str(output), frame)
    print(f"Saved {output.resolve()}")
    print(f"Crop used: x={monitor['left']} y={monitor['top']} width={monitor['width']} height={monitor['height']}")


if __name__ == "__main__":
    main()
