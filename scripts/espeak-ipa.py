#!/usr/bin/env python3
"""
Generate IPA pronunciation using espeak-ng and output as JSON.
Used internally by other scripts to get espeak-ng IPA for a German phrase.
"""
import sys
import json
import argparse
import subprocess


def get_espeak_ipa(text: str) -> str:
    """Generate IPA using espeak-ng directly."""
    try:
        # Call espeak-ng with German language and IPA output (quiet mode, no audio)
        result = subprocess.run(
            ["espeak-ng", "-v", "de", "--ipa", "-q", text],
            capture_output=True,
            text=True,
            check=True,
        )
        # Remove trailing newline
        ipa = result.stdout.strip()
        return ipa
    except subprocess.CalledProcessError as e:
        return f"ERROR: {str(e)}"
    except FileNotFoundError:
        return "ERROR: espeak-ng not found"
    except Exception as e:
        return f"ERROR: {str(e)}"


def main():
    parser = argparse.ArgumentParser(
        description="Generate IPA pronunciation using espeak-ng and output as JSON. Used internally by other scripts."
    )
    parser.add_argument("text", help="Text to convert to IPA (German)")
    args = parser.parse_args()

    text = args.text
    ipa = get_espeak_ipa(text)

    result = {"text": text, "ipa": ipa}

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
