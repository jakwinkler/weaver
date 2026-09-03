import Foundation

public enum PairingCoordinatorError: Error, Equatable {
  case expired
}

public final class PairingCoordinator {
  private let transport: PairingTransport
  private let credentialVault: DeviceCredentialVault

  public init(transport: PairingTransport, credentialVault: DeviceCredentialVault) {
    self.transport = transport
    self.credentialVault = credentialVault
  }

  public func begin(displayName: String, companionVersion: String) async throws -> PairingSession {
    try await transport.requestPairing(
      displayName: displayName,
      companionVersion: companionVersion
    )
  }

  public func waitForApproval(_ pairing: PairingSession) async throws -> DeviceCredential {
    while Date() < pairing.expiresAt {
      switch try await transport.exchange(pairingCode: pairing.pairingCode) {
      case .pending:
        let delay = UInt64(max(pairing.intervalSeconds, 1)) * 1_000_000_000
        try await Task.sleep(nanoseconds: delay)
      case .paired(let credential):
        try credentialVault.save(credential)
        return credential
      }
    }
    throw PairingCoordinatorError.expired
  }
}
