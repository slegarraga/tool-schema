import type { JSONSchema, TransformResult } from '../types.js';
import { Warnings, clone, ensureObjectRoot } from '../util.js';

/**
 * Anthropic tool use. The API is permissive: it accepts standard JSON Schema for
 * `input_schema` (anyOf, oneOf, allOf, $ref, format, pattern, ...). The only hard
 * requirement is that the root is an object, so that is all we enforce.
 */
export function toAnthropic(input: JSONSchema): TransformResult {
  const warnings = new Warnings();
  const schema = ensureObjectRoot(clone(input), warnings, 'Anthropic');
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}
