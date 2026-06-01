import type { JSONSchema, Warning, WarningCode } from './types.js';

/** Collects warnings and tracks whether the conversion lost information. */
export class Warnings {
  readonly list: Warning[] = [];
  lossy = false;

  add(path: string, code: WarningCode, message: string, lossy = true): void {
    this.list.push({ path, code, message });
    if (lossy) this.lossy = true;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A deep, structurally faithful clone. Uses the platform `structuredClone`. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Returns the schema's declared types as an array (empty when untyped). */
export function typesOf(schema: JSONSchema): string[] {
  if (typeof schema.type === 'string') return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.filter((t) => typeof t === 'string');
  return [];
}

/**
 * Heuristic: does this node describe an object? True when `type` is `object`
 * (or a union containing it) or when it is untyped but carries object keywords.
 */
export function isObjectSchema(schema: JSONSchema): boolean {
  const types = typesOf(schema);
  if (types.includes('object')) return true;
  if (types.length > 0) return false;
  return isPlainObject(schema.properties) || schema.additionalProperties !== undefined;
}

/**
 * Makes a schema accept `null`. Adds `null` to a string/array `type`, appends a
 * `{ type: 'null' }` branch to an `anyOf`, otherwise wraps the node in an
 * `anyOf` with a null branch. Used by OpenAI strict mode where every property
 * must be `required`, so optional fields are expressed as nullable instead.
 */
export function makeNullable(schema: JSONSchema): JSONSchema {
  if (typeof schema.type === 'string') {
    if (schema.type === 'null') return schema;
    return { ...schema, type: [schema.type, 'null'] };
  }
  if (Array.isArray(schema.type)) {
    if (schema.type.includes('null')) return schema;
    return { ...schema, type: [...schema.type, 'null'] };
  }
  if (Array.isArray(schema.anyOf)) {
    if (schema.anyOf.some((b) => typesOf(b).includes('null'))) return schema;
    return { ...schema, anyOf: [...schema.anyOf, { type: 'null' }] };
  }
  return { anyOf: [schema, { type: 'null' }] };
}

/**
 * Resolves local `$ref` pointers (`#/$defs/...` or `#/definitions/...`) by
 * inlining them. Non local refs are left untouched. Recursive refs are replaced
 * with an empty schema and reported, since target dialects that need inlining
 * (Gemini route A) cannot express recursion.
 */
export function dereference(root: JSONSchema, warnings: Warnings): JSONSchema {
  const defs: Record<string, JSONSchema> = {
    ...(isPlainObject(root.definitions) ? (root.definitions as Record<string, JSONSchema>) : {}),
    ...(isPlainObject(root.$defs) ? (root.$defs as Record<string, JSONSchema>) : {}),
  };

  const resolve = (ref: string): JSONSchema | undefined => {
    const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref);
    if (!m) return undefined;
    const key = decodeURIComponent(m[1].replace(/~1/g, '/').replace(/~0/g, '~'));
    return defs[key];
  };

  const walk = (node: JSONSchema, path: string, seen: Set<string>): JSONSchema => {
    if (!isPlainObject(node)) return node;
    if (typeof node.$ref === 'string') {
      const ref = node.$ref;
      const target = resolve(ref);
      if (!target) return node; // leave external / unknown refs in place
      if (seen.has(ref)) {
        warnings.add(path, 'recursive-ref', `Recursive $ref '${ref}' cannot be inlined; replaced with an open schema.`);
        return {};
      }
      const { $ref: _drop, ...rest } = node;
      void _drop;
      warnings.add(path, 'inlined-ref', `Inlined $ref '${ref}'.`, false);
      const merged = { ...clone(target), ...rest };
      return walk(merged, path, new Set([...seen, ref]));
    }
    return mapChildren(node, path, (child, childPath) => walk(child, childPath, seen));
  };

  const out = walk(clone(root), '#', new Set());
  delete out.$defs;
  delete out.definitions;
  return out;
}

/**
 * Applies `fn` to every direct sub schema of `node`, returning a new node. Walks
 * the standard applicator keywords. Leaf keywords are copied as is.
 */
export function mapChildren(
  node: JSONSchema,
  path: string,
  fn: (child: JSONSchema, childPath: string) => JSONSchema,
): JSONSchema {
  const out: JSONSchema = { ...node };

  if (isPlainObject(out.properties)) {
    const props: Record<string, JSONSchema> = {};
    for (const [k, v] of Object.entries(out.properties as Record<string, JSONSchema>)) {
      props[k] = fn(v, `${path}/properties/${k}`);
    }
    out.properties = props;
  }

  if (Array.isArray(out.items)) {
    out.items = out.items.map((it, i) => fn(it, `${path}/items/${i}`));
  } else if (isPlainObject(out.items)) {
    out.items = fn(out.items as JSONSchema, `${path}/items`);
  }

  if (isPlainObject(out.additionalProperties)) {
    out.additionalProperties = fn(out.additionalProperties as JSONSchema, `${path}/additionalProperties`);
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const arr = out[key];
    if (Array.isArray(arr)) {
      out[key] = arr.map((b, i) => fn(b, `${path}/${key}/${i}`));
    }
  }

  if (isPlainObject(out.not)) out.not = fn(out.not as JSONSchema, `${path}/not`);
  for (const key of ['if', 'then', 'else'] as const) {
    if (isPlainObject(out[key])) out[key] = fn(out[key] as JSONSchema, `${path}/${key}`);
  }

  if (isPlainObject(out.patternProperties)) {
    const pp: Record<string, JSONSchema> = {};
    for (const [k, v] of Object.entries(out.patternProperties as Record<string, JSONSchema>)) {
      pp[k] = fn(v, `${path}/patternProperties/${k}`);
    }
    out.patternProperties = pp;
  }

  for (const key of ['$defs', 'definitions', 'dependentSchemas'] as const) {
    const map = out[key];
    if (isPlainObject(map)) {
      const next: Record<string, JSONSchema> = {};
      for (const [k, v] of Object.entries(map as Record<string, JSONSchema>)) {
        next[k] = fn(v as JSONSchema, `${path}/${key}/${k}`);
      }
      out[key] = next;
    }
  }

  return out;
}

/** Ensures the root is an object schema, reporting when it was not. */
export function ensureObjectRoot(schema: JSONSchema, warnings: Warnings, target: string): JSONSchema {
  if (isObjectSchema(schema)) {
    if (typesOf(schema).length === 0) return { type: 'object', ...schema };
    return schema;
  }
  warnings.add(
    '#',
    'root-not-object',
    `${target} requires the root schema to be an object; wrapped the schema under a 'value' property.`,
  );
  return {
    type: 'object',
    properties: { value: schema },
    required: ['value'],
  };
}
