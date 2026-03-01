#!/usr/bin/env python3
# Validate that all phrases YAML files have required, non-empty en-GB field for every phrase.

import yaml
import sys
from pathlib import Path

langs = ["de-DE", "fr-FR"]
master_lang = "en-GB"

for lang in langs:
    path = Path(f"phrases-{lang}.yaml")
    with open(path) as f:
        phrases = yaml.safe_load(f)
    for p in phrases:
        if "en-GB" not in p or not p["en-GB"]:
            print(f"ERROR: {lang} phrase '{p['phrase']}' missing en-GB")
            sys.exit(1)
print("All phrases have non-empty en-GB field.")
