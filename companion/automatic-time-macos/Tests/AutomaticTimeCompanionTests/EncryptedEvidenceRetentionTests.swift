import CryptoKit
import Foundation
import XCTest
@testable import AutomaticTimeCompanion

final class EncryptedEvidenceRetentionTests: XCTestCase {
  private var temporaryDirectory: URL!

  override func setUpWithError() throws {
    temporaryDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("automatic-time-retention-tests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
  }

  override func tearDownWithError() throws {
    if let temporaryDirectory { try? FileManager.default.removeItem(at: temporaryDirectory) }
  }

  func testRawSignalsBlocksAndCandidatesSurviveEncryptedRestart() async throws {
    let fileURL = temporaryDirectory.appendingPathComponent("evidence.store")
    let key = SymmetricKey(data: Data(repeating: 3, count: 32))
    let database = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let context = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.synthetic",
      applicationName: "Synthetic App",
      windowTitle: "private synthetic window title"
    )
    let signal = ActivitySignal.context(context, at: .reference)
    let block = ActivityBlock.synthetic(context: context)
    let candidates = IssueCandidateSnapshot(
      fetchedAt: .reference,
      candidates: [IssueCandidate(id: "issue-1", key: "APG-1", summary: "Synthetic issue")]
    )
    let configuration = LocalCaptureConfiguration(
      privacySettings: CapturePrivacySettings(
        applicationExclusions: ["dev.weaver.private-app"]
      ),
      repositoryPath: "/private/synthetic/customer-repository",
      activeIssueKey: "APG-1"
    )

    try await database.recordSignal(signal)
    try await database.replaceActivityBlocks([block])
    try await database.replaceIssueCandidates(candidates)
    try await database.replaceCaptureConfiguration(configuration)

    let encrypted = try Data(contentsOf: fileURL)
    XCTAssertNil(String(data: encrypted, encoding: .utf8)?.range(of: "private synthetic window title"))
    XCTAssertNil(String(data: encrypted, encoding: .utf8)?.range(of: "customer-repository"))

    let reopened = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let reopenedSignals = await reopened.allSignals()
    let reopenedBlocks = await reopened.allActivityBlocks()
    let reopenedCandidates = await reopened.issueCandidateSnapshot()
    let reopenedConfiguration = await reopened.captureConfiguration()
    XCTAssertEqual(reopenedSignals, [signal])
    XCTAssertEqual(reopenedBlocks, [block])
    XCTAssertEqual(reopenedCandidates, candidates)
    XCTAssertEqual(reopenedConfiguration, configuration)
  }

  func testAbsoluteAndReleasedDayRetentionCreateVerifiableTombstones() async throws {
    let fileURL = temporaryDirectory.appendingPathComponent("retention.store")
    let key = SymmetricKey(data: Data(repeating: 4, count: 32))
    let database = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let now = Date.reference
    let oldContext = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.old",
      applicationName: "Old synthetic app"
    )
    let releasedContext = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.released",
      applicationName: "Released synthetic app"
    )
    let currentContext = CapturedContext(
      applicationBundleIdentifier: "dev.weaver.current",
      applicationName: "Current synthetic app"
    )
    try await database.recordSignal(.context(oldContext, at: now.addingTimeInterval(-8 * 86_400)))
    try await database.recordSignal(.context(releasedContext, at: now.addingTimeInterval(-3 * 86_400)))
    try await database.recordSignal(.context(currentContext, at: now.addingTimeInterval(-3_600)))
    try await database.replaceActivityBlocks([
      .retentionFixture(localDate: "2026-08-22", context: oldContext, at: now.addingTimeInterval(-8 * 86_400)),
      .retentionFixture(localDate: "2026-08-27", context: releasedContext, at: now.addingTimeInterval(-3 * 86_400)),
      .retentionFixture(localDate: "2026-08-30", context: currentContext, at: now.addingTimeInterval(-3_600)),
    ])
    try await database.markDayReleased(
      localDate: "2026-08-27",
      releasedAt: now.addingTimeInterval(-49 * 3_600)
    )

    let result = try await database.enforceRetention(
      now: now,
      policy: RetentionPolicy(releasedEvidenceLifetime: 48 * 3_600, absoluteMaximumAge: 7 * 86_400)
    )

    XCTAssertEqual(result.deletedSignals, 2)
    XCTAssertEqual(result.deletedBlocks, 2)
    let remainingSignals = await database.allSignals()
    let remainingBlocks = await database.allActivityBlocks()
    let tombstones = await database.retentionTombstones()
    XCTAssertEqual(remainingSignals.map(\.context?.applicationName), ["Current synthetic app"])
    XCTAssertEqual(remainingBlocks.map(\.localDate), ["2026-08-30"])
    XCTAssertEqual(tombstones.count, 2)

    let reopened = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let reopenedSignals = await reopened.allSignals()
    let reopenedTombstones = await reopened.retentionTombstones()
    XCTAssertEqual(reopenedSignals.count, 1)
    XCTAssertEqual(reopenedTombstones.count, 2)
  }

  func testCandidateSynchronizerStoresBoundedSnapshot() async throws {
    let database = try EncryptedLocalDatabase(
      fileURL: temporaryDirectory.appendingPathComponent("candidates.store"),
      key: SymmetricKey(data: Data(repeating: 5, count: 32))
    )
    let transport = FixtureIssueCandidateTransport(
      candidates: (1...125).map {
        IssueCandidate(id: "issue-\($0)", key: "APG-\($0)", summary: "Synthetic issue \($0)")
      }
    )
    let synchronizer = IssueCandidateSynchronizer(
      database: database,
      transport: transport,
      maximumCandidates: 100
    )

    let count = try await synchronizer.synchronize(credential: .candidateFixture, now: .reference)

    XCTAssertEqual(count, 100)
    let snapshot = await database.issueCandidateSnapshot()
    XCTAssertEqual(snapshot?.candidates.count, 100)
  }

  func testReleasedDaySynchronizerStoresServerReleaseTimes() async throws {
    let database = try EncryptedLocalDatabase(
      fileURL: temporaryDirectory.appendingPathComponent("released-days.store"),
      key: SymmetricKey(data: Data(repeating: 11, count: 32))
    )
    let releasedAt = Date.reference.addingTimeInterval(-49 * 3_600)
    let synchronizer = RetentionStateSynchronizer(
      database: database,
      transport: FixtureRetentionStateTransport(
        releasedDays: [ReleasedDay(localDate: "2026-08-27", releasedAt: releasedAt)]
      )
    )

    let count = try await synchronizer.synchronize(credential: .candidateFixture)

    XCTAssertEqual(count, 1)
    let releasedDays = await database.releasedDays()
    XCTAssertEqual(releasedDays, ["2026-08-27": releasedAt])
  }
}

private extension Date {
  static let reference = ISO8601DateFormatter().date(from: "2026-08-30T12:00:00Z")!
}

private extension ActivityBlock {
  static func synthetic(context: CapturedContext) -> ActivityBlock {
    ActivityBlock(
      sourceReference: "capture:synthetic",
      localDate: "2026-08-30",
      startedAt: .reference.addingTimeInterval(-1_800),
      endedAt: .reference,
      capturedSeconds: 1_800,
      context: context,
      evidenceDigest: "sha256:synthetic"
    )
  }

  static func retentionFixture(
    localDate: String,
    context: CapturedContext,
    at: Date
  ) -> ActivityBlock {
    ActivityBlock(
      sourceReference: "capture:\(localDate)",
      localDate: localDate,
      startedAt: at,
      endedAt: at.addingTimeInterval(60),
      capturedSeconds: 60,
      context: context,
      evidenceDigest: "sha256:\(localDate)"
    )
  }
}

private extension DeviceCredential {
  static let candidateFixture = DeviceCredential(
    deviceID: "device-candidates",
    tenantID: "tenant-candidates",
    token: "token-candidates",
    scopes: ["automatic-time:candidates:read"],
    expiresAt: .reference.addingTimeInterval(3_600)
  )
}

private final class FixtureIssueCandidateTransport: IssueCandidateTransport {
  private let candidates: [IssueCandidate]

  init(candidates: [IssueCandidate]) {
    self.candidates = candidates
  }

  func fetchIssueCandidates(credential: DeviceCredential) async throws -> [IssueCandidate] {
    candidates
  }
}

private final class FixtureRetentionStateTransport: RetentionStateTransport {
  private let releasedDays: [ReleasedDay]

  init(releasedDays: [ReleasedDay]) {
    self.releasedDays = releasedDays
  }

  func fetchReleasedDays(credential: DeviceCredential) async throws -> [ReleasedDay] {
    releasedDays
  }
}
