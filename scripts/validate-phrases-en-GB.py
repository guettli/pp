#!/usr/bin/env python3
"""
Validate that all non-English phrases YAML files have a non-empty en-GB field for every phrase.

Checks phrases-de-DE.yaml and phrases-fr-FR.yaml. Each entry must have an 'en-GB' field
with the English translation. Called by Taskfile as part of the 'check' task.

Usage:
    python scripts/validate-phrases-en-GB.py
"""
import argparse
import sys
import yaml
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Validate that all non-English phrase YAML files have a non-empty en-GB field (called by Taskfile 'check' task)."
    )
    parser.parse_args()

    repo_root = Path(__file__).parent.parent
    langs = ["de-DE", "fr-FR"]

    for lang in langs:
        path = repo_root / f"phrases-{lang}.yaml"
        with open(path) as f:
            phrases = yaml.safe_load(f)
        for p in phrases:
            if "en-GB" not in p or not p["en-GB"]:
                print(f"ERROR: {lang} phrase '{p['phrase']}' missing en-GB")
                sys.exit(1)
    print("All phrases have non-empty en-GB field.")


if __name__ == "__main__":
    main()
