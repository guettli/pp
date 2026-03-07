// tests/worker-opus-debug.js
// Worker thread: extracts IPA from a batch of opus files and writes .debug.yaml files.

import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import yaml from "js-yaml";

import { readAudioFile } from "../build/node/src/lib/audio.js";
import { extractPhonemesDetailed, loadPhonemeModel } from "../build/node/src/lib/phoneme-model.js";

let session = null;
let idToToken = null;

async function initModel(modelPath, vocabPath) {
  const result = await loadPhonemeModel({
    modelPath,
    vocabPath,
    useCache: false,
    singleThreaded: true,
  });
  session = result.session;
  idToToken = result.idToToken;
}

async function processTask(task) {
  const { audioPath, studyLang, voice, outputPath } = task;
  try {
    const audio = readAudioFile(audioPath);
    const result = await extractPhonemesDetailed(audio, session, idToToken);

    const debugData = {
      datetime: new Date().toISOString(),
      audio_file: audioPath,
      studyLang,
      voice,
      ipa: result.phonemes,
      details: result.details,
      raw: result.raw,
    };

    fs.writeFileSync(outputPath, yaml.dump(debugData, { lineWidth: -1 }));
    parentPort.postMessage({ status: "ok", audioPath });
  } catch (error) {
    parentPort.postMessage({ status: "error", audioPath, error: error.message });
  }
}

async function main() {
  const { modelPath, vocabPath, tasks } = workerData;
  await initModel(modelPath, vocabPath);
  for (const task of tasks) {
    await processTask(task);
  }
  parentPort.postMessage({ status: "done" });
}

main().catch((e) => {
  parentPort.postMessage({ status: "error", error: e.message });
});
