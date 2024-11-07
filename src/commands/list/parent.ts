import type { ArgumentsCamelCase } from "yargs";
import type { FormatOptions } from "./options";
import { type Command, execCommand, getParentBranch } from "../../utils.js";

function impl(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = getParentBranch(currentBranch);

  switch (argv.format) {
    case 'pr':
      console.log(parent.prNumber || '');
      break;
    case 'branch':
      console.log(parent.branchName);
      break;
    case 'both':
      if (parent.prNumber) {
        console.log(`${parent.branchName} #${parent.prNumber}`);
      } else {
        console.log(parent.branchName);
      }
      break;
  }
}

export const listParent = {
  command: 'parent' as const,
  description: 'List parent branch',
  impl,
} satisfies Command<FormatOptions>;