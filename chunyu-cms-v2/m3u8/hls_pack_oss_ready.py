# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from tqdm import tqdm


# -----------------------------
# Basic utils
# -----------------------------
def which_or_die(cmd: str) -> None:
    if shutil.which(cmd) is None:
        raise SystemExit(
            f"ERROR: '{cmd}' not found in PATH.\n"
            f"Install ffmpeg and ensure ffmpeg/ffprobe are in PATH.\n"
            f"Test: {cmd} -version"
        )

def run(cmd: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def now_ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")

def now_stamp() -> str:
    return time.strftime("%Y%m%d_%H%M%S")

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def atomic_write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def append_jsonl(path: Path, obj: dict) -> None:
    # jsonl is append-only and resilient to crashes
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)

def safe_move(src: Path, dst_dir: Path) -> Path:
    ensure_dir(dst_dir)
    dst = dst_dir / src.name
    # avoid overwrite
    if dst.exists():
        dst = dst_dir / f"{src.stem}_{now_stamp()}{src.suffix}"
    return Path(shutil.move(str(src), str(dst)))

def file_identity_hash(p: Path) -> str:
    """
    Produce ASCII-only stable-ish id for output folder.
    Uses file name + size + mtime (fast; enough for pipeline).
    """
    st = p.stat()
    raw = f"{p.name}|{st.st_size}|{int(st.st_mtime)}".encode("utf-8", errors="ignore")
    return hashlib.sha1(raw).hexdigest()  # 40 hex chars


# -----------------------------
# ffprobe / ffmpeg helpers
# -----------------------------
def ffprobe_duration_and_size(input_path: Path) -> Tuple[float, int, int]:
    p1 = run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1",
        str(input_path)
    ])
    if p1.returncode != 0 or not p1.stdout.strip():
        raise RuntimeError(f"ffprobe duration failed:\n{p1.stderr}")
    duration = float(p1.stdout.strip())

    p2 = run([
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        str(input_path)
    ])
    if p2.returncode != 0 or not p2.stdout.strip():
        raise RuntimeError(f"ffprobe size failed:\n{p2.stderr}")
    w_str, h_str = p2.stdout.strip().split("x")
    return duration, int(w_str), int(h_str)

def pick_cover_seek(duration: float) -> float:
    return max(1.0, duration * 0.10)

def generate_cover(input_path: Path, cover_path: Path, seek_sec: float) -> None:
    ensure_dir(cover_path.parent)
    p = run([
        "ffmpeg", "-y",
        "-ss", f"{seek_sec:.3f}",
        "-i", str(input_path),
        "-vframes", "1",
        "-q:v", "2",
        str(cover_path)
    ])
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg cover failed:\n{p.stderr}")

def read_key_url_from_keyinfo(keyinfo_path: Path) -> str:
    lines = keyinfo_path.read_text(encoding="utf-8", errors="replace").splitlines()
    if not lines or not lines[0].strip():
        raise RuntimeError("enc.keyinfo first line (key URL) is empty")
    return lines[0].strip()

def write_temp_keyinfo(temp_path: Path, key_url: str, local_key_path: Path) -> None:
    """
    FFmpeg hls_key_info_file expects:
    line1: key URI in playlist
    line2: local key file path for ffmpeg to read
    (line3 optional IV - not used)
    """
    txt = f"{key_url}\n{str(local_key_path)}\n"
    temp_path.write_text(txt, encoding="utf-8")

def package_hls_encrypted(
    input_path: Path,
    out_dir: Path,
    temp_keyinfo: Path,
    hls_time: int,
    playlist_filename: str,
    seg_pattern: str = "seg_%05d.ts",
) -> Path:
    ensure_dir(out_dir)
    playlist_path = out_dir / playlist_filename

    p = run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-c", "copy",
        "-hls_time", str(hls_time),
        "-hls_list_size", "0",
        "-hls_playlist_type", "vod",
        "-hls_key_info_file", str(temp_keyinfo),
        "-hls_segment_filename", str(out_dir / seg_pattern),
        str(playlist_path)
    ])
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg hls encrypt failed:\n{p.stderr}")

    return playlist_path


# -----------------------------
# state / resume / failed list
# -----------------------------
def load_state(state_path: Path) -> Dict:
    if not state_path.exists():
        return {"version": 1, "updated_at": "", "files": {}}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        bak = state_path.with_suffix(".corrupt.bak")
        state_path.replace(bak)
        return {"version": 1, "updated_at": "", "files": {}}

def save_state(state_path: Path, state: Dict) -> None:
    state["updated_at"] = now_ts()
    atomic_write_json(state_path, state)

def state_key(p: Path) -> str:
    return str(p.resolve())

def mark_state(state: Dict, key: str, rec: dict) -> None:
    state.setdefault("files", {})[key] = rec

def load_failed_list(failed_list_path: Path) -> List[Path]:
    if not failed_list_path.exists():
        return []
    lines = failed_list_path.read_text(encoding="utf-8", errors="replace").splitlines()
    out: List[Path] = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if " | " in s:
            s = s.split(" | ", 1)[0].strip()
        out.append(Path(s))
    # de-dup while keeping order
    seen = set()
    uniq = []
    for p in out:
        rp = str(p.resolve()) if p.exists() else str(p)
        if rp in seen:
            continue
        seen.add(rp)
        uniq.append(p)
    return uniq

def append_failed(failed_list_path: Path, video_path: Path, reason: str) -> None:
    line = f"{str(video_path.resolve())} | {reason.replace(chr(10),' ').replace(chr(13),' ')} | {now_ts()}\n"
    with failed_list_path.open("a", encoding="utf-8") as f:
        f.write(line)

def rewrite_failed_list(failed_list_path: Path, items: List[Path]) -> None:
    text = "\n".join(str(p.resolve()) for p in items if p.exists()) + ("\n" if items else "")
    failed_list_path.write_text(text, encoding="utf-8")


# -----------------------------
# logging
# -----------------------------
def setup_logger(log_path: Path, verbose: bool) -> logging.Logger:
    logger = logging.getLogger("hls_oss")
    logger.setLevel(logging.DEBUG)
    if logger.handlers:
        return logger

    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    class TqdmHandler(logging.Handler):
        def emit(self, record):
            msg = self.format(record)
            tqdm.write(msg)

    th = TqdmHandler()
    th.setLevel(logging.DEBUG if verbose else logging.INFO)
    th.setFormatter(fmt)
    logger.addHandler(th)

    return logger


# -----------------------------
# pipeline
# -----------------------------
def process_one(
    src_path: Path,
    input_dir: Path,
    output_dir: Path,
    pending_dir: Path,
    failed_dir: Path,
    key_url: str,
    local_key_path: Path,
    temp_keyinfo_path: Path,
    state: Dict,
    state_path: Path,
    manifest_jsonl: Path,
    failed_list_path: Path,
    logger: logging.Logger,
    hls_time: int,
    retries: int,
) -> bool:
    """
    Returns True if success, False if final failure.
    """
    k = state_key(src_path)

    # If already done per state and output exists, skip
    rec0 = state.get("files", {}).get(k, {})
    if rec0.get("status") == "done":
        logger.info(f"SKIP done: {src_path.name}")
        return True

    # compute identifiers/paths (ASCII-only)
    asset_id = file_identity_hash(src_path)
    asset_out_dir = output_dir / asset_id
    ensure_dir(asset_out_dir)

    # Store original title for API usage (text, UTF-8)
    source_title_txt = asset_out_dir / "source_title.txt"
    # Also store original filename (exact) in a separate file if you want
    source_filename_txt = asset_out_dir / "source_filename.txt"

    # Playlist renamed by time (ASCII)
    playlist_filename = f"playlist_{now_stamp()}.m3u8"
    cover_filename = "cover.jpg"
    cover_path = asset_out_dir / cover_filename
    meta_path = asset_out_dir / "meta.json"

    attempts = 1 + max(0, retries)
    last_err = ""

    for attempt in range(1, attempts + 1):
        try:
            mark_state(state, k, {
                "status": "processing",
                "updated_at": now_ts(),
                "src": str(src_path.resolve()),
                "asset_id": asset_id,
            })
            save_state(state_path, state)

            # gather meta
            duration, width, height = ffprobe_duration_and_size(src_path)
            duration_sec = int(math.floor(duration + 0.5))
            seek_sec = pick_cover_seek(duration)

            # cover
            generate_cover(src_path, cover_path, seek_sec)

            # write temp keyinfo (ensures local key path is correct)
            write_temp_keyinfo(temp_keyinfo_path, key_url=key_url, local_key_path=local_key_path)

            # package
            playlist_path = package_hls_encrypted(
                input_path=src_path,
                out_dir=asset_out_dir,
                temp_keyinfo=temp_keyinfo_path,
                hls_time=hls_time,
                playlist_filename=playlist_filename,
            )

            # write mapping files
            source_title_txt.write_text(src_path.stem, encoding="utf-8")
            source_filename_txt.write_text(src_path.name, encoding="utf-8")

            meta = {
                "asset_id": asset_id,
                "original_filename": src_path.name,   # keep original for API title mapping
                "original_stem": src_path.stem,
                "source_abs": str(src_path.resolve()),
                "created_at": now_ts(),
                "hls_time": hls_time,
                "duration": round(duration, 3),
                "duration_sec": duration_sec,
                "width": width,
                "height": height,
                "output": {
                    "dir": str(asset_out_dir.resolve()),
                    "playlist": playlist_path.name,
                    "cover": cover_filename,
                    "segments_pattern": "seg_%05d.ts",
                    "encryption": "AES-128",
                    "key_uri": key_url,
                }
            }
            atomic_write_json(meta_path, meta)

            # append manifest jsonl for global lookup (API friendly)
            append_jsonl(manifest_jsonl, {
                "status": "done",
                "created_at": meta["created_at"],
                "asset_id": asset_id,
                "original_filename": src_path.name,
                "original_stem": src_path.stem,
                "output_dir": str(asset_out_dir.resolve()),
                "playlist": playlist_path.name,
                "cover": cover_filename,
                "duration_sec": duration_sec,
                "width": width,
                "height": height,
            })

            # move original to pending
            moved = safe_move(src_path, pending_dir)

            # mark done
            mark_state(state, k, {
                "status": "done",
                "updated_at": now_ts(),
                "src_moved_to": str(moved.resolve()),
                "asset_id": asset_id,
                "output_dir": str(asset_out_dir.resolve()),
                "playlist": playlist_path.name,
                "cover": cover_filename,
                "duration_sec": duration_sec,
                "width": width,
                "height": height,
            })
            save_state(state_path, state)

            logger.info(f"DONE: {src_path.name} -> asset_id={asset_id}")
            return True

        except Exception as e:
            last_err = str(e)
            logger.error(f"FAIL attempt {attempt}/{attempts}: {src_path.name} | {last_err}")

            mark_state(state, k, {
                "status": "failed",
                "updated_at": now_ts(),
                "src": str(src_path.resolve()),
                "asset_id": asset_id,
                "error": last_err,
            })
            save_state(state_path, state)

            if attempt < attempts:
                logger.warning(f"RETRY will run again: {src_path.name}")
                time.sleep(1)

    # final failure: move to failed dir + failed_list.txt + manifest record
    try:
        moved = safe_move(src_path, failed_dir)
    except Exception as move_err:
        moved = src_path
        logger.error(f"Also failed to move into failed/: {move_err}")

    append_failed(failed_list_path, moved, last_err)
    append_jsonl(manifest_jsonl, {
        "status": "failed",
        "created_at": now_ts(),
        "asset_id": asset_id,
        "original_filename": src_path.name,
        "original_stem": src_path.stem,
        "error": last_err,
    })
    return False


def main() -> None:
    ap = argparse.ArgumentParser("OSS-ready HLS packager (Windows, ascii output, manifest mapping)")
    ap.add_argument("--hls-time", type=int, default=6, help="HLS segment duration in seconds (default 6)")
    ap.add_argument("--retries", type=int, default=0, help="Retry times on failure (default 0)")
    ap.add_argument("--rerun-failed", action="store_true", help="Only rerun from failed_list.txt")
    ap.add_argument("--clear-failed-on-success", action="store_true", help="When rerun failed, remove successful from failed_list.txt")
    ap.add_argument("--verbose", action="store_true", help="More console logs")
    args = ap.parse_args()

    which_or_die("ffmpeg")
    which_or_die("ffprobe")

    script_dir = Path(__file__).resolve().parent

    # fixed paths by your requirement
    keyinfo_path = script_dir / "enc.keyinfo"
    local_key_path = script_dir / "enc.key"
    input_dir = script_dir / "input"
    output_dir = script_dir / "output"
    pending_dir = script_dir / "pending"
    failed_dir = script_dir / "failed"

    state_path = script_dir / "state.json"
    log_path = script_dir / "run.log"
    failed_list_path = script_dir / "failed_list.txt"
    manifest_jsonl = script_dir / "manifest.jsonl"

    ensure_dir(input_dir)
    ensure_dir(output_dir)
    ensure_dir(pending_dir)
    ensure_dir(failed_dir)

    logger = setup_logger(log_path, verbose=args.verbose)

    # validate key files
    if not keyinfo_path.exists():
        raise SystemExit(f"ERROR: enc.keyinfo not found in script dir: {keyinfo_path}")
    if not local_key_path.exists():
        raise SystemExit(f"ERROR: enc.key not found in script dir: {local_key_path}")

    key_url = read_key_url_from_keyinfo(keyinfo_path)

    # temp keyinfo (always rewrite)
    temp_keyinfo_path = script_dir / "_enc.keyinfo.tmp"

    # load state + print summary
    state = load_state(state_path)
    files_map = state.get("files", {})
    done_cnt = sum(1 for v in files_map.values() if v.get("status") == "done")
    failed_cnt = sum(1 for v in files_map.values() if v.get("status") == "failed")
    proc_cnt = sum(1 for v in files_map.values() if v.get("status") == "processing")

    logger.info("========== RUN START ==========")
    logger.info(f"Script dir: {script_dir}")
    logger.info(f"Key URL: {key_url}")
    logger.info(f"Input: {input_dir}")
    logger.info(f"Output: {output_dir}")
    logger.info(f"Pending: {pending_dir}")
    logger.info(f"Failed: {failed_dir}")
    logger.info(f"State: {state_path}")
    logger.info(f"Manifest: {manifest_jsonl}")
    logger.info(f"Prev summary: done={done_cnt}, failed={failed_cnt}, processing={proc_cnt}")
    logger.info(f"Retries: {args.retries}")

    # build task list
    tasks: List[Path] = []
    if args.rerun_failed:
        failed_items = load_failed_list(failed_list_path)
        # only existing mp4
        tasks = [p.resolve() for p in failed_items if p.exists() and p.suffix.lower() == ".mp4"]
        if not tasks:
            logger.info("No valid mp4 in failed_list.txt to rerun.")
            return
        logger.info(f"Rerun failed only: {len(tasks)} item(s).")
    else:
        tasks = sorted(list(input_dir.glob("*.mp4")) + list(input_dir.glob("*.MP4")), key=lambda p: p.name.lower())
        if not tasks:
            logger.info("No mp4 files found in input/.")
            return
        logger.info(f"Found mp4 in input/: {len(tasks)} item(s).")

    errors = 0
    success_paths = set()

    with tqdm(total=len(tasks), unit="video", dynamic_ncols=True, desc="HLS Pack") as pbar:
        for src in tasks:
            pbar.set_postfix_str(src.name[:40])
            ok = process_one(
                src_path=src,
                input_dir=input_dir,
                output_dir=output_dir,
                pending_dir=pending_dir,
                failed_dir=failed_dir,
                key_url=key_url,
                local_key_path=local_key_path,
                temp_keyinfo_path=temp_keyinfo_path,
                state=state,
                state_path=state_path,
                manifest_jsonl=manifest_jsonl,
                failed_list_path=failed_list_path,
                logger=logger,
                hls_time=int(args.hls_time),
                retries=int(args.retries),
            )
            if ok:
                success_paths.add(str(src.resolve()))
            else:
                errors += 1
            pbar.update(1)

    # rerun-failed: optionally remove successful items from failed_list.txt
    if args.rerun_failed and args.clear_failed_on_success and failed_list_path.exists():
        current_failed = load_failed_list(failed_list_path)
        remaining = []
        for p in current_failed:
            rp = str(p.resolve()) if p.exists() else str(p)
            if rp in success_paths:
                continue
            remaining.append(p)
        rewrite_failed_list(failed_list_path, remaining)
        logger.info(f"failed_list.txt updated. remaining={len(remaining)}")

    # cleanup temp keyinfo
    try:
        if temp_keyinfo_path.exists():
            temp_keyinfo_path.unlink()
    except Exception:
        pass

    logger.info("========== RUN END ==========")
    logger.info(f"Errors: {errors}")
    if errors:
        raise SystemExit(f"Completed with {errors} error(s). Check run.log and failed_list.txt")
    logger.info("All done.")


if __name__ == "__main__":
    main()
