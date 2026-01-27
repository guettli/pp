from transformers import AutoModelForCTC, AutoProcessor
import torch

model_id = "ct-vikramanantha/phoneme-scorer-v2-wav2vec2"
model = AutoModelForCTC.from_pretrained(model_id)
processor = AutoProcessor.from_pretrained(model_id)

# Example input: 1 second of 16kHz audio (change as needed)
dummy_input = torch.randn(1, 16000)

torch.onnx.export(
    model,
    dummy_input,
    "phoneme_scorer_v2_wav2vec2.onnx",
    input_names=["input_values"],
    output_names=["logits"],
    dynamic_axes={
        "input_values": {1: "sequence_length"},
        "logits": {1: "sequence_length"},
    },
    opset_version=17,  # Use a recent opset for WebGPU support
)
print("Exported to phoneme_scorer_v2_wav2vec2.onnx")
