import type { JSONSchema, TransformResult } from '../types.js';
import { Warnings, clone, ensureObjectRoot } from '../util.js';

/**
 * MCP (Model Context Protocol) tools. The most permissive input target:
 * `inputSchema` is standard JSON Schema and the spec only requires the root to
 * be an object. All input keywords are preserved. MCP `outputSchema` is handled
 * at the tool envelope layer because it describes `structuredContent` and does
 * not share the input object-root constraint.
 */
export function toMcp(input: JSONSchema): TransformResult {
  const warnings = new Warnings();
  const schema = ensureObjectRoot(clone(input), warnings, 'MCP');
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}
