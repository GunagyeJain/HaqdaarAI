# Corpus Acquisition

Target: **150+ schemes** from myscheme.gov.in, normalized, prose-grounded, and passing Zod
validation before insert.

---

## Reconnaissance findings

Probed 2026-09-07 with a real browser. These findings shaped the design and are
recorded because none of them is visible from the outside:

| Probe | Result |
|---|---|
| `robots.txt` | `User-agent: * / Allow: /` — crawling is explicitly sanctioned |
| Scheme page over plain HTTP | *"Something went wrong"* — client-rendered SPA, **raw-HTML scraping is not viable** |
| `sitemap.xml` | 40 static pages, **zero** scheme pages — sitemap crawling is not viable |
| API without a browser | **HTTP 401** |
| API via `fetch()` from inside the page | **HTTP 403** — same-origin is not sufficient |
| Header the app actually sends | `x-api-key`, a public constant in the client bundle |
| Corpus size | **4,772 schemes** — the 150+ target has enormous headroom |

### The two endpoints

```
LIST    api.myscheme.gov.in/search/v6/schemes
          ?lang=en&q=[]&keyword=&sort=&from=<n>&size=<n>
        -> data.hits.items[].fields{ slug, schemeName, briefDescription,
             level, nodalMinistryName, schemeCategory, beneficiaryState, tags }
        -> data.hits.page{ total, totalPages, pageNumber, from, size }

DETAIL  api.myscheme.gov.in/schemes/v6/public/schemes?slug=<slug>&lang=<locale>
        -> data.en.basicDetails         { schemeName, level, schemeFor, ... }
        -> data.en.schemeContent        { briefDescription, benefits_md, ... }
        -> data.en.eligibilityCriteria  { eligibilityDescription_md }
```

**Eligibility prose lives only on the detail endpoint**, so the scrape is
necessarily two-stage: paginate the list for slugs, then fetch each scheme.

`eligibilityDescription_md` is clean markdown with one criterion per bullet,
which is what makes clause-per-bullet synthesis viable. A real example:

```markdown
- Finance is provided for Greenfield Enterprises.
- If the applicant is a male, he must be from SC / ST category.
- The age of the applicant must be at least 18 years.
- The applicant must not be in default to any bank/financial institution.
```

Bullet 3 synthesises cleanly to `age >= 18`, and `18` is locatable in the prose,
so it grounds. Bullets 1 and 4 are outside the closed profile schema and become
`WILDCARD / unmodellable`. Bullet 2 is a conditional whose scope we do not model
and becomes `WILDCARD / ambiguous`. That distribution is normal and expected:
partial structure plus honest UNKNOWNs, never a guess.

## Strategy: navigate and intercept

Drive the real application with Playwright and **harvest the JSON the browser already
receives**, rather than parsing rendered DOM or calling the API ourselves.

```ts
page.on('response', async (res) => {
  if (res.url().includes('/schemes/v6/public/schemes') && res.ok()) {
    capture(await res.json());        // structured JSON, not scraped markup
  }
});
await page.goto(`https://www.myscheme.gov.in/schemes/${slug}`);
```

**Why not use the API key.** Reconnaissance found the `x-api-key` the site ships in its
client bundle, and replaying it would be roughly twenty times faster. We deliberately do
not ([ADR-009](DECISIONS.md#adr-009)). Navigating the site is unambiguously the behaviour
robots.txt sanctions, needs no undocumented internal API, and comfortably meets the corpus
target. Speed we do not need is not worth the ambiguity.

**Why this beats DOM traversal:**

- Structured JSON with stable field names, instead of markup matched by CSS selectors.
- The browser supplies the gating header itself, so the scraper never handles a credential.
- A cosmetic redesign breaks CSS selectors but not the underlying payload shape.
- No per-field DOM queries.

**Corpus scope — and how it is actually achieved.** myscheme's facet panel (State, Level)
is rendered lazily and was not practically drivable with Playwright. Its search box is, and
`keyword=Punjab` returns 38 Punjab schemes, so the scraper builds its corpus from **one pass
per keyword, unioned by slug** (`SCRAPE_KEYWORDS`).

The default is an unfiltered pass plus regional passes for Punjab, Delhi, Chandigarh and
Haryana. That gives a corpus which is both broad — demonstrating the fragmentation problem
the project exists to solve — and coherent for the pilot region.

This matters more than it sounds. A first attempt took simply "the first 300", which spread
across 33 states with Punjab barely represented; a real Punjab profile then returned **0 PASS,
286 FAIL, 14 UNKNOWN**. Every verdict was correct, and the result was useless — a pilot tester
in Patiala would have seen nothing, defeating the reason Punjabi is a supported locale
([ADR-008](DECISIONS.md#adr-008)). A corpus can be entirely valid and still be the wrong corpus.

**Politeness.** Sequential navigation, a delay between requests, a single browser context.
This is public government data and crawling is permitted, but the scraper runs at human
pace regardless — there is no reason to be expensive to a public service.

---

## Normalization pipeline

```
intercepted JSON
   → field mapping        (myscheme facets → profile fields)
   → rule-tree synthesis  (eligibility prose → predicate tree)
   → PROSE GROUNDING      ← the correctness gate
   → Zod RuleTreeSchema / SchemeSchema
   → insert (with source_prose retained)
```

### Prose grounding — the correctness gate

Proposal §5.1: *ground every scraped numeric bound back against the source prose before insertion,
so no invented figure can silently exclude an eligible citizen.*

Concretely: **every numeric bound in a synthesized rule tree must be locatable in the source
prose.** A rule asserting `annualIncome <= 250000` is only accepted if `250000` — in some
recognized surface form — actually appears in the eligibility text.

Accepted surface forms include `250000`, `2,50,000` (Indian digit grouping), `2.5 lakh`,
`2.5 lakhs`, `₹2,50,000`. Age bounds and percentages are grounded the same way.

**A bound that cannot be grounded is not inserted.** The clause is downgraded to a `WILDCARD` with
`reason: 'ungrounded'` and the scheme is flagged `needs_review = true`. Never guessed, never
silently dropped.

This is the single most important behaviour in the scraper: it is the mechanism that makes the
"no hallucinated eligibility figures" claim structurally true rather than aspirational.

### Unmodellable clauses

Prose that cannot be expressed against the closed profile schema becomes a `WILDCARD` with
`reason: 'unmodellable'` (e.g. *"must not be an income tax payer"*), carrying its `sourceText`.
It evaluates to `UNKNOWN` forever, which is the honest verdict — we genuinely cannot decide it.

### Raw prose is always retained

`source_prose` and `source_url` are stored on every scheme (invariant 4). Any verdict can be
audited back to the government's own words. This also makes the manual review sample meaningful:
a reviewer compares the rule tree against the prose sitting in the same row.

---

## Fail loudly

The pipeline document is right that silent under-counting is the real danger — a scraper that
quietly returns 80 schemes looks like a working scraper.

The scraper **aborts with a non-zero exit code** on:

- an intercepted payload whose shape fails the expected Zod schema
- a page yielding zero results where results were expected
- a final corpus count below the configured floor (150)
- more than a small threshold of consecutive grounding failures — this signals a prose-format
  change rather than genuinely unusual schemes

It **warns but continues** on: an individual scheme failing grounding, or an individual
unmodellable clause. Those are expected in normal operation and are what `needs_review` exists for.

Every run writes a summary: schemes seen, inserted, flagged for review, wildcards by reason, and
failures with URLs.

---

## Scheduling

Re-scrape runs on a **GitHub Actions scheduled workflow**, not Vercel Cron — the scrape is
long-running and a full Playwright browser session exceeds serverless execution limits
([ADR-005](DECISIONS.md#adr-005)).

Benefit amounts and eligibility text change with policy, so corpus staleness is a real
correctness problem, not a hygiene one. The scheduled job must be verified to have fired
successfully at least once before deployment sign-off — the pipeline document treats this as a
deployment blocker and that is the right call.
