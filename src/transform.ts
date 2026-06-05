import type {
  JSONSchema,
  LintResult,
  Target,
  ToolDefinition,
  ToolResult,
  ToolSchemaOptions,
  TransformResult,
  Warning,
} from './types.js';
import { toOpenAI, toOpenAIStrict } from './targets/openai.js';
import { toAnthropic } from './targets/anthropic.js';
import { toGemini, toGeminiJsonSchema } from './targets/gemini.js';
import { toMcp } from './targets/mcp.js';
import { clone } from './util.js';

const EMPTY_OBJECT_SCHEMA: JSONSchema = { type: 'object', properties: {} };

/**
 * Convert any JSON Schema into a schema that is valid for a provider's tool /
 * function calling parameters.
 *
 * @example
 * const { schema, warnings } = toToolSchema(mySchema, { target: 'openai-strict' });
 */
export function toToolSchema(schema: JSONSchema, options: ToolSchemaOptions = {}): TransformResult {
  const target = options.target ?? 'openai';
  switch (target) {
    case 'openai':
      return toOpenAI(schema);
    case 'openai-strict':
      return toOpenAIStrict(schema);
    case 'anthropic':
      return toAnthropic(schema);
    case 'gemini':
      return toGemini(schema, { uppercaseTypes: options.geminiUppercaseTypes });
    case 'gemini-jsonschema':
      return toGeminiJsonSchema(schema);
    case 'mcp':
      return toMcp(schema);
    default:
      throw new Error(`Unknown target: ${String(target satisfies never)}`);
  }
}

/**
 * Build a complete, provider shaped tool / function declaration: the right
 * wrapper keys (`function`, `input_schema`, `parameters`, `inputSchema`), the
 * converted parameter schema, and provider specific extras such as `strict` or
 * MCP `annotations`.
 */
export function toTool(def: ToolDefinition, options: ToolSchemaOptions = {}): ToolResult {
  const target = options.target ?? 'openai';
  const result = toToolSchema(def.schema ?? EMPTY_OBJECT_SCHEMA, options);
  const warnings: Warning[] = [...result.warnings];
  validateName(def.name, target, warnings);

  const tool = buildTool(def, result.schema, target, options);
  return { tool, warnings, lossy: result.lossy };
}

/**
 * Report what would change to make `schema` valid for a target, without
 * applying it. `ok` is true when the schema is already conformant.
 */
export function lintToolSchema(schema: JSONSchema, options: ToolSchemaOptions = {}): LintResult {
  const { warnings } = toToolSchema(schema, options);
  return { ok: warnings.length === 0, issues: warnings };
}

function buildTool(
  def: ToolDefinition,
  schema: JSONSchema,
  target: Target,
  options: ToolSchemaOptions,
): Record<string, unknown> {
  const { name, description } = def;

  switch (target) {
    case 'openai':
    case 'openai-strict': {
      const strict = target === 'openai-strict';
      if (options.openaiResponses) {
        return {
          type: 'function',
          name,
          ...(description ? { description } : {}),
          parameters: schema,
          ...(strict ? { strict: true } : {}),
        };
      }
      return {
        type: 'function',
        function: {
          name,
          ...(description ? { description } : {}),
          parameters: schema,
          ...(strict ? { strict: true } : {}),
        },
      };
    }
    case 'anthropic':
      return {
        name,
        ...(description ? { description } : {}),
        input_schema: schema,
        ...(options.anthropicStrict ? { strict: true } : {}),
      };
    case 'gemini':
      return {
        name,
        ...(description ? { description } : {}),
        parameters: schema,
      };
    case 'gemini-jsonschema':
      return {
        name,
        ...(description ? { description } : {}),
        parametersJsonSchema: schema,
      };
    case 'mcp':
      return {
        name,
        ...(description ? { description } : {}),
        inputSchema: schema,
        ...(def.outputSchema ? { outputSchema: clone(def.outputSchema) } : {}),
        ...(def.annotations ? { annotations: def.annotations } : {}),
      };
    default:
      throw new Error(`Unknown target: ${String(target satisfies never)}`);
  }
}

const NAME_RULES: Record<Target, { pattern: RegExp; label: string }> = {
  openai: { pattern: /^[a-zA-Z0-9_-]{1,64}$/, label: 'OpenAI (letters, digits, _ and -, max 64)' },
  'openai-strict': { pattern: /^[a-zA-Z0-9_-]{1,64}$/, label: 'OpenAI (letters, digits, _ and -, max 64)' },
  anthropic: { pattern: /^[a-zA-Z0-9_-]{1,64}$/, label: 'Anthropic (letters, digits, _ and -, max 64)' },
  gemini: { pattern: /^[a-zA-Z0-9_:.-]{1,128}$/, label: 'Gemini (letters, digits, _ : . -, max 128)' },
  'gemini-jsonschema': { pattern: /^[a-zA-Z0-9_:.-]{1,128}$/, label: 'Gemini (letters, digits, _ : . -, max 128)' },
  mcp: { pattern: /^[a-zA-Z0-9_-]{1,128}$/, label: 'MCP (letters, digits, _ and -)' },
};

function validateName(name: string, target: Target, warnings: Warning[]): void {
  const rule = NAME_RULES[target];
  if (!rule.pattern.test(name)) {
    warnings.push({
      path: '#/name',
      code: 'invalid-name',
      message: `Tool name '${name}' does not match the ${rule.label} naming rule.`,
    });
  }
}
