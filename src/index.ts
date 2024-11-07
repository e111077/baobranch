#!/usr/bin/env node

import yargs from 'yargs';
import { tables } from './commands/tables.js';
import { list } from './commands/list/index.js';
import { next } from './commands/next.js';
import { prev } from './commands/prev.js';
import { rebaseParent } from './commands/rebase/parent.js';
import { pull } from './commands/pull.js';
import { cache } from './commands/cache/index.js';
import {config} from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: path.join(__dirname, '../.env.defaults') })
config({ path: path.join(__dirname, '../.env') })

const hideBin = (argv: string[]): string[] => argv.slice(2);

yargs(hideBin(process.argv))
  .command(tables.command, tables.description, {}, tables.impl)
  .command(list)
  .command(next.command, next.description, {}, next.impl)
  .command(prev.command, prev.description, {}, prev.impl)
  .command(rebaseParent.command, rebaseParent.description, {}, rebaseParent.impl)
  .command(pull.command, pull.description, {}, pull.impl)
  .command(cache)
  .completion('completion', 'Generate shell completion script')
  .demandCommand(1, 'You need to specify a command')
  .strict()
  .help()
  .alias('h', 'help')
  .version()
  .wrap(72)
  .argv;
