import { describe, it, expect } from 'vitest';
import { toToolSchema, lintToolSchema } from '../src/index.ts';
import type { JSONSchema } from '../src/index.ts';

describe('openai (non strict)', () => {
  it('passes an object schema through unchanged', () => {
    const input: JSONSchema = {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
      required: ['a'],
    };
    const { schema, warnings, lossy } = toToolSchema(input, { target: 'openai' });
    expect(schema).toEqual(input);
    expect(warnings).toEqual([]);
    expect(lossy).toBe(false);
  });

  it('keeps optional properties optional', () => {
    const { schema } = toToolSchema(
      { type: 'object', properties: { a: { type: 'string' } }, required: [] },
      { target: 'openai' },
    );
    expect(schema.required).toEqual([]);
  });
});

describe('openai-strict', () => {
  it('forces additionalProperties:false and makes every property required', () => {
    const { schema, lossy } = toToolSchema(
      { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a'] },
      { target: 'openai-strict' },
    );
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['a', 'b']);
    expect(lossy).toBe(true);
  });

  it('makes optional properties nullable instead of dropping them', () => {
    const { schema } = toToolSchema(
      { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a'] },
      { target: 'openai-strict' },
    );
    expect((schema.properties as Record<string, JSONSchema>).a.type).toBe('string');
    expect((schema.properties as Record<string, JSONSchema>).b.type).toEqual(['number', 'null']);
  });

  it('applies additionalProperties:false to nested objects', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: {
          nested: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
        },
        required: ['nested'],
      },
      { target: 'openai-strict' },
    );
    const nested = (schema.properties as Record<string, JSONSchema>).nested;
    expect(nested.additionalProperties).toBe(false);
    expect(nested.required).toEqual(['x']);
  });

  it('strips unsupported keywords', () => {
    const { schema, warnings } = toToolSchema(
      {
        type: 'object',
        properties: { a: { type: 'string', not: { const: 'x' } } },
        required: ['a'],
        if: { properties: {} },
      },
      { target: 'openai-strict' },
    );
    expect((schema.properties as Record<string, JSONSchema>).a.not).toBeUndefined();
    expect(schema.if).toBeUndefined();
    expect(warnings.some((w) => w.code === 'stripped-keyword')).toBe(true);
  });

  it('merges allOf into the parent', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        allOf: [{ properties: { x: { type: 'string' } }, required: ['x'] }],
        properties: { y: { type: 'number' } },
        required: ['y'],
      },
      { target: 'openai-strict' },
    );
    expect(schema.allOf).toBeUndefined();
    const props = schema.properties as Record<string, JSONSchema>;
    expect(Object.keys(props).sort()).toEqual(['x', 'y']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('drops non whitelisted string formats but keeps whitelisted ones', () => {
    const { schema, warnings } = toToolSchema(
      {
        type: 'object',
        properties: { a: { type: 'string', format: 'uri' }, b: { type: 'string', format: 'email' } },
        required: ['a', 'b'],
      },
      { target: 'openai-strict' },
    );
    const props = schema.properties as Record<string, JSONSchema>;
    expect(props.a.format).toBeUndefined();
    expect(props.b.format).toBe('email');
    expect(warnings.some((w) => w.code === 'unsupported-format')).toBe(true);
  });

  it('preserves $ref and transforms $defs', () => {
    const { schema } = toToolSchema(
      {
        type: 'object',
        properties: { foo: { $ref: '#/$defs/Foo' } },
        required: ['foo'],
        $defs: { Foo: { type: 'object', properties: { n: { type: 'string' } }, required: ['n'] } },
      },
      { target: 'openai-strict' },
    );
    expect((schema.properties as Record<string, JSONSchema>).foo.$ref).toBe('#/$defs/Foo');
    const defs = schema.$defs as Record<string, JSONSchema>;
    expect(defs.Foo.additionalProperties).toBe(false);
  });

  it('warns when an enum exceeds the OpenAI limit', () => {
    const big = Array.from({ length: 1001 }, (_, i) => `v${i}`);
    const { warnings } = toToolSchema(
      { type: 'object', properties: { a: { type: 'string', enum: big } }, required: ['a'] },
      { target: 'openai-strict' },
    );
    expect(warnings.some((w) => w.code === 'limit-exceeded')).toBe(true);
  });
});

describe('lintToolSchema', () => {
  it('reports ok for an already conformant strict schema', () => {
    const { ok, issues } = lintToolSchema(
      { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false },
      { target: 'openai-strict' },
    );
    expect(ok).toBe(true);
    expect(issues).toEqual([]);
  });

  it('reports issues for a non conformant strict schema', () => {
    const { ok, issues } = lintToolSchema(
      { type: 'object', properties: { a: { type: 'string' } }, required: [] },
      { target: 'openai-strict' },
    );
    expect(ok).toBe(false);
    expect(issues.length).toBeGreaterThan(0);
  });
});
