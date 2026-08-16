import { getCommitInfo, getPullRequestInfo } from "@changesets/get-github-info";
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
  // injected by GitHub Actions, falls back to public GitHub for local runs
  const GITHUB_SERVER_URL = process.env.GITHUB_SERVER_URL || "https://github.com";
  return { GITHUB_SERVER_URL };
}

// `ChangelogFunctions` options are typed as `null | Record<string, unknown>`
// since `@changesets/types` v7, so `repo` has to be narrowed before use.
function readRepo(options: null | Record<string, unknown>): string {
  const repo = options?.repo;
  if (typeof repo !== "string" || repo.length === 0) {
    throw new Error(
      'Please provide a repo to this changelog generator like this:\n"changelog": ["./generator.ts", { "repo": "org/repo" }]',
    );
  }
  return repo;
}

const ignoredUsers = new Set<string>(["redstar071"]);

// `@changesets/get-github-info` talks to the GitHub GraphQL API over `fetch`,
// which intermittently fails when a keep-alive socket is dropped. There is no
// built-in retry, so a single transient drop fails the whole release. Retry
// transient failures with exponential backoff.
//
// Since v1 the library wraps every network failure in a generic
// "Failed to fetch data from GitHub" and keeps the real error in `cause`, so the
// whole chain has to be inspected. Authentication and GraphQL errors surface as
// "Fetched data from GitHub …" instead and are deliberately not retried.
const TRANSIENT_ERROR =
  /Failed to (?:fetch|parse) data from GitHub|premature close|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network timeout|fetch failed|terminated|and retry/i;

function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 5) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.length > 0 ? messages.join(" <- ") : String(error);
}

async function withGitHubRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = describeError(error);
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

// `getCommitInfo` / `getPullRequestInfo` resolve to `undefined` when the ref
// does not exist; a rejection here means GitHub stayed unreachable across every
// retry, which must not take the whole release down.
async function lookup<T>(label: string, fn: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await withGitHubRetry(label, fn);
  } catch {
    return undefined;
  }
}

type Author = { login: string; markdownLink: string };

function creditFor(author: Author | undefined): string | undefined {
  if (!author || ignoredUsers.has(author.login.toLowerCase())) return undefined;
  return author.markdownLink;
}

const changelogFunctions: ChangelogFunctions = {
  getDependencyReleaseLine: async (changesets, dependenciesUpdated, options) => {
    const repo = readRepo(options);
    if (dependenciesUpdated.length === 0) return "";

    // unversioned private packages only appear to have their ranges updated
    const updatedDependenciesList = dependenciesUpdated
      .filter((dependency) => dependency.newVersion != null)
      .map((dependency) => `  - ${dependency.name}@${dependency.newVersion}`);
    if (updatedDependenciesList.length === 0) return "";

    const changesetLink = `- Updated dependencies [${(
      await Promise.all(
        changesets.map(async (cs) => {
          if (!cs.commit) return;
          const info = await lookup(`getCommitInfo(commit=${cs.commit})`, () =>
            getCommitInfo({ repo, commit: cs.commit! }),
          );
          return info?.commit.markdownLink ?? `\`${cs.commit.slice(0, 7)}\``;
        }),
      )
    )
      .filter((_) => _)
      .join(", ")}]:`;

    return [changesetLink, ...updatedDependenciesList].join("\n");
  },
  getReleaseLine: async (changeset, _type, options) => {
    const repo = readRepo(options);
    const { GITHUB_SERVER_URL } = readEnv();

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

    const links: { commit?: string; pull?: string; user?: string } = {};

    if (prFromSummary !== undefined) {
      const info = await lookup(`getPullRequestInfo(pull=${prFromSummary})`, () =>
        getPullRequestInfo({ repo, pull: prFromSummary! }),
      );
      links.pull = info?.pull.markdownLink;
      links.commit = info?.commit?.markdownLink;
      links.user = creditFor(info?.author);

      if (commitFromSummary) {
        const shortCommitId = commitFromSummary.slice(0, 7);
        links.commit = `[\`${shortCommitId}\`](${GITHUB_SERVER_URL}/${repo}/commit/${commitFromSummary})`;
      }
    } else {
      const commitToFetchFrom = commitFromSummary || changeset.commit;
      if (commitToFetchFrom) {
        const info = await lookup(`getCommitInfo(commit=${commitToFetchFrom})`, () =>
          getCommitInfo({ repo, commit: commitToFetchFrom }),
        );
        links.commit = info?.commit.markdownLink;
        links.pull = info?.pull?.markdownLink;
        links.user = creditFor(info?.author);
      }
    }

    const users = usersFromSummary.length
      ? usersFromSummary
          .map(
            (userFromSummary) => `[@${userFromSummary}](${GITHUB_SERVER_URL}/${userFromSummary})`,
          )
          .join(", ")
      : links.user;

    const prefix = [
      links.pull == null ? "" : ` ${links.pull}`,
      links.commit == null ? "" : ` ${links.commit}`,
    ].join("");

    const releaseLine = `\n\n-${prefix ? `${prefix} -` : ""} ${linkifyIssueRefs(firstLine, {
      serverUrl: GITHUB_SERVER_URL,
      repo,
    })}`;
    const futureReleaseLines = futureLines
      .map(
        (l) =>
          `  ${linkifyIssueRefs(l, {
            serverUrl: GITHUB_SERVER_URL,
            repo,
          })}`,
      )
      .join("\n");
    const thanks = users == null ? "" : ` Thanks ${users}!`;

    return `${releaseLine}${futureReleaseLines ? `\n${futureReleaseLines}` : ""}${thanks}`;
  },
};

// ChangelogFunctions require a default export
export default changelogFunctions;
