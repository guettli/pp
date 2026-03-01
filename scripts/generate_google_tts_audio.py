#!/usr/bin/env python

import yaml
import os
import hashlib
import json
from pathlib import Path
from google.cloud import texttospeech
import tempfile
import subprocess

def get_file_hash(file_path):
    """Calculates the SHA1 hash of a file and returns the first 16 characters."""
    with open(file_path, "rb") as f:
        content = f.read()
        return hashlib.sha1(content).hexdigest()[:16]

def main():
    """
    Main function to generate audio files and update the manifest.
    """
    project_root = Path(__file__).parent.parent
    phrases_dir = project_root
    audio_dir = project_root / "static" / "audio"
    manifest_path = audio_dir / "manifest.json"

    # Instantiates a client
    client = texttospeech.TextToSpeechClient()

    languages = {
        "de-DE": {"male": "de-DE-Standard-B", "female": "de-DE-Standard-A"},
        "en-GB": {"male": "en-GB-Standard-B", "female": "en-GB-Standard-A"},
        "fr-FR": {"male": "fr-FR-Standard-B", "female": "fr-FR-Standard-A"},
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

                ipa = None
                if "ipas" in item:
                    standard_ipa = next((ipa['ipa'] for ipa in item['ipas'] if ipa.get('category') == 'standard'), None)
                    if standard_ipa:
                        ipa = standard_ipa.strip("/")

                if not ipa:
                    print(f"Skipping phrase without standard IPA: {phrase}")
                    continue

                print(f"Generating audio for '{phrase}' (IPA: {ipa}) in {lang_code} with voice {voice_id}")

                ssml = f'<speak><phoneme alphabet="ipa" ph="{ipa}">{phrase}</phoneme></speak>'
                synthesis_input = texttospeech.SynthesisInput(ssml=ssml)

                voice = texttospeech.VoiceSelectionParams(
                    language_code=lang_code, name=voice_id
                )

                audio_config = texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.MP3
                )

                try:
                    response = client.synthesize_speech(
                        input=synthesis_input, voice=voice, audio_config=audio_config
                    )

                    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_mp3:
                        tmp_mp3.write(response.audio_content)
                        tmp_mp3_path = tmp_mp3.name

                    with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as tmp_flac:
                        tmp_flac_path = tmp_flac.name

                    subprocess.run(
                        ["ffmpeg", "-i", tmp_mp3_path, "-y", tmp_flac_path],
                        check=True,
                        capture_output=True,
                        text=True,
                    )

                    file_hash = get_file_hash(tmp_flac_path)
                    final_flac_path = voice_audio_dir / f"{file_hash}.flac"

                    os.rename(tmp_flac_path, final_flac_path)
                    os.remove(tmp_mp3_path)

                    manifest[lang_code][voice_name][phrase] = file_hash
                    print(f"  ... success. Hash: {file_hash}")

                except Exception as e:
                    print(f"  ... failed: {e}")

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    print("Manifest updated.")

if __name__ == "__main__":
    main()
