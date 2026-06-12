/**
 * A JSON Schema object. Intentionally loose: tool-schema accepts schemas from
 * many sources (hand written, OpenAPI, `z.toJSONSchema()`, codegen) so the input
 * type stays permissive. The public result types below are strict.
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  additionalProperties?: boolean | JSONSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  not?: JSONSchema;
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  definitions?: Record<string, JSONSchema>;
  description?: string;
  title?: string;
  format?: string;
  pattern?: string;
  default?: unknown;
  nullable?: boolean;
  propertyOrdering?: string[];
  // Index signature keeps the transformers simple and forward compatible.
  [key: string]: unknown;
}

/** A provider target for tool / function calling. */
export type Target = 'openai' | 'openai-strict' | 'anthropic' | 'gemini' | 'gemini-jsonschema' | 'mcp';

/** A non fatal adjustment made while converting a schema to a target. */
export interface Warning {
  /** JSON Pointer style path to the node where the change happened. */
  path: string;
  /** Stable machine readable code (e.g. `stripped-keyword`). */
  code: WarningCode;
  /** Human readable explanation. */
  message: string;
}

export type WarningCode =
  | 'stripped-keyword'
  | 'converted-keyword'
  | 'unsupported-format'
  | 'forced-required'
  | 'forced-additional-properties'
  | 'root-not-object'
  | 'merged-allof'
  | 'inlined-ref'
  | 'recursive-ref'
  | 'collapsed-nullable'
  | 'union-types'
  | 'enum-coerced'
  | 'invalid-name'
  | 'limit-exceeded';

/** Result of converting a schema for a target. */
export interface TransformResult {
  /** The provider valid schema. */
  schema: JSONSchema;
  /** Every adjustment made during conversion. Empty means the input was already valid. */
  warnings: Warning[];
  /** True when conversion dropped information (a keyword or constraint was removed). */
  lossy: boolean;
}

/** Options accepted by {@link toToolSchema} and {@link toTool}. */
export interface ToolSchemaOptions {
  /** Provider target. Defaults to `'openai'`. */
  target?: Target;
  /**
   * For the `gemini` target, emit upper case OpenAPI type names (`STRING`,
   * `OBJECT`, ...) as required by the raw REST `Schema` proto. Most official
   * SDKs accept lower case and normalize, so this defaults to `false`.
   */
  geminiUppercaseTypes?: boolean;
  /**
   * For OpenAI targets, emit the flattened Responses API tool shape
   * (`{ type, name, description, parameters, strict }`) instead of the nested
   * Chat Completions shape (`{ type, function: { ... } }`). Defaults to `false`.
   */
  openaiResponses?: boolean;
  /** For the `anthropic` target, add `strict: true` to the tool definition. */
  anthropicStrict?: boolean;
}

/** A Vercel AI SDK-style tool object. AI SDK v5 uses `inputSchema`; v4 used `parameters`. */
export interface AISDKToolDefinition {
  description?: string;
  inputSchema?: unknown;
  parameters?: unknown;
  strict?: boolean;
  [key: string]: unknown;
}

/** Options for the Vercel AI SDK adapter helpers. */
export interface AISDKAdapterOptions extends ToolSchemaOptions {
  /** Emit the AI SDK v4 `parameters` key instead of the AI SDK v5 `inputSchema` key. */
  aiSDKParameters?: boolean;
  /**
   * Optional converter for Zod or Standard Schema inputs. Pass `z.toJSONSchema`
   * or a wrapper around it to keep this package zero-dependency.
   */
  zodToJsonSchema?: (schema: unknown) => JSONSchema;
}

/** MCP tool behavioural hints. See the Model Context Protocol spec. */
export interface McpAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Input to {@link toTool}. */
export interface ToolDefinition {
  /** Tool / function name. */
  name: string;
  /** What the tool does. Strongly recommended: models use it to choose tools. */
  description?: string;
  /** The parameters / input schema. Defaults to an empty object schema. */
  schema?: JSONSchema;
  /**
   * MCP only: JSON Schema for `structuredContent` returned by the tool.
   * Preserved as standard JSON Schema 2020-12 and may describe arrays,
   * primitives, objects or composition schemas.
   */
  outputSchema?: JSONSchema;
  /** MCP only: behavioural hints surfaced to clients. */
  annotations?: McpAnnotations;
}

/** Result of {@link toTool}: a provider shaped tool plus conversion metadata. */
export interface ToolResult {
  /** The provider shaped tool / function declaration. */
  tool: Record<string, unknown>;
  warnings: Warning[];
  lossy: boolean;
}

/** Result of {@link lintToolSchema}. */
export interface LintResult {
  /** True when the schema was already valid for the target with no changes. */
  ok: boolean;
  /** The changes that would be required to make it valid. */
  issues: Warning[];
}
