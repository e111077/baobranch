import { listParent } from './parent.js';
import { listChildren } from './children.js';
import type { ListOptions } from "./options";
import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";

export const list = {
  command: ['list <target>', 'ls <target>'],
  describe: 'List parent or children branches',
  builder: (yargs: Argv): Argv<ListOptions> =>
    yargs
      .positional('target', {
        choices: ['parent', 'children'] as const,
        describe: 'Which branches to list',
        type: 'string',
        demandOption: true
      } as const)
      .option('format', {
        describe: 'Output format',
        choices: ['pr', 'branch', 'both'] as const,
        default: 'both'
      } as const),
  handler: (argv: ArgumentsCamelCase<ListOptions>) => {
    if (argv.target === 'children') {
      listChildren.impl(argv);
    } else {
      listParent.impl(argv);
    }
  }
} as const satisfies CommandModule<{}, ListOptions>;