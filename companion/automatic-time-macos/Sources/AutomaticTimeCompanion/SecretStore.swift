import CryptoKit
import Foundation
import Security

public protocol SecretStore: AnyObject {
  func save(_ data: Data, account: String) throws
  func load(account: String) throws -> Data?
  func delete(account: String) throws
}

public enum SecretStoreError: Error, Equatable {
  case unexpectedStatus(OSStatus)
  case invalidData
}

public final class KeychainSecretStore: SecretStore {
  private let service: String

  public init(service: String = "dev.weaver.automatic-time") {
    self.service = service
  }

  public func save(_ data: Data, account: String) throws {
    let query = baseQuery(account: account)
    let updateStatus = SecItemUpdate(
      query as CFDictionary,
      [kSecValueData as String: data] as CFDictionary
    )
    if updateStatus == errSecSuccess { return }
    guard updateStatus == errSecItemNotFound else {
      throw SecretStoreError.unexpectedStatus(updateStatus)
    }

    let status = SecItemAdd(
      query.merging([
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      ]) { _, new in new } as CFDictionary,
      nil
    )
    guard status == errSecSuccess else {
      throw SecretStoreError.unexpectedStatus(status)
    }
  }

  public func load(account: String) throws -> Data? {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      baseQuery(account: account).merging([
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]) { _, new in new } as CFDictionary,
      &result
    )
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else {
      throw SecretStoreError.unexpectedStatus(status)
    }
    guard let data = result as? Data else {
      throw SecretStoreError.invalidData
    }
    return data
  }

  public func delete(account: String) throws {
    let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw SecretStoreError.unexpectedStatus(status)
    }
  }

  private func baseQuery(account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

public enum CredentialVaultError: Error, Equatable {
  case expired
  case invalidCredential
}

public final class DeviceCredentialVault {
  public static let account = "device-credential"
  private let secretStore: SecretStore

  public init(secretStore: SecretStore = KeychainSecretStore()) {
    self.secretStore = secretStore
  }

  public func save(_ credential: DeviceCredential) throws {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    try secretStore.save(encoder.encode(credential), account: Self.account)
  }

  public func loadValid(now: Date = Date()) throws -> DeviceCredential? {
    guard let data = try secretStore.load(account: Self.account) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let credential = try? decoder.decode(DeviceCredential.self, from: data) else {
      throw CredentialVaultError.invalidCredential
    }
    if credential.expiresAt <= now {
      try secretStore.delete(account: Self.account)
      throw CredentialVaultError.expired
    }
    return credential
  }

  public func delete() throws {
    try secretStore.delete(account: Self.account)
  }
}

public final class LocalEncryptionKeyVault {
  public static let account = "local-encryption-key"
  private let secretStore: SecretStore

  public init(secretStore: SecretStore = KeychainSecretStore()) {
    self.secretStore = secretStore
  }

  public func loadOrCreate() throws -> SymmetricKey {
    if let existing = try secretStore.load(account: Self.account) {
      guard existing.count == 32 else { throw SecretStoreError.invalidData }
      return SymmetricKey(data: existing)
    }
    let key = SymmetricKey(size: .bits256)
    let data = key.withUnsafeBytes { Data($0) }
    try secretStore.save(data, account: Self.account)
    return key
  }
}
