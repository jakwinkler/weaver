import CryptoKit
import Foundation
import XCTest
@testable import AutomaticTimeCompanion

final class CompanionFoundationTests: XCTestCase {
  private var temporaryDirectory: URL!

  override func setUpWithError() throws {
    temporaryDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("automatic-time-companion-tests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
      at: temporaryDirectory,
      withIntermediateDirectories: true
    )
  }

  override func tearDownWithError() throws {
    if let temporaryDirectory {
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
  }

  func testEncryptedDatabasePersistsOutboxWithoutPlaintext() async throws {
    let fileURL = temporaryDirectory.appendingPathComponent("automatic-time.store")
    let key = SymmetricKey(data: Data(repeating: 7, count: 32))
    let database = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let draft = DerivedDraft(
      sourceReference: "synthetic-outbox-draft",
      localDate: "2026-08-29",
      startedAt: Date(timeIntervalSince1970: 1_777_642_400),
      endedAt: Date(timeIntervalSince1970: 1_777_644_200),
      proposedMinutes: 30,
      description: "private synthetic outbox description",
      confidence: 0.95,
      assignmentMethod: "exact-issue-key",
      assignmentReasons: ["Synthetic issue key"],
      evidenceDigest: "sha256:synthetic-outbox-draft",
      issueKey: "APG-1"
    )

    _ = try await database.enqueue(draft, now: Date(timeIntervalSince1970: 1_777_644_200))

    let encryptedBytes = try Data(contentsOf: fileURL)
    XCTAssertNil(
      String(data: encryptedBytes, encoding: .utf8)?.range(
        of: "private synthetic outbox description"
      )
    )
    let reopened = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let recovered = await reopened.dueItems(now: Date(timeIntervalSince1970: 1_777_644_200))
    XCTAssertEqual(recovered.map(\.draft), [draft])
  }

  func testOfflineFailureSurvivesRestartAndRetriesSuccessfully() async throws {
    let fileURL = temporaryDirectory.appendingPathComponent("retry.store")
    let key = SymmetricKey(data: Data(repeating: 8, count: 32))
    let database = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    _ = try await database.enqueue(.syntheticFixture, now: .reference)
    let secrets = MemorySecretStore()
    let vault = DeviceCredentialVault(secretStore: secrets)
    try vault.save(.validFixture)
    let transport = SequencedDraftTransport(results: [.failure(.offline), .success(1)])
    let engine = OutboxSyncEngine(database: database, credentialVault: vault, transport: transport)

    let first = await engine.sync(now: .reference)
    XCTAssertEqual(first, .retryScheduled)
    let afterFailure = await database.allOutboxItems()
    XCTAssertEqual(afterFailure.first?.attemptCount, 1)

    let reopened = try EncryptedLocalDatabase(fileURL: fileURL, key: key)
    let retryEngine = OutboxSyncEngine(
      database: reopened,
      credentialVault: vault,
      transport: transport
    )
    let second = await retryEngine.sync(now: .reference.addingTimeInterval(120))
    XCTAssertEqual(second, .synced(1))
    let afterSuccess = await reopened.allOutboxItems()
    XCTAssertEqual(afterSuccess, [])
  }

  func testRevocationClearsCredentialButKeepsQueuedDraft() async throws {
    let database = try EncryptedLocalDatabase(
      fileURL: temporaryDirectory.appendingPathComponent("revoked.store"),
      key: SymmetricKey(data: Data(repeating: 9, count: 32))
    )
    _ = try await database.enqueue(.syntheticFixture, now: .reference)
    let secrets = MemorySecretStore()
    let vault = DeviceCredentialVault(secretStore: secrets)
    try vault.save(.validFixture)
    let engine = OutboxSyncEngine(
      database: database,
      credentialVault: vault,
      transport: SequencedDraftTransport(results: [.failure(.unauthorized)])
    )

    let outcome = await engine.sync(now: .reference)
    XCTAssertEqual(outcome, .credentialRevoked)
    XCTAssertNil(try vault.loadValid(now: .reference))
    let queued = await database.allOutboxItems()
    XCTAssertEqual(queued.count, 1)
  }

  func testExpiredCredentialIsDeletedBeforeNetworkUse() throws {
    let secrets = MemorySecretStore()
    let vault = DeviceCredentialVault(secretStore: secrets)
    try vault.save(.expiredFixture)

    XCTAssertThrowsError(try vault.loadValid(now: .reference)) { error in
      XCTAssertEqual(error as? CredentialVaultError, .expired)
    }
    XCTAssertNil(try secrets.load(account: DeviceCredentialVault.account))
  }
}

private extension Date {
  static let reference = Date(timeIntervalSince1970: 1_777_644_200)
}

private extension DerivedDraft {
  static let syntheticFixture = DerivedDraft(
    sourceReference: "synthetic-retry-draft",
    localDate: "2026-08-29",
    startedAt: .reference.addingTimeInterval(-1_800),
    endedAt: .reference,
    proposedMinutes: 30,
    description: "Synthetic retry draft",
    confidence: 0.9,
    assignmentMethod: "exact-issue-key",
    assignmentReasons: ["Synthetic issue key"],
    evidenceDigest: "sha256:synthetic-retry-draft",
    issueKey: "APG-1"
  )
}

private extension DeviceCredential {
  static let validFixture = DeviceCredential(
    deviceID: "device-1",
    tenantID: "tenant-1",
    token: "device-token",
    scopes: ["automatic-time:drafts:write"],
    expiresAt: .reference.addingTimeInterval(3_600)
  )

  static let expiredFixture = DeviceCredential(
    deviceID: "device-expired",
    tenantID: "tenant-1",
    token: "expired-token",
    scopes: ["automatic-time:drafts:write"],
    expiresAt: .reference.addingTimeInterval(-1)
  )
}

private final class MemorySecretStore: SecretStore {
  private var values: [String: Data] = [:]

  func save(_ data: Data, account: String) throws {
    values[account] = data
  }

  func load(account: String) throws -> Data? {
    values[account]
  }

  func delete(account: String) throws {
    values.removeValue(forKey: account)
  }
}

private final class SequencedDraftTransport: DraftTransport {
  private var results: [Result<Int, CompanionTransportError>]

  init(results: [Result<Int, CompanionTransportError>]) {
    self.results = results
  }

  func sync(drafts: [DerivedDraft], credential: DeviceCredential) async throws -> Int {
    guard !results.isEmpty else { return drafts.count }
    return try results.removeFirst().get()
  }
}
