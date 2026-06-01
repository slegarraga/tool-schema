import { describe, it, expect } from 'vitest';
import { toTool } from '../src/index.ts';

const schema = {
  type: 'object',
  properties: { city: { type: 'string', description: 'City name' } },
  required: ['city'],
};

describe('toTool', () => {
  it('builds the OpenAI Chat Completions shape', () => {
    const { tool } = toTool({ name: 'get_weather', description: 'Get weather', schema }, { target: 'openai' });
    expect(tool).toMatchObject({
      type: 'function',
      function: { name: 'get_weather', description: 'Get weather' },
    });
    expect((tool.function as Record<string, unknown>).parameters).toBeDefined();
    expect((tool.function as Record<string, unknown>).strict).toBeUndefined();
  });

  it('adds strict:true for openai-strict', () => {
    const { tool } = toTool({ name: 'get_weather', schema }, { target: 'openai-strict' });
    expect((tool.function as Record<string, unknown>).strict).toBe(true);
  });

  it('emits the flattened Responses shape on request', () => {
    const { tool } = toTool({ name: 'get_weather', schema }, { target: 'openai-strict', openaiResponses: true });
    expect(tool).toMatchObject({ type: 'function', name: 'get_weather', strict: true });
    expect(tool.parameters).toBeDefined();
  });

  it('builds the Anthropic shape with input_schema', () => {
    const { tool } = toTool({ name: 'get_weather', description: 'Get weather', schema }, { target: 'anthropic' });
    expect(tool.name).toBe('get_weather');
    expect(tool.input_schema).toBeDefined();
    expect(tool.parameters).toBeUndefined();
  });

  it('builds the Gemini route A shape with parameters', () => {
    const { tool } = toTool({ name: 'get_weather', schema }, { target: 'gemini' });
    expect(tool.parameters).toBeDefined();
    expect(tool.parametersJsonSchema).toBeUndefined();
  });

  it('builds the Gemini route B shape with parametersJsonSchema', () => {
    const { tool } = toTool({ name: 'get_weather', schema }, { target: 'gemini-jsonschema' });
    expect(tool.parametersJsonSchema).toBeDefined();
    expect(tool.parameters).toBeUndefined();
  });

  it('builds the MCP shape with inputSchema and annotations', () => {
    const { tool } = toTool(
      {
        name: 'delete_file',
        description: 'Delete a file',
        schema,
        annotations: { destructiveHint: true, readOnlyHint: false },
      },
      { target: 'mcp' },
    );
    expect(tool.inputSchema).toBeDefined();
    expect(tool.annotations).toEqual({ destructiveHint: true, readOnlyHint: false });
  });

  it('defaults to an empty object schema when none is given', () => {
    const { tool } = toTool({ name: 'ping' }, { target: 'openai' });
    expect((tool.function as Record<string, unknown>).parameters).toEqual({ type: 'object', properties: {} });
  });

  it('warns on an invalid tool name for the target', () => {
    const { warnings } = toTool({ name: 'has spaces!', schema }, { target: 'openai' });
    expect(warnings.some((w) => w.code === 'invalid-name')).toBe(true);
  });

  it('accepts a Gemini name with dots and colons', () => {
    const { warnings } = toTool({ name: 'svc.v1:get', schema }, { target: 'gemini' });
    expect(warnings.some((w) => w.code === 'invalid-name')).toBe(false);
  });
});
