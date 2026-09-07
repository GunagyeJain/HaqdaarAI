-- Kleene three-valued evaluation of the rule DSL (docs/DATA-MODEL.md §3-§4).
--
-- This mirrors src/domain/rules/evaluate.ts. The two are pinned together by the
-- differential test in tests/integration/match-schemes.test.ts -- if they ever
-- diverge, that test fails.
--
-- NULL represents UNKNOWN throughout, which lets the engine inherit Kleene
-- semantics from SQL's own null handling rather than simulating them.

-- Evaluates one leaf clause. NULL when the profile lacks the field.
CREATE OR REPLACE FUNCTION haqdaar_eval_leaf(clause jsonb, applicant jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  field_name text := clause ->> 'field';
  operator   text := clause ->> 'op';
  actual     jsonb;
  expected   jsonb;
  actual_num numeric;
BEGIN
  -- WILDCARD clauses name no field, so there is nothing to decide.
  IF field_name IS NULL THEN
    RETURN NULL;
  END IF;

  actual := applicant -> field_name;

  -- Absent means undecidable. Note `false` and `0` are present values and
  -- must not be treated as absence.
  IF actual IS NULL OR jsonb_typeof(actual) = 'null' THEN
    RETURN NULL;
  END IF;

  expected := clause -> 'value';

  IF operator = 'eq' OR operator = 'neq' THEN
    -- Compare numerically when both sides are numbers so that 5 and 5.0 agree,
    -- matching JavaScript's === on numbers.
    IF jsonb_typeof(actual) = 'number' AND jsonb_typeof(expected) = 'number' THEN
      IF operator = 'eq' THEN
        RETURN (actual #>> '{}')::numeric = (expected #>> '{}')::numeric;
      END IF;
      RETURN (actual #>> '{}')::numeric <> (expected #>> '{}')::numeric;
    END IF;

    IF operator = 'eq' THEN
      RETURN actual = expected;
    END IF;
    RETURN actual <> expected;

  ELSIF operator = 'in' THEN
    RETURN (clause -> 'values') @> actual;

  ELSIF operator = 'not_in' THEN
    RETURN NOT ((clause -> 'values') @> actual);
  END IF;

  -- Every remaining operator is numeric. A numeric operator against a
  -- non-numeric value means the rule tree is malformed and schema validation
  -- should have rejected it. Degrade to UNKNOWN rather than raising: one bad
  -- rule must not deny a citizen every other scheme in the corpus.
  IF jsonb_typeof(actual) <> 'number' THEN
    RETURN NULL;
  END IF;

  actual_num := (actual #>> '{}')::numeric;

  IF operator = 'lt' THEN
    RETURN actual_num < (clause ->> 'value')::numeric;
  ELSIF operator = 'lte' THEN
    RETURN actual_num <= (clause ->> 'value')::numeric;
  ELSIF operator = 'gt' THEN
    RETURN actual_num > (clause ->> 'value')::numeric;
  ELSIF operator = 'gte' THEN
    RETURN actual_num >= (clause ->> 'value')::numeric;
  ELSIF operator = 'between' THEN
    RETURN actual_num >= (clause ->> 'min')::numeric
       AND actual_num <= (clause ->> 'max')::numeric;
  END IF;

  -- Unrecognised operator: undecidable rather than wrong.
  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- Recursively evaluates a rule tree under Kleene logic.
CREATE OR REPLACE FUNCTION haqdaar_eval_node(node jsonb, applicant jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  operator     text := node ->> 'op';
  child        jsonb;
  child_result boolean;
  saw_unknown  boolean := false;
BEGIN
  IF operator = 'AND' THEN
    FOR child IN
      SELECT value FROM jsonb_array_elements(COALESCE(node -> 'clauses', '[]'::jsonb))
    LOOP
      child_result := haqdaar_eval_node(child, applicant);
      -- One disqualifying answer decides the scheme, even with fields missing.
      IF child_result IS FALSE THEN
        RETURN false;
      END IF;
      IF child_result IS NULL THEN
        saw_unknown := true;
      END IF;
    END LOOP;

    IF saw_unknown THEN
      RETURN NULL;
    END IF;
    RETURN true;  -- an empty AND is vacuously true

  ELSIF operator = 'OR' THEN
    FOR child IN
      SELECT value FROM jsonb_array_elements(COALESCE(node -> 'clauses', '[]'::jsonb))
    LOOP
      child_result := haqdaar_eval_node(child, applicant);
      -- Mirror of the AND case: one qualifying answer is enough.
      IF child_result IS TRUE THEN
        RETURN true;
      END IF;
      IF child_result IS NULL THEN
        saw_unknown := true;
      END IF;
    END LOOP;

    IF saw_unknown THEN
      RETURN NULL;
    END IF;
    RETURN false;  -- an empty OR is vacuously false

  ELSIF operator = 'NOT' THEN
    child_result := haqdaar_eval_node(node -> 'clause', applicant);
    IF child_result IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN NOT child_result;

  ELSIF operator = 'WILDCARD' THEN
    -- INVARIANT 6: we genuinely cannot decide this, and say so.
    RETURN NULL;
  END IF;

  RETURN haqdaar_eval_leaf(node, applicant);
END;
$$;
--> statement-breakpoint

-- Flattens a rule tree to its leaf and wildcard clauses.
CREATE OR REPLACE FUNCTION haqdaar_leaves(node jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  operator text := node ->> 'op';
  child    jsonb;
BEGIN
  IF operator = 'AND' OR operator = 'OR' THEN
    FOR child IN
      SELECT value FROM jsonb_array_elements(COALESCE(node -> 'clauses', '[]'::jsonb))
    LOOP
      RETURN QUERY SELECT * FROM haqdaar_leaves(child);
    END LOOP;
  ELSIF operator = 'NOT' THEN
    RETURN QUERY SELECT * FROM haqdaar_leaves(node -> 'clause');
  ELSE
    RETURN NEXT node;
  END IF;
  RETURN;
END;
$$;
--> statement-breakpoint

-- Evaluates a profile against the whole corpus in one stateless query.
--
-- Returns the reasoning alongside the verdict, which is what powers the
-- self-explaining result cards and the information-gain next-question engine.
-- matched_clauses/failed_clauses are per-clause facts rather than causal
-- attribution: a clause inside a satisfied OR may read as failed while the
-- scheme still passes.
CREATE OR REPLACE FUNCTION match_schemes(applicant jsonb)
RETURNS TABLE (
  scheme_id       uuid,
  verdict         text,
  matched_clauses jsonb,
  failed_clauses  jsonb,
  unknown_fields  text[]
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT
    s.id,
    CASE
      WHEN e.result IS TRUE  THEN 'PASS'
      WHEN e.result IS FALSE THEN 'FAIL'
      ELSE 'UNKNOWN'
    END,
    COALESCE(jsonb_agg(l.clause) FILTER (WHERE l.result IS TRUE), '[]'::jsonb),
    COALESCE(jsonb_agg(l.clause) FILTER (WHERE l.result IS FALSE), '[]'::jsonb),
    COALESCE(
      array_agg(DISTINCT l.clause ->> 'field')
        FILTER (WHERE l.result IS NULL AND jsonb_exists(l.clause, 'field')),
      ARRAY[]::text[]
    )
  FROM schemes s
  CROSS JOIN LATERAL (
    SELECT haqdaar_eval_node(s.eligibility, applicant) AS result
  ) e
  -- LEFT JOIN so a scheme with no leaf clauses is still returned.
  LEFT JOIN LATERAL (
    SELECT leaf AS clause, haqdaar_eval_leaf(leaf, applicant) AS result
    FROM haqdaar_leaves(s.eligibility) AS leaf
  ) l ON true
  GROUP BY s.id, e.result;
$$;
