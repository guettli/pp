---

There are four matches. I think I want exactly one match.

No code duplication!

---

Compare again with ZIPA. Are there differences in:

- Output of pre-processing
- Output of mode
- Output of post-processing


---

nach .onnx suchen. Da gibt es komischen code mit int8 usw.

---

Warum ist "Die Mölch" 99% gleich zu "Die Milch" ?

diːmœlç

---

"Der Panda". Per Zippa wird das letzte A erkannt. Bei mir nur mit Tricks. Wieso?

---

When downloading model fails (network error), then auto-resume. Even after reload of page, should
re-start at last byte.

---

Which files get ignored by git ? Keep list small. Use build dir.

---

re-run sometimes does shows better results.

---

CI: New Linux user, Checkout git ....

---

chrome devtools, look at "Issues" (right top).
Warning about Buffer usage.


---

all ts scripts should use parseArgs with strict.

---

Audio zweimal ins Model geben? Ggf braucht das Model etwas mehr Input um sich an den Sprecher zu
gewöhnen?

---

Ensure expected_ipa never contains ().
When fetching ipa, create two (or more) ipa entries.

---


tests/data/de/Der_Mann/Der_Mann-Thomas.flac.yaml

Doppeltes "n". Sollte voll ok sein.

---

Gameification: Resolve things - like Tetris. Continous doing, resolving, doing...

---

❯ ./run scripts/add-test-recording.sh ~/Downloads/Der\ Hamster_20260208T173641_de_deːɾhaɾmstɛr.webm
Building dist-node...

> phoneme-party@0.1.0 build:node /home/guettli/projects/pp
> tsc -p tsconfig.build.json

src/main.ts:30:3 - error TS6133: 'adjustUserLevel' is declared but its value is never read.

30   adjustUserLevel,
     ~~~~~~~~~~~~~~~

src/utils/level-adjustment.ts:22:3 - error TS6133: 'phraseLevel' is declared but its value is never read.

22   phraseLevel: number,
     ~~~~~~~~~~~


Found 2 errors in 2 files.

Errors  Files
     1  src/main.ts:30
     1  src/utils/level-adjustment.ts:22
 ELIFECYCLE  Command failed with exit code 2.


---



Get Domain "DerHaseLacht.de"

---

Plural dazu: Zwei Mäuse, Vier Stühle...

---

Use pouchdb for local DB

Store every result of a phrase.

Only choose phrase which match the current state.

Use spaced repitition, so that words which were done good, will not be shown for a longer time.



----

scripts/update-difficulty.py:

ü is more difficult than a.

---

Gamification: jump+run Game or similar. More fun, not theory

---


From single word phrases to three word phrases: How to detect if the user is able to switch to
higher level?

Check which sounds he is able to do. Then look for phrases which contain these sounds.

Then sometimes show single words with sounds he can't pronounce yet.

---

Fast counting N.Ns when recording is too "noisy".


---

Auto play phrase after playing the recorded phrase. For "this was expected" feedback.

---

Ask for Feedback! UI and Github

---

Ask ZIPA authors for update.

---

phrase_difficulty.py:

Words like "the" do not exist.

Verbs: Get to base form (laughs is not in Glasgow-norm, but "laugh" is)

---

Let the user choose a speaker voice (web speech api)

---

i18n.ts: Check for dead entries. Check if there are missing entries.
How do other projects handle that?

---

try:
....
except ImportError:

--> No, avoid that. Check via linter.

---

Convert more to TS. There are still many JS files.

---

[Panphon for JS ? · Issue #73 · dmort27/panphon](https://github.com/dmort27/panphon/issues/73)

---

ɨ in web UI no explanation for that char --> color should be different, so that i see that.

---

Test words:

Use key-value labels

lang=de
speaker=Thomas
word=Mond
...

Then selecting a single test should easier.

---

Talk to Goethe Institut: I want feedback (not money)

---

Form before start: Allowed to use recordings for training?

---

It should be possible to test exactly one word.
Example:

Mond Thomas 80% /moːnt/ m u n d a

---

Why is there an "a" at the end?

Mond Thomas 80% /moːnt/ m u n d a

- Ich sage bewusst "Mand" anstatt "Mond". Warum 100% korrekt?
  m oː n t
  m a n d

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

---

❯ ./run scripts/test-code-duplication.sh

integrate that into lint.sh
