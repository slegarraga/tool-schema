# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
