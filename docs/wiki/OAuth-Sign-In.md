# Google and GitHub sign-in

The [Compose template](../../deploy/compose/README.md) configures social sign-in
through the installation's protected environment file. Set `WEAVER_PUBLIC_URL`
to the installation's HTTPS origin. Provider credentials are passed only to the
API at runtime.

## Register the provider applications

For an example origin of `https://weaver.example.com`, register:

| Provider | Callback URL                                             |
| -------- | -------------------------------------------------------- |
| Google   | `https://weaver.example.com/api/v1/auth/google/callback` |
| GitHub   | `https://weaver.example.com/api/v1/auth/github/callback` |

Replace the example origin with the exact origin of your installation. Use
[Google's web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)
and [GitHub's OAuth application registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google, and
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for GitHub. Either provider can
remain unset; its sign-in endpoint then returns `503`. Keep the client ID and
secret from the same provider application together.

## Change credentials

Keep a protected backup of the environment file and record the deployed source,
Compose project name, and image pins. Change the credentials in that private
file. Retain restrictive file permissions and avoid printing values in logs.

Updating the file or restarting a container does not replace its environment.
Recreate the API using the same project name and reviewed images, then reload
the web proxy so it resolves the API container's current address. Set
`WEAVER_ENV_FILE` to the protected file's absolute path and run from the
repository root:

```sh
(
  set -eu
  docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml config --quiet
  docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 api
  docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml exec -T web nginx -t
  docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml exec -T web nginx -s reload
)
```

If the installation keeps image pins in a second private env file, supply that
file with an additional `--env-file` on every Compose command. The API may be
briefly unavailable during recreation. Stop and inspect any failed health check
before proceeding.

## Verify sign-in

Open the installation's login page and start a fresh sign-in attempt. Each
configured provider should redirect from `/api/v1/auth/google` or
`/api/v1/auth/github` to its authorization page with the registered callback URL.
In production, the state cookie should be HTTP-only, Secure, and SameSite=Lax.
Do not share raw redirect headers or cookies.

Complete sign-in for each provider and verify the Weaver session. A provider
redirect alone does not verify the client secret or completed login.

| Symptom                              | Check                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `503` with `OAuth is not configured` | Both provider values must reach the API. Recreate it after changing the environment file. |
| An old provider application appears  | Confirm the API was recreated with the intended env files, then start a fresh login.      |
| Google `redirect_uri_mismatch`       | Register the exact callback URL on the selected client.                                   |
| Invalid client after authorization   | Confirm the ID and secret belong to the same provider application.                        |
| `Invalid OAuth state`                | Start again in the same browser with cookies enabled.                                     |
| `502` after recreation               | Confirm API health, then validate and reload the web proxy.                               |

For rollback, restore the private environment and Compose configuration, retain
the prior image pins and project name, and repeat API recreation and proxy
reload. A prior provider credential will work only if the provider still accepts
it.
