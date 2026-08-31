import Foundation

public protocol CorrectionMemoryTransport: AnyObject, Sendable {
  func fetchCorrectionMemories(credential: DeviceCredential) async throws -> [CorrectionMemory]
}

public final class CorrectionMemorySynchronizer: @unchecked Sendable {
  private let database: EncryptedLocalDatabase
  private let transport: CorrectionMemoryTransport
  private let maximumMemories: Int

  public init(
    database: EncryptedLocalDatabase,
    transport: CorrectionMemoryTransport,
    maximumMemories: Int = 200
  ) {
    self.database = database
    self.transport = transport
    self.maximumMemories = max(1, maximumMemories)
  }

  @discardableResult
  public func synchronize(credential: DeviceCredential, now: Date = Date()) async throws -> Int {
    let memories = Array(
      try await transport.fetchCorrectionMemories(credential: credential).prefix(maximumMemories)
    )
    try await database.replaceCorrectionMemories(
      CorrectionMemorySnapshot(fetchedAt: now, memories: memories)
    )
    return memories.count
  }
}
