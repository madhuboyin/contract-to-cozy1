const { cpSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const applicationRoot = resolve(__dirname, '..');
const standaloneRoot = join(applicationRoot, '.next', 'standalone');

for (const [source, destination] of [
  [join(applicationRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static')],
  [join(applicationRoot, 'public'), join(standaloneRoot, 'public')],
]) {
  if (existsSync(source)) cpSync(source, destination, { recursive: true });
}

require(join(standaloneRoot, 'server.js'));
