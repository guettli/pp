import onnxruntime as ort
import numpy as np

ort_session = ort.InferenceSession("phoneme_scorer_v2_wav2vec2.onnx")
dummy_input = np.random.randn(1, 16000).astype(np.float32)
outputs = ort_session.run(None, {"input_values": dummy_input})
print("ONNX output shape:", outputs[0].shape)
