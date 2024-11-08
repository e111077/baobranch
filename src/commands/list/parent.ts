import type { ArgumentsCamelCase } from "yargs";
import type { FormatOptions } from "./options";
import { type Command, execCommand, getBranchListAnnotations, getParentBranch } from "../../utils.js";

function impl(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = getParentBranch(currentBranch);
  const notes = getBranchListAnnotations(parent);

  switch (argv.format) {
    case 'pr':
      console.log(`#${notes.prNumber || ''}${notes.annotations}`);
      break;
    case 'branch':
      console.log(parent.branchName + notes.annotations);
      break;
    case 'both':
      if (notes.prNumber) {
        console.log(`${parent.branchName}#${notes.prNumber}${notes.annotations}`);
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