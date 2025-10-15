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

/**
 * Creates a terminal hyperlink using OSC 8 sequences
 * This format is supported by modern terminals and creates clickable links
 * @see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 */
export function createTerminalLink(text: string, url: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/**
 * Creates a terminal hyperlink to a PR using OSC 8 sequences
 */
export function createPrTerminalLink(prNum: number): string {
  const url = `${getGithubUrl()}/pull/${prNum}`;
  return createTerminalLink(`#${prNum}`, url);
}