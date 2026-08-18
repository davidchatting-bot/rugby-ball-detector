#!/usr/bin/env python3
"""Export dataset.json into a YOLO-ready directory of images + labels.

Downloads each image from Wikimedia Commons (one request per file, with a
delay between requests to stay well within Commons' API etiquette) and
writes out:

    <out>/images/train/*.jpg
    <out>/images/valid/*.jpg
    <out>/images/test/*.jpg
    <out>/labels/train/*.txt
    <out>/labels/valid/*.txt
    <out>/labels/test/*.txt
    <out>/data.yaml

Usage:
    python3 export_yolo.py [--out DIR] [--delay SECONDS]
"""

import argparse
import json
import re
import time
import urllib.parse
from pathlib import Path

import requests

HEADERS = {
    "User-Agent": "rugby-ball-detector-export/1.0 "
    "(https://github.com/davidchatting-bot/rugby-ball-detector; contact via github) "
    "python-requests"
}


def filename_from_url(url: str) -> str:
    """Derive a filesystem-safe filename from a Commons File: page URL."""
    title = url.split("/wiki/File:", 1)[1]
    title = urllib.parse.unquote(title)
    title = title.replace(" ", "_")
    title = re.sub(r'[<>:"/\\|?*]', "_", title)
    return title


def file_path_url(url: str) -> str:
    """Commons' Special:FilePath redirects straight to the raw file bytes."""
    return url.replace("/wiki/File:", "/wiki/Special:FilePath/")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="yolo_export", help="output directory")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between downloads")
    args = parser.parse_args()

    with open(Path(__file__).parent / "dataset.json") as f:
        dataset = json.load(f)

    out = Path(args.out)
    session = requests.Session()
    session.headers.update(HEADERS)

    split_map = {"train": "train", "valid": "valid", "test": "test"}

    total = sum(len(dataset[s]) for s in split_map)
    done = 0

    for split, dirname in split_map.items():
        images_dir = out / "images" / dirname
        labels_dir = out / "labels" / dirname
        images_dir.mkdir(parents=True, exist_ok=True)
        labels_dir.mkdir(parents=True, exist_ok=True)

        for entry in dataset[split]:
            url = entry["url"]
            fname = filename_from_url(url)
            stem = Path(fname).stem

            img_path = images_dir / fname
            if not img_path.exists():
                resp = session.get(file_path_url(url), timeout=30)
                resp.raise_for_status()
                img_path.write_bytes(resp.content)
                time.sleep(args.delay)

            label_path = labels_dir / f"{stem}.txt"
            lines = [" ".join(str(v) for v in ball) for ball in entry["balls"]]
            label_path.write_text("\n".join(lines) + "\n" if lines else "")

            done += 1
            print(f"[{done}/{total}] {split}/{fname}")

    data_yaml = out / "data.yaml"
    data_yaml.write_text(
        "path: .\n"
        "train: images/train\n"
        "val: images/valid\n"
        "test: images/test\n"
        "\n"
        f"nc: {len(dataset['classes'])}\n"
        f"names: {dataset['classes']!r}\n"
    )
    print(f"\nWrote {data_yaml}")


if __name__ == "__main__":
    main()
