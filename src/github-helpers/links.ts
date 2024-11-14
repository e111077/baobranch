import { execCommand } from "../utils.js";

/**
 * Gets the GitHub repository URL from git remote
 * Handles both HTTPS and SSH remote URLs
 */
function getGithubUrl(): string {
  const remoteUrl = execCommand('git remote get-url origin')
    .replace(/.git$/, '');
  if (remoteUrl.startsWith('https://')) {
    return remoteUrl;
  } else {
    const [domain, orgAndRepo] = remoteUrl.split('@')[1].split(':');
    return `https://${domain}/${orgAndRepo}`;
  }
}

/**
 * Creates a markdown link to a PR
 */
export function createPrLink(branch: string, prNum: number): string {
  return prNum ? `[#${prNum}](${getGithubUrl()}/pull/${prNum})` : branch;
}