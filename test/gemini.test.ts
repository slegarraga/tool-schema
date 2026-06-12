import { describe, it, expect } from 'vitest';
import { toToolSchema } from '../src/index.ts';
import type { JSONSchema } from '../src/index.ts';

const props = (s: JSONSchema) => s.properties as Record<string, JSONSchema>;

describe('gemini (route A)', () => {
  it('strips keywords absent from the Gemini Schema type', () => {
    const { schema, warnings } = toToolSchema(
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
          b: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
        required: ['a'],
      },
      { target: 'gemini' },
    );
    expect(schema.additionalProperties).toBeUndefined();
    expect(props(schema).b.oneOf).toBeUndefined();
    expect(warnings.some((w) => w.code === 'stripped-keyword')).toBe(true);
  });

  it('strips unknown and 2020-12 keywords the proto does not have', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: {
          a: { type: 'array', prefixItems: [{ type: 'string' }], examples: ['x'] },
        },
        required: ['a'],
        $comment: 'internal note',
      },
      { target: 'gemini' },
    );
    expect(schema.$comment).toBeUndefined();
    expect(props(schema).a.prefixItems).toBeUndefined();
    expect(props(schema).a.examples).toBeUndefined();
  });

  it('keeps every Schema proto field', () => {
    const input: JSONSchema = {
      type: 'object',
      title: 'Range',
      propertyOrdering: ['lo', 'hi'],
      properties: {
        lo: { type: 'number', minimum: 0, maximum: 10, default: 0, example: 1 },
        hi: { type: 'string', minLength: 1, maxLength: 5, pattern: '^[a-z]+$', format: 'date-time' },
      },
      required: ['lo', 'hi'],
      minProperties: 2,
      maxProperties: 2,
    };
    const { schema, warnings } = toToolSchema(input, { target: 'gemini' });
    expect(schema).toEqual(input);
    expect(warnings).toEqual([]);
  });

  it('converts oneOf to anyOf instead of dropping the union', () => {
    const { schema, warnings } = toToolSchema(
      {
        type: 'object',
        properties: { b: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
        required: ['b'],
      },
      { target: 'gemini' },
    );
    expect(props(schema).b.oneOf).toBeUndefined();
    expect(props(schema).b.anyOf).toHaveLength(2);
    expect(warnings.some((w) => w.code === 'converted-keyword')).toBe(true);
  });

  it('merges allOf parts instead of dropping them', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        allOf: [{ properties: { a: { type: 'string' } }, required: ['a'] }, { properties: { b: { type: 'number' } } }],
      },
      { target: 'gemini' },
    );
    expect(schema.allOf).toBeUndefined();
    expect(props(schema).a.type).toBe('string');
    expect(props(schema).b.type).toBe('number');
    expect(schema.required).toEqual(['a']);
  });

  it('converts const to a single-value enum', () => {
    const { schema, warnings } = toToolSchema(
      { type: 'object', properties: { unit: { const: 'celsius' } }, required: ['unit'] },
      { target: 'gemini' },
    );
    expect(props(schema).unit.const).toBeUndefined();
    expect(props(schema).unit.enum).toEqual(['celsius']);
    expect(props(schema).unit.type).toBe('string');
    expect(warnings.some((w) => w.code === 'converted-keyword')).toBe(true);
  });

  it('collapses tuple items into a single items schema', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: {
          single: { type: 'array', items: [{ type: 'string' }] },
          pair: { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
        },
        required: ['single', 'pair'],
      },
      { target: 'gemini' },
    );
    expect(props(schema).single.items).toEqual({ type: 'string' });
    const pairItems = props(schema).pair.items as JSONSchema;
    expect(pairItems.anyOf).toHaveLength(2);
  });

  it('inlines local $ref and removes $defs', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: { foo: { $ref: '#/$defs/Foo' } },
        required: ['foo'],
        $defs: { Foo: { type: 'object', properties: { n: { type: 'string' } }, required: ['n'] } },
      },
      { target: 'gemini' },
    );
    expect(schema.$defs).toBeUndefined();
    const foo = props(schema).foo;
    expect(foo.$ref).toBeUndefined();
    expect(props(foo).n.type).toBe('string');
  });

  it('inlines local $ref pointers below a definition', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: { city: { $ref: '#/$defs/Location/properties/city' } },
        required: ['city'],
        $defs: {
          Location: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' },
            },
            required: ['city'],
          },
        },
      },
      { target: 'gemini' },
    );
    const city = props(schema).city;
    expect(city.$ref).toBeUndefined();
    expect(city.type).toBe('string');
    expect(city.description).toBe('City name');
  });

  it('decodes escaped and percent-encoded local $ref pointer segments', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: {
          city: { $ref: '#/$defs/Name%2FCity' },
          marker: { $ref: '#/$defs/tilde~0key' },
        },
        required: ['city', 'marker'],
        $defs: {
          'Name/City': { type: 'string', description: 'Slash key' },
          'tilde~key': { type: 'number', description: 'Tilde key' },
        },
      },
      { target: 'gemini' },
    );
    expect(props(schema).city).toMatchObject({ type: 'string', description: 'Slash key' });
    expect(props(schema).marker).toMatchObject({ type: 'number', description: 'Tilde key' });
  });

  it('keeps sibling metadata when inlining local $ref pointers', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: {
          city: { $ref: '#/$defs/City', description: 'Specific city prompt' },
        },
        required: ['city'],
        $defs: {
          City: { type: 'string', description: 'Generic city' },
        },
      },
      { target: 'gemini' },
    );
    expect(props(schema).city).toMatchObject({ type: 'string', description: 'Specific city prompt' });
  });

  it('warns and opens recursive refs that cannot be inlined', () => {
    const { schema, warnings } = toToolSchema(
      {
        type: 'object',
        properties: { root: { $ref: '#/$defs/Node' } },
        required: ['root'],
        $defs: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              next: { $ref: '#/$defs/Node' },
            },
            required: ['value'],
          },
        },
      },
      { target: 'gemini' },
    );
    const root = props(schema).root;
    expect(root.$ref).toBeUndefined();
    expect(props(root).next).toEqual({});
    expect(warnings.some((w) => w.code === 'recursive-ref')).toBe(true);
  });

  it('does not report recursion from unused definitions removed from route A output', () => {
    const { schema, warnings } = toToolSchema(
      {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        $defs: {
          Node: {
            type: 'object',
            properties: {
              next: { $ref: '#/$defs/Node' },
            },
          },
        },
      },
      { target: 'gemini' },
    );
    expect(schema.$defs).toBeUndefined();
    expect(props(schema).name.type).toBe('string');
    expect(warnings.some((w) => w.code === 'recursive-ref')).toBe(false);
  });

  it('converts a nullable type union into nullable:true', () => {
    const { schema } = toToolSchema(
      { type: 'object', properties: { a: { type: ['string', 'null'] } }, required: ['a'] },
      { target: 'gemini' },
    );
    expect(props(schema).a.type).toBe('string');
    expect(props(schema).a.nullable).toBe(true);
  });

  it('collapses an anyOf null branch into nullable:true', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: { a: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
        required: ['a'],
      },
      { target: 'gemini' },
    );
    const a = props(schema).a;
    expect(a.anyOf).toBeUndefined();
    expect(a.type).toBe('string');
    expect(a.nullable).toBe(true);
  });

  it('keeps a real anyOf union of two non null branches', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: { a: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
        required: ['a'],
      },
      { target: 'gemini' },
    );
    expect(Array.isArray(props(schema).a.anyOf)).toBe(true);
    expect((props(schema).a.anyOf as JSONSchema[]).length).toBe(2);
  });

  it('coerces non string enum values to strings', () => {
    const { schema, warnings } = toToolSchema(
      { type: 'object', properties: { a: { enum: [1, 2, 3] } }, required: ['a'] },
      { target: 'gemini' },
    );
    expect(props(schema).a.enum).toEqual(['1', '2', '3']);
    expect(props(schema).a.type).toBe('string');
    expect(warnings.some((w) => w.code === 'enum-coerced')).toBe(true);
  });

  it('emits upper case type names when requested', () => {
    const { schema } = toToolSchema(
      { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
      { target: 'gemini', geminiUppercaseTypes: true },
    );
    expect(schema.type).toBe('OBJECT');
    expect(props(schema).a.type).toBe('STRING');
  });
});

describe('gemini-jsonschema (route B)', () => {
  it('keeps richer JSON Schema such as $ref', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: { foo: { $ref: '#/$defs/Foo' } },
        required: ['foo'],
        $defs: { Foo: { type: 'object', properties: { n: { type: 'string' } } } },
      },
      { target: 'gemini-jsonschema' },
    );
    expect((schema.properties as Record<string, JSONSchema>).foo.$ref).toBe('#/$defs/Foo');
    expect(schema.$defs).toBeDefined();
  });
});
