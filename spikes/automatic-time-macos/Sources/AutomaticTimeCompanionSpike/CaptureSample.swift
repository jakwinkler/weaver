import Foundation

public struct CaptureSample: Codable, Equatable, Sendable {
  public let capturedAt: Date
  public let applicationName: String?
  public let bundleIdentifier: String?
  public let windowTitle: String?
  public let gitRepository: String?
  public let gitBranch: String?

  public init(
    capturedAt: Date,
    applicationName: String?,
    bundleIdentifier: String?,
    windowTitle: String?,
    gitRepository: String?,
    gitBranch: String?
  ) {
    self.capturedAt = capturedAt
    self.applicationName = applicationName
    self.bundleIdentifier = bundleIdentifier
    self.windowTitle = windowTitle
    self.gitRepository = gitRepository
    self.gitBranch = gitBranch
  }
}
