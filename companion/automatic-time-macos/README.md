# Automatic Time macOS Companion

This is the native macOS 13 or newer companion for Weaver Automatic Time.

Phase 3 includes:

- a SwiftUI menu bar executable;
- browser-approved, short-lived pairing;
- device credentials stored in macOS Keychain;
- a Keychain-backed AES-GCM key for local storage;
- an encrypted, owner-only local outbox;
- retry-safe draft synchronization that retains queued drafts through offline and revoked states.

Phase 4 adds:

- opt-in active-application, Accessibility-gated window-title, and browser domain/title capture;
- idle, explicit pause, timed pause, screen lock, sleep, and wake boundaries;
- local Git repository fingerprints, branch names, and commit identifiers without file contents or diffs;
- bounded Weaver issue-candidate synchronization;
- deterministic activity segmentation, two-minute interruption smoothing, exact issue-key preservation, missing-signal gaps, and local-day splitting;
- encrypted raw signals, derived blocks, candidate snapshots, repository paths, and exclusion settings;
- seven-day absolute evidence retention, 48-hour post-release deletion, and persisted deletion tombstones.

Phase 5 adds:

- exact-key, repository, branch, recency, Weaver-context, and correction-memory assignment;
- encrypted synchronization of bounded correction memories;
- stable local activity clustering with concise derived descriptions;
- confidence, reasons, bounded alternatives, and a ruleset version on every draft;
- optional loopback-only semantic ranking after deterministic evidence, with deterministic fallback;
- labeled assignment evaluation that rejects invented issues.

The companion sends derived drafts only. It does not upload raw application, window, browser, repository, or Git evidence, and its device credential cannot release official time. Window and browser metadata are disabled by default. Accessibility permission is requested only through the explicit menu action, and browser automation is attempted only after browser metadata is enabled.

## Build and test

```sh
./scripts/build.sh
```

The package has no third-party dependencies. The script runs the synthetic foundation tests and builds the release executable from the checked-in Swift package configuration.

## Local pairing

Run `swift run automatic-time-companion`, enter the Weaver API URL, Weaver web URL, and tenant ID, then choose **Pair Device**. The browser approval screen shows the device name, requested scopes, version, and credential expiration before approval.

After pairing, set an optional active repository path and current Weaver issue, choose any optional metadata permissions, configure exclusions, and choose **Start**. The companion can be paused indefinitely or for 30 minutes. Repository paths and capture exclusions are stored inside the encrypted local database rather than plain preferences.

Signing, notarization, and a downloadable release artifact remain distribution work. Do not present an unsigned local build as a published companion release.
