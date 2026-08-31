import Foundation

public enum CompanionTransportError: Error, Equatable {
  case offline
  case unauthorized
  case server(status: Int)
  case invalidResponse
}

public protocol DraftTransport: AnyObject {
  func sync(drafts: [DerivedDraft], credential: DeviceCredential) async throws -> Int
}

public enum SyncOutcome: Equatable, Sendable {
  case idle
  case notPaired
  case credentialExpired
  case credentialRevoked
  case retryScheduled
  case synced(Int)
  case storageFailed
}

public final class OutboxSyncEngine {
  private let database: EncryptedLocalDatabase
  private let credentialVault: DeviceCredentialVault
  private let transport: DraftTransport

  public init(
    database: EncryptedLocalDatabase,
    credentialVault: DeviceCredentialVault,
    transport: DraftTransport
  ) {
    self.database = database
    self.credentialVault = credentialVault
    self.transport = transport
  }

  public func sync(now: Date = Date()) async -> SyncOutcome {
    let credential: DeviceCredential
    do {
      guard let loaded = try credentialVault.loadValid(now: now) else { return .notPaired }
      credential = loaded
    } catch CredentialVaultError.expired {
      return .credentialExpired
    } catch {
      return .notPaired
    }

    let items = await database.dueItems(now: now)
    if items.isEmpty { return .idle }

    do {
      let synced = try await transport.sync(
        drafts: items.map(\.draft),
        credential: credential
      )
      try await database.markSucceeded(ids: items.map(\.id))
      return .synced(synced)
    } catch CompanionTransportError.unauthorized {
      try? credentialVault.delete()
      return .credentialRevoked
    } catch {
      do {
        try await database.markFailed(ids: items.map(\.id), now: now)
      } catch {
        return .storageFailed
      }
      return .retryScheduled
    }
  }
}
