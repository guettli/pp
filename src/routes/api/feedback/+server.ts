import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { json, type RequestEvent } from "@sveltejs/kit";

export async function POST({ request }: RequestEvent): Promise<Response> {
  const formData = await request.formData();

  const text = formData.get("text") as string | null;
  const phrase = formData.get("phrase") as string;
  const uiLang = formData.get("uiLang") as string;
  const studyLang = formData.get("studyLang") as string;
  const audio = formData.get("audio") as File | null;
  const recordedPhrase = formData.get("recordedPhrase") as File | null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const feedbackDir = join(process.cwd(), "feedback");

  await mkdir(feedbackDir, { recursive: true });

  const meta = { timestamp, phrase, uiLang, studyLang, text };
  await writeFile(join(feedbackDir, `${timestamp}.json`), JSON.stringify(meta, null, 2));

  if (audio && audio.size > 0) {
    const audioBuffer = await audio.arrayBuffer();
    await writeFile(join(feedbackDir, `${timestamp}-audio.webm`), new Uint8Array(audioBuffer));
  }

  if (recordedPhrase && recordedPhrase.size > 0) {
    const buffer = await recordedPhrase.arrayBuffer();
    await writeFile(join(feedbackDir, `${timestamp}-phrase.webm`), new Uint8Array(buffer));
  }

  return json({ ok: true });
}
