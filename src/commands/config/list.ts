import type { Argv, CommandModule } from "yargs";
import { USER_ENV_LOCATION } from '../../utils.js';
import fs from 'fs';
import path from 'path';

interface ConfigListOptions {
  key?: string;
}

/**
 * Reads and parses an env file into key-value pairs
 *
 * @param {string} filePath - Path to the env file
 * @returns {Record<string, string>} Object containing env variables
 */
function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n')
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, line) => {
        const [k, ...v] = line.split('=');
        if (k) acc[k] = v.join('=');
        return acc;
      }, {});
  } catch (error) {
    return {};
  }
}

/**
 * Lists environment variables from .git/env and .env.defaults files
 * Checks .git/env first, then falls back to .env.defaults if needed
 *
 * @param {ConfigListOptions} options - The config list command options
 * @param {string} [options.key] - Optional specific variable to show
 */
function configListImpl({ key }: ConfigListOptions) {
    try {
    // Get paths to both env files
    const defaultEnvPath = path.join(process.cwd(), '.env.defaults');

    // Read both files
    const gitEnvVars = parseEnvFile(USER_ENV_LOCATION);
    const defaultEnvVars = parseEnvFile(defaultEnvPath);

    // Combine variables, with git env taking precedence
    const envVars = {
      ...defaultEnvVars,
      ...gitEnvVars
    };

    if (Object.keys(envVars).length === 0) {
      console.error('No environment variables found in either .git/env or .env.defaults');
      process.exit(1);
    }

    if (key) {
      // Show specific variable if it exists
      if (key in envVars) {
        const isDefault = !(key in gitEnvVars);
        const source = key in gitEnvVars ? '.git/env' : '.env.defaults';
        console.log(`${key}=${envVars[key]}${isDefault ? ' (default)' : ''}`);
      } else {
        console.error(`Variable ${key} not found in either .git/env or .env.defaults`);
        process.exit(1);
      }
    } else {
      // Show all variables and if it's a default
      Object.entries(envVars).forEach(([k, v]) => {
        const isDefault = !(k in gitEnvVars);
        console.log(`${k}=${v}${isDefault ? ' (default)' : ''}`);
      });
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error('Error listing config:', error.message);
    }
    process.exit(1);
  }
}

export const configList = {
  command: ['list [key]', 'ls [key]'],
  describe: 'List environment variables from .git/env and .env.defaults files',
  builder: (yargs: Argv) =>
    yargs
      .positional('key', {
        describe: 'Specific environment variable to show (optional)',
        type: 'string',
      } as const),
  handler: (argv) => {
    configListImpl(argv as ConfigListOptions);
  }
} as const satisfies CommandModule<{}, ConfigListOptions>;