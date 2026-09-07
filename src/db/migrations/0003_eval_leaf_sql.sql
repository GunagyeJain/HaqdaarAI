-- Second matching-speed step. Semantics unchanged; the differential test pins that.
--
-- haqdaar_eval_leaf is the hot path: it runs about twelve times per scheme
-- (once per leaf while collecting reasoning, and again per leaf inside the
-- recursive verdict walk), so roughly 3,600 calls over a 300-scheme corpus.
--
-- As plpgsql each call pays interpreter setup. Rewritten as LANGUAGE sql it
-- becomes a planned expression the executor can evaluate directly, which is
-- where the remaining overhead was.
--
-- Deliberately written without CTEs or a FROM clause so the planner is free to
-- inline it into the calling query.

CREATE OR REPLACE FUNCTION haqdaar_eval_leaf(clause jsonb, applicant jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    -- WILDCARD clauses name no field, so there is nothing to decide.
    WHEN clause ->> 'field' IS NULL THEN NULL

    -- Absent means undecidable. `false` and `0` are present values and must
    -- not be treated as absence.
    WHEN applicant -> (clause ->> 'field') IS NULL THEN NULL
    WHEN jsonb_typeof(applicant -> (clause ->> 'field')) = 'null' THEN NULL

    WHEN clause ->> 'op' = 'eq' THEN
      CASE
        WHEN jsonb_typeof(applicant -> (clause ->> 'field')) = 'number'
         AND jsonb_typeof(clause -> 'value') = 'number'
        THEN (applicant -> (clause ->> 'field') #>> '{}')::numeric
           = (clause ->> 'value')::numeric
        ELSE applicant -> (clause ->> 'field') = clause -> 'value'
      END

    WHEN clause ->> 'op' = 'neq' THEN
      CASE
        WHEN jsonb_typeof(applicant -> (clause ->> 'field')) = 'number'
         AND jsonb_typeof(clause -> 'value') = 'number'
        THEN (applicant -> (clause ->> 'field') #>> '{}')::numeric
          <> (clause ->> 'value')::numeric
        ELSE applicant -> (clause ->> 'field') <> clause -> 'value'
      END

    WHEN clause ->> 'op' = 'in' THEN
      (clause -> 'values') @> (applicant -> (clause ->> 'field'))

    WHEN clause ->> 'op' = 'not_in' THEN
      NOT ((clause -> 'values') @> (applicant -> (clause ->> 'field')))

    -- Every remaining operator is numeric. A numeric operator against a
    -- non-numeric value means the rule tree is malformed and schema validation
    -- should have rejected it. Degrade to UNKNOWN rather than raising: one bad
    -- rule must not deny a citizen every other scheme in the corpus.
    WHEN jsonb_typeof(applicant -> (clause ->> 'field')) <> 'number' THEN NULL

    WHEN clause ->> 'op' = 'lt' THEN
      (applicant -> (clause ->> 'field') #>> '{}')::numeric < (clause ->> 'value')::numeric
    WHEN clause ->> 'op' = 'lte' THEN
      (applicant -> (clause ->> 'field') #>> '{}')::numeric <= (clause ->> 'value')::numeric
    WHEN clause ->> 'op' = 'gt' THEN
      (applicant -> (clause ->> 'field') #>> '{}')::numeric > (clause ->> 'value')::numeric
    WHEN clause ->> 'op' = 'gte' THEN
      (applicant -> (clause ->> 'field') #>> '{}')::numeric >= (clause ->> 'value')::numeric
    WHEN clause ->> 'op' = 'between' THEN
      (applicant -> (clause ->> 'field') #>> '{}')::numeric >= (clause ->> 'min')::numeric
      AND (applicant -> (clause ->> 'field') #>> '{}')::numeric <= (clause ->> 'max')::numeric

    -- Unrecognised operator: undecidable rather than wrong.
    ELSE NULL
  END;
$$;
