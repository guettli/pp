#!/usr/bin/env python3
"""
Export PanPhon IPA features as a compact binary JSON for use in the browser.

Generates build/data/panphon_features.json from the PanPhon phonetic feature table.
This is a build artifact — run via Taskfile ('task panphon') rather than directly.

Usage:
    python scripts/export_panphon_features.py
"""
import argparse
import json
import base64
import os
import struct


def main():
    parser = argparse.ArgumentParser(
        description="Export PanPhon IPA feature table to build/data/panphon_features.json."
        " Called by Taskfile via './run task panphon'. The output is loaded by the browser"
        " for client-side phoneme distance calculations (same scoring as web UI)."
    )
    parser.parse_args()

    import panphon
    ft = panphon.FeatureTable()

    # Build feature dict: symbol -> feature vector (as list of "+", "-", "0")
    feature_dict = {}
    for sym in ft.seg_dict.keys():
        vec = ft.word_to_vector_list(sym)
        if len(vec) == 1:
            feature_dict[sym] = vec[0]

    print(f"Phonemes: {len(feature_dict)}")

    # Convert to compact binary format (Int8: -1/0/1 per feature)
    phonemes_list = list(feature_dict.keys())
    features_binary = []
    for features in feature_dict.values():
        for f in features:
            if f == "+":
                features_binary.append(1)
            elif f == "-":
                features_binary.append(-1)
            else:
                features_binary.append(0)

    binary_data = struct.pack(f'{len(features_binary)}b', *features_binary)
    features_base64 = base64.b64encode(binary_data).decode('ascii')

    output = {
        'phonemes': phonemes_list,
        'features': features_base64,
        'featureCount': 24,
    }

    output_path = 'build/data/panphon_features.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

    print(f"Saved to: {output_path} ({os.path.getsize(output_path):,} bytes)")


if __name__ == "__main__":
    main()
