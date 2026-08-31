import CryptoKit
import Foundation
import XCTest
@testable import AutomaticTimeCompanion

final class SyntheticWorkdayTests: XCTestCase {
  func testRepresentativeDayIsStablePrivateAndRestartSafe() async throws {
    let start = ISO8601DateFormatter().date(from: "2026-08-30T08:55:00Z")!
    let editor = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.editor",
      applicationName: "Synthetic Editor",
      windowTitle: "APG-10 synthetic implementation",
      repositoryFingerprint: "repo-apg",
      gitBranch: "APG-10-local-capture",
      gitCommit: "1111111111111111"
    )
    let interruption = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.chat",
      applicationName: "Synthetic Chat"
    )
    let browser = CapturedContext(
      applicationBundleIdentifier: "com.apple.Safari",
      applicationName: "Safari",
      browserDomain: "weaver.example",
      browserTitle: "APG-11 synthetic review"
    )
    var signals: [ActivitySignal] = []
    signals += contextSignals(editor, from: start, minuteRange: 0..<20)
    signals.append(.context(interruption, at: start.addingTimeInterval(20 * 60)))
    signals += contextSignals(editor, from: start, minuteRange: 21..<35)
    signals.append(.lifecycle(.idleStarted, at: start.addingTimeInterval(35 * 60)))
    signals.append(.lifecycle(.idleEnded, at: start.addingTimeInterval(45 * 60)))
    signals += contextSignals(browser, from: start, minuteRange: 45..<65)
    signals.append(.lifecycle(.sleep, at: start.addingTimeInterval(65 * 60)))
    signals.append(.lifecycle(.wake, at: start.addingTimeInterval(95 * 60)))
    signals += contextSignals(browser, from: start, minuteRange: 95..<110)

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let segmenter = DeterministicSegmenter(
      smoothingThreshold: 120,
      maximumSignalGap: 90,
      calendar: calendar
    )
    let end = start.addingTimeInterval(110 * 60)
    let first = try segmenter.segment(signals: signals, through: end)
    let second = try segmenter.segment(signals: Array(signals.reversed()), through: end)

    XCTAssertEqual(first, second)
    XCTAssertEqual(first.map(\.capturedSeconds), [35 * 60, 20 * 60, 15 * 60])
    XCTAssertEqual(first.map(\.context.exactIssueKey), ["APG-10", "APG-11", "APG-11"])
    XCTAssertEqual(first.reduce(0) { $0 + $1.capturedSeconds }, 70 * 60)

    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("automatic-time-workday-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appendingPathComponent("workday.store")
    let key = SymmetricKey(data: Data(repeating: 10, count: 32))
    let database = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    for signal in signals { try await database.recordSignal(signal) }
    try await database.replaceActivityBlocks(first)

    let encryptedBytes = try Data(contentsOf: fileURL)
    let plaintext = String(data: encryptedBytes, encoding: .utf8) ?? ""
    XCTAssertFalse(plaintext.contains("APG-10 synthetic implementation"))
    XCTAssertFalse(plaintext.contains("weaver.example"))

    let reopened = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let recoveredSignals = await reopened.allSignals()
    let recoveredBlocks = await reopened.allActivityBlocks()
    XCTAssertEqual(recoveredSignals.count, signals.count)
    XCTAssertEqual(recoveredBlocks, first)

    let upload = try JSONEncoder().encode(
      DerivedDraft(
        sourceReference: first[0].sourceReference,
        localDate: first[0].localDate,
        startedAt: first[0].startedAt,
        endedAt: first[0].endedAt,
        proposedMinutes: first[0].capturedSeconds / 60,
        description: "Synthetic derived draft",
        confidence: 0.95,
        assignmentMethod: "exact-issue-key",
        assignmentReasons: ["Exact issue key"],
        evidenceDigest: first[0].evidenceDigest,
        issueKey: first[0].context.exactIssueKey
      )
    )
    let uploadJSON = String(data: upload, encoding: .utf8) ?? ""
    XCTAssertFalse(uploadJSON.contains("windowTitle"))
    XCTAssertFalse(uploadJSON.contains("browserDomain"))
    XCTAssertFalse(uploadJSON.contains("repositoryFingerprint"))
  }

  private func contextSignals(
    _ context: CapturedContext,
    from start: Date,
    minuteRange: Range<Int>
  ) -> [ActivitySignal] {
    minuteRange.map {
      .context(context, at: start.addingTimeInterval(TimeInterval($0 * 60)))
    }
  }
}
