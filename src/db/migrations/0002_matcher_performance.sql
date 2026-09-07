-- Matching-speed fix. Semantics are unchanged; the differential test in
-- tests/integration/match-schemes.test.ts pins that.
--
-- THE PROBLEM (found by EXPLAIN ANALYZE, per ADR-007, not by assumption):
-- match_schemes took ~220ms median over a 300-scheme corpus against a <100ms
-- target. Almost all of the excess was JIT compilation, and JIT was firing
-- because the planner's cost estimate was wrong by two orders of magnitude:
--
--   Function Scan on haqdaar_leaves  (cost=0.25..260.25 rows=1000) (actual rows=6)
--   Nested Loop Left Join            (rows=298000)                 (actual rows=1788)
--
-- A set-returning function reports 1000 estimated rows by default. Multiplied
-- across the corpus that produced a total cost of ~179,000, comfortably over
-- the default jit_above_cost of 100,000 — so Postgres spent ~135ms compiling a
-- query that runs in ~60ms.
--
-- Two changes, no behavioural difference:
--   1. Declare a realistic ROWS estimate on haqdaar_leaves. Real schemes carry
--      about six leaf clauses. This keeps the plan honest as the corpus grows
--      rather than disabling JIT globally, which would be papering over a bad
--      estimate.
--   2. Group by scheme id alone. The previous version grouped by
--      (id, haqdaar_eval_node(...)), forcing a sort on a computed plpgsql
--      result; the verdict is now evaluated once per scheme after aggregation.

CREATE OR REPLACE FUNCTION haqdaar_leaves(node jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
ROWS 6
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
  WITH leaf_results AS (
    SELECT
      s.id AS scheme_id,
      l.clause,
      haqdaar_eval_leaf(l.clause, applicant) AS result
    FROM schemes s
    -- LEFT JOIN so a scheme with no leaf clauses is still returned.
    LEFT JOIN LATERAL haqdaar_leaves(s.eligibility) AS l(clause) ON true
  ),
  aggregated AS (
    SELECT
      scheme_id,
      COALESCE(jsonb_agg(clause) FILTER (WHERE result IS TRUE), '[]'::jsonb) AS matched,
      COALESCE(jsonb_agg(clause) FILTER (WHERE result IS FALSE), '[]'::jsonb) AS failed,
      COALESCE(
        array_agg(DISTINCT clause ->> 'field')
          FILTER (WHERE result IS NULL AND jsonb_exists(clause, 'field')),
        ARRAY[]::text[]
      ) AS unknowns
    FROM leaf_results
    GROUP BY scheme_id
  )
  SELECT
    a.scheme_id,
    CASE
      WHEN e.result IS TRUE  THEN 'PASS'
      WHEN e.result IS FALSE THEN 'FAIL'
      ELSE 'UNKNOWN'
    END,
    a.matched,
    a.failed,
    a.unknowns
  FROM aggregated a
  JOIN schemes s ON s.id = a.scheme_id
  CROSS JOIN LATERAL (
    SELECT haqdaar_eval_node(s.eligibility, applicant) AS result
  ) e;
$$;
