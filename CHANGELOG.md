# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
