#!/usr/bin/env bash
#
# Regenerates tests/fixtures/corpus.sql from a scraped database.
#
# The fixture is 25 real schemes, not synthetic ones, because invariant 4 says
# every rule keeps the prose it came from — and a synthetic fixture would let the
# source-prose assertion pass against text no government ever wrote.
#
# The slug list is fixed rather than sampled so the fixture is reproducible: a
# fixture that changed on every run would turn an unrelated corpus refresh into a
# mysterious CI diff.
#
# Usage:
#   bash scripts/make-corpus-fixture.sh                  # local docker Postgres
#   DATABASE_URL="postgres://…" bash scripts/make-corpus-fixture.sh
#
set -euo pipefail

OUT="tests/fixtures/corpus.sql"
CONTAINER="${PGCONTAINER:-haqdaar-postgres}"

COLS="id,slug,name,summary,ministry,state,eligibility,source_prose,source_url,benefits,documents,scraped_at,needs_review"

# Chosen against the real matcher: for {age:42, state:PB} the first twelve
# resolve UNKNOWN (visible cards) and the rest FAIL (the "Show N schemes"
# control). Verified by scripts/verify-corpus-fixture.sh, not by eye.
SLUGS="'aktinf','asd','bbgspbocwwb','bfa','bnlbks','btus','csccwpbocwwb','csspremsobcsi','cvcis','dls-punjab','dpps','dshaspbocwwb','aag','aamgsiscs','aapd','aas','aass','abhb','abn','acaobocwwb','adacw','adthsg','aes','affr','afpoaa'"

query() {
  if [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -t -A -c "$1"
  else
    docker exec "$CONTAINER" psql -U haqdaar -d haqdaar -t -A -c "$1"
  fi
}

mkdir -p "$(dirname "$OUT")"

cat > "$OUT" <<'HEADER'
--
-- CI corpus fixture: 25 real schemes taken from the scraped corpus.
--
-- WHY THIS EXISTS
--
-- Four e2e tests assert things that only exist when there are schemes to render:
-- verdict cards, the government's own wording behind each one, the expanded
-- ineligible list, and the next-question prompt. CI applies migrations but has
-- no corpus, and the synthetic rows the matching benchmark seeds are deleted
-- again in its afterAll. So those four gates could never run in CI, and did not,
-- from the repository's very first push.
--
-- WHY REAL ROWS RATHER THAN SYNTHETIC ONES
--
-- Invariant 4: every rule keeps the prose it came from. A synthetic fixture
-- would let the source-prose assertion pass against text no government ever
-- wrote, which is precisely what that assertion exists to prevent. These are
-- genuine rows, with genuine prose and genuine myscheme.gov.in URLs.
--
-- COMPOSITION, chosen against the real matcher rather than by eye:
--   For a profile of age 42 in Punjab, 12 of these resolve UNKNOWN and 13 FAIL.
--   The UNKNOWN set produces the visible result cards; the FAIL set produces the
--   "Show N schemes" control. No row PASSes, and that is honest rather than a
--   gap: ~1,100 clauses across the corpus are WILDCARD by design, so PASS is
--   rare, and a fixture that manufactured one would misrepresent the system it
--   is meant to guard.
--
-- REGENERATE with scripts/make-corpus-fixture.sh against a scraped database.
-- Do not hand-edit: each rule tree must stay consistent with the prose beside it.
--

-- This fixture is the entire corpus for the database it loads into.
TRUNCATE schemes;

HEADER

echo "COPY schemes ($(echo "$COLS" | sed 's/,/, /g')) FROM stdin;" >> "$OUT"
query "COPY (SELECT $COLS FROM schemes WHERE slug IN ($SLUGS) ORDER BY slug) TO STDOUT" >> "$OUT"
printf '\\.\n' >> "$OUT"

echo "wrote $OUT ($(grep -c '' < "$OUT") lines)"
