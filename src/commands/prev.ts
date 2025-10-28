import { type Command, execCommand } from "../utils.js";
import { getParentBranch } from "../tree-nav/parent.js";

async function impl() {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const parent = await getParentBranch(currentBranch);
  execCommand(`git checkout ${parent.branchName}`);
}

export const prev: Command = {
  command: 'prev',
  description: 'Check out to the parent branch',
  impl
}