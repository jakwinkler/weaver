import AppKit
import AutomaticTimeCompanion
import SwiftUI

@MainActor
final class CompanionAppModel: ObservableObject {
  @Published var apiBaseURL = UserDefaults.standard.string(forKey: "apiBaseURL")
    ?? "http://localhost:3000/api/v1"
  @Published var webBaseURL = UserDefaults.standard.string(forKey: "webBaseURL")
    ?? "http://localhost:5173"
  @Published var tenantID = UserDefaults.standard.string(forKey: "tenantID") ?? ""
  @Published var repositoryPath = ""
  @Published var activeIssueKey = ""
  @Published var applicationExclusions = ""
  @Published var domainExclusions = ""
  @Published var repositoryExclusions = ""
  @Published var captureWindowTitles = false
  @Published var captureBrowserMetadata = false
  @Published private(set) var pairingStatus = "Not paired"
  @Published private(set) var captureStatus = "Capture stopped"
  @Published private(set) var candidateStatus = "Candidates not synchronized"
  @Published private(set) var userCode = ""
  @Published private(set) var isPairing = false
  @Published private(set) var isCapturing = false
  @Published private(set) var isPaused = false

  private let credentialVault = DeviceCredentialVault()
  private let contextCapture = MacOSContextCapture()
  private var database: EncryptedLocalDatabase?
  private var captureCoordinator: MacOSCaptureCoordinator?
  private var lifecycleMonitor: MacOSLifecycleMonitor?
  private var captureTimer: Timer?

  init() {
    if (try? credentialVault.loadValid()) != nil {
      pairingStatus = "Paired"
    }
    do {
      let key = try LocalEncryptionKeyVault().loadOrCreate()
      let directory = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      ).appendingPathComponent("Weaver/AutomaticTime", isDirectory: true)
      let database = try EncryptedLocalDatabase(
        fileURL: directory.appendingPathComponent("automatic-time.store"),
        key: key
      )
      self.database = database
      Task { [weak self] in
        if let configuration = await database.captureConfiguration() {
          self?.apply(configuration)
        }
      }
      captureCoordinator = MacOSCaptureCoordinator(
        database: database,
        contextCapture: contextCapture,
        settings: privacySettings,
        repositoryURL: configuredRepositoryURL
      )
      lifecycleMonitor = MacOSLifecycleMonitor { [weak self] event in
        self?.recordLifecycle(event)
      }
    } catch {
      captureStatus = "Encrypted local storage is unavailable"
    }
  }

  deinit {
    captureTimer?.invalidate()
  }

  func pair() {
    guard
      let apiURL = URL(string: apiBaseURL),
      let webURL = URL(string: webBaseURL),
      !tenantID.isEmpty
    else {
      pairingStatus = "Add valid Weaver URLs and tenant ID"
      return
    }

    saveConfiguration()
    isPairing = true
    pairingStatus = "Requesting pairing"

    Task {
      do {
        let client = AutomaticTimeHTTPClient(apiBaseURL: apiURL, tenantID: tenantID)
        let coordinator = PairingCoordinator(
          transport: client,
          credentialVault: credentialVault
        )
        let session = try await coordinator.begin(
          displayName: Host.current().localizedName ?? "Mac",
          companionVersion: AutomaticTimeHTTPClient.companionVersion
        )
        userCode = session.userCode
        pairingStatus = "Approve \(session.userCode) in Weaver"
        if let approvalURL = URL(string: session.verificationUri, relativeTo: webURL)?.absoluteURL {
          NSWorkspace.shared.open(approvalURL)
        }
        _ = try await coordinator.waitForApproval(session)
        pairingStatus = "Paired"
        isPairing = false
        await synchronizeCandidates()
      } catch {
        pairingStatus = "Pairing failed. Retry when Weaver is reachable."
        isPairing = false
      }
    }
  }

  func forgetCredential() {
    try? credentialVault.delete()
    pairingStatus = "Not paired"
    candidateStatus = "Candidates not synchronized"
    userCode = ""
  }

  func startCapture() {
    guard let captureCoordinator else {
      captureStatus = "Encrypted local storage is unavailable"
      return
    }
    saveConfiguration()
    isCapturing = true
    isPaused = false
    captureStatus = captureDescription
    Task {
      await captureCoordinator.update(
        settings: privacySettings,
        repositoryURL: configuredRepositoryURL,
        weaverIssueKey: normalizedIssueKey
      )
      try? await captureCoordinator.resume()
      await sample()
    }
    scheduleCaptureTimer()
    Task { await synchronizeCandidates() }
  }

  func pauseCapture(duration: TimeInterval? = nil) {
    guard let captureCoordinator, isCapturing else { return }
    isPaused = true
    captureStatus = duration == nil ? "Capture paused" : "Capture paused for 30 minutes"
    Task { try? await captureCoordinator.pause(for: duration) }
  }

  func resumeCapture() {
    guard let captureCoordinator, isCapturing else { return }
    isPaused = false
    captureStatus = captureDescription
    Task {
      try? await captureCoordinator.resume()
      await sample()
    }
  }

  func stopCapture() {
    guard let captureCoordinator else { return }
    captureTimer?.invalidate()
    captureTimer = nil
    isCapturing = false
    isPaused = true
    captureStatus = "Capture stopped"
    Task { try? await captureCoordinator.pause() }
  }

  func requestWindowTitlePermission() {
    contextCapture.requestWindowTitlePermission()
    captureStatus = contextCapture.hasWindowTitlePermission
      ? captureDescription
      : "Accessibility permission requested in System Settings"
  }

  func synchronizeCandidates() async {
    guard
      let database,
      let credential = try? credentialVault.loadValid(),
      let apiURL = URL(string: apiBaseURL),
      !tenantID.isEmpty
    else {
      candidateStatus = "Pair before synchronizing candidates"
      return
    }
    do {
      let client = AutomaticTimeHTTPClient(apiBaseURL: apiURL, tenantID: tenantID)
      let count = try await IssueCandidateSynchronizer(
        database: database,
        transport: client
      ).synchronize(credential: credential)
      let releasedDayCount = try await RetentionStateSynchronizer(
        database: database,
        transport: client
      ).synchronize(credential: credential)
      if let captureCoordinator { _ = try await captureCoordinator.enforceRetention() }
      candidateStatus =
        "\(count) bounded Weaver candidates and \(releasedDayCount) released days cached"
    } catch CompanionTransportError.unauthorized {
      try? credentialVault.delete()
      pairingStatus = "Pairing was revoked or expired"
      candidateStatus = "Candidate synchronization stopped"
    } catch {
      candidateStatus = "Candidate synchronization will retry when Weaver is reachable"
    }
  }

  private var captureDescription: String {
    var fields = ["application"]
    if captureWindowTitles { fields.append("window title") }
    if captureBrowserMetadata { fields.append("browser domain and title") }
    if configuredRepositoryURL != nil { fields.append("Git metadata") }
    return "Capturing \(fields.joined(separator: ", ")) locally"
  }

  private var privacySettings: CapturePrivacySettings {
    CapturePrivacySettings(
      captureWindowTitles: captureWindowTitles,
      captureBrowserMetadata: captureBrowserMetadata,
      applicationExclusions: commaSeparated(applicationExclusions),
      domainExclusions: commaSeparated(domainExclusions),
      repositoryExclusions: Set(
        commaSeparated(repositoryExclusions).map {
          GitMetadataCapture().fingerprint(repositoryURL: URL(fileURLWithPath: $0))
        }
      )
    )
  }

  private var configuredRepositoryURL: URL? {
    let value = repositoryPath.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : URL(fileURLWithPath: value)
  }

  private var normalizedIssueKey: String? {
    let value = activeIssueKey.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return value.isEmpty ? nil : value
  }

  private func commaSeparated(_ value: String) -> Set<String> {
    Set(
      value.split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    )
  }

  private func saveConfiguration() {
    let values: [String: String] = [
      "apiBaseURL": apiBaseURL,
      "webBaseURL": webBaseURL,
      "tenantID": tenantID,
    ]
    for (key, value) in values { UserDefaults.standard.set(value, forKey: key) }
    guard let database else { return }
    let configuration = LocalCaptureConfiguration(
      privacySettings: privacySettings,
      repositoryPath: configuredRepositoryURL?.path,
      repositoryExclusionPaths: Array(commaSeparated(repositoryExclusions)).sorted(),
      activeIssueKey: normalizedIssueKey
    )
    Task {
      do {
        try await database.replaceCaptureConfiguration(configuration)
      } catch {
        captureStatus = "Capture settings could not be encrypted"
      }
    }
  }

  private func apply(_ configuration: LocalCaptureConfiguration) {
    captureWindowTitles = configuration.privacySettings.captureWindowTitles
    captureBrowserMetadata = configuration.privacySettings.captureBrowserMetadata
    applicationExclusions = configuration.privacySettings.applicationExclusions.sorted()
      .joined(separator: ", ")
    domainExclusions = configuration.privacySettings.domainExclusions.sorted()
      .joined(separator: ", ")
    repositoryExclusions = configuration.repositoryExclusionPaths.joined(separator: ", ")
    repositoryPath = configuration.repositoryPath ?? ""
    activeIssueKey = configuration.activeIssueKey ?? ""
  }

  private func scheduleCaptureTimer() {
    captureTimer?.invalidate()
    captureTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
      Task { @MainActor in await self?.sample() }
    }
  }

  private func sample() async {
    guard let captureCoordinator, isCapturing else { return }
    await captureCoordinator.update(
      settings: privacySettings,
      repositoryURL: configuredRepositoryURL,
      weaverIssueKey: normalizedIssueKey
    )
    do {
      try await captureCoordinator.sample()
      _ = try await captureCoordinator.enforceRetention()
      isPaused = await captureCoordinator.captureIsPaused()
      if !isPaused { captureStatus = captureDescription }
    } catch {
      captureStatus = "Capture storage failed. No missing interval will be inferred."
    }
  }

  private func recordLifecycle(_ event: ActivitySignalKind) {
    guard let captureCoordinator, isCapturing else { return }
    Task { try? await captureCoordinator.recordLifecycle(event) }
  }
}

@main
struct AutomaticTimeMenuBarApp: App {
  @StateObject private var model = CompanionAppModel()

  var body: some Scene {
    MenuBarExtra("Automatic Time", systemImage: "clock") {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text("Automatic Time").font(.headline)
          statusRow("Pairing", model.pairingStatus)
          statusRow("Capture", model.captureStatus)
          statusRow("Weaver", model.candidateStatus)
          if !model.userCode.isEmpty {
            Text(model.userCode).font(.system(.body, design: .monospaced)).textSelection(.enabled)
          }

          Divider()
          Group {
            Text("Weaver connection").font(.subheadline).bold()
            TextField("API URL", text: $model.apiBaseURL).textFieldStyle(.roundedBorder)
            TextField("Web URL", text: $model.webBaseURL).textFieldStyle(.roundedBorder)
            TextField("Tenant ID", text: $model.tenantID).textFieldStyle(.roundedBorder)
            HStack {
              Button(model.isPairing ? "Waiting..." : "Pair Device") { model.pair() }
                .disabled(model.isPairing)
              Button("Sync candidates") { Task { await model.synchronizeCandidates() } }
              Button("Forget") { model.forgetCredential() }
            }
          }

          Divider()
          Group {
            Text("Local capture").font(.subheadline).bold()
            TextField("Active repository path (optional)", text: $model.repositoryPath)
              .textFieldStyle(.roundedBorder)
            TextField("Current Weaver issue key (optional)", text: $model.activeIssueKey)
              .textFieldStyle(.roundedBorder)
            Toggle("Capture active window titles", isOn: $model.captureWindowTitles)
            Toggle("Capture browser domain and page title", isOn: $model.captureBrowserMetadata)
            Text("Window and browser metadata are off by default and never leave this Mac as raw evidence.")
              .font(.caption)
              .foregroundStyle(.secondary)
            Button("Request window-title permission") { model.requestWindowTitlePermission() }
            HStack {
              Button("Start") { model.startCapture() }
              Button("Pause") { model.pauseCapture() }.disabled(!model.isCapturing)
              Button("Pause 30m") { model.pauseCapture(duration: 30 * 60) }
                .disabled(!model.isCapturing)
              Button("Resume") { model.resumeCapture() }.disabled(!model.isCapturing)
              Button("Stop") { model.stopCapture() }.disabled(!model.isCapturing)
            }
          }

          Divider()
          Group {
            Text("Exclusions").font(.subheadline).bold()
            TextField("Application bundle IDs, comma separated", text: $model.applicationExclusions)
              .textFieldStyle(.roundedBorder)
            TextField("Domains, comma separated", text: $model.domainExclusions)
              .textFieldStyle(.roundedBorder)
            TextField("Repository paths, comma separated", text: $model.repositoryExclusions)
              .textFieldStyle(.roundedBorder)
          }

          Divider()
          HStack {
            Text("Companion \(AutomaticTimeHTTPClient.companionVersion)")
              .font(.caption)
              .foregroundStyle(.secondary)
            Spacer()
            Button("Quit") { NSApplication.shared.terminate(nil) }
          }
        }
        .padding(12)
      }
      .frame(width: 440, height: 650)
    }
    .menuBarExtraStyle(.window)
  }

  private func statusRow(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label).font(.caption).bold()
      Text(value).font(.caption).foregroundStyle(.secondary)
    }
  }
}
