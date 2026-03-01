import os
import numpy as np
import kaldi_native_fbank as knf

def load_tokens(token_file):
    tokens = {}
    if not os.path.exists(token_file):
        print(f"Warning: Token file {token_file} not found.")
        return {}

    with open(token_file, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 1:
                token = parts[0]
                idx = int(parts[1]) if len(parts) > 1 else len(tokens)
                tokens[idx] = token
    return tokens

def ctc_greedy_decode(probs, vocab, lengths=None):
    # probs: (Batch, Time, Vocab) or (Time, Vocab)
    is_batch = len(probs.shape) == 3
    if not is_batch:
        probs = probs[np.newaxis, :, :]

    if lengths is None:
        lengths = np.array([probs.shape[1]] * probs.shape[0])

    batch_size = probs.shape[0]
    preds = np.argmax(probs, axis=-1)

    results = []
    blank_id = 0

    for b in range(batch_size):
        decoded = []
        prev_idx = -1
        valid_len = lengths[b]
        for t in range(valid_len):
            idx = preds[b, t]
            if idx != blank_id and idx != prev_idx:
                decoded.append(vocab.get(idx, ""))
            prev_idx = idx
        results.append(decoded)

    if not is_batch:
        return results[0]
    return results

def transducer_greedy_decode(encoder_out, decoder_model, joiner_model, vocab, lengths=None):
    # encoder_out: (Batch, Time, D) or (Time, D)
    is_batch = len(encoder_out.shape) == 3
    if not is_batch:
        encoder_out = encoder_out[np.newaxis, :, :]

    if lengths is None:
        lengths = np.array([encoder_out.shape[1]] * encoder_out.shape[0])

    batch_size = encoder_out.shape[0]
    results = []

    for b in range(batch_size):
        enc_seq = encoder_out[b, :lengths[b], :]

        decoded = []
        decoder_input = np.zeros((1, 2), dtype=np.int64)
        dec_out = decoder_model.run(None, {"y": decoder_input})[0]

        T = enc_seq.shape[0]
        blank_id = 0
        max_sym_per_frame = 3

        for t in range(T):
            enc_frame = enc_seq[t:t+1, :]

            for _ in range(max_sym_per_frame):
                joiner_out = joiner_model.run(None, {
                    "encoder_out": enc_frame,
                    "decoder_out": dec_out
                })[0]

                pred = np.argmax(joiner_out, axis=-1).item()

                if pred == blank_id:
                    break
                else:
                    decoded.append(vocab.get(pred, ""))
                    decoder_input[0, 0] = decoder_input[0, 1]
                    decoder_input[0, 1] = pred
                    dec_out = decoder_model.run(None, {"y": decoder_input})[0]

        results.append(decoded)

    if not is_batch:
        return results[0]
    return results

def get_fbank_extractor():
    opts = knf.FbankOptions()
    opts.frame_opts.dither = 0
    opts.mel_opts.num_bins = 80
    opts.frame_opts.snip_edges = False
    return knf.OnlineFbank(opts)
