import CryptoKit
import Foundation

public enum EncryptedLocalDatabaseError: Error, Equatable {
  case unavailableCombinedRepresentation
}

public struct OutboxItem: Codable, Equatable, Identifiable, Sendable {
  public let id: UUID
  public let draft: DerivedDraft
  public var attemptCount: Int
  public var nextAttemptAt: Date
  public let createdAt: Date
}

public struct RetentionPolicy: Codable, Equatable, Sendable {
  public let releasedEvidenceLifetime: TimeInterval
  public let absoluteMaximumAge: TimeInterval

  public init(
    releasedEvidenceLifetime: TimeInterval = 48 * 3_600,
    absoluteMaximumAge: TimeInterval = 7 * 86_400
  ) {
    self.releasedEvidenceLifetime = releasedEvidenceLifetime
    self.absoluteMaximumAge = absoluteMaximumAge
  }
}

public struct RetentionResult: Codable, Equatable, Sendable {
  public let deletedSignals: Int
  public let deletedBlocks: Int
  public let tombstoneIDs: [UUID]
}

public struct RetentionTombstone: Codable, Equatable, Identifiable, Sendable {
  public enum Reason: String, Codable, Sendable {
    case absoluteMaximumAge
    case releasedDay
  }

  public let id: UUID
  public let reason: Reason
  public let deletedAt: Date
  public let deletedSignals: Int
  public let deletedBlocks: Int
}

private struct LocalDatabaseState: Codable {
  var outbox: [OutboxItem] = []
  var signals: [ActivitySignal] = []
  var activityBlocks: [ActivityBlock] = []
  var issueCandidates: IssueCandidateSnapshot?
  var correctionMemories: CorrectionMemorySnapshot?
  var syncedDraftReferences: [String: Date] = [:]
  var captureConfiguration: LocalCaptureConfiguration?
  var releasedDays: [String: Date] = [:]
  var retentionTombstones: [RetentionTombstone] = []

  private enum CodingKeys: String, CodingKey {
    case outbox
    case signals
    case activityBlocks
    case issueCandidates
    case correctionMemories
    case syncedDraftReferences
    case captureConfiguration
    case releasedDays
    case retentionTombstones
  }

  init() {}

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    outbox = try container.decodeIfPresent([OutboxItem].self, forKey: .outbox) ?? []
    signals = try container.decodeIfPresent([ActivitySignal].self, forKey: .signals) ?? []
    activityBlocks =
      try container.decodeIfPresent([ActivityBlock].self, forKey: .activityBlocks) ?? []
    issueCandidates = try container.decodeIfPresent(
      IssueCandidateSnapshot.self,
      forKey: .issueCandidates
    )
    correctionMemories = try container.decodeIfPresent(
      CorrectionMemorySnapshot.self,
      forKey: .correctionMemories
    )
    syncedDraftReferences =
      try container.decodeIfPresent([String: Date].self, forKey: .syncedDraftReferences) ?? [:]
    captureConfiguration = try container.decodeIfPresent(
      LocalCaptureConfiguration.self,
      forKey: .captureConfiguration
    )
    releasedDays = try container.decodeIfPresent([String: Date].self, forKey: .releasedDays) ?? [:]
    retentionTombstones =
      try container.decodeIfPresent([RetentionTombstone].self, forKey: .retentionTombstones) ?? []
  }
}

public actor EncryptedLocalDatabase {
  private let fileURL: URL
  private let key: SymmetricKey
  private let fileManager: FileManager
  private var state: LocalDatabaseState

  public init(fileURL: URL, key: SymmetricKey, fileManager: FileManager = .default) throws {
    self.fileURL = fileURL
    self.key = key
    self.fileManager = fileManager
    if fileManager.fileExists(atPath: fileURL.path) {
      let combined = try Data(contentsOf: fileURL)
      let box = try AES.GCM.SealedBox(combined: combined)
      let plaintext = try AES.GCM.open(box, using: key)
      let decoder = JSONDecoder()
      decoder.dateDecodingStrategy = .iso8601
      state = try decoder.decode(LocalDatabaseState.self, from: plaintext)
    } else {
      state = LocalDatabaseState()
    }
  }

  @discardableResult
  public func enqueue(_ draft: DerivedDraft, now: Date = Date()) throws -> UUID {
    if let existing = state.outbox.first(where: { $0.draft.sourceReference == draft.sourceReference }) {
      return existing.id
    }
    let item = OutboxItem(
      id: UUID(),
      draft: draft,
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now
    )
    state.outbox.append(item)
    try persist()
    return item.id
  }

  @discardableResult
  public func enqueueIfNeeded(_ draft: DerivedDraft, now: Date = Date()) throws -> Bool {
    guard state.syncedDraftReferences[draft.sourceReference] == nil else { return false }
    guard !state.outbox.contains(where: { $0.draft.sourceReference == draft.sourceReference }) else {
      return false
    }
    state.outbox.append(
      OutboxItem(
        id: UUID(),
        draft: draft,
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now
      )
    )
    try persist()
    return true
  }

  public func dueItems(now: Date = Date()) -> [OutboxItem] {
    state.outbox
      .filter { $0.nextAttemptAt <= now }
      .sorted { $0.createdAt < $1.createdAt }
  }

  public func allOutboxItems() -> [OutboxItem] {
    state.outbox.sorted { $0.createdAt < $1.createdAt }
  }

  public func recordSignal(_ signal: ActivitySignal) throws {
    guard !state.signals.contains(where: { $0.id == signal.id }) else { return }
    state.signals.append(signal)
    state.signals.sort { $0.occurredAt < $1.occurredAt }
    try persist()
  }

  public func allSignals() -> [ActivitySignal] {
    state.signals.sorted { $0.occurredAt < $1.occurredAt }
  }

  public func replaceActivityBlocks(_ blocks: [ActivityBlock]) throws {
    state.activityBlocks = blocks.sorted { $0.startedAt < $1.startedAt }
    try persist()
  }

  public func allActivityBlocks() -> [ActivityBlock] {
    state.activityBlocks.sorted { $0.startedAt < $1.startedAt }
  }

  public func replaceIssueCandidates(_ snapshot: IssueCandidateSnapshot) throws {
    state.issueCandidates = snapshot
    try persist()
  }

  public func issueCandidateSnapshot() -> IssueCandidateSnapshot? {
    state.issueCandidates
  }

  public func replaceCorrectionMemories(_ snapshot: CorrectionMemorySnapshot) throws {
    state.correctionMemories = snapshot
    try persist()
  }

  public func correctionMemorySnapshot() -> CorrectionMemorySnapshot? {
    state.correctionMemories
  }

  public func replaceCaptureConfiguration(_ configuration: LocalCaptureConfiguration) throws {
    state.captureConfiguration = configuration
    try persist()
  }

  public func captureConfiguration() -> LocalCaptureConfiguration? {
    state.captureConfiguration
  }

  public func markDayReleased(localDate: String, releasedAt: Date = Date()) throws {
    state.releasedDays[localDate] = releasedAt
    try persist()
  }

  public func replaceReleasedDays(_ releasedDays: [ReleasedDay]) throws {
    for releasedDay in releasedDays {
      state.releasedDays[releasedDay.localDate] = releasedDay.releasedAt
    }
    try persist()
  }

  public func releasedDays() -> [String: Date] {
    state.releasedDays
  }

  public func retentionTombstones() -> [RetentionTombstone] {
    state.retentionTombstones.sorted { $0.deletedAt < $1.deletedAt }
  }

  public func enforceRetention(
    now: Date = Date(),
    policy: RetentionPolicy = RetentionPolicy(),
    calendar: Calendar = .current
  ) throws -> RetentionResult {
    let absoluteCutoff = now.addingTimeInterval(-policy.absoluteMaximumAge)
    let releasedCutoff = now.addingTimeInterval(-policy.releasedEvidenceLifetime)

    let absoluteSignals = state.signals.filter { $0.occurredAt <= absoluteCutoff }
    let absoluteBlocks = state.activityBlocks.filter { $0.endedAt <= absoluteCutoff }
    let absoluteSignalIDs = Set(absoluteSignals.map(\.id))
    let absoluteBlockIDs = Set(absoluteBlocks.map(\.sourceReference))

    let releasedDates = Set(
      state.releasedDays.compactMap { localDate, releasedAt in
        releasedAt <= releasedCutoff ? localDate : nil
      }
    )
    let releasedSignals = state.signals.filter {
      !absoluteSignalIDs.contains($0.id) && releasedDates.contains(Self.localDate($0.occurredAt, calendar))
    }
    let releasedBlocks = state.activityBlocks.filter {
      !absoluteBlockIDs.contains($0.sourceReference) && releasedDates.contains($0.localDate)
    }
    let releasedSignalIDs = Set(releasedSignals.map(\.id))
    let releasedBlockIDs = Set(releasedBlocks.map(\.sourceReference))

    state.signals.removeAll {
      absoluteSignalIDs.contains($0.id) || releasedSignalIDs.contains($0.id)
    }
    state.activityBlocks.removeAll {
      absoluteBlockIDs.contains($0.sourceReference) || releasedBlockIDs.contains($0.sourceReference)
    }
    state.syncedDraftReferences = state.syncedDraftReferences.filter { $0.value > absoluteCutoff }

    var tombstoneIDs: [UUID] = []
    if !absoluteSignals.isEmpty || !absoluteBlocks.isEmpty {
      let tombstone = RetentionTombstone(
        id: UUID(),
        reason: .absoluteMaximumAge,
        deletedAt: now,
        deletedSignals: absoluteSignals.count,
        deletedBlocks: absoluteBlocks.count
      )
      state.retentionTombstones.append(tombstone)
      tombstoneIDs.append(tombstone.id)
    }
    if !releasedSignals.isEmpty || !releasedBlocks.isEmpty {
      let tombstone = RetentionTombstone(
        id: UUID(),
        reason: .releasedDay,
        deletedAt: now,
        deletedSignals: releasedSignals.count,
        deletedBlocks: releasedBlocks.count
      )
      state.retentionTombstones.append(tombstone)
      tombstoneIDs.append(tombstone.id)
    }

    try persist()
    return RetentionResult(
      deletedSignals: absoluteSignals.count + releasedSignals.count,
      deletedBlocks: absoluteBlocks.count + releasedBlocks.count,
      tombstoneIDs: tombstoneIDs
    )
  }

  public func markSucceeded(ids: [UUID], now: Date = Date()) throws {
    let completed = Set(ids)
    for item in state.outbox where completed.contains(item.id) {
      state.syncedDraftReferences[item.draft.sourceReference] = now
    }
    state.outbox.removeAll { completed.contains($0.id) }
    try persist()
  }

  public func markFailed(ids: [UUID], now: Date = Date()) throws {
    let failed = Set(ids)
    for index in state.outbox.indices where failed.contains(state.outbox[index].id) {
      state.outbox[index].attemptCount += 1
      let exponent = min(state.outbox[index].attemptCount - 1, 6)
      let delay = min(60.0 * pow(2.0, Double(exponent)), 3_600.0)
      state.outbox[index].nextAttemptAt = now.addingTimeInterval(delay)
    }
    try persist()
  }

  private func persist() throws {
    let directory = fileURL.deletingLastPathComponent()
    try fileManager.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700]
    )
    try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let plaintext = try encoder.encode(state)
    let box = try AES.GCM.seal(plaintext, using: key)
    guard let combined = box.combined else {
      throw EncryptedLocalDatabaseError.unavailableCombinedRepresentation
    }
    try combined.write(to: fileURL, options: .atomic)
    try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
  }

  private static func localDate(_ date: Date, _ calendar: Calendar) -> String {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }
}
