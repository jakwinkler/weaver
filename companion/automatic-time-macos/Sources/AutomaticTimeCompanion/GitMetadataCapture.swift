import Foundation

public protocol GitCommandRunning: AnyObject {
  func run(arguments: [String], repositoryURL: URL) throws -> String
}

public enum GitMetadataCaptureError: Error, Equatable {
  case commandFailed(Int32)
  case invalidOutput
}

public final class ProcessGitCommandRunner: GitCommandRunning {
  public init() {}

  public func run(arguments: [String], repositoryURL: URL) throws -> String {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
    process.arguments = ["-C", repositoryURL.path] + arguments
    process.standardOutput = output
    process.standardError = Pipe()
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      throw GitMetadataCaptureError.commandFailed(process.terminationStatus)
    }
    let data = output.fileHandleForReading.readDataToEndOfFile()
    guard let value = String(data: data, encoding: .utf8) else {
      throw GitMetadataCaptureError.invalidOutput
    }
    return value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

public final class GitMetadataCapture {
  private let commandRunner: GitCommandRunning

  public init(commandRunner: GitCommandRunning = ProcessGitCommandRunner()) {
    self.commandRunner = commandRunner
  }

  public func fingerprint(repositoryURL: URL) -> String {
    sha256Hex(repositoryURL.standardizedFileURL.path)
  }

  public func capture(
    repositoryURL: URL,
    exclusions: Set<String>
  ) throws -> GitMetadata? {
    let fingerprint = fingerprint(repositoryURL: repositoryURL)
    if exclusions.map({ $0.lowercased() }).contains(fingerprint.lowercased()) { return nil }
    let branch = try commandRunner.run(
      arguments: ["rev-parse", "--abbrev-ref", "HEAD"],
      repositoryURL: repositoryURL
    )
    let commit = try commandRunner.run(
      arguments: ["rev-parse", "HEAD"],
      repositoryURL: repositoryURL
    )
    guard !branch.isEmpty, !commit.isEmpty else { throw GitMetadataCaptureError.invalidOutput }
    return GitMetadata(
      repositoryFingerprint: fingerprint,
      branch: String(branch.prefix(250)),
      commit: String(commit.prefix(64))
    )
  }
}
