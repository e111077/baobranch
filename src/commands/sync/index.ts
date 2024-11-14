import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs"
import { syncPrs } from "./prs.js"

function handler(argv: ArgumentsCamelCase<{}>) {
}

export const sync = {
  command: ['sync <command>'],
  describe: 'Synchronizes with remotes',
  builder: (yargs: Argv): Argv<{}> =>
    yargs
      .command(syncPrs),
  handler,
} as const satisfies CommandModule<{}, {}>;