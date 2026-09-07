# Haqdaar.ai

**A multimodal, deterministic eligibility matcher for Indian government welfare schemes.**

*Haqdaar* (Hindi/Urdu) — "one who is rightfully entitled."

Thousands of welfare schemes exist across central and state governments with no unified way to
discover them, and their eligibility criteria are written in legal prose most citizens cannot
self-assess against. Haqdaar.ai lets a citizen **describe themselves in their own language — by
voice or by typing — and find out what they are entitled to.**

---

## The design principle

**An LLM never decides eligibility.**

Existing AI approaches to this problem hallucinate, and the resulting harm is asymmetric: a
hallucinated *false negative* means a real person is told they don't qualify for money or medicine
they are legally entitled to.

So the responsibilities are split:

- **The LLM only transcribes and extracts** — turning *"I'm a 42-year-old farmer from Punjab"* into
  structured fields. It never sees scheme rules and never issues a verdict.
- **A deterministic PostgreSQL engine decides eligibility**, evaluating the profile against
  normalized scheme rules with three-valued logic: **PASS / FAIL / UNKNOWN**.
- **Every rule keeps its source prose**, so any verdict is auditable back to the government's own
  words.
- **Nothing extracted reaches the matcher without human confirmation** in an editable box.

`UNKNOWN` is a first-class answer. "We can't tell yet, and here's the one question that would tell
us most" is more honest — and more useful — than a confident guess.

---

## Features

- **Multimodal by design.** Voice is strictly additive: the typed form works completely on its own,
  with every AI provider switched off. A mis-transcription is always recoverable.
- **Five languages** — English, Hindi, Punjabi, Bengali, Tamil — with full UI switching, not just
  multilingual voice.
- **Explained results.** Every card shows *why*: which criteria matched, which failed, what's still
  missing.
- **Smart follow-ups.** The next question is chosen by information gain — the field that resolves
  the most currently-undecided schemes — with sensitive questions (caste, income) deferred.
- **Real corpus.** 150+ schemes scraped from myscheme.gov.in, every numeric bound verified against
  its source prose before insert.
- **No profile is ever stored.** No accounts, no database of citizens' caste, income or disability
  status. Session-only, by design.

---

## Stack

Next.js · TypeScript · Tailwind · Drizzle · PostgreSQL (JSONB) · Zod · Playwright ·
Sarvam AI (Indic STT/TTS) · Groq (extraction only) · Vitest · `next-intl`

Three logical tiers enforced by dependency direction, in one deployable.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

---

## Getting started

```bash
pnpm install
cp .env.example .env.local     # AI keys optional — the typed path works without them
pnpm db:up                     # local Postgres via Docker
pnpm db:migrate
pnpm scrape                    # populate the scheme corpus
pnpm dev
```

Requires Node 20+, pnpm, and Docker.

---

## Documentation

| Document | Contents |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Project constitution and invariants |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Rule DSL and three-valued logic — **the core** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tiers, data flow, providers, i18n |
| [docs/SCRAPER.md](docs/SCRAPER.md) | Corpus acquisition and prose grounding |
| [docs/EVALUATION.md](docs/EVALUATION.md) | Success metrics as executable gates |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Current state and phase tracking |

---

## About

Course project for **UCS503P**, Thapar Institute of Engineering and Technology.
Dibyanshu Samal · Gunagye Jain · Yash Jagwan — CSED.

Scheme data is sourced from [myscheme.gov.in](https://www.myscheme.gov.in), a National Platform of
the Government of India. Haqdaar.ai is an independent academic project and is not affiliated with
or endorsed by any government body. **Always verify eligibility with the official scheme
authority before applying.**
