import AppKit
@preconcurrency import ApplicationServices
import Foundation

public struct MacOSContextSnapshot: Equatable, Sendable {
  public let applicationName: String?
  public let bundleIdentifier: String?
  public let processIdentifier: pid_t?
  public let windowTitle: String?
  public let accessibilityTrusted: Bool
}

public struct MacOSCapabilityStatus: Equatable, Sendable {
  public let accessibilityTrusted: Bool
  public let frontmostApplicationAPIAvailable: Bool
  public let windowTitleCapturePermitted: Bool
}

public struct MacOSContextReader {
  public init() {}

  @MainActor
  public func probeCapabilities() -> MacOSCapabilityStatus {
    let trusted = accessibilityIsTrusted(prompt: false)
    let frontmostApplicationAvailable = NSWorkspace.shared.frontmostApplication != nil
    return MacOSCapabilityStatus(
      accessibilityTrusted: trusted,
      frontmostApplicationAPIAvailable: frontmostApplicationAvailable,
      windowTitleCapturePermitted: trusted && frontmostApplicationAvailable
    )
  }

  @MainActor
  public func capture(promptForAccessibility: Bool = false) -> MacOSContextSnapshot {
    let trusted = accessibilityIsTrusted(prompt: promptForAccessibility)
    guard let application = NSWorkspace.shared.frontmostApplication else {
      return MacOSContextSnapshot(
        applicationName: nil,
        bundleIdentifier: nil,
        processIdentifier: nil,
        windowTitle: nil,
        accessibilityTrusted: trusted
      )
    }

    return MacOSContextSnapshot(
      applicationName: application.localizedName,
      bundleIdentifier: application.bundleIdentifier,
      processIdentifier: application.processIdentifier,
      windowTitle: trusted
        ? focusedWindowTitle(processIdentifier: application.processIdentifier) : nil,
      accessibilityTrusted: trusted
    )
  }

  private func accessibilityIsTrusted(prompt: Bool) -> Bool {
    guard prompt else {
      return AXIsProcessTrusted()
    }
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true]
    return AXIsProcessTrustedWithOptions(options as CFDictionary)
  }

  private func focusedWindowTitle(processIdentifier: pid_t) -> String? {
    let application = AXUIElementCreateApplication(processIdentifier)
    var focusedWindowValue: CFTypeRef?
    let windowStatus = AXUIElementCopyAttributeValue(
      application,
      kAXFocusedWindowAttribute as CFString,
      &focusedWindowValue
    )
    guard
      windowStatus == .success,
      let focusedWindowValue,
      CFGetTypeID(focusedWindowValue) == AXUIElementGetTypeID()
    else {
      return nil
    }

    let focusedWindow = unsafeDowncast(focusedWindowValue, to: AXUIElement.self)
    var titleValue: CFTypeRef?
    let titleStatus = AXUIElementCopyAttributeValue(
      focusedWindow,
      kAXTitleAttribute as CFString,
      &titleValue
    )
    guard titleStatus == .success else {
      return nil
    }
    return titleValue as? String
  }
}
