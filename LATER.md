Get Domain "DerHaseLacht.de"

---

Plural dazu: Zwei Mäuse, Vier Stühle...

---

Cache dont use ~/.cache/pp use ~/.cache/phoneme-party

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
