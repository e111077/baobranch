#!/usr/bin/env node

import yargs from 'yargs';
import { list } from './commands/list/index.js';
import { listTree } from './commands/list/tree.js';
import { next } from './commands/next.js';
import { prev } from './commands/prev.js';
import { evolve } from './commands/evolve/index.js';
import { rebase } from './commands/rebase/index.js';
import { pull } from './commands/pull.js';
import { amend } from './commands/amend.js';
import { unamend } from './commands/unamend.js';
import { commit } from './commands/commit.js';
import { sync } from './commands/sync/index.js';
import { push } from './commands/push/index.js';
import { split } from './commands/split/index.js';
import { setVerbose } from './utils.js';

const hideBin = (argv: string[]): string[] => argv.slice(2);

yargs(hideBin(process.argv))
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Enable verbose debug logging',
    global: true,
    default: false
  })
  .middleware((argv) => {
    setVerbose(argv.verbose as boolean);
  })
  .command({
    ...listTree,
    command: '*',
  })
  .command(list)
  .command(next.command, next.description, {}, next.impl)
  .command(prev.command, prev.description, {}, prev.impl)
  .command(amend)
  .command(unamend)
  .command(evolve)
  .command(rebase)
  .command(commit)
  .command(sync)
  .command(push)
  .command(pull.command, pull.description, {}, pull.impl)
  .command(split)
  .completion('completion', 'Generate shell completion script')
  .strict()
  .help()
  .alias('h', 'help')
  .version()
  .wrap(72)
  .argv;
