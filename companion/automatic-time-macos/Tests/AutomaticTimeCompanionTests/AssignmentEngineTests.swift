import Foundation
import XCTest

@testable import AutomaticTimeCompanion

final class AssignmentEngineTests: XCTestCase {
  func testExactIssueKeyWinsInsideBoundedSnapshotWithoutSemanticRanking() async throws {
    let semantic = RecordingSemanticRanker(result: SemanticIssueRank(issueKey: "ATM-2", score: 1))
    let decision = try await AssignmentEngine().assign(
      block: .fixture(branch: "feature/ATM-1-local-capture"),
      snapshot: .fixture,
      rules: AssignmentRules(),
      correctionMemories: [],
      semanticRanker: semantic,
      now: .reference
    )

    XCTAssertEqual(decision.issueKey, "ATM-1")
    XCTAssertEqual(decision.confidence, 1)
    XCTAssertEqual(decision.method, .exactIssueKey)
    XCTAssertEqual(decision.rulesetVersion, AssignmentEngine.rulesetVersion)
    let semanticCalls = await semantic.callCount
    XCTAssertEqual(semanticCalls, 0)
  }

  func testUnknownIssueKeyIsNeverInvented() async throws {
    let decision = try await AssignmentEngine().assign(
      block: .fixture(branch: "feature/GHOST-99-do-not-invent"),
      snapshot: .fixture,
      rules: AssignmentRules(),
      correctionMemories: [],
      now: .reference
    )

    XCTAssertNil(decision.issueKey)
    XCTAssertEqual(decision.method, .unassigned)
    XCTAssertFalse(decision.alternatives.contains { $0.issueKey == "GHOST-99" })
  }

  func testRepositoryAndBranchMappingsEachCombineWithRecency() async throws {
    let repositoryDecision = try await AssignmentEngine().assign(
      block: .fixture(branch: nil),
      snapshot: .fixture,
      rules: AssignmentRules(
        repositoryMappings: ["repo-fingerprint": AssignmentTarget(issueKey: "ATM-1")]
      ),
      correctionMemories: [],
      now: .reference
    )
    XCTAssertEqual(repositoryDecision.issueKey, "ATM-1")
    XCTAssertGreaterThanOrEqual(repositoryDecision.confidence, 0.9)
    XCTAssertTrue(repositoryDecision.reasons.contains { $0.contains("repository mapping") })

    let branchRules = AssignmentRules(
      repositoryMappings: ["repo-fingerprint": AssignmentTarget(issueKey: "ATM-1")],
      branchMappings: [
        BranchAssignmentMapping(pattern: "automatic-time", target: AssignmentTarget(issueKey: "ATM-1"))
      ]
    )
    let branchDecision = try await AssignmentEngine().assign(
      block: .fixture(branch: "29-automatic-time", repositoryFingerprint: nil),
      snapshot: .fixture,
      rules: branchRules,
      correctionMemories: [],
      now: .reference
    )

    XCTAssertEqual(branchDecision.issueKey, "ATM-1")
    XCTAssertGreaterThanOrEqual(branchDecision.confidence, 0.9)
    XCTAssertEqual(branchDecision.method, .deterministic)
    XCTAssertTrue(branchDecision.reasons.contains { $0.contains("branch mapping") })
  }

  func testCorrectionMemoryCanPromoteABoundedCandidate() async throws {
    let memory = CorrectionMemory(
      id: "memory-1",
      memoryType: "application",
      normalizedFeatures: ["applicationBundleIdentifier": "com.apple.dt.Xcode"],
      targetIssueKey: "ATM-2",
      weight: 1.5,
      positiveCount: 4,
      negativeCount: 0,
      explanation: "Xcode work was corrected to ATM-2"
    )
    let decision = try await AssignmentEngine().assign(
      block: .fixture(branch: nil),
      snapshot: .fixture,
      rules: AssignmentRules(),
      correctionMemories: [memory],
      now: .reference
    )

    XCTAssertEqual(decision.issueKey, "ATM-2")
    XCTAssertGreaterThanOrEqual(decision.confidence, 0.65)
    XCTAssertTrue(decision.reasons.contains { $0.contains("correction memory") })
  }

  func testSemanticRankingRunsOnlyAfterDeterministicEvidenceAndCannotExpandCandidates() async throws {
    let semantic = RecordingSemanticRanker(result: SemanticIssueRank(issueKey: "ATM-2", score: 0.95))
    let rules = AssignmentRules(
      repositoryMappings: ["repo-fingerprint": AssignmentTarget(projectKey: "ATM")]
    )
    let decision = try await AssignmentEngine().assign(
      block: .fixture(branch: nil),
      snapshot: .fixture,
      rules: rules,
      correctionMemories: [],
      semanticRanker: semantic,
      now: .reference
    )

    let semanticCalls = await semantic.callCount
    XCTAssertEqual(semanticCalls, 1)
    XCTAssertEqual(decision.issueKey, "ATM-2")
    XCTAssertEqual(decision.method, .localSemantic)

    let invented = RecordingSemanticRanker(result: SemanticIssueRank(issueKey: "GHOST-99", score: 1))
    let bounded = try await AssignmentEngine().assign(
      block: .fixture(branch: nil),
      snapshot: .fixture,
      rules: rules,
      correctionMemories: [],
      semanticRanker: invented,
      now: .reference
    )
    XCTAssertNotEqual(bounded.issueKey, "GHOST-99")
    XCTAssertFalse(bounded.alternatives.contains { $0.issueKey == "GHOST-99" })
  }

  func testSemanticRankingIsSkippedWithoutStructuralEvidence() async throws {
    let semantic = RecordingSemanticRanker(result: SemanticIssueRank(issueKey: "ATM-1", score: 1))
    _ = try await AssignmentEngine().assign(
      block: .fixture(branch: nil, repositoryFingerprint: nil),
      snapshot: .fixture,
      rules: AssignmentRules(),
      correctionMemories: [],
      semanticRanker: semantic,
      now: .reference
    )

    let semanticCalls = await semantic.callCount
    XCTAssertEqual(semanticCalls, 0)
  }

  func testDraftDerivationClustersAdjacentBlocksAndStoresExplainability() async throws {
    let first = ActivityBlock.fixture(
      sourceReference: "block-1",
      startedAt: .reference,
      endedAt: .reference.addingTimeInterval(15 * 60),
      branch: "feature/ATM-1"
    )
    let second = ActivityBlock.fixture(
      sourceReference: "block-2",
      startedAt: .reference.addingTimeInterval(16 * 60),
      endedAt: .reference.addingTimeInterval(31 * 60),
      branch: "feature/ATM-1"
    )
    let drafts = try await DraftDerivationEngine().derive(
      blocks: [first, second],
      snapshot: .fixture,
      rules: AssignmentRules(),
      correctionMemories: [],
      now: .reference
    )

    XCTAssertEqual(drafts.count, 1)
    XCTAssertEqual(drafts[0].issueKey, "ATM-1")
    XCTAssertEqual(drafts[0].proposedMinutes, 30)
    XCTAssertEqual(drafts[0].description, "Worked on Build Automatic Time assignment")
    XCTAssertFalse(drafts[0].assignmentReasons.isEmpty)
    XCTAssertEqual(drafts[0].rulesetVersion, AssignmentEngine.rulesetVersion)
  }

  func testLabeledAssignmentHarnessExceedsEightyPercentWithoutInventingIssues() async throws {
    struct Fixture {
      let block: ActivityBlock
      let expectedIssueKey: String
      let rules: AssignmentRules
      let memories: [CorrectionMemory]
      let semantic: RecordingSemanticRanker?
    }
    let fixtures = [
      Fixture(
        block: .fixture(branch: "feature/ATM-1-exact"),
        expectedIssueKey: "ATM-1",
        rules: AssignmentRules(),
        memories: [],
        semantic: nil
      ),
      Fixture(
        block: .fixture(branch: "29-automatic-time"),
        expectedIssueKey: "ATM-1",
        rules: AssignmentRules(
          repositoryMappings: ["repo-fingerprint": AssignmentTarget(issueKey: "ATM-1")],
          branchMappings: [
            BranchAssignmentMapping(
              pattern: "automatic-time",
              target: AssignmentTarget(issueKey: "ATM-1")
            )
          ]
        ),
        memories: [],
        semantic: nil
      ),
      Fixture(
        block: .fixture(branch: nil),
        expectedIssueKey: "ATM-2",
        rules: AssignmentRules(),
        memories: [
          CorrectionMemory(
            id: "fixture-memory",
            memoryType: "application",
            normalizedFeatures: ["applicationBundleIdentifier": "com.apple.dt.Xcode"],
            targetIssueKey: "ATM-2",
            weight: 1.5,
            positiveCount: 4,
            negativeCount: 0,
            explanation: "Synthetic labeled correction"
          )
        ],
        semantic: nil
      ),
      Fixture(
        block: .fixture(branch: nil),
        expectedIssueKey: "ATM-2",
        rules: AssignmentRules(
          repositoryMappings: ["repo-fingerprint": AssignmentTarget(projectKey: "ATM")]
        ),
        memories: [],
        semantic: RecordingSemanticRanker(
          result: SemanticIssueRank(issueKey: "ATM-2", score: 0.95)
        )
      ),
    ]
    var correctSeconds = 0
    var labeledSeconds = 0
    let boundedKeys = Set(IssueCandidateSnapshot.fixture.candidates.map(\.key))
    var inventedIssueCount = 0
    for fixture in fixtures {
      let decision = try await AssignmentEngine().assign(
        block: fixture.block,
        snapshot: .fixture,
        rules: fixture.rules,
        correctionMemories: fixture.memories,
        semanticRanker: fixture.semantic,
        now: .reference
      )
      labeledSeconds += fixture.block.capturedSeconds
      if decision.issueKey == fixture.expectedIssueKey {
        correctSeconds += fixture.block.capturedSeconds
      }
      if let issueKey = decision.issueKey, !boundedKeys.contains(issueKey) {
        inventedIssueCount += 1
      }
    }

    let destinationAccuracy = Double(correctSeconds) / Double(labeledSeconds)
    XCTAssertGreaterThanOrEqual(destinationAccuracy, 0.8)
    XCTAssertEqual(inventedIssueCount, 0)
  }
}

private actor RecordingSemanticRanker: LocalSemanticIssueRanking {
  private(set) var callCount = 0
  private let result: SemanticIssueRank?

  init(result: SemanticIssueRank?) {
    self.result = result
  }

  func rank(context: CapturedContext, candidates: [IssueCandidate]) async throws -> SemanticIssueRank? {
    callCount += 1
    return result
  }
}

private extension Date {
  static let reference = ISO8601DateFormatter().date(from: "2026-08-31T13:00:00Z")!
}

private extension IssueCandidateSnapshot {
  static let fixture = IssueCandidateSnapshot(
    fetchedAt: .reference,
    candidates: [
      IssueCandidate(
        id: "issue-1",
        key: "ATM-1",
        summary: "Build Automatic Time assignment",
        projectKey: "ATM",
        statusCategory: "in_progress",
        updatedAt: "2026-08-31T12:00:00Z"
      ),
      IssueCandidate(
        id: "issue-2",
        key: "ATM-2",
        summary: "Review local semantic ranking",
        projectKey: "ATM",
        statusCategory: "todo",
        updatedAt: "2026-08-30T12:00:00Z"
      ),
    ]
  )
}

private extension ActivityBlock {
  static func fixture(
    sourceReference: String = "block-1",
    startedAt: Date = .reference,
    endedAt: Date = .reference.addingTimeInterval(30 * 60),
    branch: String?,
    repositoryFingerprint: String? = "repo-fingerprint"
  ) -> ActivityBlock {
    ActivityBlock(
      sourceReference: sourceReference,
      localDate: "2026-08-31",
      startedAt: startedAt,
      endedAt: endedAt,
      capturedSeconds: Int(endedAt.timeIntervalSince(startedAt)),
      context: CapturedContext(
        applicationBundleIdentifier: "com.apple.dt.Xcode",
        applicationName: "Xcode",
        repositoryFingerprint: repositoryFingerprint,
        gitBranch: branch,
        gitCommit: "abc123"
      ),
      evidenceDigest: "sha256:\(sourceReference)"
    )
  }
}
