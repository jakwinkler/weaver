# ADR 001: Native macOS Companion for Automatic Time

- Status: Accepted for the first local alpha
- Date: 2026-08-29
- Scope: Automatic Time companion technology and Phase 0 operating defaults

## Context

Automatic Time needs a separately installed macOS companion. The companion must collect a deliberately narrow metadata set, segment work locally, protect short-lived evidence at rest, and send only derived private drafts to Weaver. It must remain useful when Weaver is offline and must not broaden the plugin's authority to release official time.

The companion boundary is security-sensitive. Window titles may contain private information, device credentials are valuable secrets, and a general cross-platform runtime would still need native bridges for macOS Accessibility, AppKit, Keychain, sleep and wake, and application lifecycle events.

## Decision

Build the first companion as a native Swift menu bar application targeting macOS 13 or newer.

- Put the production application in `companion/automatic-time-macos/`. Keep the Phase 0 proof under `spikes/` disposable.
- Use `NSWorkspace.frontmostApplication` for the active application process.
- Treat window-title access as an optional Accessibility capability. Check trust without prompting during ordinary startup. Request access only from an explicit onboarding or settings action.
- Keep browser metadata disabled by default. When explicitly enabled, use a fixed browser allowlist and Apple Events to read only the active tab URL and title, immediately reduce the URL to its normalized domain, and never persist the full URL. Domain exclusions remove both domain and title evidence.
- Read Git branch and commit identifiers only from an explicitly configured local repository. Persist a SHA-256 repository fingerprint with the branch and commit, while keeping the path inside the encrypted local configuration and never reading file contents or diffs.
- Use CryptoKit AES-GCM for authenticated encryption of local evidence.
- Store the evidence encryption key and device credential as small secrets in macOS Keychain. Do not store the evidence body in Keychain.
- Keep capture adapters separate from segmentation, assignment, encrypted storage, and sync so every boundary can be fixture-tested.
- Run segmentation and assignment locally. The companion may sync derived drafts, confidence, reasons, alternatives, durations, and a non-reversible evidence digest. Raw application events, window titles, browser titles, repository paths, and Git history do not leave the device.
- Use synthetic metadata in automated tests. A diagnostic command may report capability booleans but must not print or persist the active application or window title.

This accepts native Swift for the first macOS-only release. A cross-platform runtime can be reconsidered only when another supported desktop platform becomes a real requirement and an equal-condition spike proves that the native bridges do not weaken privacy, reliability, or maintainability.

## Phase 0 Trial Defaults

These are initial local-alpha settings, not permanent policy:

- Inference: local only.
- Raw evidence retention: delete 48 hours after the associated day is released, with an absolute maximum age of seven days.
- Interruption smoothing: fold context switches shorter than two minutes into surrounding work unless the interruption contains a strong issue signal.
- Confidence: at least `0.90` assigns a private draft, `0.65` through `0.89` shows a prominent suggestion, and below `0.65` remains unassigned.
- Rounding: retain captured timestamps at full precision locally. At release, round the reviewed day total to the nearest whole minute and distribute whole minutes across entries by largest remainder so their sum exactly matches the reviewed total. Never round an activity block before review.
- Unassigned release: a draft must be assigned, hidden, or deleted before release. The first version does not create issue-less official time.

These settings remain editable and should be reviewed after days two, five, and ten of the local alpha.

## Spike Evidence

The Phase 0 spike lives at `spikes/automatic-time-macos/` and compiles against the current macOS SDK.

| Question                                                             | Evidence                                                                                                                                                                                                                                   | Result                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Can the frontmost application be identified through a supported API? | [`NSWorkspace.frontmostApplication`](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication) and the compiled capability probe                                                                                  | Yes                                                             |
| Can title capture be permission-gated?                               | [`AXIsProcessTrustedWithOptions`](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions), `AXUIElementCreateApplication`, and `AXUIElementCopyAttributeValue` compile in the capture adapter | Yes                                                             |
| Can local evidence be encrypted and authenticated?                   | [CryptoKit `AES.GCM`](https://developer.apple.com/documentation/cryptokit/aes/gcm) plus a synthetic round-trip and plaintext-absence test                                                                                                  | Yes                                                             |
| Can keys be separated from evidence?                                 | [Keychain Services](https://developer.apple.com/documentation/security/keychain-services) plus a compiled generic-password key provider                                                                                                    | Yes, subject to signing and entitlement verification in Phase 3 |
| Can short retention be enforced?                                     | A time-controlled test deletes an expired encrypted evidence file and preserves the current one                                                                                                                                            | Yes for the storage boundary demonstrated by the spike          |

Verified commands:

```text
swift test
swift run automatic-time-spike
```

The capability command reports only whether the APIs are available and authorized. It does not output captured metadata.

## Consequences

- The first companion can use platform security and lifecycle APIs directly, with no native bridge layer.
- macOS is an intentional product boundary for the first version.
- Accessibility permission denial degrades title-based evidence without stopping application, Git, or Weaver-context evidence.
- The spike proves the primitives and module boundary. It does not choose the production encrypted database, validate application signing or sandbox entitlements, implement browser metadata, or exercise persistent Keychain writes.
- Phase 3 must test Keychain behavior in the exact signed application and verify upgrade, revocation, uninstall, and recovery behavior before distribution.

## Remaining Decisions

- Local inference model and runtime
- Exact issue-candidate lookback window
- Final-total adjustment policy beyond the default rounding rule
- Companion signing, notarization, update, and delivery mechanism
