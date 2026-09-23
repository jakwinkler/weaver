# Google and GitHub sign-in

Each provider needs its own registered OAuth application and a client ID/secret
pair. A `503` response saying `OAuth is not configured` means the API cannot see
one or both credentials for that provider. The sign-in links alone do not prove
the provider is configured.

Use these settings for this deployment:

| Provider | Application type | Callback URL |
| --- | --- | --- |
| Google | Web application | `https://weaver.usercore.com/api/v1/auth/google/callback` |
| GitHub | OAuth App | `https://weaver.usercore.com/api/v1/auth/github/callback` |

For Google, configure the consent screen and create the client in
[Google Auth Platform](https://console.cloud.google.com/auth/clients). Register
the exact callback above as an authorized redirect URI. See Google's
[web server OAuth instructions](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).

For GitHub, follow the
[OAuth App registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
Use `Weaver` as the application name, `https://weaver.usercore.com` as the
homepage, and the exact GitHub callback above. Generate a client secret after
registering the app. The login flow requests `user:email` access.

Store the four values in `/opt/weaver/shared/.env` on the host, keeping mode
`0600`. Supply them through a secure editor or credential manager; never put
them in Git, chat, command arguments, or build arguments:

```dotenv
GOOGLE_CLIENT_ID=<Google client ID>
GOOGLE_CLIENT_SECRET=<Google client secret>
GITHUB_CLIENT_ID=<GitHub client ID>
GITHUB_CLIENT_SECRET=<GitHub client secret>
```

Compose passes these values only to the API at runtime. Either provider can
remain unset, but its sign-in endpoint will return `503`. The callback URLs are
derived from the API's fixed public URL and prefix in `compose.yaml`.

### Changing credentials and reloading the API

When you select a different Google or GitHub OAuth application, update both its
client ID and its matching client secret. Register the callback URL above on
that same application. The Google app name shown during sign-in comes from its
consent-screen branding; changing Weaver's environment does not rename it.

Before changing the protected environment file, keep a mode-`0600` backup in a
root-only directory and record the current API image ID. Preserve the deployed
Compose file and `release.env` with the backup. Review variable names and
presence without printing secret values.

Edit `/opt/weaver/shared/.env` on the host and retain mode `0600`. Changing the
file does not change the environment of a running container. A Docker restart
also retains that container's old environment, so recreate the API with Compose.
The following commands preserve the current image pins and wait for API health
before reloading the web proxy. The API may be briefly unavailable during
recreation.

Connect to Penny with `ssh penny` from the configured operator workstation.
Then run this block on the host after the credential change is approved:

```sh
(
  set -eu
  cd /opt/weaver/current

  docker compose \
    --env-file /opt/weaver/shared/.env \
    --env-file release.env \
    -f deploy/weaver.usercore.com/compose.yaml \
    config --quiet

  docker compose \
    --env-file /opt/weaver/shared/.env \
    --env-file release.env \
    -f deploy/weaver.usercore.com/compose.yaml \
    up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 api

  docker exec weaver-live-web-1 nginx -t
  docker exec weaver-live-web-1 nginx -s reload
  curl --fail --silent --show-error https://weaver.usercore.com/api/v1/health
)
```

The subshell stops at the first failed command. If API health does not pass,
inspect the failure before continuing. Nginx needs the reload to resolve the
recreated API container's address. No application image rebuild or database
migration is required for a credential change.

### Verify sign-in

Start a new attempt from [Weaver's login page](https://weaver.usercore.com/login).
Do not reuse a provider tab opened before the credential change. The public
login page and `/api/v1/health` should return `200`. Each configured provider's
start endpoint must return `302` to its authorization page:

| Provider | Start endpoint | Expected destination |
| --- | --- | --- |
| Google | `/api/v1/auth/google` | `accounts.google.com` |
| GitHub | `/api/v1/auth/github` | `github.com/login/oauth/authorize` |

Check that the redirect uses the exact callback URL and sets an HTTP-only,
Secure, SameSite=Lax state cookie matching the request state. Avoid sharing raw
redirect headers, which include state and cookie values. Complete a real browser
sign-in for each provider to verify the credential exchange and Weaver session.
A working redirect alone does not verify the client secret or full login.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| `503` with `OAuth is not configured` | Both credentials must be present in the API container. Confirm the four mappings in `compose.yaml`, then recreate the API after editing the host environment. |
| Old Google application or client still appears | Confirm the API was recreated with `/opt/weaver/shared/.env` and the release's `release.env`, then start a fresh sign-in attempt. |
| Google `redirect_uri_mismatch` | Register the exact Google callback URL on the client selected by `GOOGLE_CLIENT_ID`. |
| Provider reports an invalid client, or login fails after authorization | Confirm the client ID and secret belong to the same provider application. A redirect can succeed before the secret is checked. |
| `Invalid OAuth state` | Start again from Weaver's login page in the same browser with cookies enabled. Do not reuse an old callback URL. |
| Public API returns `502` after recreation | Confirm API health, then validate and reload Nginx so it resolves the current API container address. |

### Rollback

To roll back, restore the protected environment and Compose copies, then
recreate only the API using the same pinned image and reload the web proxy after
API health passes. Restore the prior `release.env` if its image pins were changed.
An old credential will only work if it remains valid at the provider.

### Local configuration check

Run the local configuration regression check with synthetic credentials:

```sh
node --test deploy/weaver.usercore.com/oauth-config.test.cjs
```
