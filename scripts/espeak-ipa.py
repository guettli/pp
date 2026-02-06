#!/usr/bin/env python3
"""
Generate IPA pronunciation using espeak-ng.
Takes German text as input and outputs IPA.
"""
import sys
import json
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
    if len(sys.argv) < 2:
        print("Usage: espeak-ipa.py <text>", file=sys.stderr)
        sys.exit(1)

    text = sys.argv[1]
    ipa = get_espeak_ipa(text)

    result = {"text": text, "ipa": ipa}

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
