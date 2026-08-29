# Automatic Time macOS feasibility spike

This Swift package demonstrates the smallest native boundary needed by the Automatic Time companion:

- frontmost-application metadata through AppKit
- permission-gated window-title capture through macOS Accessibility
- AES-GCM encrypted evidence files with owner-only permissions
- a Keychain-backed encryption-key provider that compiles without writing a real key during tests
- time-controlled retention deletion

All tests use synthetic activity data. The executable prints capability booleans only.

```shell
swift test
swift run automatic-time-spike
```

This is disposable Phase 0 proof, not the distributable companion application.
