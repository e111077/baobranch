import { type Command, execCommand, getParentBranch } from "../utils.js";

function impl() {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = getParentBranch(currentBranch);
  execCommand(`git checkout ${parent.branchName}`);
}

export const prev: Command = {
  command: 'prev',
  description: 'Check out to the parent branch',
  impl
}