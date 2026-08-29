#!/usr/bin/env node

'use strict';

const { runCli } = require('../dist/index.js');

runCli().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
