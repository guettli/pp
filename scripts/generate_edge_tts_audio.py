#!/usr/bin/env python

import yaml
import subprocess
import hashlib
import json
from pathlib import Path

def phrase_hash(phrase: str) -> str:
    """Return a 16-char hex MD5 of the phrase (UTF-8), used as filename."""
    return hashlib.md5(phrase.encode("utf-8")).hexdigest()[:16]

def main():
    """
    Main function to generate audio files and update the manifest.
    """
    project_root = Path(__file__).parent.parent
    phrases_dir = project_root
    audio_dir = project_root / "static" / "audio"
    manifest_path = audio_dir / "manifest.json"

    languages = {
        "de-DE": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
        "en-GB": {"male": "en-GB-RyanNeural", "female": "en-GB-LibbyNeural"},
        "fr-FR": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
    }

    if manifest_path.exists():
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
    else:
        manifest = {}

    for lang_code, voices in languages.items():
        lang_phrases_file = phrases_dir / f"phrases-{lang_code}.yaml"
        if not lang_phrases_file.exists():
            print(f"Phrases file not found for {lang_code}, skipping.")
            continue

        with open(lang_phrases_file, "r") as f:
            phrases_data = yaml.safe_load(f)

        if lang_code not in manifest:
            manifest[lang_code] = {}

        for voice_type, voice_id in voices.items():
            voice_name = f"edge-tts-{voice_type}"
            if voice_name not in manifest[lang_code]:
                manifest[lang_code][voice_name] = {}

            voice_audio_dir = audio_dir / lang_code / voice_name
            voice_audio_dir.mkdir(parents=True, exist_ok=True)

            for item in phrases_data:
                phrase = item.get("phrase")
                if not phrase:
                    continue

                if phrase in manifest[lang_code][voice_name]:
                    print(f"Skipping existing phrase: {phrase}")
                    continue

                print(f"Generating audio for '{phrase}' in {lang_code} with voice {voice_id}")

                fhash = phrase_hash(phrase)
                out_file = voice_audio_dir / f"{fhash}.opus"
                tmp_mp3 = voice_audio_dir / f"{fhash}.tmp.mp3"
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
                    manifest[lang_code][voice_name][phrase] = fhash
                    print(f"  ... success. Hash: {fhash}")
                except subprocess.CalledProcessError as e:
                    print(f"  ... failed: {e.stderr}")
                    tmp_mp3.unlink(missing_ok=True)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    print("Manifest updated.")

if __name__ == "__main__":
    main()
