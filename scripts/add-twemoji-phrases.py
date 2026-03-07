#!/usr/bin/env python3
"""
Add new phrases based on the twemoji emoji set to phrases-de-DE.yaml, phrases-en-GB.yaml, phrases-fr-FR.yaml.
German format: "Der/Die/Das [word]" + a simple sentence.
English format: "[word]" (if missing) + a simple sentence.
French format: "Le/La/L'[word]" + a simple sentence.
Levels are left blank so update-difficulty.py fills them in.
"""
import argparse
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
    ("Die Suppe",                 "🍲", ["/diː ˈzʊpə/"]),
    ("Die Suppe ist heiß",        "🍲", ["/diː ˈzʊpə ɪst haɪ̯s/"]),
    ("Der Salat",                 "🥗", ["/deːɐ̯ zaˈlaːt/"]),
    ("Der Honig",                 "🍯", ["/deːɐ̯ ˈhoːnɪç/"]),
    ("Der Honig ist süß",         "🍯", ["/deːɐ̯ ˈhoːnɪç ɪst zyːs/"]),
    ("Der Reis",                  "🍚", ["/deːɐ̯ ʁaɪ̯s/"]),
    ("Die Nudeln",                "🍝", ["/diː ˈnuːdəln/"]),
    ("Die Nudeln sind lecker",    "🍝", ["/diː ˈnuːdəln zɪnt ˈlɛkɐ/"]),
    ("Der Keks",                  "🍪", ["/deːɐ̯ keːks/"]),
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
    ("Das Klavier",               "🎹", ["/das klaˈviːɐ̯/"]),
    ("Das Klavier klingt schön",  "🎹", ["/das klaˈviːɐ̯ klɪŋt ʃøːn/"]),
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
    # --- colors ---
    ("Rot",                       "🔴", ["/ʁoːt/"]),
    ("Blau",                      "🔵", ["/blaʊ̯/"]),
    ("Grün",                      "💚", ["/ɡʁyːn/"]),
    ("Gelb",                      "💛", ["/ɡɛlp/"]),
    ("Schwarz",                   "🖤", ["/ʃvaʁts/"]),
    ("Weiß",                      "⬜", ["/vaɪ̯s/"]),
    ("Lila",                      "💜", ["/ˈliːla/"]),
    ("Rosa",                      "🩷", ["/ˈʁoːza/"]),
    # --- body parts (new ones) ---
    ("Der Kopf",                  "👤", ["/deːɐ̯ kɔpf/"]),
    ("Der Arm",                   "💪", ["/deːɐ̯ aʁm/"]),
    ("Das Bein",                  "🦵", ["/das baɪ̯n/"]),
    ("Der Finger",                "☝️", ["/deːɐ̯ ˈfɪŋɐ/"]),
    ("Die Zunge",                 "👅", ["/diː ˈtsʊŋə/"]),
    # --- clothing ---
    ("Die Hose",                  "👖", ["/diː ˈhoːzə/"]),
    ("Die Hose ist bequem",       "👖", ["/diː ˈhoːzə ɪst bəˈkveːm/"]),
    ("Die Jacke",                 "🧥", ["/diː ˈjakə/"]),
    ("Die Jacke ist warm",        "🧥", ["/diː ˈjakə ɪst vaʁm/"]),
    ("Der Schal",                 "🧣", ["/deːɐ̯ ʃaːl/"]),
    ("Die Mütze",                 "🧢", ["/diː ˈmʏtsə/"]),
    ("Der Handschuh",             "🧤", ["/deːɐ̯ ˈhantʃuː/"]),
    ("Die Socke",                 "🧦", ["/diː ˈzɔkə/"]),
    # --- nature / landscape ---
    ("Der Berg",                  "⛰️", ["/deːɐ̯ bɛʁk/"]),
    ("Der Berg ist hoch",         "⛰️", ["/deːɐ̯ bɛʁk ɪst hoːx/"]),
    ("Das Meer",                  "🌊", ["/das meːɐ̯/"]),
    ("Das Meer ist blau",         "🌊", ["/das meːɐ̯ ɪst blaʊ̯/"]),
    ("Der Strand",                "🏖️", ["/deːɐ̯ ʃtʁant/"]),
    ("Der Strand ist warm",       "🏖️", ["/deːɐ̯ ʃtʁant ɪst vaʁm/"]),
    ("Der Wald",                  "🌲", ["/deːɐ̯ valt/"]),
    ("Der Wald ist grün",         "🌲", ["/deːɐ̯ valt ɪst ɡʁyːn/"]),
    ("Die Insel",                 "🏝️", ["/diː ˈɪnzəl/"]),
    ("Die Insel ist klein",       "🏝️", ["/diː ˈɪnzəl ɪst klaɪ̯n/"]),
    ("Der Vulkan",                "🌋", ["/deːɐ̯ vʊlˈkaːn/"]),
    ("Der Vulkan bricht aus",     "🌋", ["/deːɐ̯ vʊlˈkaːn bʁɪçt aʊ̯s/"]),
    ("Der Blitz",                 "⚡", ["/deːɐ̯ blɪts/"]),
    ("Der Blitz leuchtet hell",   "⚡", ["/deːɐ̯ blɪts lɔʏçtət hɛl/"]),
    # --- sport ---
    ("Das Tennis",                "🎾", ["/das ˈtɛnɪs/"]),
    # --- simple single words missing ---
    ("Feuer",                     "🔥", ["/ˈfɔʏ̯ɐ/"]),
]

# ---------------------------------------------------------------------------
# New French phrases (Le/La/L' [word]  +  sentence)
# Tuples: (phrase, emoji, [ipa])
# IPA without slashes, category "vowels" (consistent with existing French entries)
# ---------------------------------------------------------------------------
NEW_FR = [
    # --- animals ---
    ("Le lapin",                              "🐰", ["lə la.pɛ̃"]),
    ("Le lapin mange des carottes.",          "🐰", ["lə la.pɛ̃ mɑ̃ʒ de ka.ʁɔt"]),
    ("Le cheval",                             "🐴", ["lə ʃə.val"]),
    ("Le cheval galope dans le pré.",         "🐴", ["lə ʃə.val ɡa.lɔp dɑ̃ lə pʁe"]),
    ("La vache",                              "🐮", ["la vaʃ"]),
    ("La vache donne du lait.",               "🐮", ["la vaʃ dɔn dy lɛ"]),
    ("Le cochon",                             "🐷", ["lə kɔ.ʃɔ̃"]),
    ("Le cochon grogne.",                     "🐷", ["lə kɔ.ʃɔ̃ ɡʁɔɲ"]),
    ("Le mouton",                             "🐑", ["lə mu.tɔ̃"]),
    ("Le mouton bêle.",                       "🐑", ["lə mu.tɔ̃ bɛl"]),
    ("Le lion",                               "🦁", ["lə ljɔ̃"]),
    ("Le lion rugit fort.",                   "🦁", ["lə ljɔ̃ ʁy.ʒi fɔʁ"]),
    ("L'ours",                                "🐻", ["luʁs"]),
    ("L'ours mange du miel.",                 "🐻", ["luʁs mɑ̃ʒ dy mjɛl"]),
    ("Le tigre",                              "🐯", ["lə tiɡʁ"]),
    ("Le tigre court vite.",                  "🐯", ["lə tiɡʁ kuʁ vit"]),
    ("L'éléphant",                            "🐘", ["le.le.fɑ̃"]),
    ("L'éléphant est très grand.",            "🐘", ["le.le.fɑ̃ ɛ tʁɛ ɡʁɑ̃"]),
    ("La girafe",                             "🦒", ["la ʒi.ʁaf"]),
    ("La girafe a un long cou.",              "🦒", ["la ʒi.ʁaf a œ̃ lɔ̃ ku"]),
    ("Le canard",                             "🦆", ["lə ka.naʁ"]),
    ("Le canard nage sur l'étang.",           "🦆", ["lə ka.naʁ naʒ syʁ le.tɑ̃"]),
    ("Le hibou",                              "🦉", ["lə i.bu"]),
    ("Le hibou vole la nuit.",                "🦉", ["lə i.bu vɔl la nɥi"]),
    ("Le renard",                             "🦊", ["lə ʁə.naʁ"]),
    ("Le renard est rusé.",                   "🦊", ["lə ʁə.naʁ ɛ ʁy.ze"]),
    ("Le singe",                              "🐵", ["lə sɛ̃ʒ"]),
    ("Le singe grimpe aux arbres.",           "🐵", ["lə sɛ̃ʒ ɡʁɛ̃p o zaʁbʁ"]),
    ("La baleine",                            "🐳", ["la ba.lɛn"]),
    ("La baleine nage dans la mer.",          "🐳", ["la ba.lɛn naʒ dɑ̃ la mɛʁ"]),
    ("Le dauphin",                            "🐬", ["lə do.fɛ̃"]),
    ("Le dauphin saute hors de l'eau.",       "🐬", ["lə do.fɛ̃ sot ɔʁ də lo"]),
    ("Le serpent",                            "🐍", ["lə sɛʁ.pɑ̃"]),
    ("Le serpent rampe par terre.",           "🐍", ["lə sɛʁ.pɑ̃ ʁɑ̃p paʁ tɛʁ"]),
    ("L'araignée",                            "🕷️", ["la.ʁɛ.ɲe"]),
    ("L'araignée tisse une toile.",           "🕷️", ["la.ʁɛ.ɲe tis yn twal"]),
    ("L'escargot",                            "🐌", ["lɛs.kaʁ.ɡo"]),
    ("L'escargot avance lentement.",          "🐌", ["lɛs.kaʁ.ɡo a.vɑ̃s lɑ̃t.mɑ̃"]),
    ("La tortue",                             "🐢", ["la tɔʁ.ty"]),
    ("La tortue vit longtemps.",              "🐢", ["la tɔʁ.ty vi lɔ̃.tɑ̃"]),
    ("L'abeille",                             "🐝", ["la.bɛj"]),
    ("L'abeille produit du miel.",            "🐝", ["la.bɛj pʁɔ.dɥi dy mjɛl"]),
    ("Le loup",                               "🐺", ["lə lu"]),
    ("Le loup hurle dans la forêt.",          "🐺", ["lə lu yʁl dɑ̃ la fɔ.ʁɛ"]),
    ("Le panda",                              "🐼", ["lə pɑ̃.da"]),
    ("Le panda mange du bambou.",             "🐼", ["lə pɑ̃.da mɑ̃ʒ dy bɑ̃.bu"]),
    ("Le pingouin",                           "🐧", ["lə pɛ̃.ɡwɛ̃"]),
    ("Le pingouin nage bien.",                "🐧", ["lə pɛ̃.ɡwɛ̃ naʒ bjɛ̃"]),
    ("L'aigle",                               "🦅", ["lɛɡl"]),
    ("L'aigle vole très haut.",               "🦅", ["lɛɡl vɔl tʁɛ o"]),
    ("La fourmi",                             "🐜", ["la fuʁ.mi"]),
    ("La fourmi est très petite.",            "🐜", ["la fuʁ.mi ɛ tʁɛ pə.tit"]),
    # --- colors ---
    ("Rouge",                                 "🔴", ["ʁuʒ"]),
    ("Bleu",                                  "🔵", ["blø"]),
    ("Vert",                                  "💚", ["vɛʁ"]),
    ("Jaune",                                 "💛", ["ʒon"]),
    ("Blanc",                                 "⬜", ["blɑ̃"]),
    ("Noir",                                  "🖤", ["nwaʁ"]),
    ("Rose",                                  "🩷", ["ʁoz"]),
    ("Violet",                                "💜", ["vjɔ.lɛ"]),
    ("Orange",                                "🟠", ["ɔ.ʁɑ̃ʒ"]),
    # --- body parts ---
    ("La tête",                               "👤", ["la tɛt"]),
    ("La tête pense.",                        "👤", ["la tɛt pɑ̃s"]),
    ("Le bras",                               "💪", ["lə bʁa"]),
    ("Le bras est fort.",                     "💪", ["lə bʁa ɛ fɔʁ"]),
    ("La jambe",                              "🦵", ["la ʒɑ̃b"]),
    ("La jambe court vite.",                  "🦵", ["la ʒɑ̃b kuʁ vit"]),
    ("Le nez",                                "👃", ["lə ne"]),
    ("Le nez sent les fleurs.",               "👃", ["lə ne sɑ̃ le flœʁ"]),
    ("L'oreille",                             "👂", ["lɔ.ʁɛj"]),
    ("L'oreille entend les sons.",            "👂", ["lɔ.ʁɛj ɑ̃.tɑ̃ le sɔ̃"]),
    ("La bouche",                             "👄", ["la buʃ"]),
    ("La bouche parle et mange.",             "👄", ["la buʃ paʁl e mɑ̃ʒ"]),
    ("La dent",                               "🦷", ["la dɑ̃"]),
    ("La dent est blanche.",                  "🦷", ["la dɑ̃ ɛ blɑ̃ʃ"]),
    ("Le doigt",                              "☝️", ["lə dwa"]),
    ("Le doigt montre le chemin.",            "☝️", ["lə dwa mɔ̃tʁ lə ʃə.mɛ̃"]),
    ("L'œil",                                 "👁️", ["lœj"]),
    ("L'œil voit les couleurs.",              "👁️", ["lœj vwa le ku.lœʁ"]),
    # --- transport ---
    ("Le train",                              "🚂", ["lə tʁɛ̃"]),
    ("Le train roule vite.",                  "🚂", ["lə tʁɛ̃ ʁul vit"]),
    ("L'avion",                               "✈️", ["la.vjɔ̃"]),
    ("L'avion vole dans le ciel.",            "✈️", ["la.vjɔ̃ vɔl dɑ̃ lə sjɛl"]),
    ("Le bateau",                             "🚢", ["lə ba.to"]),
    ("Le bateau navigue sur la mer.",         "🚢", ["lə ba.to na.viɡ syʁ la mɛʁ"]),
    ("Le bus",                                "🚌", ["lə bys"]),
    ("Le bus transporte les gens.",           "🚌", ["lə bys tʁɑ̃s.pɔʁt le ʒɑ̃"]),
    ("La moto",                               "🏍️", ["la mɔ.to"]),
    ("La moto va très vite.",                 "🏍️", ["la mɔ.to va tʁɛ vit"]),
    # --- nature ---
    ("L'arc-en-ciel",                         "🌈", ["laʁk.ɑ̃.sjɛl"]),
    ("L'arc-en-ciel brille après la pluie.",  "🌈", ["laʁk.ɑ̃.sjɛl bʁij a.pʁɛ la plɥi"]),
    ("Le nuage",                              "☁️", ["lə nɥaʒ"]),
    ("Le nuage cache le soleil.",             "☁️", ["lə nɥaʒ kaʃ lə sɔ.lɛj"]),
    ("La neige",                              "❄️", ["la nɛʒ"]),
    ("La neige tombe doucement.",             "❄️", ["la nɛʒ tɔ̃b dus.mɑ̃"]),
    ("La pluie",                              "🌧️", ["la plɥi"]),
    ("La pluie tombe sur le jardin.",         "🌧️", ["la plɥi tɔ̃b syʁ lə ʒaʁ.dɛ̃"]),
    ("Le vent",                               "💨", ["lə vɑ̃"]),
    ("Le vent souffle fort.",                 "💨", ["lə vɑ̃ sufl fɔʁ"]),
    ("L'étoile",                              "⭐", ["le.twal"]),
    ("L'étoile brille dans le ciel.",         "⭐", ["le.twal bʁij dɑ̃ lə sjɛl"]),
    ("La plage",                              "🏖️", ["la plaʒ"]),
    ("La plage est belle et ensoleillée.",    "🏖️", ["la plaʒ ɛ bɛl e ɑ̃.sɔ.le.je"]),
    ("L'île",                                 "🏝️", ["lil"]),
    ("L'île est entourée d'eau.",             "🏝️", ["lil ɛt ɑ̃.tu.ʁe do"]),
    ("La forêt",                              "🌲", ["la fɔ.ʁɛ"]),
    ("La forêt est calme et verte.",          "🌲", ["la fɔ.ʁɛ ɛ kalm e vɛʁt"]),
    ("Le feu",                                "🔥", ["lə fø"]),
    ("Le feu brûle dans la cheminée.",        "🔥", ["lə fø bʁyl dɑ̃ la ʃə.mi.ne"]),
    ("L'éclair",                              "⚡", ["le.klɛʁ"]),
    ("L'éclair illumine le ciel.",            "⚡", ["le.klɛʁ i.ly.min lə sjɛl"]),
    ("Le volcan",                             "🌋", ["lə vɔl.kɑ̃"]),
    ("Le volcan entre en éruption.",          "🌋", ["lə vɔl.kɑ̃ ɑ̃tʁ ɑ̃ e.ʁyp.sjɔ̃"]),
    # --- food ---
    ("L'orange",                              "🍊", ["lɔ.ʁɑ̃ʒ"]),
    ("L'orange est juteuse et sucrée.",       "🍊", ["lɔ.ʁɑ̃ʒ ɛ ʒy.tøz e sy.kʁe"]),
    ("Le raisin",                             "🍇", ["lə ʁɛ.zɛ̃"]),
    ("Le raisin est doux et juteux.",         "🍇", ["lə ʁɛ.zɛ̃ ɛ du e ʒy.tø"]),
    ("La cerise",                             "🍒", ["la sə.ʁiz"]),
    ("La cerise est petite et rouge.",        "🍒", ["la sə.ʁiz ɛ pə.tit e ʁuʒ"]),
    ("La tomate",                             "🍅", ["la tɔ.mat"]),
    ("La tomate est rouge et ronde.",         "🍅", ["la tɔ.mat ɛ ʁuʒ e ʁɔ̃d"]),
    ("La carotte",                            "🥕", ["la ka.ʁɔt"]),
    ("La carotte est bonne pour les yeux.",   "🥕", ["la ka.ʁɔt ɛ bɔn puʁ le jø"]),
    ("La pomme de terre",                     "🥔", ["la pɔm də tɛʁ"]),
    ("La pomme de terre cuit dans l'eau.",    "🥔", ["la pɔm də tɛʁ kɥi dɑ̃ lo"]),
    ("Le chocolat",                           "🍫", ["lə ʃɔ.kɔ.la"]),
    ("Le chocolat est délicieux.",            "🍫", ["lə ʃɔ.kɔ.la ɛ de.li.sjø"]),
    ("La glace",                              "🍦", ["la ɡlas"]),
    ("La glace fond au soleil.",              "🍦", ["la ɡlas fɔ̃ o sɔ.lɛj"]),
    ("La pizza",                              "🍕", ["la pit.sa"]),
    ("La pizza est chaude et savoureuse.",    "🍕", ["la pit.sa ɛ ʃod e sa.vu.ʁøz"]),
    ("L'eau",                                 "💧", ["lo"]),
    ("L'eau est essentielle à la vie.",       "💧", ["lo ɛt e.sɑ̃.sjɛl a la vi"]),
    ("Le lait",                               "🥛", ["lə lɛ"]),
    ("Le lait est blanc et nutritif.",        "🥛", ["lə lɛ ɛ blɑ̃ e ny.tʁi.tif"]),
    ("L'œuf",                                 "🥚", ["lœf"]),
    ("L'œuf est frais et rond.",              "🥚", ["lœf ɛ fʁɛ e ʁɔ̃"]),
    ("Le miel",                               "🍯", ["lə mjɛl"]),
    ("Le miel est doux et sucré.",            "🍯", ["lə mjɛl ɛ du e sy.kʁe"]),
    ("La soupe",                              "🍲", ["la sup"]),
    ("La soupe est chaude et bonne.",         "🍲", ["la sup ɛ ʃod e bɔn"]),
    ("Le riz",                                "🍚", ["lə ʁi"]),
    ("Le riz cuit dans la casserole.",        "🍚", ["lə ʁi kɥi dɑ̃ la ka.sʁɔl"]),
    ("Le gâteau",                             "🍰", ["lə ɡa.to"]),
    ("Le gâteau est sucré et moelleux.",      "🍰", ["lə ɡa.to ɛ sy.kʁe e mwa.lø"]),
    ("Les frites",                            "🍟", ["le fʁit"]),
    ("Les frites sont croustillantes.",       "🍟", ["le fʁit sɔ̃ kʁus.ti.jɑ̃t"]),
    ("Le sandwich",                           "🥪", ["lə sɑ̃d.witʃ"]),
    ("Le sandwich est délicieux.",            "🥪", ["lə sɑ̃d.witʃ ɛ de.li.sjø"]),
    # --- clothing ---
    ("Le pantalon",                           "👖", ["lə pɑ̃.ta.lɔ̃"]),
    ("Le pantalon est confortable.",          "👖", ["lə pɑ̃.ta.lɔ̃ ɛ kɔ̃.fɔʁ.tabl"]),
    ("La veste",                              "🧥", ["la vɛst"]),
    ("La veste garde au chaud.",              "🧥", ["la vɛst ɡaʁd o ʃo"]),
    ("L'écharpe",                             "🧣", ["le.ʃaʁp"]),
    ("L'écharpe protège du froid.",           "🧣", ["le.ʃaʁp pʁɔ.tɛʒ dy fʁwa"]),
    ("Le bonnet",                             "🧢", ["lə bɔ.nɛ"]),
    ("Le bonnet couvre les oreilles.",        "🧢", ["lə bɔ.nɛ kuvʁ le zɔ.ʁɛj"]),
    ("La chaussette",                         "🧦", ["la ʃo.sɛt"]),
    ("La chaussette tient les pieds au chaud.", "🧦", ["la ʃo.sɛt tjɛ̃ le pje o ʃo"]),
    ("La robe",                               "👗", ["la ʁɔb"]),
    ("La robe est belle et élégante.",        "👗", ["la ʁɔb ɛ bɛl e e.le.ɡɑ̃t"]),
    ("La chaussure",                          "👞", ["la ʃo.syʁ"]),
    ("La chaussure protège le pied.",         "👞", ["la ʃo.syʁ pʁɔ.tɛʒ lə pje"]),
    ("Les lunettes",                          "👓", ["le ly.nɛt"]),
    ("Les lunettes aident à voir.",           "👓", ["le ly.nɛt ɛd a vwaʁ"]),
    ("Le gant",                               "🧤", ["lə ɡɑ̃"]),
    ("Le gant protège les mains.",            "🧤", ["lə ɡɑ̃ pʁɔ.tɛʒ le mɛ̃"]),
    # --- household ---
    ("La porte",                              "🚪", ["la pɔʁt"]),
    ("La porte s'ouvre et se ferme.",         "🚪", ["la pɔʁt suvʁ e sə fɛʁm"]),
    ("Le lit",                                "🛏️", ["lə li"]),
    ("Le lit est doux et confortable.",       "🛏️", ["lə li ɛ du e kɔ̃.fɔʁ.tabl"]),
    ("La chaise",                             "🪑", ["la ʃɛz"]),
    ("La chaise est pour s'asseoir.",         "🪑", ["la ʃɛz ɛ puʁ sa.swaʁ"]),
    ("La clé",                                "🔑", ["la kle"]),
    ("La clé ouvre la porte.",                "🔑", ["la kle uvʁ la pɔʁt"]),
    ("La lampe",                              "💡", ["la lɑ̃p"]),
    ("La lampe éclaire la pièce.",            "💡", ["la lɑ̃p e.klɛʁ la pjɛs"]),
    ("Le canapé",                             "🛋️", ["lə ka.na.pe"]),
    ("Le canapé est confortable.",            "🛋️", ["lə ka.na.pe ɛ kɔ̃.fɔʁ.tabl"]),
    # --- buildings / places ---
    ("L'hôpital",                             "🏥", ["lo.pi.tal"]),
    ("L'hôpital soigne les malades.",         "🏥", ["lo.pi.tal swaɲ le ma.lad"]),
    ("L'église",                              "⛪", ["le.ɡliz"]),
    ("L'église est belle et ancienne.",       "⛪", ["le.ɡliz ɛ bɛl e ɑ̃.sjɛn"]),
    ("Le château",                            "🏰", ["lə ʃa.to"]),
    ("Le château est très vieux.",            "🏰", ["lə ʃa.to ɛ tʁɛ vjø"]),
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
    ("soup",                        "🍲", ["/suːp/"]),
    ("honey",                       "🍯", ["/ˈhʌni/"]),
    ("noodles",                     "🍝", ["/ˈnuː.dl̩z/"]),
    ("volcano",                     "🌋", ["/vɒlˈkeɪ.nəʊ/"]),
    ("lightning",                   "⚡", ["/ˈlaɪt.nɪŋ/"]),
    ("forest",                      "🌲", ["/ˈfɒ.rɪst/"]),
    ("scarf",                       "🧣", ["/skɑːf/"]),
    ("glove",                       "🧤", ["/ɡlʌv/"]),
    ("sock",                        "🧦", ["/sɒk/"]),
    ("trousers",                    "👖", ["/ˈtɹaʊ.zəz/"]),
    ("jacket",                      "🧥", ["/ˈdʒæk.ɪt/"]),
    ("castle",                      "🏰", ["/ˈkɑːsl̩/"]),
    ("piano",                       "🎹", ["/piˈæn.əʊ/"]),
    ("tennis",                      "🎾", ["/ˈtɛn.ɪs/"]),
    ("sofa",                        "🛋️", ["/ˈsəʊ.fə/"]),
    ("lamp",                        "💡", ["/læmp/"]),
    ("red",                         "🔴", ["/ʁɛd/"]),
    ("blue",                        "🔵", ["/bluː/"]),
    ("green",                       "💚", ["/ɡɹiːn/"]),
    ("yellow",                      "💛", ["/ˈjɛl.əʊ/"]),
    ("black",                       "🖤", ["/blæk/"]),
    ("white",                       "⬜", ["/waɪt/"]),
    ("purple",                      "💜", ["/ˈpɜː.pl̩/"]),
    ("pink",                        "🩷", ["/pɪŋk/"]),
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
    ("The soup is hot",             "🍲", ["/ðə suːp ɪz hɒt/"]),
    ("The honey is sweet",          "🍯", ["/ðə ˈhʌni ɪz swiːt/"]),
    ("The volcano erupts",          "🌋", ["/ðə vɒlˈkeɪ.nəʊ ɪˈɹʌpts/"]),
    ("The forest is green and calm","🌲", ["/ðə ˈfɒ.rɪst ɪz ɡɹiːn ənd kɑːm/"]),
    ("The beach is warm and sunny", "🏖️", ["/ðə biːtʃ ɪz wɔːm ənd ˈsʌni/"]),
    ("The piano sounds beautiful",  "🎹", ["/ðə piˈæn.əʊ saʊndz ˈbjuː.tɪ.fəl/"]),
]


def build_entry(phrase: str, emoji: str, ipas: list[str], category: str = "standard") -> dict:
    return {
        "phrase": phrase,
        "emoji": emoji,
        "ipas": [{"ipa": ipa, "category": category} for ipa in ipas],
    }


def add_phrases(yaml_path: Path, new_entries: list[tuple], category: str = "standard") -> int:
    with open(yaml_path, encoding="utf-8") as f:
        existing = yaml.safe_load(f)

    existing_phrases = {e["phrase"] for e in existing}

    added = 0
    for phrase, emoji, ipas in new_entries:
        if phrase in existing_phrases:
            print(f"  skip (already exists): {phrase}")
            continue
        existing.append(build_entry(phrase, emoji, ipas, category))
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
    parser = argparse.ArgumentParser(
        description="Add a predefined set of Twemoji-based phrases (animals, colors, body parts, food, etc.) to phrases-de-DE.yaml, phrases-en-GB.yaml, and phrases-fr-FR.yaml. Skips phrases that already exist."
    )
    parser.parse_args()

    de_path = REPO_ROOT / "phrases-de-DE.yaml"
    en_path = REPO_ROOT / "phrases-en-GB.yaml"
    fr_path = REPO_ROOT / "phrases-fr-FR.yaml"

    print(f"\n🇩🇪 Adding German phrases to {de_path.name}…")
    n_de = add_phrases(de_path, NEW_DE)
    print(f"   → added {n_de} entries\n")

    print(f"🇬🇧 Adding English phrases to {en_path.name}…")
    n_en = add_phrases(en_path, NEW_EN)
    print(f"   → added {n_en} entries\n")

    print(f"🇫🇷 Adding French phrases to {fr_path.name}…")
    n_fr = add_phrases(fr_path, NEW_FR, category="vowels")
    print(f"   → added {n_fr} entries\n")

    print("✅ Done. Run update-difficulty.py next.")


if __name__ == "__main__":
    main()
