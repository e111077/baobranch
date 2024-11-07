import type { ArgumentsCamelCase } from 'yargs';
import type { FormatOptions } from "./options";
import { type Command, execCommand, findChildren, getBranchListAnnotations } from '../../utils.js';

function impl(argv: ArgumentsCamelCase<FormatOptions>) {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const children = findChildren(currentBranch);

  if (!children.length) {
    console.log('No child branches found');
    return;
  }

  const output = children.map(child => {
    const annotations = getBranchListAnnotations(child);
    switch (argv.format) {
      case 'pr':
        return `#${child.prNumber || '(none)'}${annotations}`;
      case 'branch':
        return `${child.branchName}${annotations}`;
      case 'both':
      default:
        return child.prNumber ?
          `${child.branchName}#${child.prNumber}${annotations}` :
          child.branchName;
    }
  });

  console.log(output.join('\n'));
}

export const listChildren = {
  command: 'children' as const,
  description: 'List child branches',
  impl,
} satisfies Command<FormatOptions>;
