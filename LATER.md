Why same similarity ??

IPA changed (same similarity, not updated):
  Mond (Thomas): 80%
    stored:    "m u n d"
    extracted: "m u n d a"

---

Test words:

Use key-value labels

lang=de
speaker=Thomas
word=Mond
...

Then selecting a single test should easier.

----

It should be possible to test exactly one word.
Example:

Mond           Thomas              80%   /moːnt/             m u n d a

---

Why is there an "a" at the end?

Mond           Thomas              80%   /moːnt/             m u n d a

- Ich sage bewusst "Mand" anstatt "Mond". Warum 100% korrekt?
m oː n t
m a n d

- claude says the wav2vec2 does ... ? Is that used?

- Check browser warnings.
- Linux shows a square, not a heart: <https://thomas-guettler.de/phoneme-party/?lang=de&word=Herz>
- Phoneme recognition still bad. How to fix??? Write test, adjust parameters?
- Auto-play input and should.
- Avoid code duplications. Via Linter
- use typescript.
- alignment passt nicht. ein Zeichen in der mitte zu viel/wenig, alles verschoben.
- structure words differently: WORD/LANG/ in WORD dir is the icon. This way all languages use the
  same icon.
- after record button release wait .5s, and then stop recording. Sometimes the last sound is cut.
- Phonem-Analyse: always fine: ✓ [f] → [l] ✓ [uː] → [a] ✓ [s] → [l]
- More rounded corners. More child friendly
- Positive feedback.
- collect phonemes metrics: Which are often correct, which are often wrong?
