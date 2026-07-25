import fs from 'node:fs';
import path from 'node:path';
import {
  CapabilitySmokeConfigSchema,
  canonicalCapabilityRegistry,
  runCapabilitySmokeCheck,
} from '../src/productFramework/capabilities';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const baseUrl = requiredEnvironment('CAPABILITY_SMOKE_BASE_URL');
  const token = requiredEnvironment('CAPABILITY_SMOKE_TOKEN');
  const configPath = path.resolve(
    requiredEnvironment('CAPABILITY_SMOKE_SCENARIOS_FILE'),
  );
  const config = CapabilitySmokeConfigSchema.parse(
    JSON.parse(fs.readFileSync(configPath, 'utf8')),
  );
  const report = await runCapabilitySmokeCheck({
    baseUrl,
    token,
    config,
    registry: canonicalCapabilityRegistry,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Capability discovery smoke failed: ${message}\n`);
  process.exitCode = 1;
});
