import Foundation
import XCTest
@testable import AutomaticTimeCompanion

final class CapturePrivacyTests: XCTestCase {
  func testPrivacyFilterRemovesOptionalAndExcludedMetadata() {
    let settings = CapturePrivacySettings(
      captureWindowTitles: false,
      captureBrowserMetadata: true,
      applicationExclusions: [],
      domainExclusions: ["private.example"],
      repositoryExclusions: ["repo-excluded"]
    )
    let context = CapturedContext(
      applicationBundleIdentifier: "com.apple.Safari",
      applicationName: "Safari",
      windowTitle: "Private customer title",
      browserDomain: "private.example",
      browserTitle: "Private browser title",
      repositoryFingerprint: "repo-excluded",
      gitBranch: "APG-123-private-work",
      gitCommit: "0123456789abcdef",
      weaverIssueKey: "APG-123"
    )

    let filtered = CapturePrivacyFilter.apply(context, settings: settings)

    XCTAssertEqual(filtered?.applicationBundleIdentifier, "com.apple.Safari")
    XCTAssertNil(filtered?.windowTitle)
    XCTAssertNil(filtered?.browserDomain)
    XCTAssertNil(filtered?.browserTitle)
    XCTAssertNil(filtered?.repositoryFingerprint)
    XCTAssertNil(filtered?.gitBranch)
    XCTAssertNil(filtered?.gitCommit)
    XCTAssertEqual(filtered?.weaverIssueKey, "APG-123")
  }

  func testApplicationExclusionDropsTheEntireContext() {
    let settings = CapturePrivacySettings(
      applicationExclusions: ["com.password-manager.app"]
    )
    let context = CapturedContext(
      applicationBundleIdentifier: "com.password-manager.app",
      applicationName: "Secrets"
    )

    XCTAssertNil(CapturePrivacyFilter.apply(context, settings: settings))
  }

  func testBrowserSanitizerKeepsOnlyDomainAndTitle() {
    let metadata = BrowserMetadataSanitizer.metadata(
      urlString: "https://Example.COM/private/path?token=secret#fragment",
      title: "  Synthetic work item  "
    )

    XCTAssertEqual(metadata?.domain, "example.com")
    XCTAssertEqual(metadata?.title, "Synthetic work item")
    XCTAssertNil(
      BrowserMetadataSanitizer.metadata(urlString: "file:///private/work.txt", title: "Work")
    )
  }

  func testGitCaptureReturnsFingerprintWithoutRepositoryPath() throws {
    let repositoryURL = URL(fileURLWithPath: "/synthetic/private/customer-repository")
    let runner = FixtureGitCommandRunner(
      responses: ["main": "APG-42-feature", "commit": "abcdef0123456789"]
    )
    let capture = GitMetadataCapture(commandRunner: runner)

    let metadata = try capture.capture(repositoryURL: repositoryURL, exclusions: [])

    XCTAssertEqual(metadata?.branch, "APG-42-feature")
    XCTAssertEqual(metadata?.commit, "abcdef0123456789")
    XCTAssertFalse(metadata?.repositoryFingerprint.contains("customer-repository") ?? true)
    XCTAssertEqual(runner.invocationCount, 2)

    let excluded = try capture.capture(
      repositoryURL: repositoryURL,
      exclusions: [metadata!.repositoryFingerprint]
    )
    XCTAssertNil(excluded)
    XCTAssertEqual(runner.invocationCount, 2)
  }
}

private final class FixtureGitCommandRunner: GitCommandRunning {
  private let responses: [String: String]
  private(set) var invocationCount = 0

  init(responses: [String: String]) {
    self.responses = responses
  }

  func run(arguments: [String], repositoryURL: URL) throws -> String {
    invocationCount += 1
    if arguments.contains("--abbrev-ref") { return responses["main"] ?? "" }
    return responses["commit"] ?? ""
  }
}
