import type { JSONSchema, TransformResult } from '../types.js';
import {
  Warnings,
  clone,
  dereference,
  ensureObjectRoot,
  isPlainObject,
  mapChildren,
  mergeAllOf,
  oneOfToAnyOf,
  typesOf,
} from '../util.js';

/**
 * The fields of Gemini's `Schema` proto (route A), verified against the REST
 * API reference. The REST API rejects unknown fields ("Invalid JSON payload
 * received. Unknown name ..."), so route A keeps strictly this set: anything
 * else is converted when an equivalent exists (`allOf`, `oneOf`, `const`,
 * tuple `items`) and stripped otherwise.
 */
const PROTO_FIELDS = new Set([
  'type',
  'format',
  'title',
  'description',
  'nullable',
  'default',
  'enum',
  'example',
  'items',
  'minItems',
  'maxItems',
  'properties',
  'required',
  'minProperties',
  'maxProperties',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'anyOf',
  'propertyOrdering',
]);

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

    // Convert what has an equivalent before stripping what does not.
    if (Array.isArray(s.allOf)) {
      s = mergeAllOf(s, path, warnings, 'Gemini (route A)');
    }
    s = oneOfToAnyOf(s, path, warnings, 'Gemini (route A)');
    s = constToEnum(s, path, warnings);
    s = flattenTupleItems(s, path, warnings);

    for (const kw of Object.keys(s)) {
      if (!PROTO_FIELDS.has(kw)) {
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

/** Converts `const: x` into the equivalent single-value `enum: [x]`. */
function constToEnum(node: JSONSchema, path: string, warnings: Warnings): JSONSchema {
  if (!('const' in node)) return node;
  const { const: value, ...rest } = node;
  const out: JSONSchema = { ...rest };
  if (!Array.isArray(out.enum)) {
    out.enum = [value];
    warnings.add(
      path,
      'converted-keyword',
      "Converted 'const' to a single-value 'enum' ('const' is unsupported by Gemini route A).",
      false,
    );
  } else {
    warnings.add(path, 'stripped-keyword', "'const' is not supported by Gemini (route A); removed.");
  }
  return out;
}

/**
 * Gemini's `items` is a single schema. Tuple (array form) `items` collapse to
 * the single schema when the tuple has one entry, or to an `anyOf` of the
 * entries otherwise (the positional constraint is lost).
 */
function flattenTupleItems(node: JSONSchema, path: string, warnings: Warnings): JSONSchema {
  if (!Array.isArray(node.items)) return node;
  const parts = node.items;
  const out: JSONSchema = { ...node };
  if (parts.length === 1) {
    out.items = parts[0];
    warnings.add(
      path,
      'converted-keyword',
      'Collapsed a single-entry tuple `items` into a plain `items` schema.',
      false,
    );
  } else if (parts.length === 0) {
    delete out.items;
    warnings.add(path, 'stripped-keyword', 'Removed an empty tuple `items` array.', false);
  } else {
    out.items = { anyOf: parts };
    warnings.add(
      path,
      'converted-keyword',
      'Converted tuple `items` into `items: { anyOf: [...] }`; Gemini cannot express per-position schemas.',
    );
  }
  return out;
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
