/**
 * Deterministic serialization of a rule tree, for answering one question
 * honestly: did this tree actually change?
 *
 * A tree does not come back from a JSONB column the way it went in. Postgres
 * normalizes object key order -- by key length, then bytewise -- so a clause
 * written as `{field, op, values}` reads back as `{op, field, values}`.
 * `JSON.stringify` preserves insertion order, so comparing the two reports a
 * difference that does not exist. `pnpm db:renormalize` reported all 483
 * schemes changed on a run that changed nothing, which made its own headline
 * metric useless: a number that is always the row count cannot tell you
 * whether a synthesis improvement did anything.
 *
 * Key order is therefore not significant here. Array order is: clause order is
 * how a rule reads back against the prose it came from (invariant 4), so
 * reordering clauses is a real change even where the logic is untouched.
 */
import type { RuleNode } from './types';

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue | undefined;
}

/**
 * Two trees produce the same string exactly when they carry the same data in
 * the same clause order, whatever order their keys happen to be in.
 */
export function canonicalJson(node: RuleNode): string {
  return serialize(node as unknown as JsonValue);
}

function serialize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;

  // Absent and explicitly-undefined are the same thing to JSON, and must be
  // the same thing here -- otherwise a key that survives a round trip as
  // missing would read as a change.
  const entries = Object.entries(value)
    .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${serialize(v)}`).join(',')}}`;
}
