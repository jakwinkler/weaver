import CryptoKit
import Foundation
import XCTest
@testable import AutomaticTimeCompanion

final class CaptureCoordinatorTests: XCTestCase {
  func testTimedPauseResumesAndScreenLockSuppressesSampling() async throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("automatic-time-coordinator-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let database = try EncryptedLocalDatabase(
      fileURL: directory.appendingPathComponent("capture.store"),
      key: SymmetricKey(data: Data(repeating: 6, count: 32))
    )
    let application = FixtureApplicationCapture()
    let coordinator = MacOSCaptureCoordinator(
      database: database,
      contextCapture: MacOSContextCapture(
        applicationCapture: application,
        windowCapture: FixtureWindowCapture(),
        browserCapture: FixtureBrowserCapture()
      ),
      idleMonitor: FixtureIdleMonitor(),
      segmenter: DeterministicSegmenter(maximumSignalGap: 90)
    )
    let start = ISO8601DateFormatter().date(from: "2026-08-30T09:00:00Z")!

    try await coordinator.sample(now: start)
    try await coordinator.sample(now: start.addingTimeInterval(30))
    try await coordinator.pause(for: 60, now: start.addingTimeInterval(31))
    try await coordinator.sample(now: start.addingTimeInterval(60))
    let pausedBeforeDeadline = await coordinator.captureIsPaused()
    XCTAssertTrue(pausedBeforeDeadline)
    try await coordinator.sample(now: start.addingTimeInterval(92))
    let pausedAfterDeadline = await coordinator.captureIsPaused()
    XCTAssertFalse(pausedAfterDeadline)

    try await coordinator.recordLifecycle(.locked, now: start.addingTimeInterval(100))
    try await coordinator.sample(now: start.addingTimeInterval(120))
    try await coordinator.recordLifecycle(.unlocked, now: start.addingTimeInterval(150))
    try await coordinator.sample(now: start.addingTimeInterval(150))

    let signals = await database.allSignals()
    XCTAssertFalse(signals.contains { $0.kind == .context && $0.occurredAt == start.addingTimeInterval(120) })
    XCTAssertTrue(signals.contains { $0.kind == .context && $0.occurredAt == start.addingTimeInterval(150) })
  }
}

private final class FixtureApplicationCapture: FrontmostApplicationCapturing {
  func capture() -> CapturedApplication? {
    CapturedApplication(
      bundleIdentifier: "dev.weaver.synthetic",
      displayName: "Synthetic Editor",
      processIdentifier: 42
    )
  }
}

private final class FixtureWindowCapture: WindowTitleCapturing {
  var isTrusted = false
  func requestPermission() {}
  func capture(processIdentifier: pid_t) -> String? { nil }
}

private final class FixtureBrowserCapture: BrowserMetadataCapturing {
  func capture(bundleIdentifier: String) -> BrowserMetadata? { nil }
}

private final class FixtureIdleMonitor: IdleMonitoring {
  func isIdle(threshold: TimeInterval) -> Bool { false }
}
