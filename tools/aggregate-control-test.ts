/**
 * Aggregate exported control-test JSON files into a markdown report.
 *   npm run aggregate -- results/*.json
 */
import { readFileSync } from 'node:fs';
import { aggregate, renderMarkdown } from '../src/telemetry/aggregate';
import { parseResult } from '../src/telemetry/schema';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('usage: npm run aggregate -- results/*.json');
  process.exit(1);
}

const results = [];
for (const f of files) {
  try {
    results.push(parseResult(readFileSync(f, 'utf8')));
  } catch (err) {
    console.error(`skipping ${f}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
if (results.length === 0) {
  console.error('no valid result files');
  process.exit(1);
}
console.log(renderMarkdown(aggregate(results)));
