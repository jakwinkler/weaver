import AppKit
import AutomaticTimeCompanion
import Foundation

@MainActor
final class MacOSLifecycleMonitor {
  private let workspaceCenter = NSWorkspace.shared.notificationCenter
  private let distributedCenter = DistributedNotificationCenter.default()
  private var workspaceObservers: [NSObjectProtocol] = []
  private var distributedObservers: [NSObjectProtocol] = []

  init(handler: @escaping (ActivitySignalKind) -> Void) {
    workspaceObservers.append(
      workspaceCenter.addObserver(
        forName: NSWorkspace.willSleepNotification,
        object: nil,
        queue: .main
      ) { _ in handler(.sleep) }
    )
    workspaceObservers.append(
      workspaceCenter.addObserver(
        forName: NSWorkspace.didWakeNotification,
        object: nil,
        queue: .main
      ) { _ in handler(.wake) }
    )
    distributedObservers.append(
      distributedCenter.addObserver(
        forName: Notification.Name("com.apple.screenIsLocked"),
        object: nil,
        queue: .main
      ) { _ in handler(.locked) }
    )
    distributedObservers.append(
      distributedCenter.addObserver(
        forName: Notification.Name("com.apple.screenIsUnlocked"),
        object: nil,
        queue: .main
      ) { _ in handler(.unlocked) }
    )
  }

  deinit {
    for observer in workspaceObservers { workspaceCenter.removeObserver(observer) }
    for observer in distributedObservers { distributedCenter.removeObserver(observer) }
  }
}
