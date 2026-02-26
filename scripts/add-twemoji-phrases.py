#!/usr/bin/env python3
"""
Add new phrases based on the twemoji emoji set to phrases-de.yaml and phrases-en.yaml.
German format: "Der/Die/Das [word]" + a simple sentence.
English format: "[word]" (if missing) + a simple sentence.
Levels are left blank so update-difficulty.py fills them in.
"""
import sys
from pathlib import Path
import yaml

REPO_ROOT = Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# New German phrases (Der/Die/Das [word]  +  sentence)
# Each tuple: (phrase, emoji, [ipa, ...])
# ---------------------------------------------------------------------------
NEW_DE = [
    # --- food ---
    ("Der Brokkoli",              "🥦", ["/deːɐ̯ ˈbʁɔkoli/"]),
    ("Der Brokkoli ist grün",     "🥦", ["/deːɐ̯ ˈbʁɔkoli ɪst ɡʁyːn/"]),
    ("Die Kiwi",                  "🥝", ["/diː ˈkiːvi/"]),
    ("Die Kiwi ist grün",         "🥝", ["/diː ˈkiːvi ɪst ɡʁyːn/"]),
    ("Die Wassermelone",          "🍉", ["/diː ˈvasɐmeloːnə/"]),
    ("Die Wassermelone ist groß", "🍉", ["/diː ˈvasɐmeloːnə ɪst ɡʁoːs/"]),
    ("Die Zwiebel",               "🧅", ["/diː ˈtsviːbəl/"]),
    ("Die Zwiebel riecht stark",  "🧅", ["/diː ˈtsviːbəl ʁiːçt ʃtaʁk/"]),
    ("Das Ei",                    "🥚", ["/das aɪ̯/"]),
    ("Das Ei ist rund",           "🥚", ["/das aɪ̯ ɪst ʁʊnt/"]),
    ("Die Waffel",                "🧇", ["/diː ˈvafəl/"]),
    ("Die Waffel ist warm",       "🧇", ["/diː ˈvafəl ɪst vaʁm/"]),
    ("Die Erdnuss",               "🥜", ["/diː ˈeːɐ̯tnʊs/"]),
    ("Die Erdnuss ist lecker",    "🥜", ["/diː ˈeːɐ̯tnʊs ɪst ˈlɛkɐ/"]),
    ("Der Donut",                 "🍩", ["/deːɐ̯ ˈdoːnʊt/"]),
    ("Der Donut ist süß",         "🍩", ["/deːɐ̯ ˈdoːnʊt ɪst zyːs/"]),
    # --- animals ---
    ("Das Känguru",               "🦘", ["/das ˈkɛŋɡuːʁu/"]),
    ("Das Känguru springt weit",  "🦘", ["/das ˈkɛŋɡuːʁu ʃpʁɪŋt vaɪ̯t/"]),
    ("Das Krokodil",              "🐊", ["/das kʁokoˈdiːl/"]),
    ("Das Krokodil schnappt zu",  "🐊", ["/das kʁokoˈdiːl ʃnapt tsuː/"]),
    ("Der Hai",                   "🦈", ["/deːɐ̯ haɪ̯/"]),
    ("Der Hai schwimmt schnell",  "🦈", ["/deːɐ̯ haɪ̯ ʃvɪmt ʃnɛl/"]),
    ("Der Papagei",               "🦜", ["/deːɐ̯ papaˈɡaɪ̯/"]),
    ("Der Papagei redet viel",    "🦜", ["/deːɐ̯ papaˈɡaɪ̯ ˈʁeːdət fiːl/"]),
    ("Der Flamingo",              "🦩", ["/deːɐ̯ flaˈmɪŋɡo/"]),
    ("Der Flamingo ist rosa",     "🦩", ["/deːɐ̯ flaˈmɪŋɡo ɪst ˈʁoːza/"]),
    ("Der Pfau",                  "🦚", ["/deːɐ̯ pfaʊ̯/"]),
    ("Der Pfau ist bunt",         "🦚", ["/deːɐ̯ pfaʊ̯ ɪst bʊnt/"]),
    # --- instruments ---
    ("Die Gitarre",               "🎸", ["/diː ɡiˈtaʁə/"]),
    ("Die Gitarre klingt schön",  "🎸", ["/diː ɡiˈtaʁə klɪŋt ʃøːn/"]),
    ("Das Schlagzeug",            "🥁", ["/das ˈʃlaːktsɔɪ̯k/"]),
    ("Das Schlagzeug macht Lärm", "🥁", ["/das ˈʃlaːktsɔɪ̯k maxt lɛʁm/"]),
    ("Die Trompete",              "🎺", ["/diː tʁɔmˈpeːtə/"]),
    ("Die Trompete klingt laut",  "🎺", ["/diː tʁɔmˈpeːtə klɪŋt laʊ̯t/"]),
    ("Die Geige",                 "🎻", ["/diː ˈɡaɪ̯ɡə/"]),
    ("Die Geige klingt schön",    "🎻", ["/diː ˈɡaɪ̯ɡə klɪŋt ʃøːn/"]),
    # --- objects / other ---
    ("Der Regenschirm",                        "☂️", ["/deːɐ̯ ˈʁeːɡənˌʃɪʁm/"]),
    ("Der Regenschirm schützt vor Regen",      "☂️", ["/deːɐ̯ ˈʁeːɡənˌʃɪʁm ʃʏtst foːɐ̯ ˈʁeːɡən/"]),
    ("Der Magnet",                "🧲", ["/deːɐ̯ maɡˈneːt/"]),
    ("Der Magnet zieht Eisen an", "🧲", ["/deːɐ̯ maɡˈneːt tsiːt ˈaɪ̯zən an/"]),
    ("Das Teleskop",              "🔭", ["/das teləˈskoːp/"]),
    ("Das Teleskop zeigt die Sterne", "🔭",   ["/das teləˈskoːp tsaɪ̯kt diː ˈʃtɛʁnə/"]),
    ("Der Teddybär",              "🧸", ["/deːɐ̯ ˈtɛdiˌbɛːɐ̯/"]),
    ("Der Teddybär ist weich",    "🧸", ["/deːɐ̯ ˈtɛdiˌbɛːɐ̯ ɪst vaɪ̯ç/"]),
    ("Das Zelt",                  "⛺", ["/das tsɛlt/"]),
    ("Das Zelt steht im Wald",    "⛺", ["/das tsɛlt ʃteːt ɪm valt/"]),
    ("Der Hubschrauber",          "🚁", ["/deːɐ̯ ˈhuːpˌʃʁaʊ̯bɐ/"]),
    ("Der Hubschrauber fliegt hoch", "🚁",    ["/deːɐ̯ ˈhuːpˌʃʁaʊ̯bɐ fliːɡt hoːx/"]),
    ("Die Rakete",                "🚀", ["/diː ʁaˈkeːtə/"]),
    ("Die Rakete fliegt ins All", "🚀", ["/diː ʁaˈkeːtə fliːɡt ɪns al/"]),
]

# ---------------------------------------------------------------------------
# New English phrases
# Tuples: (phrase, emoji, [ipa])
# We skip words already in the file; just add the word + a sentence.
# ---------------------------------------------------------------------------
NEW_EN = [
    # words not yet in file
    ("watermelon",                  "🍉", ["/ˈwɔː.tə.mɛl.ən/"]),
    ("egg",                         "🥚", ["/ɛɡ/"]),
    ("waffle",                      "🧇", ["/ˈwɒf.əl/"]),
    ("donut",                       "🍩", ["/ˈdəʊ.nʌt/"]),
    ("kangaroo",                    "🦘", ["/ˌkæŋ.ɡəˈruː/"]),
    ("flamingo",                    "🦩", ["/fləˈmɪŋ.ɡəʊ/"]),
    ("magnet",                      "🧲", ["/ˈmæɡ.nɪt/"]),
    ("teddy bear",                  "🧸", ["/ˈtɛd.i bɛː/"]),
    ("tent",                        "⛺", ["/tɛnt/"]),
    # sentences (word already exists → just the sentence)
    ("The kiwi is green",           "🥝", ["/ðə ˈkiː.wi ɪz ɡɹiːn/"]),
    ("The watermelon is big",       "🍉", ["/ðə ˈwɔː.tə.mɛl.ən ɪz bɪɡ/"]),
    ("The egg is round",            "🥚", ["/ðɪ ɛɡ ɪz ɹaʊnd/"]),
    ("The waffle is warm",          "🧇", ["/ðə ˈwɒf.əl ɪz wɔːm/"]),
    ("The donut is sweet",          "🍩", ["/ðə ˈdəʊ.nʌt ɪz swiːt/"]),
    ("The kangaroo jumps far",      "🦘", ["/ðə ˌkæŋ.ɡəˈruː dʒʌmps fɑː/"]),
    ("The crocodile is big",        "🐊", ["/ðə ˈkɹɒk.ə.daɪl ɪz bɪɡ/"]),
    ("The flamingo is pink",        "🦩", ["/ðə fləˈmɪŋ.ɡəʊ ɪz pɪŋk/"]),
    ("The shark swims fast",        "🦈", ["/ðə ʃɑːk swɪmz fɑːst/"]),
    ("The parrot talks a lot",      "🦜", ["/ðə ˈpær.ət tɔːks ə lɒt/"]),
    ("The peacock is colourful",    "🦚", ["/ðə ˈpiː.kɒk ɪz ˈkʌl.ə.fəl/"]),
    ("The guitar sounds great",     "🎸", ["/ðə ɡɪˈtɑː saʊndz ɡɹeɪt/"]),
    ("The drum is loud",            "🥁", ["/ðə dɹʌm ɪz laʊd/"]),
    ("The trumpet is loud",         "🎺", ["/ðə ˈtɹʌm.pɪt ɪz laʊd/"]),
    ("The violin sounds great",     "🎻", ["/ðə vaɪəˈlɪn saʊndz ɡɹeɪt/"]),
    ("The umbrella keeps you dry",  "☂️", ["/ðə ʌmˈbɹɛl.ə kiːps jə dɹaɪ/"]),
    ("The magnet pulls iron",       "🧲", ["/ðə ˈmæɡ.nɪt pʊlz ˈaɪ.ən/"]),
    ("The telescope shows stars",   "🔭", ["/ðə ˈtɛl.ɪ.skəʊp ʃəʊz stɑːz/"]),
    ("The teddy bear is soft",      "🧸", ["/ðə ˈtɛd.i bɛː ɪz sɒft/"]),
    ("The tent stands in the woods","⛺", ["/ðə tɛnt stændz ɪn ðə wʊdz/"]),
    ("The helicopter flies high",   "🚁", ["/ðə ˈhɛl.ɪ.kɒp.tə flaɪz haɪ/"]),
    ("The rocket flies high",       "🚀", ["/ðə ˈɹɒk.ɪt flaɪz haɪ/"]),
    ("The broccoli is healthy",     "🥦", ["/ðə ˈbɹɒk.ə.li ɪz ˈhɛl.θi/"]),
    ("The onion smells strong",     "🧅", ["/ðɪ ˈʌn.jən smɛlz stɹɒŋ/"]),
    ("The peanut is tasty",         "🥜", ["/ðə ˈpiː.nʌt ɪz ˈteɪs.ti/"]),
]


def build_entry(phrase: str, emoji: str, ipas: list[str]) -> dict:
    return {
        "phrase": phrase,
        "emoji": emoji,
        "ipas": [{"ipa": ipa, "category": "standard"} for ipa in ipas],
    }


def add_phrases(yaml_path: Path, new_entries: list[tuple]) -> int:
    with open(yaml_path, encoding="utf-8") as f:
        existing = yaml.safe_load(f)

    existing_phrases = {e["phrase"] for e in existing}

    added = 0
    for phrase, emoji, ipas in new_entries:
        if phrase in existing_phrases:
            print(f"  skip (already exists): {phrase}")
            continue
        existing.append(build_entry(phrase, emoji, ipas))
        existing_phrases.add(phrase)
        print(f"  + {phrase}")
        added += 1

    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(
            existing,
            f,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
            width=120,
        )
    return added


def main():
    de_path = REPO_ROOT / "phrases-de.yaml"
    en_path = REPO_ROOT / "phrases-en.yaml"

    print(f"\n🇩🇪 Adding German phrases to {de_path.name}…")
    n_de = add_phrases(de_path, NEW_DE)
    print(f"   → added {n_de} entries\n")

    print(f"🇬🇧 Adding English phrases to {en_path.name}…")
    n_en = add_phrases(en_path, NEW_EN)
    print(f"   → added {n_en} entries\n")

    print("✅ Done. Run update-difficulty.py next.")


if __name__ == "__main__":
    main()
