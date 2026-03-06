#!/usr/bin/env python

import re
import yaml
import subprocess
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


def main():
    """
    Main function to generate audio files.
    Filenames are derived from the en-GB translation of each phrase.
    """
    project_root = Path(__file__).parent.parent
    phrases_dir = project_root
    audio_dir = project_root / "static" / "audio"

    languages = {
        "de-DE": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
        "en-GB": {"male": "en-GB-RyanNeural", "female": "en-GB-LibbyNeural"},
        "fr-FR": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
        "it-IT": {"male": "it-IT-DiegoNeural", "female": "it-IT-ElsaNeural"},
    }

    for lang_code, voices in languages.items():
        lang_phrases_file = phrases_dir / f"phrases-{lang_code}.yaml"
        if not lang_phrases_file.exists():
            print(f"Phrases file not found for {lang_code}, skipping.")
            continue

        with open(lang_phrases_file, "r") as f:
            phrases_data = yaml.safe_load(f)

        for voice_type, voice_id in voices.items():
            voice_name = f"edge-tts-{voice_type}"
            voice_audio_dir = audio_dir / lang_code / voice_name
            voice_audio_dir.mkdir(parents=True, exist_ok=True)

            for item in phrases_data:
                phrase = item.get("phrase")
                if not phrase:
                    continue

                # Use en-GB translation for filename; fall back to native phrase
                if lang_code == "en-GB":
                    en_gb_text = phrase
                else:
                    en_gb_text = item.get("en-GB") or phrase

                stem = phrase_to_filename(en_gb_text)
                out_file = voice_audio_dir / f"{stem}.opus"
                if out_file.exists():
                    print(f"Skipping existing phrase: {phrase}")
                    continue

                print(f"Generating audio for '{phrase}' in {lang_code} with voice {voice_id}")
                tmp_mp3 = voice_audio_dir / f"{stem}.tmp.mp3"
                try:
                    subprocess.run(
                        ["edge-tts", "--voice", voice_id, "--text", phrase, "--write-media", str(tmp_mp3)],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    subprocess.run(
                        ["ffmpeg", "-y", "-i", str(tmp_mp3), "-c:a", "libopus", "-b:a", "24k", "-ac", "1",
                         str(out_file)],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    tmp_mp3.unlink()
                    print(f"  ... success. File: {out_file.name}")
                except subprocess.CalledProcessError as e:
                    print(f"  ... failed: {e.stderr}")
                    tmp_mp3.unlink(missing_ok=True)

    print("Done.")


if __name__ == "__main__":
    main()
