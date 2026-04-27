import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC_DIR = '/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src';

const files = globSync('**/*.tsx', { cwd: SRC_DIR, absolute: true });

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('href=') || content.includes('<Link')) {
    console.log(`\n--- ${file.replace(SRC_DIR, '')} ---`);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('<Link') || line.includes('href=')) {
        console.log(`${i + 1}: ${line.trim()}`);
      }
    });
  }
}
