import { describe, it, expect } from 'vitest';
import { fromAISDKTool, toAISDKTool } from '../src/index.ts';

const schema = {
  type: 'object',
  properties: {
    city: { type: 'string', description: 'City name' },
    units: { type: 'string', enum: ['c', 'f'] },
  },
  required: ['city'],
};

describe('Vercel AI SDK adapter', () => {
  it('emits AI SDK 5 inputSchema by default', () => {
    const { tool } = toAISDKTool({ name: 'get_weather', description: 'Get weather', schema }, { target: 'openai-strict' });

    expect(tool).toMatchObject({ description: 'Get weather', strict: true });
    expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tool.parameters).toBeUndefined();
  });

  it('can emit legacy AI SDK parameters', () => {
    const { tool } = toAISDKTool(
      { name: 'get_weather', description: 'Get weather', schema },
      { target: 'gemini', aiSDKParameters: true },
    );

    expect(tool.parameters).toBeDefined();
    expect(tool.inputSchema).toBeUndefined();
  });

  it('turns an AI SDK inputSchema tool into a provider tool', () => {
    const { tool, warnings } = fromAISDKTool(
      'get_weather',
      { description: 'Get weather', inputSchema: schema, strict: true },
      { target: 'openai-strict' },
    );

    expect(tool).toMatchObject({
      type: 'function',
      function: { name: 'get_weather', description: 'Get weather', strict: true },
    });
    expect((tool.function as Record<string, unknown>).parameters).toBeDefined();
    expect(warnings.some((w) => w.code === 'forced-required')).toBe(true);
  });

  it('accepts legacy AI SDK parameters as input', () => {
    const { tool } = fromAISDKTool('get_weather', { description: 'Get weather', parameters: schema }, { target: 'anthropic' });

    expect(tool).toMatchObject({ name: 'get_weather', description: 'Get weather' });
    expect(tool.input_schema).toBeDefined();
  });

  it('uses a caller supplied Zod converter without depending on Zod', () => {
    const fakeZodSchema = { _def: { typeName: 'ZodObject' } };
    const { tool } = fromAISDKTool(
      'get_weather',
      { description: 'Get weather', inputSchema: fakeZodSchema },
      {
        target: 'openai',
        zodToJsonSchema: (value) => {
          expect(value).toBe(fakeZodSchema);
          return schema;
        },
      },
    );

    expect((tool.function as Record<string, unknown>).parameters).toEqual(schema);
  });

  it('throws a helpful error for non-JSON-schema inputs without a converter', () => {
    expect(() => fromAISDKTool('bad', { inputSchema: { _def: { typeName: 'ZodObject' } } }, { target: 'openai' })).toThrow(
      /zodToJsonSchema|z\.toJSONSchema/,
    );
  });
});
