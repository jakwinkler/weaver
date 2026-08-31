import Foundation
import XCTest
@testable import AutomaticTimeCompanion

final class SegmentationTests: XCTestCase {
  private let calendar = Calendar(identifier: .gregorian)

  func testBriefInterruptionIsSmoothedIntoSurroundingContext() throws {
    let segmenter = DeterministicSegmenter(
      smoothingThreshold: 120,
      maximumSignalGap: 600,
      calendar: calendar
    )
    let primary = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.editor",
      applicationName: "Editor",
      repositoryFingerprint: "repo-a",
      gitBranch: "feature/local-capture"
    )
    let interruption = CapturedContext(
      applicationBundleIdentifier: "com.apple.mail",
      applicationName: "Mail"
    )
    let start = date("2026-08-30T09:00:00Z")
    let signals = [
      ActivitySignal.context(primary, at: start),
      ActivitySignal.context(interruption, at: start.addingTimeInterval(600)),
      ActivitySignal.context(primary, at: start.addingTimeInterval(660)),
    ]

    let blocks = try segmenter.segment(
      signals: signals,
      through: start.addingTimeInterval(1_200)
    )

    XCTAssertEqual(blocks.count, 1)
    XCTAssertEqual(blocks[0].startedAt, start)
    XCTAssertEqual(blocks[0].endedAt, start.addingTimeInterval(1_200))
    XCTAssertEqual(blocks[0].capturedSeconds, 1_200)
    XCTAssertEqual(blocks[0].context, primary)
  }

  func testExactIssueKeyTransitionIsNeverSmoothed() throws {
    let segmenter = DeterministicSegmenter(
      smoothingThreshold: 120,
      maximumSignalGap: 600,
      calendar: calendar
    )
    let primary = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.editor",
      applicationName: "Editor"
    )
    let issue = CapturedContext(
      applicationBundleIdentifier: "com.apple.Safari",
      applicationName: "Safari",
      browserTitle: "APG-42 synthetic issue"
    )
    let start = date("2026-08-30T09:00:00Z")

    let blocks = try segmenter.segment(
      signals: [
        .context(primary, at: start),
        .context(issue, at: start.addingTimeInterval(600)),
        .context(primary, at: start.addingTimeInterval(660)),
      ],
      through: start.addingTimeInterval(1_200)
    )

    XCTAssertEqual(blocks.count, 3)
    XCTAssertEqual(blocks[1].context.exactIssueKey, "APG-42")
    XCTAssertEqual(blocks[1].capturedSeconds, 60)
  }

  func testIdlePauseLockAndSleepNeverInflateCapturedTime() throws {
    let segmenter = DeterministicSegmenter(
      smoothingThreshold: 120,
      maximumSignalGap: 600,
      calendar: calendar
    )
    let context = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.editor",
      applicationName: "Editor"
    )
    let start = date("2026-08-30T09:00:00Z")
    let signals: [ActivitySignal] = [
      .context(context, at: start),
      .lifecycle(.idleStarted, at: start.addingTimeInterval(300)),
      .lifecycle(.idleEnded, at: start.addingTimeInterval(600)),
      .context(context, at: start.addingTimeInterval(600)),
      .lifecycle(.paused, at: start.addingTimeInterval(900)),
      .lifecycle(.resumed, at: start.addingTimeInterval(1_200)),
      .context(context, at: start.addingTimeInterval(1_200)),
      .lifecycle(.locked, at: start.addingTimeInterval(1_500)),
      .lifecycle(.unlocked, at: start.addingTimeInterval(1_800)),
      .context(context, at: start.addingTimeInterval(1_800)),
      .lifecycle(.sleep, at: start.addingTimeInterval(2_100)),
      .lifecycle(.wake, at: start.addingTimeInterval(2_400)),
      .context(context, at: start.addingTimeInterval(2_400)),
    ]

    let blocks = try segmenter.segment(
      signals: signals,
      through: start.addingTimeInterval(2_700)
    )

    XCTAssertEqual(blocks.reduce(0) { $0 + $1.capturedSeconds }, 1_500)
    XCTAssertEqual(blocks.count, 5)
  }

  func testMissingSignalGapIsNotInferred() throws {
    let segmenter = DeterministicSegmenter(
      smoothingThreshold: 120,
      maximumSignalGap: 90,
      calendar: calendar
    )
    let context = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.editor",
      applicationName: "Editor"
    )
    let start = date("2026-08-30T09:00:00Z")

    let blocks = try segmenter.segment(
      signals: [
        .context(context, at: start),
        .context(context, at: start.addingTimeInterval(600)),
      ],
      through: start.addingTimeInterval(660)
    )

    XCTAssertEqual(blocks.count, 1)
    XCTAssertEqual(blocks[0].startedAt, start.addingTimeInterval(600))
    XCTAssertEqual(blocks[0].capturedSeconds, 60)
  }

  func testBlockIsSplitAtLocalDayBoundaryWithoutLosingTime() throws {
    var utcCalendar = calendar
    utcCalendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let segmenter = DeterministicSegmenter(
      smoothingThreshold: 120,
      maximumSignalGap: 600,
      calendar: utcCalendar
    )
    let context = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.editor",
      applicationName: "Editor"
    )
    let start = date("2026-08-30T23:58:00Z")

    let blocks = try segmenter.segment(
      signals: [.context(context, at: start)],
      through: date("2026-08-31T00:02:00Z")
    )

    XCTAssertEqual(blocks.map(\.localDate), ["2026-08-30", "2026-08-31"])
    XCTAssertEqual(blocks.map(\.capturedSeconds), [120, 120])
  }

  private func date(_ value: String) -> Date {
    ISO8601DateFormatter().date(from: value)!
  }
}
