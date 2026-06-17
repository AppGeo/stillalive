#!/usr/bin/env node

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import createServer from './server.js';

const configPath = resolve(process.argv[2]);
const len = process.argv.length;

try {
  const resp = await readFile(configPath);
  const config = JSON.parse(resp.toString());
  // The email provider config lives under `provider`. `smtp`/`api` are accepted
  // as fallbacks so config files written for older versions keep working.
  const providerConfig = config.provider || config.smtp || config.api;

  switch (len) {
    case 3:
      await createServer(config.key, providerConfig);
      break;
    case 4:
      await createServer(config.key, providerConfig, process.argv[3]);
      break;
    default:
      throw new TypeError('wrong number of arguments');
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
