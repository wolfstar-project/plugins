#!/usr/bin/env bash
# Usage: find_plan.sh <owner/repo> <issue-number>
# Prints the issue (title, labels, body) followed by every comment, and marks the
# Pullfrog plan comment. Uses the REST API only (GraphQL is blocked in some sessions).
set -euo pipefail
repo="${1:?owner/repo}"; num="${2:?issue number}"

gh api "repos/$repo/issues/$num" -q '"# #\(.number) \(.title)\nstate: \(.state)  labels: \([.labels[].name] | join(", "))\nupdated: \(.updated_at)\n\n\(.body // "")"'
echo; echo "================ COMMENTS ================"
gh api --paginate "repos/$repo/issues/$num/comments" -q '.[] | "\n--- id=\(.id) author=\(.user.login) created=\(.created_at) updated=\(.updated_at)" +
  (if (.user.login | test("pullfrog"; "i")) and (.body | test("(^|\n)#{1,4} +[^\n]*\\bplan"; "i"))
   then "  <<< PULLFROG PLAN" else "" end) + "\n\(.body)"'
