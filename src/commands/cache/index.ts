// src/commands/cache/index.ts
import type { CommandModule } from 'yargs';
import { clear } from './clear.js';
import { drop } from './drop.js';

export const cache: CommandModule = {
  command: 'cache',
  describe: 'Cache management commands',
  builder: (yargs) =>
    yargs
      .command(clear.command, clear.description, {}, clear.impl)
      .command(drop),
  handler: () => {}
};