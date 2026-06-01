import type { JSONSchema, TransformResult } from '../types.js';
import { Warnings, clone, ensureObjectRoot } from '../util.js';

/**
 * MCP (Model Context Protocol) tools. The most permissive target: `inputSchema`
 * is standard JSON Schema and the spec only requires the root to be an object.
 * All keywords are preserved.
 */
export function toMcp(input: JSONSchema): TransformResult {
  const warnings = new Warnings();
  const schema = ensureObjectRoot(clone(input), warnings, 'MCP');
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}
