# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-06-12

### Changed

- OpenAI strict mode now converts `oneOf` to `anyOf` (OpenAI rejects `oneOf`;
  previously it passed through and failed at the API).
- OpenAI strict mode no longer strips `patternProperties`: current OpenAI docs
  only exclude it for fine-tuned models.
- OpenAI strict mode strips the remaining unsupported 2020-12 applicators
  (`prefixItems`, `contains`, `minContains`, `maxContains`, `propertyNames`,
  `unevaluatedItems`).
- The Gemini route A target now keeps exactly the fields of the `Schema`
  proto (allowlist verified against the REST reference), so unknown keywords
  such as `prefixItems` or `examples` can no longer leak through and fail the
  request with an unknown-field error. Newly preserved proto fields:
  `default`, `example`, `propertyOrdering`.
- Gemini route A converts instead of dropping where an equivalent exists:
  `allOf` is merged, `oneOf` becomes `anyOf`, `const` becomes a single-value
  `enum`, and tuple-form `items` collapse to `items` / `items.anyOf`.

### Added

- New `converted-keyword` warning code reported for the conversions above.
- `mapChildren` now walks `prefixItems`, `contains`, `propertyNames`,
  `unevaluatedItems` and `unevaluatedProperties` subschemas.

## [0.3.3] - 2026-06-11

### Changed

- Published README download badge updates so the npm package page shows the refreshed 30-day download badge.

## [0.3.2] - 2026-06-07

### Fixed

- Normalized the package `bin` path so npm no longer auto-corrects package
  metadata during publish.

## [0.3.1] - 2026-06-07

### Fixed

- Applied strict object handling more consistently for nested schemas when
  targeting providers that require `additionalProperties: false`.
- Preserved object schema details more reliably across OpenAI, Gemini and AI SDK
  conversions.

### Changed

- Expanded README guidance for provider-specific strict schema behavior and
  nested object caveats.

## [0.3.0] - 2026-06-05

### Added

- Added Vercel AI SDK adapter helpers: `toAISDKTool(...)` emits AI SDK v5
  `inputSchema` tool definitions, and `fromAISDKTool(...)` converts AI SDK tools
  into provider-specific OpenAI, Anthropic, Gemini or MCP tool shapes.
- Added legacy AI SDK v4 `parameters` support and a zero-dependency
  `zodToJsonSchema` hook for callers using Zod inputs.

## [0.2.0] - 2026-06-05

### Added

- Added MCP `outputSchema` support on `toTool(...)` definitions so tools can
  describe `structuredContent` results.
- Preserved MCP output schemas as standard JSON Schema without forcing an object
  root, matching structured outputs that return arrays, primitives or composed
  schemas.

## [0.1.3] - 2026-06-04

### Changed

- Updated vulnerable development tooling and added CodeQL, OpenSSF Scorecard,
  pinned GitHub Actions, least-privilege workflow permissions and a Scorecard
  README badge.

## [0.1.2] - 2026-06-04

### Changed

- Published README package-status badges, download visibility and release notes
  to the npm package page.

## [0.1.1] - 2026-06-03

### Changed

- Added OpenAI-compatible provider keywords for DeepSeek, Groq and OpenRouter
  discovery in npm and package metadata.

## [0.1.0] - 2026-06-01

### Added

- Initial release.
- `toToolSchema(schema, { target })` converts any JSON Schema into a provider
  valid schema for `openai`, `openai-strict`, `anthropic`, `gemini`,
  `gemini-jsonschema` and `mcp`.
- `toTool(def, { target })` builds a full provider shaped tool / function
  declaration (`function`, `input_schema`, `parameters`, `inputSchema`),
  including `strict` and MCP `annotations`.
- `lintToolSchema(schema, { target })` reports what would change without applying.
- `tool-schema` CLI: convert a schema file or stdin for any target.
- Zero runtime dependencies.
