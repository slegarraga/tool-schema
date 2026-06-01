import type { JSONSchema, TransformResult } from '../types.js';
import {
  Warnings,
  clone,
  isObjectSchema,
  isPlainObject,
  makeNullable,
  mapChildren,
  ensureObjectRoot,
} from '../util.js';

/** Formats OpenAI Structured Outputs accepts. Others are dropped in strict mode. */
const FORMAT_WHITELIST = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
]);

/** Keywords OpenAI strict mode rejects outright. */
const UNSUPPORTED = [
  'not',
  'if',
  'then',
  'else',
  'dependentRequired',
  'dependentSchemas',
  'patternProperties',
  'unevaluatedProperties',
] as const;

const MAX_PROPERTIES = 5000;
const MAX_DEPTH = 10;
const MAX_ENUM_VALUES = 1000;

/** OpenAI non strict: tool parameters should be an object, otherwise pass through. */
export function toOpenAI(input: JSONSchema): TransformResult {
  const warnings = new Warnings();
  const schema = ensureObjectRoot(clone(input), warnings, 'OpenAI');
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}

/**
 * OpenAI Structured Outputs / `strict: true`. Enforces: every object has
 * `additionalProperties: false`; every property is `required` (optional ones
 * become nullable); unsupported keywords are stripped; `allOf` is merged; only
 * whitelisted `format` values survive. `$defs` / `$ref` and `anyOf` are kept.
 */
export function toOpenAIStrict(input: JSONSchema): TransformResult {
  const warnings = new Warnings();

  const transform = (node: JSONSchema, path: string): JSONSchema => {
    if (!isPlainObject(node)) return node;
    let s: JSONSchema = { ...node };

    if (Array.isArray(s.allOf)) {
      s = mergeAllOf(s, path, warnings);
    }

    for (const kw of UNSUPPORTED) {
      if (kw in s) {
        delete s[kw];
        warnings.add(path, 'stripped-keyword', `'${kw}' is not supported in OpenAI strict mode; removed.`);
      }
    }

    if (typeof s.format === 'string' && !FORMAT_WHITELIST.has(s.format)) {
      warnings.add(
        `${path}/format`,
        'unsupported-format',
        `format '${s.format}' is not in OpenAI's whitelist; removed.`,
      );
      delete s.format;
    }

    // Recurse into all sub schemas first (anyOf branches, items, $defs, ...).
    s = mapChildren(s, path, transform);

    if (isObjectSchema(s) && isPlainObject(s.properties)) {
      const props = s.properties as Record<string, JSONSchema>;
      const originalRequired = new Set(Array.isArray(s.required) ? s.required : []);
      const nextProps: Record<string, JSONSchema> = {};
      for (const key of Object.keys(props)) {
        let child = props[key];
        if (!originalRequired.has(key)) {
          child = makeNullable(child);
          warnings.add(
            `${path}/properties/${key}`,
            'forced-required',
            `Optional property '${key}' was made required and nullable for OpenAI strict mode.`,
          );
        }
        nextProps[key] = child;
      }
      s.properties = nextProps;
      s.required = Object.keys(nextProps);
      if (s.additionalProperties !== false) {
        warnings.add(
          path,
          'forced-additional-properties',
          "Set 'additionalProperties: false' as required by strict mode.",
          false,
        );
      }
      s.additionalProperties = false;
    } else if (isObjectSchema(s)) {
      // Object without declared properties: strict mode still forbids extra keys.
      if (s.additionalProperties !== false) {
        warnings.add(
          path,
          'forced-additional-properties',
          "Set 'additionalProperties: false' on a property-less object.",
          false,
        );
      }
      s.additionalProperties = false;
    }

    return s;
  };

  const schema = ensureObjectRoot(transform(clone(input), '#'), warnings, 'OpenAI strict mode');
  checkLimits(schema, warnings);
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}

/** Shallow merges `allOf` object subschemas into the parent, then drops `allOf`. */
function mergeAllOf(node: JSONSchema, path: string, warnings: Warnings): JSONSchema {
  const parts = node.allOf as JSONSchema[];
  const { allOf: _drop, ...base } = node;
  void _drop;
  const merged: JSONSchema = { ...base };
  const props: Record<string, JSONSchema> = isPlainObject(merged.properties)
    ? { ...(merged.properties as Record<string, JSONSchema>) }
    : {};
  const required = new Set<string>(Array.isArray(merged.required) ? merged.required : []);

  for (const part of parts) {
    if (!isPlainObject(part)) continue;
    if (isPlainObject(part.properties)) {
      Object.assign(props, part.properties);
    }
    if (Array.isArray(part.required)) {
      for (const r of part.required) required.add(r);
    }
    if (part.type && !merged.type) merged.type = part.type;
  }

  if (Object.keys(props).length > 0) merged.properties = props;
  if (required.size > 0) merged.required = [...required];
  if (!merged.type && (merged.properties || isObjectSchema(merged))) merged.type = 'object';
  warnings.add(path, 'merged-allof', "Merged 'allOf' subschemas into the parent (unsupported in strict mode).");
  return merged;
}

function checkLimits(schema: JSONSchema, warnings: Warnings): void {
  let propertyCount = 0;
  let maxDepth = 0;

  const visit = (node: JSONSchema, depth: number): void => {
    if (!isPlainObject(node)) return;
    maxDepth = Math.max(maxDepth, depth);
    if (isPlainObject(node.properties)) {
      const keys = Object.keys(node.properties as Record<string, JSONSchema>);
      propertyCount += keys.length;
    }
    if (Array.isArray(node.enum) && node.enum.length > MAX_ENUM_VALUES) {
      warnings.add(
        '#',
        'limit-exceeded',
        `An enum has ${node.enum.length} values; OpenAI allows at most ${MAX_ENUM_VALUES}.`,
        false,
      );
    }
    const children = collectChildren(node);
    for (const c of children) visit(c, depth + 1);
  };

  visit(schema, 0);
  if (propertyCount > MAX_PROPERTIES) {
    warnings.add(
      '#',
      'limit-exceeded',
      `Schema has ${propertyCount} object properties; OpenAI allows at most ${MAX_PROPERTIES}.`,
      false,
    );
  }
  if (maxDepth > MAX_DEPTH) {
    warnings.add(
      '#',
      'limit-exceeded',
      `Schema nests ${maxDepth} levels deep; OpenAI allows at most ${MAX_DEPTH}.`,
      false,
    );
  }
}

function collectChildren(node: JSONSchema): JSONSchema[] {
  const out: JSONSchema[] = [];
  if (isPlainObject(node.properties)) out.push(...Object.values(node.properties as Record<string, JSONSchema>));
  if (Array.isArray(node.items)) out.push(...node.items);
  else if (isPlainObject(node.items)) out.push(node.items as JSONSchema);
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const arr = node[key];
    if (Array.isArray(arr)) out.push(...arr);
  }
  if (isPlainObject(node.$defs)) out.push(...Object.values(node.$defs as Record<string, JSONSchema>));
  return out.filter(isPlainObject) as JSONSchema[];
}
