import type { JSONSchema, TransformResult } from '../types.js';
import { Warnings, clone, dereference, ensureObjectRoot, isPlainObject, mapChildren, typesOf } from '../util.js';

/**
 * Keywords absent from Gemini's `Schema` proto (route A). Sending them either
 * errors or is silently ignored, so they are stripped.
 */
const STRIP = [
  '$schema',
  '$id',
  '$anchor',
  '$ref',
  'oneOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'additionalProperties',
  'patternProperties',
  'unevaluatedProperties',
  'const',
  'dependentRequired',
  'dependentSchemas',
  'multipleOf',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'uniqueItems',
  'contentEncoding',
  'contentMediaType',
  '$defs',
  'definitions',
] as const;

const TYPE_UPPER: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
  null: 'NULL',
};

interface GeminiOptions {
  uppercaseTypes?: boolean;
}

/**
 * Gemini function calling, route A (`parameters` as an OpenAPI 3.0 subset).
 * Inlines `$ref`, strips unsupported keywords, converts nullable unions to
 * `nullable: true`, collapses `anyOf` null branches, and coerces enum values to
 * strings. Use the `gemini-jsonschema` target for the richer
 * `parametersJsonSchema` route.
 */
export function toGemini(input: JSONSchema, options: GeminiOptions = {}): TransformResult {
  const warnings = new Warnings();
  const dereferenced = dereference(clone(input), warnings);

  const transform = (node: JSONSchema, path: string): JSONSchema => {
    if (!isPlainObject(node)) return node;
    let s: JSONSchema = { ...node };

    for (const kw of STRIP) {
      if (kw in s) {
        delete s[kw];
        warnings.add(path, 'stripped-keyword', `'${kw}' is not supported by Gemini (route A); removed.`);
      }
    }

    s = collapseNullableUnion(s, path, warnings);
    s = mapChildren(s, path, transform);
    s = collapseAnyOf(s, path, warnings);
    coerceEnum(s, path, warnings);
    return s;
  };

  let schema = ensureObjectRoot(transform(dereferenced, '#'), warnings, 'Gemini');
  if (options.uppercaseTypes) schema = uppercaseTypes(schema);
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}

/** Final pass: rewrite JSON Schema type names to Gemini's upper case enum. */
function uppercaseTypes(node: JSONSchema): JSONSchema {
  if (!isPlainObject(node)) return node;
  const out: JSONSchema = { ...node };
  if (typeof out.type === 'string') {
    out.type = TYPE_UPPER[out.type] ?? out.type;
  } else if (Array.isArray(out.type)) {
    out.type = out.type.map((t) => TYPE_UPPER[t] ?? t);
  }
  return mapChildren(out, '#', (child) => uppercaseTypes(child));
}

/** Gemini route B (`parametersJsonSchema`): richer JSON Schema, object root only. */
export function toGeminiJsonSchema(input: JSONSchema): TransformResult {
  const warnings = new Warnings();
  const schema = ensureObjectRoot(clone(input), warnings, 'Gemini (parametersJsonSchema)');
  return { schema, warnings: warnings.list, lossy: warnings.lossy };
}

/** Converts `type: ['string', 'null']` into `type: 'string', nullable: true`. */
function collapseNullableUnion(node: JSONSchema, path: string, warnings: Warnings): JSONSchema {
  if (!Array.isArray(node.type)) return node;
  const nonNull = node.type.filter((t) => t !== 'null');
  const hadNull = node.type.includes('null');
  const out: JSONSchema = { ...node };
  if (nonNull.length === 0) {
    out.type = 'string';
  } else {
    out.type = nonNull[0];
    if (nonNull.length > 1) {
      warnings.add(
        path,
        'union-types',
        `Gemini cannot express a union of types [${nonNull.join(', ')}]; kept '${nonNull[0]}'.`,
      );
    }
  }
  if (hadNull) {
    out.nullable = true;
    warnings.add(path, 'collapsed-nullable', "Converted nullable type union into 'nullable: true'.", false);
  }
  return out;
}

/** Removes `{ type: 'null' }` branches from `anyOf`, mapping them to `nullable`. */
function collapseAnyOf(node: JSONSchema, path: string, warnings: Warnings): JSONSchema {
  if (!Array.isArray(node.anyOf)) return node;
  const branches = node.anyOf as JSONSchema[];
  const nonNull = branches.filter((b) => !(typesOf(b).length === 1 && typesOf(b)[0] === 'null'));
  const hadNull = nonNull.length !== branches.length;
  const out: JSONSchema = { ...node };

  if (hadNull) {
    out.nullable = true;
    warnings.add(path, 'collapsed-nullable', "Converted an anyOf null branch into 'nullable: true'.", false);
  }

  if (nonNull.length === 0) {
    delete out.anyOf;
    if (!out.type) out.type = 'string';
  } else if (nonNull.length === 1) {
    // Flatten a single remaining branch into the parent.
    delete out.anyOf;
    const branch = nonNull[0];
    for (const [k, v] of Object.entries(branch)) {
      if (k === 'description' && out.description) continue;
      out[k] = v;
    }
  } else {
    out.anyOf = nonNull;
  }
  return out;
}

/** Gemini enum values must be strings. Coerces and reports when they were not. */
function coerceEnum(node: JSONSchema, path: string, warnings: Warnings): void {
  if (!Array.isArray(node.enum)) return;
  const allStrings = node.enum.every((v) => typeof v === 'string');
  if (!allStrings) {
    node.enum = node.enum.map((v) => String(v));
    warnings.add(`${path}/enum`, 'enum-coerced', 'Gemini enum values must be strings; coerced non string values.');
  }
  if (!node.type) node.type = 'string';
}
