import AutomaticTimeCompanionSpike
import Foundation

@main
struct AutomaticTimeSpikeCommand {
  @MainActor
  static func main() throws {
    let status = MacOSContextReader().probeCapabilities()
    let result: [String: Bool] = [
      "accessibilityTrusted": status.accessibilityTrusted,
      "frontmostApplicationAPIAvailable": status.frontmostApplicationAPIAvailable,
      "windowTitleCapturePermitted": status.windowTitleCapturePermitted,
    ]
    let data = try JSONSerialization.data(
      withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: data, as: UTF8.self))
  }
}
