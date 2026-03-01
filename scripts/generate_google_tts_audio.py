#!/usr/bin/env python

import yaml
import os
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from google.cloud import texttospeech


def phrase_hash(phrase: str) -> str:
    """Return a 16-char hex MD5 of the phrase (UTF-8), used as filename."""
    return hashlib.md5(phrase.encode("utf-8")).hexdigest()[:16]


def main():
    """
    Main function to generate audio files and update the manifest.
    Uses Google Cloud TTS Neural2 voices for high-quality synthesis.
    """
    project_root = Path(__file__).parent.parent
    phrases_dir = project_root
    audio_dir = project_root / "static" / "audio"
    manifest_path = audio_dir / "manifest.json"

    client = texttospeech.TextToSpeechClient()

    languages = {
        "de-DE": {"male": "de-DE-Neural2-B", "female": "de-DE-Neural2-A"},
        "en-GB": {"male": "en-GB-Neural2-B", "female": "en-GB-Neural2-A"},
        "fr-FR": {"male": "fr-FR-Neural2-B", "female": "fr-FR-Neural2-A"},
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
            voice_name = f"google-{voice_type}"
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

                # Extract standard IPA if available for SSML phoneme hints
                ipa = None
                if "ipas" in item:
                    standard_ipa = next(
                        (e["ipa"] for e in item["ipas"] if e.get("category") == "standard"),
                        None,
                    )
                    if standard_ipa:
                        ipa = standard_ipa.strip("/")

                if ipa:
                    synthesis_input = texttospeech.SynthesisInput(
                        ssml=f'<speak><phoneme alphabet="ipa" ph="{ipa}">{phrase}</phoneme></speak>'
                    )
                    print(f"Generating '{phrase}' (IPA: {ipa}) [{lang_code} {voice_id}]")
                else:
                    synthesis_input = texttospeech.SynthesisInput(text=phrase)
                    print(f"Generating '{phrase}' [{lang_code} {voice_id}]")

                voice = texttospeech.VoiceSelectionParams(
                    language_code=lang_code, name=voice_id
                )
                audio_config = texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.MP3
                )

                fhash = phrase_hash(phrase)
                out_file = voice_audio_dir / f"{fhash}.opus"

                try:
                    response = client.synthesize_speech(
                        input=synthesis_input, voice=voice, audio_config=audio_config
                    )

                    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                        tmp.write(response.audio_content)
                        tmp_mp3_path = tmp.name

                    subprocess.run(
                        ["ffmpeg", "-y", "-i", tmp_mp3_path,
                         "-c:a", "libopus", "-b:a", "24k", "-ac", "1",
                         str(out_file)],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    os.unlink(tmp_mp3_path)

                    manifest[lang_code][voice_name][phrase] = fhash
                    print(f"  ... success. Hash: {fhash}")

                except Exception as e:
                    print(f"  ... failed: {e}")
                    if "tmp_mp3_path" in dir() and os.path.exists(tmp_mp3_path):
                        os.unlink(tmp_mp3_path)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    print("Manifest updated.")


if __name__ == "__main__":
    main()
