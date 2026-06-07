import type { AISDKAdapterOptions, AISDKToolDefinition, JSONSchema, ToolDefinition, ToolResult } from '../types.js';
import { toTool, toToolSchema } from '../transform.js';
import { clone, isPlainObject } from '../util.js';

const EMPTY_OBJECT_SCHEMA: JSONSchema = { type: 'object', properties: {} };

/**
 * Build a Vercel AI SDK tool definition from a `tool-schema` definition.
 *
 * AI SDK v5 expects `{ description?, inputSchema, strict? }`. Pass
 * `aiSDKParameters: true` for the legacy AI SDK v4 `{ parameters }` key.
 */
export function toAISDKTool(def: ToolDefinition, options: AISDKAdapterOptions = {}): ToolResult {
  const result = toToolSchema(def.schema ?? EMPTY_OBJECT_SCHEMA, options);
  const schemaKey = options.aiSDKParameters ? 'parameters' : 'inputSchema';

  return {
    tool: {
      ...(def.description ? { description: def.description } : {}),
      [schemaKey]: result.schema,
      ...(options.target === 'openai-strict' ? { strict: true } : {}),
    },
    warnings: result.warnings,
    lossy: result.lossy,
  };
}

/**
 * Convert a Vercel AI SDK tool definition into any provider-specific tool shape.
 *
 * The tool name comes from the key in the AI SDK `tools` object:
 * `fromAISDKTool('get_weather', tools.get_weather, { target: 'openai-strict' })`.
 */
export function fromAISDKTool(
  name: string,
  aiTool: AISDKToolDefinition,
  options: AISDKAdapterOptions = {},
): ToolResult {
  if (!isPlainObject(aiTool)) {
    throw new TypeError('fromAISDKTool expected an AI SDK tool object.');
  }

  const rawSchema = aiTool.inputSchema ?? aiTool.parameters ?? EMPTY_OBJECT_SCHEMA;
  const schema = toJSONSchema(rawSchema, options);
  const target = aiTool.strict === true && (options.target ?? 'openai') === 'openai' ? 'openai-strict' : options.target;

  return toTool(
    {
      name,
      ...(typeof aiTool.description === 'string' ? { description: aiTool.description } : {}),
      schema,
    },
    { ...options, target },
  );
}

function toJSONSchema(value: unknown, options: AISDKAdapterOptions): JSONSchema {
  if (isProbablyZodSchema(value)) {
    if (options.zodToJsonSchema) {
      return assertJSONSchema(options.zodToJsonSchema(value));
    }
    throw new TypeError(
      'AI SDK tool schema looks like a Zod/Standard Schema object. tool-schema has zero dependencies; pass zodToJsonSchema: z.toJSONSchema or pass JSON Schema directly.',
    );
  }

  if (isPlainObject(value) && typeof value.toJSONSchema === 'function') {
    return assertJSONSchema((value.toJSONSchema as () => unknown)());
  }

  return assertJSONSchema(value);
}

function assertJSONSchema(value: unknown): JSONSchema {
  if (!isPlainObject(value)) {
    throw new TypeError('Expected a JSON Schema object for the AI SDK tool input schema.');
  }
  return clone(value as JSONSchema);
}

function isProbablyZodSchema(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  return '_def' in value || '_zod' in value || '~standard' in value;
}
