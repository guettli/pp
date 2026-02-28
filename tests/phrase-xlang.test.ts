import { describe, expect, it } from "vitest";
import type { Phrase } from "../src/types";
import { getPhraseInLang } from "../src/utils/phrase-xlang";

describe("getPhraseInLang", () => {
  const enPhrase: Phrase = {
    phrase: "Cat",
    emoji: "🐱",
    ipas: [],
    level: 1,
    "en-GB": "Cat",
  };

  it("returns en-GB for en-GB", () => {
    expect(getPhraseInLang(enPhrase, "en-GB")).toBe("Cat");
  });

  it("returns uiLang phrase for de-DE", () => {
    // Should return "Katze" for de-DE, but will fail if not implemented
    expect(getPhraseInLang(enPhrase, "de-DE")).toBe("Katze");
  });

  it("returns uiLang phrase for fr-FR", () => {
    // Should return "Le chat" for fr-FR, but will fail if not implemented
    expect(getPhraseInLang(enPhrase, "fr-FR")).toBe("Le chat");
  });
});
