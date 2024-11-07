import type { Argv, CommandModule } from "yargs";
import { USER_ENV_LOCATION } from '../../utils.js';
import fs from 'fs';

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
 * Updates or creates an environment variable in the user's .git/env file
 *
 * @param {ConfigSetOptions} options - The config set command options
 * @param {string} options.key - Environment variable name
 * @param {string} options.value - Environment variable value
 */
function configSetImpl({ key, value }: ConfigSetOptions) {
  try {
    // Read existing env file or create empty content
    let envContent = '';
    try {
      envContent = fs.readFileSync(USER_ENV_LOCATION, 'utf8');
    } catch (error) {
      // File doesn't exist, will create new
      fs.writeFileSync(USER_ENV_LOCATION, '');
    }

    // Parse existing env content into key-value pairs
    const envVars = envContent.split('\n')
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, line) => {
        const [k, ...v] = line.split('=');

        if (k) {
          acc[k] = v.join('=');
        }

        return acc;
      }, {});

    // Update or add new variable
    envVars[key] = value;

    if (value === '') {
      delete envVars[key];
    }

    // Convert back to env file format
    const newContent = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';

    // Write back to file
    fs.writeFileSync(USER_ENV_LOCATION, newContent);

    if (value === '') {
      console.log(`Unset ${key}.`);
      return;
    }

    console.log(`Set ${key}=${value}.`);

  } catch (error) {
    if (error instanceof Error) {
      console.error('Error setting config:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Command configuration for the config set functionality
 * Sets environment variables in the user's .git/env file
 *
 * Usage:
 * fb config set GITHUB_TOKEN abc123
 */
export const configSet = {
  command: 'set <key> <value>',
  describe: 'Set environment variable in .git/env file',
  builder: (yargs: Argv) =>
    yargs
      .positional('key', {
        describe: 'Environment variable name',
        type: 'string',
        demandOption: true
      } as const)
      .positional('value', {
        describe: 'Environment variable value',
        type: 'string',
        demandOption: true
      } as const),
  handler: (argv) => {
    configSetImpl(argv as ConfigSetOptions);
  }
} as const satisfies CommandModule<{}, ConfigSetOptions>;