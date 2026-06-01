#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { toToolSchema, toTool } from './transform.js';
import type { JSONSchema, Target, ToolSchemaOptions } from './types.js';

const TARGETS: Target[] = ['openai', 'openai-strict', 'anthropic', 'gemini', 'gemini-jsonschema', 'mcp'];

const HELP = `tool-schema - convert a JSON Schema into a provider valid tool schema

Usage:
  tool-schema [file.json] --target <target> [options]
  cat schema.json | tool-schema --target gemini

Targets:
  ${TARGETS.join(', ')}

Options:
  -t, --target <name>   Provider target (default: openai)
  --tool <name>         Wrap the result as a full tool definition with this name
  --description <text>  Tool description (with --tool)
  --responses           OpenAI: emit the Responses API tool shape
  --uppercase-types     Gemini: emit upper case OpenAPI type names
  --quiet               Do not print warnings to stderr
  -h, --help            Show this help

Reads from the given file or from stdin. Prints the converted schema (or tool)
as JSON to stdout. Warnings go to stderr and never pollute stdout.`;

interface Args {
  file?: string;
  target: Target;
  tool?: string;
  description?: string;
  responses: boolean;
  uppercase: boolean;
  quiet: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    target: 'openai',
    responses: false,
    uppercase: false,
    quiet: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-t':
      case '--target':
        args.target = argv[++i] as Target;
        break;
      case '--tool':
        args.tool = argv[++i];
        break;
      case '--description':
        args.description = argv[++i];
        break;
      case '--responses':
        args.responses = true;
        break;
      case '--uppercase-types':
        args.uppercase = true;
        break;
      case '--quiet':
        args.quiet = true;
        break;
      default:
        if (a.startsWith('-')) {
          throw new Error(`Unknown option: ${a}`);
        }
        args.file = a;
    }
  }
  return args;
}

function readInput(file?: string): string {
  if (file) return readFileSync(file, 'utf8');
  return readFileSync(0, 'utf8');
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(2);
  }

  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (!TARGETS.includes(args.target)) {
    process.stderr.write(`Invalid target '${args.target}'. Valid: ${TARGETS.join(', ')}\n`);
    process.exit(2);
  }

  let schema: JSONSchema;
  try {
    schema = JSON.parse(readInput(args.file)) as JSONSchema;
  } catch (err) {
    process.stderr.write(`Could not read or parse input: ${(err as Error).message}\n`);
    process.exit(1);
    return;
  }

  const options: ToolSchemaOptions = {
    target: args.target,
    openaiResponses: args.responses,
    geminiUppercaseTypes: args.uppercase,
  };

  const { output, warnings, lossy } = args.tool
    ? (() => {
        const r = toTool({ name: args.tool!, description: args.description, schema }, options);
        return { output: r.tool, warnings: r.warnings, lossy: r.lossy };
      })()
    : (() => {
        const r = toToolSchema(schema, options);
        return { output: r.schema, warnings: r.warnings, lossy: r.lossy };
      })();

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (!args.quiet && warnings.length > 0) {
    process.stderr.write(`\n${warnings.length} warning(s) for target '${args.target}'${lossy ? ' (lossy)' : ''}:\n`);
    for (const w of warnings) {
      process.stderr.write(`  ${w.path}  [${w.code}] ${w.message}\n`);
    }
  }
}

main();
