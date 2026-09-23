import CryptoKit
import Foundation
import Security

public enum KeychainKeyProviderError: Error, Equatable {
  case invalidKeyData
  case unexpectedStatus(OSStatus)
}

public struct KeychainKeyProvider: Sendable {
  private let service: String
  private let account: String

  public init(
    service: String = "dev.weaver.automatic-time", account: String = "evidence-encryption-key"
  ) {
    self.service = service
    self.account = account
  }

  public func loadOrCreateKey() throws -> SymmetricKey {
    let existing = loadKeyData()
    switch existing.status {
    case errSecSuccess:
      guard let data = existing.data else {
        throw KeychainKeyProviderError.invalidKeyData
      }
      guard !data.isEmpty else {
        throw KeychainKeyProviderError.invalidKeyData
      }
      return SymmetricKey(data: data)
    case errSecItemNotFound:
      let key = SymmetricKey(size: .bits256)
      let data = key.withUnsafeBytes { Data($0) }
      let status = SecItemAdd(
        baseQuery().merging([
          kSecValueData as String: data,
          kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]) { _, new in new } as CFDictionary,
        nil
      )
      guard status == errSecSuccess else {
        throw KeychainKeyProviderError.unexpectedStatus(status)
      }
      return key
    default:
      throw KeychainKeyProviderError.unexpectedStatus(existing.status)
    }
  }

  private func loadKeyData() -> (data: Data?, status: OSStatus) {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      baseQuery().merging([
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]) { _, new in new } as CFDictionary,
      &result
    )
    guard status == errSecSuccess else {
      return (nil, status)
    }
    guard let data = result as? Data else {
      return (nil, errSecDecode)
    }
    return (data, errSecSuccess)
  }

  private func baseQuery() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}
