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

  // Frame-by-frame top predictions (vertical alignment view)
  html += '<div class="mb-3">';
  html += '<h6 class="fw-bold text-primary">Frame-by-Frame Top Predictions</h6>';
  html += '<p class="small text-muted">Symbols align vertically when they continue across frames. Probability shown as percentage (01-99).</p>';

  // Build vertical alignment visualization
  const frameViz = buildFrameVisualization(detailed.raw.frameData);

  html += '<pre style="font-family: monospace; font-size: 0.85rem; line-height: 1.3; background: #f8f9fa; padding: 1rem; border-radius: 0.25rem; overflow-x: auto;">';
  html += frameViz;
  html += '</pre>';

  html += "</div>";

  return html;
}

/**
 * Build vertical frame-by-frame visualization where symbols align in columns
 */
function buildFrameVisualization(frameData: FrameData[]): string {
  if (frameData.length === 0) return "No frame data";

  // Track column assignments: Map<symbol, columnIndex>
  const columnMap = new Map<string, number>();
  const rows: string[] = [];

  // Header
  rows.push("Frame | Predictions (symbol:prob%)");
  rows.push("------|" + "-".repeat(60));

  for (const frame of frameData) {
    // Get top predictions sorted by probability, filter out low confidence predictions
    const predictions = [...frame.topPredictions]
      .filter(p => p.probability >= 0.14)  // Hide symbols with prob < 14%
      .sort((a, b) => b.probability - a.probability);

    // Update column assignments
    const currentSymbols = new Set(predictions.map(p => p.symbol));

    // Remove symbols that are no longer in top predictions
    for (const [symbol] of columnMap.entries()) {
      if (!currentSymbols.has(symbol)) {
        columnMap.delete(symbol);
      }
    }

    // Assign columns to new symbols
    for (const pred of predictions) {
      if (!columnMap.has(pred.symbol)) {
        // Find lowest available column
        const usedColumns = new Set(columnMap.values());
        let col = 0;
        while (usedColumns.has(col)) col++;
        columnMap.set(pred.symbol, col);
      }
    }

    // Build row with symbols in their assigned columns
    const columns: Array<{ symbol: string; prob: number }> = [];
    for (const pred of predictions) {
      const col = columnMap.get(pred.symbol)!;
      while (columns.length <= col) {
        columns.push({ symbol: "", prob: 0 });
      }
      columns[col] = {
        symbol: pred.symbol,
        prob: Math.min(99, Math.round(pred.probability * 100))
      };
    }

    // Format row
    const frameNum = frame.frameIndex.toString().padStart(5, " ");
    const cells = columns
      .map(c => c.symbol ? `${c.symbol}:${c.prob.toString().padStart(2, "0")}` : "     ")
      .join(" ");

    rows.push(`${frameNum} | ${cells}`);
  }

  return rows.join("\n");
}
