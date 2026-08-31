import CryptoKit
import Foundation

public struct BrowserMetadata: Codable, Equatable, Sendable {
  public let domain: String
  public let title: String?

  public init(domain: String, title: String?) {
    self.domain = domain
    self.title = title
  }
}

public struct GitMetadata: Codable, Equatable, Sendable {
  public let repositoryFingerprint: String
  public let branch: String
  public let commit: String

  public init(repositoryFingerprint: String, branch: String, commit: String) {
    self.repositoryFingerprint = repositoryFingerprint
    self.branch = branch
    self.commit = commit
  }
}

public struct CapturedContext: Codable, Equatable, Hashable, Sendable {
  public let applicationBundleIdentifier: String
  public let applicationName: String
  public let windowTitle: String?
  public let browserDomain: String?
  public let browserTitle: String?
  public let repositoryFingerprint: String?
  public let gitBranch: String?
  public let gitCommit: String?
  public let weaverIssueKey: String?

  public init(
    applicationBundleIdentifier: String,
    applicationName: String,
    windowTitle: String? = nil,
    browserDomain: String? = nil,
    browserTitle: String? = nil,
    repositoryFingerprint: String? = nil,
    gitBranch: String? = nil,
    gitCommit: String? = nil,
    weaverIssueKey: String? = nil
  ) {
    self.applicationBundleIdentifier = applicationBundleIdentifier
    self.applicationName = applicationName
    self.windowTitle = windowTitle
    self.browserDomain = browserDomain
    self.browserTitle = browserTitle
    self.repositoryFingerprint = repositoryFingerprint
    self.gitBranch = gitBranch
    self.gitCommit = gitCommit
    self.weaverIssueKey = weaverIssueKey
  }

  public var exactIssueKey: String? {
    if let explicit = Self.normalizedIssueKey(weaverIssueKey) { return explicit }
    for value in [gitBranch, windowTitle, browserTitle] {
      if let issueKey = Self.firstIssueKey(in: value) { return issueKey }
    }
    return nil
  }

  private static func normalizedIssueKey(_ value: String?) -> String? {
    guard let value else { return nil }
    let candidate = value.uppercased()
    guard candidate.range(of: "^[A-Z][A-Z0-9]+-[0-9]+$", options: .regularExpression) != nil
    else { return nil }
    return candidate
  }

  private static func firstIssueKey(in value: String?) -> String? {
    guard let value else { return nil }
    let uppercased = value.uppercased()
    guard
      let range = uppercased.range(
        of: "(?<![A-Z0-9])[A-Z][A-Z0-9]+-[0-9]+(?![A-Z0-9])",
        options: .regularExpression
      )
    else { return nil }
    return String(uppercased[range])
  }

  func replacing(
    windowTitle: String?? = nil,
    browserDomain: String?? = nil,
    browserTitle: String?? = nil,
    repositoryFingerprint: String?? = nil,
    gitBranch: String?? = nil,
    gitCommit: String?? = nil
  ) -> CapturedContext {
    CapturedContext(
      applicationBundleIdentifier: applicationBundleIdentifier,
      applicationName: applicationName,
      windowTitle: windowTitle ?? self.windowTitle,
      browserDomain: browserDomain ?? self.browserDomain,
      browserTitle: browserTitle ?? self.browserTitle,
      repositoryFingerprint: repositoryFingerprint ?? self.repositoryFingerprint,
      gitBranch: gitBranch ?? self.gitBranch,
      gitCommit: gitCommit ?? self.gitCommit,
      weaverIssueKey: weaverIssueKey
    )
  }
}

public struct CapturePrivacySettings: Codable, Equatable, Sendable {
  public var captureWindowTitles: Bool
  public var captureBrowserMetadata: Bool
  public var applicationExclusions: Set<String>
  public var domainExclusions: Set<String>
  public var repositoryExclusions: Set<String>

  public init(
    captureWindowTitles: Bool = false,
    captureBrowserMetadata: Bool = false,
    applicationExclusions: Set<String> = [],
    domainExclusions: Set<String> = [],
    repositoryExclusions: Set<String> = []
  ) {
    self.captureWindowTitles = captureWindowTitles
    self.captureBrowserMetadata = captureBrowserMetadata
    self.applicationExclusions = applicationExclusions
    self.domainExclusions = domainExclusions
    self.repositoryExclusions = repositoryExclusions
  }
}

public struct LocalCaptureConfiguration: Codable, Equatable, Sendable {
  public let privacySettings: CapturePrivacySettings
  public let repositoryPath: String?
  public let repositoryExclusionPaths: [String]
  public let activeIssueKey: String?
  public let assignmentRules: AssignmentRules
  public let localInference: LocalInferencePreference

  public init(
    privacySettings: CapturePrivacySettings,
    repositoryPath: String? = nil,
    repositoryExclusionPaths: [String] = [],
    activeIssueKey: String? = nil,
    assignmentRules: AssignmentRules = AssignmentRules(),
    localInference: LocalInferencePreference = LocalInferencePreference()
  ) {
    self.privacySettings = privacySettings
    self.repositoryPath = repositoryPath
    self.repositoryExclusionPaths = repositoryExclusionPaths
    self.activeIssueKey = activeIssueKey
    self.assignmentRules = assignmentRules
    self.localInference = localInference
  }

  private enum CodingKeys: String, CodingKey {
    case privacySettings
    case repositoryPath
    case repositoryExclusionPaths
    case activeIssueKey
    case assignmentRules
    case localInference
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    privacySettings = try container.decode(CapturePrivacySettings.self, forKey: .privacySettings)
    repositoryPath = try container.decodeIfPresent(String.self, forKey: .repositoryPath)
    repositoryExclusionPaths =
      try container.decodeIfPresent([String].self, forKey: .repositoryExclusionPaths) ?? []
    activeIssueKey = try container.decodeIfPresent(String.self, forKey: .activeIssueKey)
    assignmentRules =
      try container.decodeIfPresent(AssignmentRules.self, forKey: .assignmentRules)
      ?? AssignmentRules()
    localInference =
      try container.decodeIfPresent(LocalInferencePreference.self, forKey: .localInference)
      ?? LocalInferencePreference()
  }
}

public struct LocalInferencePreference: Codable, Equatable, Sendable {
  public let isEnabled: Bool
  public let endpoint: String
  public let model: String

  public init(
    isEnabled: Bool = false,
    endpoint: String = "http://127.0.0.1:8000/v1",
    model: String = ""
  ) {
    self.isEnabled = isEnabled
    self.endpoint = endpoint
    self.model = model
  }
}

public enum CapturePrivacyFilter {
  public static func apply(
    _ context: CapturedContext,
    settings: CapturePrivacySettings
  ) -> CapturedContext? {
    let applicationExclusions = normalized(settings.applicationExclusions)
    if applicationExclusions.contains(context.applicationBundleIdentifier.lowercased())
      || applicationExclusions.contains(context.applicationName.lowercased())
    {
      return nil
    }

    var filtered = context
    if !settings.captureWindowTitles {
      filtered = filtered.replacing(windowTitle: .some(nil))
    }

    let domain = context.browserDomain?.lowercased()
    let domainExcluded = domain.map { excludedDomain($0, exclusions: settings.domainExclusions) }
      ?? false
    if !settings.captureBrowserMetadata || domainExcluded {
      filtered = filtered.replacing(
        browserDomain: .some(nil),
        browserTitle: .some(nil)
      )
    }

    if let fingerprint = context.repositoryFingerprint,
      normalized(settings.repositoryExclusions).contains(fingerprint.lowercased())
    {
      filtered = filtered.replacing(
        repositoryFingerprint: .some(nil),
        gitBranch: .some(nil),
        gitCommit: .some(nil)
      )
    }
    return filtered
  }

  private static func normalized(_ values: Set<String>) -> Set<String> {
    Set(values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
  }

  private static func excludedDomain(_ domain: String, exclusions: Set<String>) -> Bool {
    normalized(exclusions).contains { excluded in
      domain == excluded || domain.hasSuffix(".\(excluded)")
    }
  }
}

public enum BrowserMetadataSanitizer {
  public static func metadata(urlString: String, title: String?) -> BrowserMetadata? {
    guard
      let components = URLComponents(string: urlString),
      components.scheme == "http" || components.scheme == "https",
      let host = components.host?.lowercased(),
      !host.isEmpty
    else { return nil }
    let normalizedHost = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    let normalizedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
    return BrowserMetadata(
      domain: normalizedHost,
      title: normalizedTitle?.isEmpty == false ? String(normalizedTitle!.prefix(500)) : nil
    )
  }
}

public enum ActivitySignalKind: String, Codable, Equatable, Sendable {
  case context
  case idleStarted
  case idleEnded
  case paused
  case resumed
  case locked
  case unlocked
  case sleep
  case wake
  case gap
}

public struct ActivitySignal: Codable, Equatable, Identifiable, Sendable {
  public let id: UUID
  public let occurredAt: Date
  public let kind: ActivitySignalKind
  public let context: CapturedContext?

  public init(
    id: UUID = UUID(),
    occurredAt: Date,
    kind: ActivitySignalKind,
    context: CapturedContext? = nil
  ) {
    self.id = id
    self.occurredAt = occurredAt
    self.kind = kind
    self.context = context
  }

  public static func context(
    _ context: CapturedContext,
    at date: Date,
    id: UUID = UUID()
  ) -> ActivitySignal {
    ActivitySignal(id: id, occurredAt: date, kind: .context, context: context)
  }

  public static func lifecycle(
    _ kind: ActivitySignalKind,
    at date: Date,
    id: UUID = UUID()
  ) -> ActivitySignal {
    ActivitySignal(id: id, occurredAt: date, kind: kind)
  }
}

public struct ActivityBlock: Codable, Equatable, Identifiable, Sendable {
  public var id: String { sourceReference }
  public let sourceReference: String
  public let localDate: String
  public let startedAt: Date
  public let endedAt: Date
  public let capturedSeconds: Int
  public let context: CapturedContext
  public let evidenceDigest: String

  public init(
    sourceReference: String,
    localDate: String,
    startedAt: Date,
    endedAt: Date,
    capturedSeconds: Int,
    context: CapturedContext,
    evidenceDigest: String
  ) {
    self.sourceReference = sourceReference
    self.localDate = localDate
    self.startedAt = startedAt
    self.endedAt = endedAt
    self.capturedSeconds = capturedSeconds
    self.context = context
    self.evidenceDigest = evidenceDigest
  }
}

public struct IssueCandidate: Codable, Equatable, Sendable {
  public let id: String
  public let key: String
  public let summary: String
  public let projectKey: String?
  public let statusCategory: String?
  public let assigneeId: String?
  public let updatedAt: String?

  public init(
    id: String,
    key: String,
    summary: String,
    projectKey: String? = nil,
    statusCategory: String? = nil,
    assigneeId: String? = nil,
    updatedAt: String? = nil
  ) {
    self.id = id
    self.key = key
    self.summary = summary
    self.projectKey = projectKey
    self.statusCategory = statusCategory
    self.assigneeId = assigneeId
    self.updatedAt = updatedAt
  }
}

public struct IssueCandidateSnapshot: Codable, Equatable, Sendable {
  public let fetchedAt: Date
  public let candidates: [IssueCandidate]

  public init(fetchedAt: Date, candidates: [IssueCandidate]) {
    self.fetchedAt = fetchedAt
    self.candidates = candidates
  }
}

func sha256Hex(_ value: String) -> String {
  let digest = SHA256.hash(data: Data(value.utf8))
  return digest.map { String(format: "%02x", $0) }.joined()
}
