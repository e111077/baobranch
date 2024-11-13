#!/usr/bin/env node

import yargs from 'yargs';
import { list } from './commands/list/index.js';
import { next } from './commands/next.js';
import { prev } from './commands/prev.js';
import { sync } from './commands/sync.js';
import { rebase } from './commands/rebase/index.js';
import { pull } from './commands/pull.js';
import { amend } from './commands/amend.js';
import { unamend } from './commands/unamend.js';

const hideBin = (argv: string[]): string[] => argv.slice(2);

yargs(hideBin(process.argv))
  .command(list)
  .command(next.command, next.description, {}, next.impl)
  .command(prev.command, prev.description, {}, prev.impl)
  .command(amend)
  .command(unamend)
  .command(sync)
  .command(rebase)
  .command(pull.command, pull.description, {}, pull.impl)
  .completion('completion', 'Generate shell completion script')
  .demandCommand(1, 'You need to specify a command')
  .strict()
  .help()
  .alias('h', 'help')
  .version()
  .wrap(72)
  .argv;
