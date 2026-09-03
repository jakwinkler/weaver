import Foundation

public struct ReleasedDay: Codable, Equatable, Sendable {
  public let localDate: String
  public let releasedAt: Date

  public init(localDate: String, releasedAt: Date) {
    self.localDate = localDate
    self.releasedAt = releasedAt
  }
}

public protocol RetentionStateTransport: AnyObject {
  func fetchReleasedDays(credential: DeviceCredential) async throws -> [ReleasedDay]
}

public final class RetentionStateSynchronizer {
  private let database: EncryptedLocalDatabase
  private let transport: RetentionStateTransport

  public init(database: EncryptedLocalDatabase, transport: RetentionStateTransport) {
    self.database = database
    self.transport = transport
  }

  @discardableResult
  public func synchronize(credential: DeviceCredential) async throws -> Int {
    let releasedDays = try await transport.fetchReleasedDays(credential: credential)
    try await database.replaceReleasedDays(releasedDays)
    return releasedDays.count
  }
}
