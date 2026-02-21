import { extractKaldiFbank } from "../../wasm/kaldi-fbank/index.js";

export async function buildPhonemeFeeds<T>(
  audioData: Float32Array,
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => T,
): Promise<{ x: T; x_lens: T }> {
  const melBands = 80;
  const melFeatures = await extractKaldiFbank(audioData);
  const numFrames = melFeatures.length / melBands;
  return {
    x: new Tensor("float32", melFeatures, [1, numFrames, melBands]),
    x_lens: new Tensor("int64", new BigInt64Array([BigInt(numFrames)]), [1]),
  };
}
