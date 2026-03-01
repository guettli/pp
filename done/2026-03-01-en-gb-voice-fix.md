# en-GB Voice Fix

## Task

The test config in `tests/all-phrases.test.js` used `en-US-AndrewNeural` (an American English voice)
for the `en-GB` study language entry, while the actual production scripts already used
`en-GB-RyanNeural`.

## Fix

Changed `tests/all-phrases.test.js` line 27:

```javascript
// Before:
"en-GB": { voice: "en-US-AndrewNeural", source: "edge-tts-andrew" },

// After:
"en-GB": { voice: "en-GB-RyanNeural", source: "edge-tts-ryan" },
```

This aligns the test config with:

- `scripts/generate_edge_tts_audio.py` — already used `en-GB-RyanNeural`
- `scripts/generate-edge-tts-test-data-en-gb.sh` — already generated `edge-tts-ryan` test data files
