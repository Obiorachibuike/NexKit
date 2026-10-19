#!/usr/bin/env bash
# Creates/updates the GitHub environment "npm" used by .github/workflows/publish.yml:
#   - required reviewer: the repository owner (change REVIEWER_LOGIN if desired)
#   - deployments allowed only from tags matching v*
# Requires: gh CLI authenticated as a repository admin (`gh auth login`).
set -euo pipefail

REPO="${REPO:-Obiorachibuike/NexKit}"
REVIEWER_LOGIN="${REVIEWER_LOGIN:-${REPO%%/*}}"

reviewer_id="$(gh api "users/${REVIEWER_LOGIN}" -q .id)"

echo "→ creating environment 'npm' on ${REPO} (reviewer: ${REVIEWER_LOGIN})"
gh api -X PUT "repos/${REPO}/environments/npm" --input - >/dev/null <<JSON
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [{ "type": "User", "id": ${reviewer_id} }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON

echo "→ allowing deployments from tags v*"
existing="$(gh api "repos/${REPO}/environments/npm/deployment-branch-policies" -q '.branch_policies[] | select(.name=="v*" and .type=="tag") | .id' || true)"
if [[ -z "${existing}" ]]; then
  gh api -X POST "repos/${REPO}/environments/npm/deployment-branch-policies" -f name='v*' -f type='tag' >/dev/null
fi

echo "✓ environment ready:"
gh api "repos/${REPO}/environments/npm" -q '{name, reviewers: [.protection_rules[]? | select(.type=="required_reviewers") | .reviewers[].reviewer.login], policy: .deployment_branch_policy}'
gh api "repos/${REPO}/environments/npm/deployment-branch-policies" -q '.branch_policies[] | {name, type}'
