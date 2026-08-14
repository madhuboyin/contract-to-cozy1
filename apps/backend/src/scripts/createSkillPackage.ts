import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSkillPackage, type SkillPackageScaffoldSpec } from '../services/skills/skillPackageScaffold';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const specPath = argument('--spec');
  if (!specPath) throw new Error('Usage: npm run skill:create -- --spec <spec.json> [--output-root <directory>]');
  const outputRoot = resolve(argument('--output-root') ?? resolve(__dirname, '../services/skills'));
  const parsed = JSON.parse(await readFile(resolve(specPath), 'utf8')) as SkillPackageScaffoldSpec;
  const created = await createSkillPackage(outputRoot, parsed);
  process.stdout.write(`${JSON.stringify({
    directory: created.directory,
    registration: created.scaffold.registration,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
