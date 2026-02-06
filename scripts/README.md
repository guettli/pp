# scripts/

## update-ipa.ts

Automatically fetches and updates IPA pronunciations in `phrases-*.yaml` files using the Wiktionary
API.

- **Usage:**

```sh
# Update only missing IPA entries (default)
tsx scripts/update-ipa.ts phrases-de.yaml

# Re-fetch and update ALL IPA entries from Wiktionary
tsx scripts/update-ipa.ts phrases-de.yaml --update-all
```

- **Features:**
  - Always writes changes to file (safe with git version control)
  - By default, only updates entries with missing IPAs
  - Use `--update-all` to refresh all IPAs from Wiktionary
  - Queries Wiktionary API for accurate, human-curated IPA data
  - Handles multi-word phrases by combining word-level IPAs
  - Includes common German function words (der, die, das, ist, etc.)
  - Caches results in `~/.cache/phoneme-party/wiktionary-ipa-cache.json`
  - Respects rate limiting (1 request per second)

- **Requirements:**
  - `js-yaml` package (already in dependencies)

## export_panphon_features.py

This script exports the PanPhon IPA feature table to a JSON file for use in browser-based phoneme
distance calculations.

- **Output:** `panphon_features.generated.json` (marked as generated)
- **Usage:**

```sh
python export_panphon_features.py
```

- **Requirements:**
  - `panphon` Python package (`pip install panphon`)

The generated JSON can be loaded in your static web app for fast, client-side phoneme feature lookup
and distance calculation.
