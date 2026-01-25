# scripts/

## export_panphon_features.py

This script exports the PanPhon IPA feature table to a JSON file for use in browser-based phoneme distance calculations.

- **Output:** `panphon_features.generated.json` (marked as generated)
- **Usage:**

```sh
python export_panphon_features.py
```

- **Requirements:**
  - `panphon` Python package (`pip install panphon`)

The generated JSON can be loaded in your static web app for fast, client-side phoneme feature lookup and distance calculation.
