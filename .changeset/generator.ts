import { getInfo, getInfoFromPullRequest } from "@changesets/get-github-info";
import type { ChangelogFunctions } from "@changesets/types";

// "match what you skip, capture what you want": the left alternative
// consumes markdown links so the right alternative only matches bare refs
function linkifyIssueRefs(
  line: string,
  { serverUrl, repo }: { serverUrl: string; repo: string },
): string {
  return line.replace(/\[.*?\]\(.*?\)|\B#([1-9]\d*)\b/g, (match, issue) =>
    // PRs and issues are the same thing on GitHub (to some extent, of course)
    // this relies on GitHub redirecting from /issues/1234 to /pull/1234 when necessary
    issue ? `[#${issue}](${serverUrl}/${repo}/issues/${issue})` : match,
  );
}

function readEnv() {
  const GITHUB_SERVER_URL =
    // @ts-expect-error -- this is injected by GitHub Actions, but TypeScript doesn't know about it
    process.env.GITHUB_SERVER_URL || "https://github.com";
  return { GITHUB_SERVER_URL };
}

const ignoredUsers = new Set<string>(["redstar071"]);

// `@changesets/get-github-info` talks to the GitHub GraphQL API through
// `node-fetch`, which intermittently throws "Premature close" /
// "Failed to parse data from GitHub" when a keep-alive socket is dropped.
// There is no built-in retry, so a single transient drop fails the whole
// release. Retry transient failures with exponential backoff.
const TRANSIENT_ERROR =
  /premature close|Failed to parse data from GitHub|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network timeout|fetch failed|terminated|and retry/i;

const NULL_LINKS = { commit: null, pull: null, user: null } as const;

async function withGitHubRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts || !TRANSIENT_ERROR.test(message)) break;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      // stderr is the only runtime channel visible in CI logs
      console.warn(
        `[changelog] ${label} failed (attempt ${attempt}/${attempts}): ${message}. Retrying in ${delayMs}ms…`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

const changelogFunctions: ChangelogFunctions = {
  getDependencyReleaseLine: async (changesets, dependenciesUpdated, options) => {
    if (!options.repo) {
      throw new Error(
        'Please provide a repo to this changelog generator like this:\n"changelog": ["@changesets/changelog-github", { "repo": "org/repo" }]',
      );
    }
    if (dependenciesUpdated.length === 0) return "";

    const changesetLink = `- Updated dependencies [${(
      await Promise.all(
        changesets.map(async (cs) => {
          if (cs.commit) {
            try {
              const { links } = (await withGitHubRetry(`getInfo(commit=${cs.commit})`, () =>
                getInfo({
                  repo: options.repo,
                  commit: cs.commit!,
                }),
              )) as { links: { commit: string } };
              return links.commit;
            } catch {
              return undefined;
            }
          }
        }),
      )
    )
      .filter((_) => _)
      .join(", ")}]:`;

    const updatedDependenciesList = dependenciesUpdated.map(
      (dependency) => `  - ${dependency.name}@${dependency.newVersion}`,
    );

    return [changesetLink, ...updatedDependenciesList].join("\n");
  },
  getReleaseLine: async (changeset, _type, options) => {
    const { GITHUB_SERVER_URL } = readEnv();
    if (!options?.repo) {
      throw new Error(
        'Please provide a repo to this changelog generator like this:\n"changelog": ["@changesets/changelog-github", { "repo": "org/repo" }]',
      );
    }

    let prFromSummary: number | undefined;
    let commitFromSummary: string | undefined;
    const usersFromSummary: string[] = [];

    const replacedChangelog = changeset.summary
      .replace(/^\s*(?:pr|pull|pull\s+request):\s*#?(\d+)/im, (_, pr) => {
        const num = Number(pr);
        if (!Number.isNaN(num)) prFromSummary = num;
        return "";
      })
      .replace(/^\s*commit:\s*([^\s]+)/im, (_, commit) => {
        commitFromSummary = commit;
        return "";
      })
      .replace(/^\s*(?:author|user):\s*@?([^\s]+)/gim, (_, user) => {
        if (!ignoredUsers.has(String(user).toLowerCase())) {
          usersFromSummary.push(user);
        }
        return "";
      })
      .trim();

    const [firstLine, ...futureLines] = replacedChangelog.split("\n").map((l) => l.trimEnd());

    const links = await (async () => {
      if (prFromSummary !== undefined) {
        try {
          let { links } = await withGitHubRetry(`getInfoFromPullRequest(pull=${prFromSummary})`, () =>
            getInfoFromPullRequest({
              repo: options.repo,
              pull: prFromSummary!,
            }),
          );
          if (commitFromSummary) {
            const shortCommitId = commitFromSummary.slice(0, 7);
            links = {
              ...links,
              commit: `[\`${shortCommitId}\`](${GITHUB_SERVER_URL}/${options.repo}/commit/${commitFromSummary})`,
            };
          }
          return links;
        } catch {
          return NULL_LINKS;
        }
      }
      const commitToFetchFrom = commitFromSummary || changeset.commit;
      if (commitToFetchFrom) {
        try {
          const { links } = await withGitHubRetry(`getInfo(commit=${commitToFetchFrom})`, () =>
            getInfo({
              repo: options.repo,
              commit: commitToFetchFrom,
            }),
          );
          return links;
        } catch {
          return NULL_LINKS;
        }
      }
      return NULL_LINKS;
    })();

    const users = usersFromSummary.length
      ? usersFromSummary
          .map(
            (userFromSummary) => `[@${userFromSummary}](${GITHUB_SERVER_URL}/${userFromSummary})`,
          )
          .join(", ")
      : links.user &&
          [...ignoredUsers].some((user) =>
            links.user!.toLowerCase().includes(`[@${user.toLowerCase()}]`),
          )
        ? null
        : links.user;

    const prefix = [
      links.pull === null ? "" : ` ${links.pull}`,
      links.commit === null ? "" : ` ${links.commit}`,
    ].join("");

    const releaseLine = `\n\n-${prefix ? `${prefix} -` : ""} ${linkifyIssueRefs(firstLine, {
      serverUrl: GITHUB_SERVER_URL,
      repo: options?.repo,
    })}`;
    const futureReleaseLines = futureLines
      .map(
        (l) =>
          `  ${linkifyIssueRefs(l, {
            serverUrl: GITHUB_SERVER_URL,
            repo: options?.repo,
          })}`,
      )
      .join("\n");
    const thanks = users === null ? "" : ` Thanks ${users}!`;

    return `${releaseLine}${futureReleaseLines ? `\n${futureReleaseLines}` : ""}${thanks}`;
  },
};

export default changelogFunctions;
