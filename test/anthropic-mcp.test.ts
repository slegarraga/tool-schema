import { describe, it, expect } from 'vitest';
import { toToolSchema } from '../src/index.ts';
import type { JSONSchema } from '../src/index.ts';

describe('anthropic', () => {
  it('keeps permissive keywords untouched', () => {
    const input: JSONSchema = {
      type: 'object',
      properties: { a: { oneOf: [{ type: 'string' }, { type: 'number' }] }, b: { $ref: '#/$defs/B' } },
      required: ['a'],
      $defs: { B: { type: 'string' } },
    };
    const { schema, warnings, lossy } = toToolSchema(input, { target: 'anthropic' });
    expect(schema).toEqual(input);
    expect(warnings).toEqual([]);
    expect(lossy).toBe(false);
  });

  it('wraps a non object root under a value property', () => {
    const { schema, warnings } = toToolSchema({ type: 'string' }, { target: 'anthropic' });
    expect(schema.type).toBe('object');
    expect((schema.properties as Record<string, JSONSchema>).value.type).toBe('string');
    expect(warnings.some((w) => w.code === 'root-not-object')).toBe(true);
  });
});

describe('mcp', () => {
  it('keeps all keywords and adds a type to an untyped object root', () => {
    const { schema, warnings } = toToolSchema(
      { properties: { a: { type: 'string' } }, required: ['a'] },
      { target: 'mcp' },
    );
    expect(schema.type).toBe('object');
    expect(warnings).toEqual([]);
  });
});
