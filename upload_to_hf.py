#!/usr/bin/env python3
import os
from huggingface_hub import HfApi

# Configuration
HF_USERNAME = os.environ.get("USER", "").strip()
if not HF_USERNAME:
    raise RuntimeError(
        "Environment variable USER is empty. Please set USER to your Hugging Face username."
    )
MODEL_NAME = "zipa-small-ctc-onnx-2026-01-28"
LOCAL_FOLDER = "onnx/zipa-export-2026-01-28"


# Optionally, include git commit hash for traceability
def get_git_commit_hash():
    try:
        import subprocess

        return (
            subprocess.check_output(["git", "rev-parse", "HEAD"])
            .decode("utf-8")
            .strip()
        )
    except Exception:
        return "unknown"


def main():
    api = HfApi()
    repo_id = f"{HF_USERNAME}/{MODEL_NAME}"

    commit_hash = get_git_commit_hash()
    description = (
        "ZIPA small CTC model exported to ONNX format. "
        "Contains model.onnx and vocab.json generated from the Colab notebook. "
        "See onnx/zipa_export_colab.ipynb for details.\n"
        f"\nCode commit: {commit_hash}"
    )

    print(f"Ensuring repository exists: {repo_id}")
    api.create_repo(repo_id=repo_id, exist_ok=True)

    # Ensure README, LICENSE, and .hfignore are present in the upload folder
    for fname in ["README.md", "LICENSE", ".hfignore"]:
        src = os.path.join(LOCAL_FOLDER, fname)
        if not os.path.exists(src):
            print(f"Warning: {fname} not found in {LOCAL_FOLDER}.")

    print(f"Uploading contents of {LOCAL_FOLDER} to {repo_id}...")
    api.upload_folder(
        folder_path=LOCAL_FOLDER,
        repo_id=repo_id,
        repo_type="model",
        commit_description=description,
    )
    print("Upload complete.")


if __name__ == "__main__":
    main()
