import Foundation

public protocol IssueCandidateTransport: AnyObject {
  func fetchIssueCandidates(credential: DeviceCredential) async throws -> [IssueCandidate]
}

public final class IssueCandidateSynchronizer {
  private let database: EncryptedLocalDatabase
  private let transport: IssueCandidateTransport
  private let maximumCandidates: Int

  public init(
    database: EncryptedLocalDatabase,
    transport: IssueCandidateTransport,
    maximumCandidates: Int = 100
  ) {
    self.database = database
    self.transport = transport
    self.maximumCandidates = max(1, maximumCandidates)
  }

  @discardableResult
  public func synchronize(credential: DeviceCredential, now: Date = Date()) async throws -> Int {
    let candidates = Array(
      try await transport.fetchIssueCandidates(credential: credential).prefix(maximumCandidates)
    )
    try await database.replaceIssueCandidates(
      IssueCandidateSnapshot(fetchedAt: now, candidates: candidates)
    )
    return candidates.count
  }
}
