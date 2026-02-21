/**
 * Shared model details visualization HTML generator
 * Used by both web UI and static HTML generator
 */

interface PhonemeDetail {
  symbol: string;
  confidence: number;
  duration: number;
}

interface FramePrediction {
  symbol: string;
  tokenId: number;
  logit: number;
  probability: number;
}

interface FrameData {
  frameIndex: number;
  topPredictions: FramePrediction[];
}

interface DetailedPhonemeData {
  phonemes: string;
  details: PhonemeDetail[];
  raw: {
    frames: number;
    vocabSize: number;
    frameData: FrameData[];
  };
}

/**
 * Generate HTML for model details visualization
 */
export function generateModelDetailsHTML(detailed: DetailedPhonemeData): string {
  let html = "";

  // Summary
  html += '<div class="mb-4">';
  html += '<h6 class="fw-bold text-primary">Summary</h6>';
  html += `<div class="small"><strong>Detected IPA:</strong> <code class="fs-6">${detailed.phonemes}</code></div>`;
  html += `<div class="small"><strong>Total Frames:</strong> ${detailed.raw.frames}</div>`;
  html += `<div class="small"><strong>Vocabulary Size:</strong> ${detailed.raw.vocabSize}</div>`;
  html += `<div class="small"><strong>Phonemes Detected:</strong> ${detailed.details.length}</div>`;
  html += "</div>";

  // Phoneme details with confidence and duration
  html += '<div class="mb-4">';
  html += '<h6 class="fw-bold text-primary">Phoneme Details (After CTC Decoding & Filtering)</h6>';
  html += '<div class="table-responsive">';
  html += '<table class="table table-sm table-striped">';
  html +=
    "<thead><tr><th>Symbol</th><th>Confidence</th><th>Duration (frames)</th><th>Confidence Bar</th></tr></thead>";
  html += "<tbody>";

  for (const phoneme of detailed.details) {
    const confidencePercent = Math.min(100, (phoneme.confidence / 10) * 100); // Normalize exp(logit)
    const confidenceColor =
      confidencePercent > 80 ? "success" : confidencePercent > 50 ? "warning" : "danger";

    html += "<tr>";
    html += `<td><code class="fs-6 fw-bold">${phoneme.symbol}</code></td>`;
    html += `<td>${phoneme.confidence.toFixed(3)}</td>`;
    html += `<td>${phoneme.duration}</td>`;
    html += `<td><div class="progress" style="height: 20px;"><div class="progress-bar bg-${confidenceColor}" style="width: ${confidencePercent}%">${confidencePercent.toFixed(0)}%</div></div></td>`;
    html += "</tr>";
  }

  html += "</tbody></table>";
  html += "</div>";
  html += "</div>";

  // Frame-by-frame top predictions
  html += '<div class="mb-3">';
  html += '<h6 class="fw-bold text-primary">Frame-by-Frame Top Predictions</h6>';
  html +=
    '<p class="small text-muted">Probability shown as percentage (01-99). ⎵ = blank/silence. Leading and trailing blank frames are collapsed.</p>';

  html +=
    '<pre style="font-family: monospace; font-size: 0.85rem; line-height: 1.3; background: #f8f9fa; padding: 1rem; border-radius: 0.25rem; overflow-x: auto;">';
  html += buildFrameText(detailed.raw.frameData);
  html += "</pre>";

  html += "</div>";

  return html;
}

const BLANK_SYMBOLS = new Set(["<blk>", "▁"]);
const BLANK_DISPLAY = "⎵"; // visually similar to |_|, represents blank/silence

/**
 * Build plain-text frame-by-frame visualization.
 * Leading and trailing blank-only frames are collapsed to a single "empty" line.
 * Exported for reuse by CLI scripts.
 */
export function buildFrameText(frameData: FrameData[]): string {
  if (frameData.length === 0) return "No frame data";

  // Build one entry per frame: the formatted text and whether it is blank-only
  const lines = frameData.map((frame) => {
    const predictions = [...frame.topPredictions]
      .filter((p) => p.probability >= 0.08)
      .sort((a, b) => b.probability - a.probability);

    // First column: blank/silence token (always), or 4 spaces for alignment
    const blankPred = predictions.find((p) => BLANK_SYMBOLS.has(p.symbol));
    const nonBlankPreds = predictions.filter((p) => !BLANK_SYMBOLS.has(p.symbol));

    const firstCol = blankPred
      ? `${BLANK_DISPLAY}:${Math.min(99, Math.floor(blankPred.probability * 100))
          .toString()
          .padStart(2, "0")}`
      : "    "; // 4 spaces matches width of "⎵:NN"

    const rest = nonBlankPreds
      .map((p) => {
        const pct = Math.min(99, Math.floor(p.probability * 100));
        return `${p.symbol}:${pct.toString().padStart(2, "0")}`;
      })
      .join("  ");

    const text = rest ? `${firstCol}  ${rest}` : firstCol.trimEnd();

    const isBlankOnly =
      predictions.length === 0 || predictions.every((p) => BLANK_SYMBOLS.has(p.symbol));

    return { text, isBlankOnly };
  });

  // Locate first / last non-blank frame
  const nonBlankIndices = lines.map((l, i) => (l.isBlankOnly ? -1 : i)).filter((i) => i >= 0);
  const firstNonBlank = nonBlankIndices.length > 0 ? nonBlankIndices[0] : lines.length;
  const lastNonBlank =
    nonBlankIndices.length > 0 ? nonBlankIndices[nonBlankIndices.length - 1] : -1;

  const rows: string[] = [];
  let t = 0;
  while (t < lines.length) {
    const from = t.toString().padStart(3, "0");
    if (t < firstNonBlank) {
      const end = firstNonBlank - 1;
      rows.push(t < end ? `${from}..${end.toString().padStart(3, "0")}: empty` : `${from}: empty`);
      t = firstNonBlank;
    } else if (t > lastNonBlank) {
      const end = lines.length - 1;
      rows.push(t < end ? `${from}..${end.toString().padStart(3, "0")}: empty` : `${from}: empty`);
      break;
    } else {
      rows.push(`${from}: ${lines[t].text}`);
      t++;
    }
  }

  return rows.join("\n");
}
