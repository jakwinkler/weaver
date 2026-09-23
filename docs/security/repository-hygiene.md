# Repository hygiene

Keep credentials, host inventories, customer data, backups, browser sessions,
screenshots from real accounts, and generated database migration plans in private
storage outside this repository. Public deployment examples should use reserved
example domains and empty credential fields.

The repository ignores environment variants, local worktrees, private artifact
directories (`secrets/`, `backups/`, and `.private/`), and common browser/test
outputs. Put local key material in private storage or a designated ignored
directory. `.env.example` files are intentionally tracked and must contain only
safe examples. Ignore rules do not remove files already tracked by Git.

## Scan before pushing

Install [Gitleaks](https://github.com/gitleaks/gitleaks) 8.30.1, the version used by
CI, and run from the repository root:

```sh
gitleaks git --log-opts="--all" --config .gitleaks.toml --redact=100 --ignore-gitleaks-allow
```

The CI workflow also scans a clean export of the current tracked tree to include
content introduced by merge resolutions. It runs for pull requests and pushes
to `main`. Scanner output is redacted; failures still require review before
publishing logs or reproductions elsewhere.

The configuration extends the default detection rules. Its exception is limited
to the two exact synthetic values in the runtime-configuration unit test, for the
generic API-key rule and that file only. New values and other files remain
subject to scanning. Avoid broad test-directory exclusions or blanket baselines.

Inspect the staged diff before committing. Repository administrators should also
verify GitHub secret scanning and push protection in repository settings; a CI
check detects a pushed secret after it has already reached GitHub.

## If a credential is exposed

Revoke or rotate it with its provider first. Remove it from the tracked files,
then assess historical copies, pull requests, forks, logs, and artifacts. Deleting
a file in a new commit does not erase earlier commits. Coordinate any history
rewrite with maintainers and follow
[GitHub's removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
