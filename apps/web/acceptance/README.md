# Live client acceptance

This suite tests the deployed service with four synthetic accounts inside one
new, disposable organization. It covers agency administrator access, two
clients assigned to different private projects, browser invitation acceptance,
issue creation/editing/comments, attachment storage, search/dashboard filtering,
direct resource access, read-only permissions, membership revocation and login.
It verifies project-scoped client directories and people pickers while preserving agency owner/admin access to everyone.

Live writes require explicit authorization. The normal `e2e` suite remains
local-only and never loads this suite. This suite requires the exact hostname,
a fresh manifest, a protected backup, and operator cleanup. Automatic retries,
traces and video are disabled because invitation URLs and passwords are
credentials. Passwords are random and remain in the test process. Screenshots
are taken only after authentication, outside invitation pages.

## Prepare

Use a unique UTC run ID such as `20261014t202201-f05700`. From the repository
root, establish one persistent SSH transport and send the helper to the
authorized deployment host. Reuse that transport throughout the run:

```sh
export WEAVER_QA_SSH_SOCKET=/private/tmp/weaver-acceptance-ssh.sock
ssh -MNf -o BatchMode=yes -o ConnectTimeout=12 -o ControlPersist=30m -S "$WEAVER_QA_SSH_SOCKET" penny
ssh -S "$WEAVER_QA_SSH_SOCKET" -o ControlMaster=no -o ProxyCommand=false penny 'python3 - prepare RUN_ID' < deploy/compose/client-acceptance-data.py
```

`ProxyCommand=false` makes subsequent commands fail if the master disappears,
instead of silently opening more TCP connections. The socket is temporary and
does not change the user's global SSH configuration.

The helper checks that all four emails, the organization slug and its schema
are absent. It fingerprints existing public/tenant table contents and takes
a validated custom-format database backup in a mode-700 directory under
`/opt/weaver/backups/client-acceptance-RUN_ID/`. Refresh sessions are excluded
from fingerprints because unrelated sign-ins can change them. It checks the
existing bootstrap setting and does not change live configuration.

Save the returned `manifest` object to a private local `manifest.json` file.
Do not edit the manifest or reuse a run ID. Record the exact live revision.

## Execute once

From `apps/web`, using absolute paths for the manifest and results directory:

```sh
WEAVER_LIVE_CLIENT_ACCEPTANCE=weaver.usercore.com \
WEAVER_ACCEPTANCE_MANIFEST=/private/tmp/RUN_ID/manifest.json \
WEAVER_ACCEPTANCE_OUTPUT=/private/tmp/RUN_ID/results \
pnpm exec playwright test --config playwright.live.config.ts
```

The report is `acceptance.json`. A setup error is recorded as a failed setup,
not as evidence that later checks passed. Independent checks continue so that
one failure does not hide other results. Always clean up, including failed runs.

## Preview, remove and verify

Close the acceptance browser sessions, then run these in order from the repo
root. Inspect the preview before applying it. A changed preview fails closed.

```sh
ssh -S "$WEAVER_QA_SSH_SOCKET" -o ControlMaster=no -o ProxyCommand=false penny 'python3 - plan RUN_ID' < deploy/compose/client-acceptance-data.py
ssh -S "$WEAVER_QA_SSH_SOCKET" -o ControlMaster=no -o ProxyCommand=false penny 'python3 - cleanup RUN_ID' < deploy/compose/client-acceptance-data.py
ssh -S "$WEAVER_QA_SSH_SOCKET" -o ControlMaster=no -o ProxyCommand=false penny 'python3 - verify RUN_ID' < deploy/compose/client-acceptance-data.py
ssh -S "$WEAVER_QA_SSH_SOCKET" -O exit penny
```

Cleanup requires the exact original run ID and exact synthetic email addresses.
It refuses an unexpected person in the organization or a test account with
another organization membership. It backs up again before cleanup, quarantines
only uploads referenced by the disposable schema, removes those files, drops
that schema, and removes the exact organization/users with cascading public
records. It never restores a full database over live data. The quarantine and
database backups remain private on the deployment host for recovery.

Verification requires zero remaining test users, organization, invitations or
schema, then compares all recorded existing-table fingerprints. A difference
requires investigation; concurrent legitimate writes must not be overwritten.
Keep the report and screenshots after deleting account credentials/state.

The suite proves the tested configuration on the recorded release. It does
not establish the existing customer organizations' configuration, OAuth or
outbound email delivery, every installed plugin, or every identity surface in third-party plugins. New projects are required to remain private.
