// Run from the repo root after `npm run build`:
//   node examples/usage.mjs
import { toTool, toToolSchema, lintToolSchema } from '../dist/index.js';

const schema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'File path to delete' },
    force: { type: 'boolean' }, // optional
  },
  required: ['path'],
};

console.log('--- OpenAI strict tool ---');
console.log(
  JSON.stringify(
    toTool({ name: 'delete_file', description: 'Delete a file', schema }, { target: 'openai-strict' }).tool,
    null,
    2,
  ),
);

console.log('\n--- MCP tool with annotations ---');
console.log(
  JSON.stringify(
    toTool(
      {
        name: 'delete_file',
        description: 'Delete a file',
        schema,
        outputSchema: {
          type: 'object',
          properties: {
            deleted: { type: 'boolean' },
            path: { type: 'string' },
          },
          required: ['deleted', 'path'],
        },
        annotations: { destructiveHint: true },
      },
      { target: 'mcp' },
    ).tool,
    null,
    2,
  ),
);

console.log('\n--- Gemini schema (note: $ref free, nullable applied) ---');
const gemini = toToolSchema(
  { type: 'object', properties: { id: { type: ['string', 'null'] } }, required: ['id'] },
  { target: 'gemini' },
);
console.log(JSON.stringify(gemini.schema, null, 2));

console.log('\n--- Lint a schema for OpenAI strict ---');
console.log(lintToolSchema(schema, { target: 'openai-strict' }));
