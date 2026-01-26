#!/usr/bin/env python3
"""
Export PanPhon features as compact binary format:
- Keeps ALL phonemes (for any language Whisper might output)
- Uses Int8 array (1 byte per feature: -1, 0, 1)
- Much smaller than JSON (149 KB vs 734 KB)
"""

import json
import base64
import struct

# Read the full PanPhon feature table
print("Reading panphon_features.generated.json...")
with open('panphon_features.generated.json', 'r', encoding='utf-8') as f:
    all_features = json.load(f)

print(f"Phonemes: {len(all_features)}")

# Build index mapping: phoneme -> index
phoneme_index = {}
phonemes_list = []
features_binary = []

for idx, (phoneme, features) in enumerate(all_features.items()):
    phoneme_index[phoneme] = idx
    phonemes_list.append(phoneme)

    # Convert features to integers: "0" -> 0, "+" -> 1, "-" -> -1
    for f in features:
        if f == "0":
            features_binary.append(0)
        elif f == "+":
            features_binary.append(1)
        elif f == "-":
            features_binary.append(-1)
        else:
            features_binary.append(0)

# Pack as signed bytes (-128 to 127)
binary_data = struct.pack(f'{len(features_binary)}b', *features_binary)

# Encode as base64 for JSON transport
features_base64 = base64.b64encode(binary_data).decode('ascii')

# Create output structure
output = {
    'phonemes': phonemes_list,  # Array of phoneme strings
    'features': features_base64,  # Base64-encoded binary feature data
    'featureCount': 24  # Number of features per phoneme
}

# Save as JSON
output_path = 'src/data/panphon_features.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

# Get sizes
import os
json_size = len(json.dumps(all_features, separators=(',', ':')))
output_size = os.path.getsize(output_path)

print(f"\nOriginal JSON (minified): {json_size:,} bytes ({json_size/1024:.1f} KB)")
print(f"Binary format (base64):   {output_size:,} bytes ({output_size/1024:.1f} KB)")
print(f"Reduction:                {(1 - output_size/json_size)*100:.1f}%")
print(f"\nPhonemes: {len(phonemes_list)}")
print(f"Binary data: {len(binary_data):,} bytes")
print(f"Base64 overhead: {len(features_base64) - len(binary_data):,} bytes")
print(f"\nSaved to: {output_path}")
