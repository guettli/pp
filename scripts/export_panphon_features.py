#!/usr/bin/env python3
# Export PanPhon IPA features as a compact binary JSON for use in the browser.
# Output: build/data/panphon_features.json  (run from project root)
# Usage: python export_panphon_features.py
import json
import base64
import struct
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

import os
print(f"Saved to: {output_path} ({os.path.getsize(output_path):,} bytes)")
