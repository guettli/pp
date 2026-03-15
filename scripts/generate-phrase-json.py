#!/usr/bin/env python3
"""Generate static/phrases/{lang}.json from phrases-{lang}.yaml"""
import yaml
import json
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / "static" / "phrases"
OUT.mkdir(parents=True, exist_ok=True)

for lang in ["de-DE", "en-GB", "fr-FR", "it-IT", "es-ES"]:
    src = ROOT / f"phrases-{lang}.yaml"
    data = yaml.safe_load(src.read_text())
    out = OUT / f"{lang}.json"
    out.write_text(json.dumps(data, ensure_ascii=False))
    print(f"Generated {out.relative_to(ROOT)}")
