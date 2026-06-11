# tool-schema

[![npm version](https://img.shields.io/npm/v/tool-schema.svg)](https://www.npmjs.com/package/tool-schema)
[![npm downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fslegarraga%2Ftool-schema%2Fmain%2Fbadges%2Fnpm-downloads%2Ftool-schema.json)](https://www.npmjs.com/package/tool-schema)
[![CI](https://github.com/slegarraga/tool-schema/actions/workflows/ci.yml/badge.svg)](https://github.com/slegarraga/tool-schema/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/slegarraga/tool-schema/badge)](https://scorecard.dev/viewer/?uri=github.com/slegarraga/tool-schema)
[![license](https://img.shields.io/npm/l/tool-schema.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

One JSON Schema in, a valid tool / function calling schema out, for **OpenAI**, **Anthropic**, **Gemini** and **MCP**. Zero dependencies.

Security posture is tracked in [docs/security-posture.md](./docs/security-posture.md),
including CodeQL, OpenSSF Scorecard, Dependabot and branch rules.

Every provider accepts a slightly different subset of JSON Schema for tool calling, and the differences are exactly the kind that fail at runtime with a `400 invalid schema`:

- **OpenAI** strict mode demands `additionalProperties: false` on every object and every property listed in `required`, and rejects `allOf`, `not` and `if/then/else`.
- **Gemini** does not understand `$ref`, `oneOf`, `allOf` or `additionalProperties`, and expresses nullability as `nullable: true` instead of `type: ["string", "null"]`.
- **Anthropic** and **MCP input schemas** are permissive but still require an object at the root.
- **MCP output schemas** describe `structuredContent` and can be any JSON Schema shape, including arrays and primitives.

`tool-schema` knows these rules so you do not have to. Write your schema once, target any provider.

## Install

```sh
npm install tool-schema
```

Requires Node 18+. Ships ESM and CommonJS with full TypeScript types.

## Quick start

```ts
import { toTool } from 'tool-schema';

const schema = {
  type: 'object',
  properties: {
    city: { type: 'string', description: 'City name' },
    units: { type: 'string', enum: ['c', 'f'] }, // optional
  },
  required: ['city'],
};

// OpenAI (Chat Completions) with Structured Outputs
const { tool } = toTool({ name: 'get_weather', description: 'Get the weather', schema }, { target: 'openai-strict' });
// tool -> { type: 'function', function: { name, description, parameters, strict: true } }
// `units` becomes required and nullable, additionalProperties:false is added everywhere.
```

Before:

```json
{
  "type": "object",
  "properties": {
    "city": { "type": "string" },
    "units": { "type": "string", "enum": ["c", "f"] }
  },
  "required": ["city"]
}
```

After `target: 'openai-strict'`:

```json
{
  "type": "object",
  "properties": {
    "city": { "type": "string" },
    "units": { "type": ["string", "null"], "enum": ["c", "f", null] }
  },
  "required": ["city", "units"],
  "additionalProperties": false
}
```

The same definition, four providers:

```ts
toTool(def, { target: 'openai' }); // { type: 'function', function: { ... } }
toTool(def, { target: 'anthropic' }); // { name, description, input_schema }
toTool(def, { target: 'gemini' }); // { name, description, parameters }
toTool(def, { target: 'mcp' }); // { name, description, inputSchema, annotations? }
```

MCP tools can also publish an `outputSchema` for structured tool results:

```ts
toTool(
  {
    name: 'rank_files',
    description: 'Rank files by relevance',
    schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          score: { type: 'number' },
        },
        required: ['path', 'score'],
      },
    },
  },
  { target: 'mcp' },
);
// -> { name, description, inputSchema, outputSchema }
```

## Convert just the schema

When you already build the tool envelope yourself and only need a provider valid
parameter schema, use `toToolSchema`:

```ts
import { toToolSchema } from 'tool-schema';

const { schema, warnings, lossy } = toToolSchema(mySchema, { target: 'gemini' });

// schema  -> the Gemini valid schema ($ref inlined, oneOf stripped, nullable applied)
// warnings -> every adjustment made, with a JSON Pointer path and a stable code
// lossy   -> true if any information had to be dropped
```

## Works with Zod

Zod 4 emits JSON Schema natively, so there is nothing extra to install:

```ts
import { z } from 'zod';
import { toTool } from 'tool-schema';

const schema = z.toJSONSchema(z.object({ city: z.string(), units: z.enum(['c', 'f']).optional() }));

const { tool } = toTool({ name: 'get_weather', schema }, { target: 'openai-strict' });
```

## Vercel AI SDK adapter

AI SDK v5 tools use `{ description?, inputSchema, strict? }`. Convert a normal
`tool-schema` definition into that shape, while still applying provider rules:

```ts
import { toAISDKTool, fromAISDKTool } from 'tool-schema';

const { tool: aiSdkTool } = toAISDKTool(
  { name: 'get_weather', description: 'Get weather', schema },
  { target: 'openai-strict' },
);
// aiSdkTool -> { description, inputSchema, strict: true }

// AI SDK tool names usually live as keys in the `tools` object.
const { tool: openaiTool } = fromAISDKTool('get_weather', aiSdkTool, { target: 'openai-strict' });
// openaiTool -> { type: 'function', function: { name, description, parameters, strict: true } }
```

Use `{ aiSDKParameters: true }` for legacy AI SDK v4 `parameters` instead of
`inputSchema`. For Zod inputs, keep `tool-schema` zero-dependency by passing a
converter:

```ts
import { z } from 'zod';
import { fromAISDKTool } from 'tool-schema';

fromAISDKTool(
  'get_weather',
  { inputSchema: z.object({ city: z.string() }) },
  {
    target: 'openai-strict',
    zodToJsonSchema: z.toJSONSchema,
  },
);
```

## Lint without transforming

Want to know whether a schema is already valid for a provider, for example in a
test or a CI check?

```ts
import { lintToolSchema } from 'tool-schema';

const { ok, issues } = lintToolSchema(mySchema, { target: 'openai-strict' });
if (!ok) {
  for (const issue of issues) console.warn(`${issue.path}: ${issue.message}`);
}
```

## API reference

| Function                             | Use it when                                                                       | Returns                       |
| ------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------- |
| `toToolSchema(schema, options)`      | You already build the provider tool envelope and only need compatible parameters. | `{ schema, warnings, lossy }` |
| `toTool(def, options)`               | You want the full provider-shaped tool/function declaration.                      | `{ tool, warnings, lossy }`   |
| `lintToolSchema(schema, options)`    | You want CI/test feedback without using the converted schema.                     | `{ ok, issues }`              |
| `toAISDKTool(def, options)`          | You want a Vercel AI SDK tool with converted `inputSchema`.                       | `{ tool, warnings, lossy }`   |
| `fromAISDKTool(name, tool, options)` | You want to convert an AI SDK tool into a provider tool.                          | `{ tool, warnings, lossy }`   |

Options:

| Option                 | Applies to                | Default    | Effect                                                                               |
| ---------------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `target`               | all functions             | `'openai'` | One of `openai`, `openai-strict`, `anthropic`, `gemini`, `gemini-jsonschema`, `mcp`. |
| `openaiResponses`      | `toTool`, `fromAISDKTool` | `false`    | Emits the flattened OpenAI Responses API tool shape.                                 |
| `geminiUppercaseTypes` | `gemini`                  | `false`    | Emits `OBJECT`, `STRING`, etc. for raw REST clients that expect enum type names.     |
| `anthropicStrict`      | `toTool`, `fromAISDKTool` | `false`    | Adds `strict: true` to Anthropic tool declarations.                                  |
| `aiSDKParameters`      | `toAISDKTool`             | `false`    | Emits legacy AI SDK v4 `parameters` instead of v5 `inputSchema`.                     |
| `zodToJsonSchema`      | AI SDK helpers            | none       | Converts Zod/Standard Schema inputs without adding a runtime dependency.             |

## Targets

| Target              | Output key             | What it does                                                                                                                       |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `openai`            | `function.parameters`  | Ensures an object root. Otherwise pass through.                                                                                    |
| `openai-strict`     | `function.parameters`  | Structured Outputs: `additionalProperties:false`, all required, optionals nullable, unsupported keywords stripped, `allOf` merged. |
| `anthropic`         | `input_schema`         | Permissive. Ensures an object root.                                                                                                |
| `gemini`            | `parameters`           | OpenAPI subset: inlines `$ref`, strips `oneOf`/`allOf`/`additionalProperties`, `nullable: true`, string enums.                     |
| `gemini-jsonschema` | `parametersJsonSchema` | Gemini's richer route. Keeps `$ref` and more.                                                                                      |
| `mcp`               | `inputSchema`          | Most permissive for input. Ensures an object root. Supports `annotations` and `outputSchema`.                                      |

## Provider rules at a glance

| Constraint                           | openai         | openai-strict            | anthropic      | gemini           | mcp        |
| ------------------------------------ | -------------- | ------------------------ | -------------- | ---------------- | ---------- |
| Root must be object                  | yes            | yes                      | yes            | yes              | input only |
| `additionalProperties: false` forced | no             | yes (every object)       | no             | removed          | no         |
| All properties required              | no             | yes (optionals nullable) | no             | no               | no         |
| `$ref` / `$defs`                     | keep           | keep                     | keep           | inlined          | keep       |
| `oneOf` / `allOf` / `not`            | keep           | stripped / merged        | keep           | stripped         | keep       |
| Nullability                          | `["t","null"]` | `["t","null"]`           | `["t","null"]` | `nullable: true` | any        |
| Structured output schema             | no             | no                       | no             | no               | yes        |

## CLI

```sh
# Convert a schema file for a target
npx tool-schema schema.json --target openai-strict

# Pipe a schema and wrap it as a full tool definition
cat schema.json | npx tool-schema --target gemini --tool get_weather --description "Get the weather"
```

The converted JSON goes to stdout. Warnings go to stderr, so the output is always
safe to pipe into another tool. Run `npx tool-schema --help` for all options.

## Warnings

Every conversion returns a list of `warnings`. Each one has a `path` (JSON Pointer
to the node), a stable `code`, and a human readable `message`. Codes include
`stripped-keyword`, `forced-required`, `forced-additional-properties`,
`inlined-ref`, `collapsed-nullable`, `enum-coerced`, `merged-allof`,
`unsupported-format`, `limit-exceeded` and `invalid-name`. `lossy` is `true`
whenever a keyword or constraint had to be dropped.

## Caveats

`tool-schema` is a compatibility transformer, not a full JSON Schema validator.
It preserves unknown keywords for permissive targets and only strips or rewrites
keywords that are known to break a target.

Gemini has two useful routes. `target: 'gemini'` emits the narrower `parameters`
schema: local `$ref` pointers are inlined, recursive refs are replaced with `{}`,
and unsupported composition keywords are stripped with warnings. Use
`target: 'gemini-jsonschema'` when your Gemini client accepts
`parametersJsonSchema` and you want to keep richer JSON Schema.

OpenAI strict mode has no optional properties. Optional inputs are converted to
required nullable fields; if an optional field uses `enum`, `null` is added to
the enum so the nullable value is actually valid JSON Schema.

## Why zero dependencies

This library is meant to sit deep in agent and tool pipelines. No transitive
dependencies means no supply chain surface, no version conflicts, and a tiny
install. It uses only the JSON Schema you pass in and the platform `structuredClone`.

## Part of a set

`tool-schema` pairs with [`llm-messages`](https://github.com/slegarraga/llm-messages),
which converts your chat **conversations** across the same providers. Together
they let you write an agent once and run it on any LLM.

## License

MIT (c) Sebastian Legarraga. See [LICENSE](./LICENSE).
