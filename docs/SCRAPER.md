# Corpus Acquisition

Target: **150+ schemes** from myscheme.gov.in, normalized, prose-grounded, and passing Zod
validation before insert.

---

## Reconnaissance findings

Probed 2026-09-07. These findings changed the approach and are recorded because they are not
obvious from the outside:

| Probe | Result | Consequence |
|---|---|---|
| `robots.txt` | `User-agent: * / Allow: /`, only `/404` disallowed | Crawling is explicitly sanctioned |
| Scheme detail page over plain HTTP | Returns *"Something went wrong"* — no content | **Client-rendered SPA. Raw-HTML scraping is not viable.** |
| `sitemap.xml` | 40 static pages, **zero** scheme pages | Sitemap-driven crawling is not viable |
| `api.myscheme.gov.in/search/v5/schemes` | **HTTP 401** | A real JSON API exists but is header-gated by the SPA's own bundle |
| Platform scale | 4,700+ schemes published | The 150+ target has large headroom |

The implementation pipeline document assumed Playwright DOM traversal. The 401 and the empty
sitemap together rule out the simpler alternatives, and the SPA architecture rules out DOM
scraping being *stable* even if it worked.

---

## Strategy: response interception

Drive the real application with Playwright and **harvest the JSON it already receives**, rather
than parsing rendered DOM.

```ts
page.on('response', async (res) => {
  if (res.url().includes('/search/v5/schemes') && res.ok()) {
    queue.push(await res.json());          // structured JSON, not scraped markup
  }
});
```

Then paginate by driving the UI as a user would.

**Why this beats DOM traversal:**

- We receive **structured JSON with stable field names** instead of markup matched by CSS
  selectors.
- The browser supplies the gating header naturally, so **no API key is ever extracted or
  hardcoded** — we use the site exactly as a visitor does.
- A cosmetic redesign breaks CSS selectors but not the underlying payload shape.
- It is substantially faster: no per-field DOM queries.

**Politeness.** Sequential navigation, a delay between pages, one browser context, and a
descriptive user agent. This is public government data and crawling is permitted, but the scraper
runs at human-ish pace regardless — there is no reason to be expensive to a public service.

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
