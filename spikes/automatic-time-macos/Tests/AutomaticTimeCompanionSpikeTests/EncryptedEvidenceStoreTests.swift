import CryptoKit
import Foundation
import Testing

@testable import AutomaticTimeCompanionSpike

struct EncryptedEvidenceStoreTests {
  private let key = SymmetricKey(size: .bits256)

  @Test
  func encryptsEvidenceAtRestAndRoundTrips() throws {
    try withTemporaryDirectory { directory in
      let store = EncryptedEvidenceStore(directory: directory, key: key)
      let sample = CaptureSample(
        capturedAt: Date(timeIntervalSince1970: 1_724_598_000),
        applicationName: "Synthetic Editor",
        bundleIdentifier: "dev.weaver.synthetic-editor",
        windowTitle: "WEAV-29 private synthetic title",
        gitRepository: "weaver",
        gitBranch: "29-automatic-time"
      )

      let url = try store.save(sample, named: "sample")
      let ciphertext = try Data(contentsOf: url)
      let plaintext = try JSONEncoder().encode(sample)

      #expect(ciphertext.range(of: plaintext) == nil)
      #expect(!String(decoding: ciphertext, as: UTF8.self).contains("private synthetic title"))
      #expect(try store.load(CaptureSample.self, named: "sample") == sample)

      let permissions =
        try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber
      #expect(permissions?.intValue == 0o600)
      let directoryPermissions =
        try FileManager.default.attributesOfItem(atPath: directory.path)[.posixPermissions]
        as? NSNumber
      #expect(directoryPermissions?.intValue == 0o700)
    }
  }

  @Test
  func purgesOnlyEncryptedEvidenceOlderThanTheCutoff() throws {
    try withTemporaryDirectory { directory in
      let store = EncryptedEvidenceStore(directory: directory, key: key)
      let sample = CaptureSample(
        capturedAt: Date(timeIntervalSince1970: 1_724_598_000),
        applicationName: "Synthetic Editor",
        bundleIdentifier: nil,
        windowTitle: nil,
        gitRepository: nil,
        gitBranch: nil
      )
      let oldURL = try store.save(sample, named: "old")
      let currentURL = try store.save(sample, named: "current")
      try FileManager.default.setAttributes(
        [.modificationDate: Date(timeIntervalSince1970: 100)],
        ofItemAtPath: oldURL.path
      )

      let removed = try store.purgeEvidence(olderThan: Date(timeIntervalSince1970: 200))

      #expect(removed.map(\.lastPathComponent) == [oldURL.lastPathComponent])
      #expect(!FileManager.default.fileExists(atPath: oldURL.path))
      #expect(FileManager.default.fileExists(atPath: currentURL.path))
    }
  }

  private func withTemporaryDirectory(_ body: (URL) throws -> Void) throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("weaver-automatic-time-spike-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    try body(directory)
  }
}
