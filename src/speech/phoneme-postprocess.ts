/**
 * Shared helper for extracting logits from ONNX inference results.
 * Works with both onnxruntime-web (browser worker) and onnxruntime-node.
 */

interface TensorLike {
  data: unknown;
  dims: readonly number[];
}

interface OrtResults {
  logits?: TensorLike;
  log_probs?: TensorLike;
  [key: string]: TensorLike | undefined;
}

/**
 * Extract logitsData, seqLen, and vocabSize from ONNX session.run() results.
 * Throws if no output tensor is found.
 */
export function extractLogitsTensor(results: OrtResults): {
  logitsData: Float32Array;
  seqLen: number;
  vocabSize: number;
} {
  const tensor = results.logits ?? results.log_probs ?? results[Object.keys(results)[0]];
  if (!tensor) {
    throw new Error(
      "No logits output found in ONNX results. Available keys: " + Object.keys(results).join(", "),
    );
  }
  return {
    logitsData: tensor.data as Float32Array,
    seqLen: tensor.dims[1],
    vocabSize: tensor.dims[2],
  };
}
