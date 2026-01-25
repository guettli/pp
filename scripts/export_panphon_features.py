#!/usr/bin/env python
# This script exports the PanPhon IPA feature table as a JSON file for use in the browser.
# Usage: python export_panphon_features.py
import json
import panphon
import panphon.featuretable

ft = panphon.FeatureTable()

# Get all IPA symbols in the PanPhon table
ipa_symbols = ft.seg_dict.keys()

# Build a dict: symbol -> feature vector (as a list of 1, 0, -1)
feature_dict = {}
for sym in ipa_symbols:
    vec = ft.word_to_vector_list(sym)
    # Only include single-symbol phonemes
    if len(vec) == 1:
        feature_dict[sym] = vec[0]

# Save as JSON
with open("panphon_features.generated.json", "w", encoding="utf-8") as f:
    json.dump(feature_dict, f, ensure_ascii=False, indent=2)

print(f"Exported {len(feature_dict)} IPA symbols to panphon_features.generated.json")
