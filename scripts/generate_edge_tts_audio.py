#!/usr/bin/env python

import asyncio
import re
import yaml
from pathlib import Path


def djb2hex(text: str) -> str:
    """8-char hex djb2 hash over UTF-8 bytes (matches TypeScript implementation)."""
    h = 5381
    for b in text.encode("utf-8"):
        h = ((h << 5) + h + b) & 0xFFFFFFFF
    return f"{h:08x}"


def phrase_to_filename(en_gb_text: str) -> str:
    """Derive safe filename stem from en-GB text (no extension)."""
    safe = re.sub(r"[^a-zA-Z0-9]", "_", en_gb_text)
    if len(safe) <= 25:
        return safe
    return safe[:25] + "_" + djb2hex(en_gb_text)


async def generate_one(phrase: str, voice_id: str, out_file: Path, sem: asyncio.Semaphore) -> str:
    """Download TTS audio and convert to opus. Returns a status line."""
    import edge_tts

    tmp_mp3 = out_file.with_suffix(".tmp.mp3")
    max_retries = 5
    async with sem:
        for attempt in range(max_retries):
            try:
                communicate = edge_tts.Communicate(phrase, voice_id)
                await communicate.save(str(tmp_mp3))
                break
            except Exception as e:
                tmp_mp3.unlink(missing_ok=True)
                if attempt == max_retries - 1:
                    raise RuntimeError(f"edge-tts failed after {max_retries} attempts: {e}") from e
                wait = 2 ** attempt
                print(f"  Retry {attempt + 1}/{max_retries} for '{phrase}' (error: {e}) — waiting {wait}s")
                await asyncio.sleep(wait)

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", str(tmp_mp3), "-c:a", "libopus", "-b:a", "24k", "-ac", "1", str(out_file),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    tmp_mp3.unlink(missing_ok=True)
    if proc.returncode != 0:
        last_line = stderr.decode().strip().splitlines()[-1] if stderr.strip() else "(no error output)"
        raise RuntimeError(f"ffmpeg failed: {last_line}")
    return f"  OK  {out_file.name}"


async def async_main(check_only: bool, delete_orphans: bool) -> None:
    project_root = Path(__file__).parent.parent
    audio_dir = project_root / "static" / "audio"

    languages = {
        "de-DE": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
        "en-GB": {"male": "en-GB-RyanNeural", "female": "en-GB-LibbyNeural"},
        "fr-FR": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
        "it-IT": {"male": "it-IT-DiegoNeural", "female": "it-IT-ElsaNeural"},
        "es-ES": {"male": "es-ES-AlvaroNeural", "female": "es-ES-ElviraNeural"},
    }

    # Limit concurrent TTS network requests to avoid rate-limiting
    sem = asyncio.Semaphore(5)

    for lang_code, voices in languages.items():
        lang_phrases_file = project_root / f"phrases-{lang_code}.yaml"
        if not lang_phrases_file.exists():
            print(f"Phrases file not found for {lang_code}, skipping.")
            continue

        with open(lang_phrases_file, "r") as f:
            phrases_data = yaml.safe_load(f)

        # Build set of expected stems from phrases yaml
        expected_stems: set[str] = set()
        for item in phrases_data:
            phrase = item.get("phrase")
            if not phrase:
                continue
            en_gb_text = phrase if lang_code == "en-GB" else (item.get("en-GB") or phrase)
            expected_stems.add(phrase_to_filename(en_gb_text))

        # Sort phrases by stem for deterministic generation order
        sorted_phrases = sorted(
            (item for item in phrases_data if item.get("phrase")),
            key=lambda item: phrase_to_filename(
                item["phrase"] if lang_code == "en-GB" else (item.get("en-GB") or item["phrase"])
            ),
        )

        for voice_type, voice_id in sorted(voices.items()):
            voice_name = f"edge-tts-{voice_type}"
            voice_audio_dir = audio_dir / lang_code / voice_name
            voice_audio_dir.mkdir(parents=True, exist_ok=True)

            if check_only or delete_orphans:
                for opus_file in sorted(voice_audio_dir.glob("*.opus")):
                    if opus_file.stem not in expected_stems:
                        if delete_orphans:
                            opus_file.unlink()
                            print(f"DELETED  {lang_code}/{voice_name}/{opus_file.name}")
                        else:
                            print(f"ORPHAN   {lang_code}/{voice_name}/{opus_file.name}")

            if check_only:
                for item in sorted_phrases:
                    phrase = item["phrase"]
                    en_gb_text = phrase if lang_code == "en-GB" else (item.get("en-GB") or phrase)
                    stem = phrase_to_filename(en_gb_text)
                    out_file = voice_audio_dir / f"{stem}.opus"
                    if not out_file.exists():
                        print(f"MISSING  {lang_code}/{voice_name}/{out_file.name}  (phrase: {phrase})")
                continue

            # Build tasks for all missing phrases in this voice
            tasks = []
            for item in sorted_phrases:
                phrase = item["phrase"]
                en_gb_text = phrase if lang_code == "en-GB" else (item.get("en-GB") or phrase)
                stem = phrase_to_filename(en_gb_text)
                out_file = voice_audio_dir / f"{stem}.opus"
                if out_file.exists():
                    continue
                print(f"Queuing: '{phrase}' [{lang_code}/{voice_name}]")
                tasks.append(generate_one(phrase, voice_id, out_file, sem))

            if not tasks:
                continue

            print(f"Generating {len(tasks)} files for {lang_code}/{voice_name} ...")
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    print(f"  ERROR: {result}")
                    raise SystemExit(1)
                print(result)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate or check edge-tts opus audio files for all phrases."
        " edge-tts is a free Microsoft Azure Text-to-Speech service accessible"
        " via the 'edge-tts' Python library without an API key.",
    )
    subparsers = parser.add_subparsers(dest="subcommand")
    subparsers.add_parser("check", help="Print missing and orphaned opus files without changing anything.")
    subparsers.add_parser("create", help="Generate missing opus files using edge-tts.")
    subparsers.add_parser("delete-orphans", help="Delete opus files with no matching phrase.")

    args = parser.parse_args()

    if args.subcommand is None:
        parser.print_help()
        return

    asyncio.run(async_main(
        check_only=args.subcommand == "check",
        delete_orphans=args.subcommand == "delete-orphans",
    ))
    print("Done.")


if __name__ == "__main__":
    main()
