import CryptoKit
import Foundation

public enum EncryptedEvidenceStoreError: Error, Equatable {
  case invalidName
  case unavailableCombinedRepresentation
}

public struct EncryptedEvidenceStore {
  private let directory: URL
  private let key: SymmetricKey
  private let fileManager: FileManager

  public init(directory: URL, key: SymmetricKey, fileManager: FileManager = .default) {
    self.directory = directory
    self.key = key
    self.fileManager = fileManager
  }

  @discardableResult
  public func save<Value: Encodable>(_ value: Value, named name: String) throws -> URL {
    let url = try evidenceURL(named: name)
    try fileManager.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700]
    )
    try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)

    let plaintext = try JSONEncoder().encode(value)
    let sealedBox = try AES.GCM.seal(plaintext, using: key)
    guard let combined = sealedBox.combined else {
      throw EncryptedEvidenceStoreError.unavailableCombinedRepresentation
    }

    try combined.write(to: url, options: .atomic)
    try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    return url
  }

  public func load<Value: Decodable>(_ type: Value.Type, named name: String) throws -> Value {
    let url = try evidenceURL(named: name)
    let combined = try Data(contentsOf: url)
    let sealedBox = try AES.GCM.SealedBox(combined: combined)
    let plaintext = try AES.GCM.open(sealedBox, using: key)
    return try JSONDecoder().decode(type, from: plaintext)
  }

  @discardableResult
  public func purgeEvidence(olderThan cutoff: Date) throws -> [URL] {
    guard fileManager.fileExists(atPath: directory.path) else {
      return []
    }

    let keys: Set<URLResourceKey> = [.contentModificationDateKey, .isRegularFileKey]
    let files = try fileManager.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: Array(keys),
      options: [.skipsHiddenFiles]
    )
    var removed: [URL] = []

    for file in files where file.pathExtension == "weaver-evidence" {
      let values = try file.resourceValues(forKeys: keys)
      guard values.isRegularFile == true, let modifiedAt = values.contentModificationDate,
        modifiedAt < cutoff
      else {
        continue
      }
      try fileManager.removeItem(at: file)
      removed.append(file)
    }

    return removed.sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  private func evidenceURL(named name: String) throws -> URL {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
    guard !name.isEmpty, name.unicodeScalars.allSatisfy(allowed.contains) else {
      throw EncryptedEvidenceStoreError.invalidName
    }
    return directory.appendingPathComponent(name).appendingPathExtension("weaver-evidence")
  }
}
