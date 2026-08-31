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
      transport: CorrectionMemoryFixtureTransport(memories: memories)
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
}

private final class CorrectionMemoryFixtureTransport: CorrectionMemoryTransport, @unchecked Sendable {
  private let memories: [CorrectionMemory]

  init(memories: [CorrectionMemory]) {
    self.memories = memories
  }

  func fetchCorrectionMemories(credential: DeviceCredential) async throws -> [CorrectionMemory] {
    memories
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
