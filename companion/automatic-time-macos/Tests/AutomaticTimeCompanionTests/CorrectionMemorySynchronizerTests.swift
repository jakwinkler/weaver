import CryptoKit
import Foundation
import XCTest

@testable import AutomaticTimeCompanion

final class CorrectionMemorySynchronizerTests: XCTestCase {
  func testSynchronizerBoundsAndEncryptsCorrectionMemories() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let fileURL = directory.appendingPathComponent("memories.store")
    let key = SymmetricKey(size: .bits256)
    let memories = (1...225).map {
      CorrectionMemory(
        id: "memory-\($0)",
        memoryType: "repository",
        normalizedFeatures: ["repositoryFingerprint": "fingerprint-\($0)"],
        targetIssueKey: "ATM-1",
        weight: 1,
        positiveCount: 1,
        negativeCount: 0,
        explanation: "Synthetic memory \($0)"
      )
    }
    let database = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let count = try await CorrectionMemorySynchronizer(
      database: database,
      transport: CorrectionMemoryFixtureTransport(
        snapshot: CorrectionMemoryRemoteSnapshot(
          revision: 1,
          recomputeContextDigests: [],
          memories: memories
        )
      )
    ).synchronize(credential: .rulesFixture, now: .reference)

    XCTAssertEqual(count, 200)
    let snapshot = await database.correctionMemorySnapshot()
    XCTAssertEqual(snapshot?.fetchedAt, .reference)
    XCTAssertEqual(snapshot?.memories.count, 200)
    let encryptedBytes = try Data(contentsOf: fileURL)
    XCTAssertFalse(String(decoding: encryptedBytes, as: UTF8.self).contains("fingerprint-1"))

    let reopened = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let reopenedCount = await reopened.correctionMemorySnapshot()?.memories.count
    XCTAssertEqual(reopenedCount, 200)
  }


  func testNewRevisionRequeuesOnlyMatchingUnreleasedDrafts() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let database = try EncryptedLocalDatabase(
      fileURL: directory.appendingPathComponent("recompute.store"),
      key: SymmetricKey(size: .bits256)
    )
    let matching = DerivedDraft.fixture(
      sourceReference: "matching",
      localDate: "2026-08-30",
      correctionContextDigest: "sha256:matching"
    )
    let released = DerivedDraft.fixture(
      sourceReference: "released",
      localDate: "2026-08-29",
      correctionContextDigest: "sha256:matching"
    )
    let unrelated = DerivedDraft.fixture(
      sourceReference: "unrelated",
      localDate: "2026-08-30",
      correctionContextDigest: "sha256:unrelated"
    )
    for draft in [matching, released, unrelated] {
      try await database.enqueue(draft, now: .reference)
    }
    let queued = await database.allOutboxItems()
    try await database.markSucceeded(ids: queued.map(\.id), now: .reference)
    try await database.markDayReleased(localDate: "2026-08-29", releasedAt: .reference)
    try await database.replaceCorrectionMemories(
      CorrectionMemorySnapshot(fetchedAt: .reference, revision: 1, memories: [])
    )

    _ = try await CorrectionMemorySynchronizer(
      database: database,
      transport: CorrectionMemoryFixtureTransport(
        snapshot: CorrectionMemoryRemoteSnapshot(
          revision: 2,
          recomputeContextDigests: ["sha256:matching"],
          memories: []
        )
      )
    ).synchronize(credential: .rulesFixture, now: .reference.addingTimeInterval(60))

    let matchingRequeued = try await database.enqueueIfNeeded(matching, now: .reference)
    let releasedRequeued = try await database.enqueueIfNeeded(released, now: .reference)
    let unrelatedRequeued = try await database.enqueueIfNeeded(unrelated, now: .reference)
    XCTAssertTrue(matchingRequeued)
    XCTAssertFalse(releasedRequeued)
    XCTAssertFalse(unrelatedRequeued)
  }
}

private final class CorrectionMemoryFixtureTransport: CorrectionMemoryTransport, @unchecked Sendable {
  private let snapshot: CorrectionMemoryRemoteSnapshot

  init(snapshot: CorrectionMemoryRemoteSnapshot) {
    self.snapshot = snapshot
  }

  func fetchCorrectionMemories(
    credential: DeviceCredential
  ) async throws -> CorrectionMemoryRemoteSnapshot {
    snapshot
  }
}

private extension DerivedDraft {
  static func fixture(
    sourceReference: String,
    localDate: String,
    correctionContextDigest: String
  ) -> DerivedDraft {
    DerivedDraft(
      sourceReference: sourceReference,
      localDate: localDate,
      startedAt: .reference,
      endedAt: .reference.addingTimeInterval(1_800),
      proposedMinutes: 30,
      description: "Synthetic private draft",
      confidence: 0.8,
      assignmentMethod: "deterministic",
      assignmentReasons: ["Synthetic fixture"],
      evidenceDigest: "sha256:\(sourceReference)",
      correctionContextDigest: correctionContextDigest,
      issueKey: "ATM-1"
    )
  }
}

private extension DeviceCredential {
  static let rulesFixture = DeviceCredential(
    deviceID: "device-rules",
    tenantID: "tenant-rules",
    token: "token-rules",
    scopes: ["automatic-time:rules:read"],
    expiresAt: Date(timeIntervalSince1970: 4_000_000_000)
  )
}

private extension Date {
  static let reference = ISO8601DateFormatter().date(from: "2026-08-31T13:00:00Z")!
}
