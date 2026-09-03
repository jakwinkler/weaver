import AppKit
import ApplicationServices
import Foundation

public struct CapturedApplication: Equatable, Sendable {
  public let bundleIdentifier: String
  public let displayName: String
  public let processIdentifier: pid_t

  public init(bundleIdentifier: String, displayName: String, processIdentifier: pid_t) {
    self.bundleIdentifier = bundleIdentifier
    self.displayName = displayName
    self.processIdentifier = processIdentifier
  }
}

public protocol FrontmostApplicationCapturing: AnyObject {
  func capture() -> CapturedApplication?
}

public final class WorkspaceFrontmostApplicationCapture: FrontmostApplicationCapturing {
  public init() {}

  public func capture() -> CapturedApplication? {
    guard let application = NSWorkspace.shared.frontmostApplication else { return nil }
    return CapturedApplication(
      bundleIdentifier: application.bundleIdentifier ?? "unknown",
      displayName: application.localizedName ?? "Unknown application",
      processIdentifier: application.processIdentifier
    )
  }
}

public protocol WindowTitleCapturing: AnyObject {
  var isTrusted: Bool { get }
  func requestPermission()
  func capture(processIdentifier: pid_t) -> String?
}

public final class AccessibilityWindowTitleCapture: WindowTitleCapturing {
  public init() {}

  public var isTrusted: Bool { AXIsProcessTrusted() }

  public func requestPermission() {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true]
    _ = AXIsProcessTrustedWithOptions(options as CFDictionary)
  }

  public func capture(processIdentifier: pid_t) -> String? {
    guard isTrusted else { return nil }
    let application = AXUIElementCreateApplication(processIdentifier)
    var windowValue: CFTypeRef?
    guard
      AXUIElementCopyAttributeValue(
        application,
        kAXFocusedWindowAttribute as CFString,
        &windowValue
      ) == .success,
      let windowValue
    else { return nil }
    let window = unsafeBitCast(windowValue, to: AXUIElement.self)
    var titleValue: CFTypeRef?
    guard
      AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &titleValue) == .success
    else { return nil }
    return (titleValue as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

public protocol BrowserMetadataCapturing: AnyObject {
  func capture(bundleIdentifier: String) -> BrowserMetadata?
}

public final class AppleScriptBrowserMetadataCapture: BrowserMetadataCapturing {
  private let applicationNames = [
    "com.apple.Safari": "Safari",
    "com.google.Chrome": "Google Chrome",
    "com.google.Chrome.beta": "Google Chrome Beta",
    "com.brave.Browser": "Brave Browser",
    "com.microsoft.edgemac": "Microsoft Edge",
  ]

  public init() {}

  public func capture(bundleIdentifier: String) -> BrowserMetadata? {
    guard let applicationName = applicationNames[bundleIdentifier] else { return nil }
    let script: String
    if bundleIdentifier == "com.apple.Safari" {
      script = """
        tell application "Safari"
          if (count of windows) is 0 then return ""
          set activeURL to URL of current tab of front window
          set activeTitle to name of current tab of front window
          return activeURL & (ASCII character 31) & activeTitle
        end tell
        """
    } else {
      script = """
        tell application "\(applicationName)"
          if (count of windows) is 0 then return ""
          set activeURL to URL of active tab of front window
          set activeTitle to title of active tab of front window
          return activeURL & (ASCII character 31) & activeTitle
        end tell
        """
    }
    var error: NSDictionary?
    guard
      let value = NSAppleScript(source: script)?.executeAndReturnError(&error).stringValue,
      error == nil
    else { return nil }
    let fields = value.split(separator: "\u{001f}", maxSplits: 1, omittingEmptySubsequences: false)
    guard let url = fields.first else { return nil }
    let title = fields.count == 2 ? String(fields[1]) : nil
    return BrowserMetadataSanitizer.metadata(urlString: String(url), title: title)
  }
}

public protocol IdleMonitoring: AnyObject {
  func isIdle(threshold: TimeInterval) -> Bool
}

public final class EventSourceIdleMonitor: IdleMonitoring {
  public init() {}

  public func isIdle(threshold: TimeInterval) -> Bool {
    CGEventSource.secondsSinceLastEventType(
      .combinedSessionState,
      eventType: .null
    ) >= threshold
  }
}

public final class MacOSContextCapture {
  private let applicationCapture: FrontmostApplicationCapturing
  private let windowCapture: WindowTitleCapturing
  private let browserCapture: BrowserMetadataCapturing
  private let gitCapture: GitMetadataCapture

  public init(
    applicationCapture: FrontmostApplicationCapturing = WorkspaceFrontmostApplicationCapture(),
    windowCapture: WindowTitleCapturing = AccessibilityWindowTitleCapture(),
    browserCapture: BrowserMetadataCapturing = AppleScriptBrowserMetadataCapture(),
    gitCapture: GitMetadataCapture = GitMetadataCapture()
  ) {
    self.applicationCapture = applicationCapture
    self.windowCapture = windowCapture
    self.browserCapture = browserCapture
    self.gitCapture = gitCapture
  }

  public var hasWindowTitlePermission: Bool { windowCapture.isTrusted }

  public func requestWindowTitlePermission() {
    windowCapture.requestPermission()
  }

  public func capture(
    settings: CapturePrivacySettings,
    repositoryURL: URL? = nil,
    weaverIssueKey: String? = nil
  ) -> CapturedContext? {
    guard let application = applicationCapture.capture() else { return nil }
    let base = CapturedContext(
      applicationBundleIdentifier: application.bundleIdentifier,
      applicationName: application.displayName,
      weaverIssueKey: weaverIssueKey
    )
    guard CapturePrivacyFilter.apply(base, settings: settings) != nil else { return nil }

    let windowTitle = settings.captureWindowTitles
      ? windowCapture.capture(processIdentifier: application.processIdentifier)
      : nil
    let browser = settings.captureBrowserMetadata
      ? browserCapture.capture(bundleIdentifier: application.bundleIdentifier)
      : nil
    var git: GitMetadata?
    if let repositoryURL {
      git = try? gitCapture.capture(
        repositoryURL: repositoryURL,
        exclusions: settings.repositoryExclusions
      )
    }
    let captured = CapturedContext(
      applicationBundleIdentifier: application.bundleIdentifier,
      applicationName: application.displayName,
      windowTitle: windowTitle,
      browserDomain: browser?.domain,
      browserTitle: browser?.title,
      repositoryFingerprint: git?.repositoryFingerprint,
      gitBranch: git?.branch,
      gitCommit: git?.commit,
      weaverIssueKey: weaverIssueKey
    )
    return CapturePrivacyFilter.apply(captured, settings: settings)
  }
}

public actor MacOSCaptureCoordinator {
  private let database: EncryptedLocalDatabase
  private let contextCapture: MacOSContextCapture
  private let idleMonitor: IdleMonitoring
  private var settings: CapturePrivacySettings
  private var repositoryURL: URL?
  private var weaverIssueKey: String?
  private var pausedUntil: Date?
  private var isPaused = false
  private var isIdle = false
  private var isLocked = false
  private var isSleeping = false
  private let idleThreshold: TimeInterval
  private let segmenter: DeterministicSegmenter

  public init(
    database: EncryptedLocalDatabase,
    contextCapture: MacOSContextCapture = MacOSContextCapture(),
    idleMonitor: IdleMonitoring = EventSourceIdleMonitor(),
    settings: CapturePrivacySettings = CapturePrivacySettings(),
    repositoryURL: URL? = nil,
    idleThreshold: TimeInterval = 5 * 60,
    segmenter: DeterministicSegmenter = DeterministicSegmenter()
  ) {
    self.database = database
    self.contextCapture = contextCapture
    self.idleMonitor = idleMonitor
    self.settings = settings
    self.repositoryURL = repositoryURL
    self.idleThreshold = idleThreshold
    self.segmenter = segmenter
  }

  public func update(
    settings: CapturePrivacySettings,
    repositoryURL: URL?,
    weaverIssueKey: String? = nil
  ) {
    self.settings = settings
    self.repositoryURL = repositoryURL
    self.weaverIssueKey = weaverIssueKey
  }

  public func sample(now: Date = Date()) async throws {
    if isPaused, let pausedUntil, pausedUntil <= now {
      try await resume(now: now)
    }
    let idle = idleMonitor.isIdle(threshold: idleThreshold)
    if idle != isIdle {
      isIdle = idle
      try await recordLifecycle(idle ? .idleStarted : .idleEnded, now: now)
    }
    if !isPaused, !isIdle, !isLocked, !isSleeping,
      let context = contextCapture.capture(
        settings: settings,
        repositoryURL: repositoryURL,
        weaverIssueKey: weaverIssueKey
      )
    {
      try await database.recordSignal(.context(context, at: now))
    }
    try await rebuildBlocks(through: now)
  }

  public func pause(for duration: TimeInterval? = nil, now: Date = Date()) async throws {
    guard !isPaused else {
      pausedUntil = duration.map { now.addingTimeInterval($0) }
      return
    }
    isPaused = true
    pausedUntil = duration.map { now.addingTimeInterval($0) }
    try await recordLifecycle(.paused, now: now)
  }

  public func resume(now: Date = Date()) async throws {
    guard isPaused else { return }
    isPaused = false
    pausedUntil = nil
    try await recordLifecycle(.resumed, now: now)
  }

  public func captureIsPaused() -> Bool {
    isPaused
  }

  public func recordLifecycle(_ kind: ActivitySignalKind, now: Date = Date()) async throws {
    switch kind {
    case .idleStarted:
      isIdle = true
    case .idleEnded:
      isIdle = false
    case .paused:
      isPaused = true
    case .resumed:
      isPaused = false
    case .locked:
      isLocked = true
    case .unlocked:
      isLocked = false
    case .sleep:
      isSleeping = true
    case .wake:
      isSleeping = false
    case .context, .gap:
      break
    }
    try await database.recordSignal(.lifecycle(kind, at: now))
    try await rebuildBlocks(through: now)
  }

  public func enforceRetention(now: Date = Date()) async throws -> RetentionResult {
    try await database.enforceRetention(now: now)
  }

  private func rebuildBlocks(through date: Date) async throws {
    let signals = await database.allSignals()
    let blocks = try segmenter.segment(signals: signals, through: date)
    try await database.replaceActivityBlocks(blocks)
  }
}
