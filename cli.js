#!/usr/bin/env node

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import createServer from './server.js';

try {
  const [configArg, portArg] = process.argv.slice(2);
  if (!configArg) {
    throw new TypeError('Usage: stillalive <config.json> [port]');
  }

  const configPath = resolve(configArg);
  const config = JSON.parse((await readFile(configPath)).toString());
  // The email provider config lives under `provider`.
  const providerConfig = config.provider;

  await createServer(config.key, providerConfig, portArg);
} catch (err) {
  console.error(err);
  process.exit(1);
}
