import type { Argv, CommandModule } from "yargs";
import {configList} from './list.js';
import {configSet} from './set.js';

/**
 * Options for the config set command
 * @interface ConfigSetOptions
 * @property {string} key - The environment variable name to set
 * @property {string} value - The value to set for the environment variable
 */
interface ConfigSetOptions {
  key: string;
  value: string;
}

/**
 * Command configuration for the config set functionality
 * Sets environment variables in the user's .git/env file
 *
 * Usage:
 * fb config set GITHUB_TOKEN abc123
 */
export const config = {
  command: 'config <command>',
  describe: 'Manage the configuration of the tool',
  builder: (yargs: Argv) =>
    yargs
      .command(configSet)
      .command(configList),
  handler: () => {}
} as const satisfies CommandModule<{}, {}>;