import Foundation

public enum AutomaticTimeAssignmentMethod: String, Codable, Equatable, Sendable {
  case exactIssueKey = "exact-issue-key"
  case deterministic
  case localSemantic = "local-semantic"
  case unassigned
}

public struct AssignmentAlternative: Codable, Equatable, Sendable {
  public let issueKey: String
  public let confidence: Double
  public let reasons: [String]

  public init(issueKey: String, confidence: Double, reasons: [String]) {
    self.issueKey = issueKey
    self.confidence = confidence
    self.reasons = reasons
  }
}

public struct AssignmentDecision: Codable, Equatable, Sendable {
  public let issueKey: String?
  public let confidence: Double
  public let method: AutomaticTimeAssignmentMethod
  public let reasons: [String]
  public let alternatives: [AssignmentAlternative]
  public let rulesetVersion: String

  public init(
    issueKey: String?,
    confidence: Double,
    method: AutomaticTimeAssignmentMethod,
    reasons: [String],
    alternatives: [AssignmentAlternative],
    rulesetVersion: String
  ) {
    self.issueKey = issueKey
    self.confidence = confidence
    self.method = method
    self.reasons = reasons
    self.alternatives = alternatives
    self.rulesetVersion = rulesetVersion
  }
}

public struct AssignmentTarget: Codable, Equatable, Sendable {
  public let issueKey: String?
  public let projectKey: String?

  public init(issueKey: String? = nil, projectKey: String? = nil) {
    self.issueKey = issueKey?.uppercased()
    self.projectKey = projectKey?.uppercased()
  }
}

public struct BranchAssignmentMapping: Codable, Equatable, Sendable {
  public let pattern: String
  public let target: AssignmentTarget

  public init(pattern: String, target: AssignmentTarget) {
    self.pattern = pattern.lowercased()
    self.target = target
  }
}

public struct AssignmentRules: Codable, Equatable, Sendable {
  public let repositoryMappings: [String: AssignmentTarget]
  public let branchMappings: [BranchAssignmentMapping]

  public init(
    repositoryMappings: [String: AssignmentTarget] = [:],
    branchMappings: [BranchAssignmentMapping] = []
  ) {
    self.repositoryMappings = Dictionary(
      uniqueKeysWithValues: repositoryMappings.map { ($0.key.lowercased(), $0.value) }
    )
    self.branchMappings = branchMappings
  }
}

public struct CorrectionMemory: Codable, Equatable, Sendable {
  public let id: String
  public let memoryType: String
  public let normalizedFeatures: [String: String]
  public let targetProjectKey: String?
  public let targetIssueKey: String?
  public let weight: Double
  public let positiveCount: Int
  public let negativeCount: Int
  public let explanation: String
  public let updatedAt: Date?

  public init(
    id: String,
    memoryType: String,
    normalizedFeatures: [String: String],
    targetProjectKey: String? = nil,
    targetIssueKey: String? = nil,
    weight: Double,
    positiveCount: Int,
    negativeCount: Int,
    explanation: String,
    updatedAt: Date? = nil
  ) {
    self.id = id
    self.memoryType = memoryType
    self.normalizedFeatures = normalizedFeatures
    self.targetProjectKey = targetProjectKey?.uppercased()
    self.targetIssueKey = targetIssueKey?.uppercased()
    self.weight = weight
    self.positiveCount = positiveCount
    self.negativeCount = negativeCount
    self.explanation = explanation
    self.updatedAt = updatedAt
  }
}

public struct CorrectionMemorySnapshot: Codable, Equatable, Sendable {
  public let fetchedAt: Date
  public let memories: [CorrectionMemory]

  public init(fetchedAt: Date, memories: [CorrectionMemory]) {
    self.fetchedAt = fetchedAt
    self.memories = memories
  }
}

public struct SemanticIssueRank: Codable, Equatable, Sendable {
  public let issueKey: String
  public let score: Double

  public init(issueKey: String, score: Double) {
    self.issueKey = issueKey.uppercased()
    self.score = min(max(score, 0), 1)
  }
}

public protocol LocalSemanticIssueRanking: Sendable {
  func rank(context: CapturedContext, candidates: [IssueCandidate]) async throws
    -> SemanticIssueRank?
}

public struct AssignmentEngine: Sendable {
  public static let rulesetVersion = "automatic-time-assignment-v1"

  private struct CandidateScore {
    var score = 0.0
    var reasons: [String] = []
    var usedSemantic = false
  }

  public init() {}

  public func assign(
    block: ActivityBlock,
    snapshot: IssueCandidateSnapshot,
    rules: AssignmentRules,
    correctionMemories: [CorrectionMemory],
    semanticRanker: (any LocalSemanticIssueRanking)? = nil,
    now: Date = Date()
  ) async throws -> AssignmentDecision {
    let candidates = Array(snapshot.candidates.prefix(100))
    let candidateByKey = Dictionary(
      uniqueKeysWithValues: candidates.map { ($0.key.uppercased(), $0) }
    )

    if let exactKey = block.context.exactIssueKey,
      candidateByKey[exactKey] != nil
    {
      return AssignmentDecision(
        issueKey: exactKey,
        confidence: 1,
        method: .exactIssueKey,
        reasons: ["Exact issue key \(exactKey) appeared in local context"],
        alternatives: [],
        rulesetVersion: Self.rulesetVersion
      )
    }

    var scores = Dictionary(
      uniqueKeysWithValues: candidates.map { ($0.key.uppercased(), CandidateScore()) }
    )
    var hasStructuralEvidence = false

    if let fingerprint = block.context.repositoryFingerprint?.lowercased(),
      let target = rules.repositoryMappings[fingerprint]
    {
      hasStructuralEvidence = apply(
        target: target,
        contribution: target.issueKey == nil ? 0.45 : 0.85,
        reason: "Matched repository mapping",
        candidates: candidates,
        scores: &scores
      ) || hasStructuralEvidence
    }

    if let branch = block.context.gitBranch?.lowercased() {
      for mapping in rules.branchMappings where branch.contains(mapping.pattern) {
        hasStructuralEvidence = apply(
          target: mapping.target,
          contribution: mapping.target.issueKey == nil ? 0.45 : 0.8,
          reason: "Matched branch mapping \(mapping.pattern)",
          candidates: candidates,
          scores: &scores
        ) || hasStructuralEvidence
      }
    }

    for memory in correctionMemories where memoryMatches(memory, context: block.context) {
      let observations = max(0, memory.positiveCount) + max(0, memory.negativeCount)
      let reliability = Double(max(0, memory.positiveCount) + 1) / Double(observations + 1)
      let contribution = min(0.7, 0.5 * min(max(memory.weight, 0), 2) * reliability)
      let applied = apply(
        target: AssignmentTarget(
          issueKey: memory.targetIssueKey,
          projectKey: memory.targetProjectKey
        ),
        contribution: contribution,
        reason: "Matched correction memory: \(memory.explanation)",
        candidates: candidates,
        scores: &scores
      )
      hasStructuralEvidence = applied || hasStructuralEvidence
    }

    for candidate in candidates {
      guard let updatedAt = candidate.updatedAt.flatMap(ISO8601DateFormatter().date) else { continue }
      let age = max(0, now.timeIntervalSince(updatedAt))
      let recency = age <= 7 * 86_400 ? 0.1 : age <= 30 * 86_400 ? 0.04 : 0
      if recency > 0 {
        add(
          contribution: recency,
          reason: age <= 7 * 86_400 ? "Issue updated in the last 7 days" : "Issue updated in the last 30 days",
          to: candidate.key,
          scores: &scores
        )
      }
    }

    if hasStructuralEvidence,
      topScore(scores)?.value.score ?? 0 < 0.9,
      let semanticRanker,
      let rank = try? await semanticRanker.rank(context: block.context, candidates: candidates),
      candidateByKey[rank.issueKey] != nil
    {
      add(
        contribution: rank.score * 0.4,
        reason: "Local semantic ranking favored \(rank.issueKey)",
        to: rank.issueKey,
        usedSemantic: true,
        scores: &scores
      )
    }

    let ranked = scores.sorted {
      if $0.value.score == $1.value.score { return $0.key < $1.key }
      return $0.value.score > $1.value.score
    }
    guard let top = ranked.first, top.value.score >= 0.65 else {
      return AssignmentDecision(
        issueKey: nil,
        confidence: min(ranked.first?.value.score ?? 0, 1),
        method: .unassigned,
        reasons: hasStructuralEvidence
          ? ["Deterministic evidence was below the assignment threshold"]
          : ["No deterministic assignment evidence"],
        alternatives: alternatives(from: ranked, excluding: nil),
        rulesetVersion: Self.rulesetVersion
      )
    }

    return AssignmentDecision(
      issueKey: top.key,
      confidence: min(top.value.score, 0.99),
      method: top.value.usedSemantic ? .localSemantic : .deterministic,
      reasons: top.value.reasons,
      alternatives: alternatives(from: ranked, excluding: top.key),
      rulesetVersion: Self.rulesetVersion
    )
  }

  private func apply(
    target: AssignmentTarget,
    contribution: Double,
    reason: String,
    candidates: [IssueCandidate],
    scores: inout [String: CandidateScore]
  ) -> Bool {
    if let issueKey = target.issueKey, scores[issueKey] != nil {
      add(contribution: contribution, reason: reason, to: issueKey, scores: &scores)
      return true
    }
    if let projectKey = target.projectKey {
      let matches = candidates.filter { $0.projectKey?.uppercased() == projectKey }
      for candidate in matches {
        add(contribution: contribution, reason: reason, to: candidate.key, scores: &scores)
      }
      return !matches.isEmpty
    }
    return false
  }

  private func add(
    contribution: Double,
    reason: String,
    to issueKey: String,
    usedSemantic: Bool = false,
    scores: inout [String: CandidateScore]
  ) {
    let key = issueKey.uppercased()
    guard var value = scores[key] else { return }
    value.score = min(0.99, value.score + max(0, contribution))
    if !value.reasons.contains(reason) { value.reasons.append(reason) }
    value.usedSemantic = value.usedSemantic || usedSemantic
    scores[key] = value
  }

  private func topScore(_ scores: [String: CandidateScore]) -> (key: String, value: CandidateScore)? {
    scores.max {
      if $0.value.score == $1.value.score { return $0.key > $1.key }
      return $0.value.score < $1.value.score
    }
  }

  private func alternatives(
    from ranked: [(key: String, value: CandidateScore)],
    excluding issueKey: String?
  ) -> [AssignmentAlternative] {
    ranked
      .filter { $0.key != issueKey && $0.value.score > 0 }
      .prefix(3)
      .map {
        AssignmentAlternative(
          issueKey: $0.key,
          confidence: min($0.value.score, 0.99),
          reasons: $0.value.reasons
        )
      }
  }

  private func memoryMatches(_ memory: CorrectionMemory, context: CapturedContext) -> Bool {
    guard !memory.normalizedFeatures.isEmpty else { return false }
    return memory.normalizedFeatures.allSatisfy { key, expected in
      let normalized = expected.lowercased()
      switch key {
      case "applicationBundleIdentifier":
        return context.applicationBundleIdentifier.lowercased() == normalized
      case "applicationName":
        return context.applicationName.lowercased() == normalized
      case "browserDomain":
        return context.browserDomain?.lowercased() == normalized
      case "repositoryFingerprint":
        return context.repositoryFingerprint?.lowercased() == normalized
      case "gitBranch":
        return context.gitBranch?.lowercased() == normalized
      case "branchContains":
        return context.gitBranch?.lowercased().contains(normalized) == true
      case "weaverIssueKey":
        return context.weaverIssueKey?.lowercased() == normalized
      default:
        return false
      }
    }
  }
}

public struct DraftDerivationEngine: Sendable {
  private struct AssignedBlock {
    let block: ActivityBlock
    let decision: AssignmentDecision
  }

  private let assignmentEngine: AssignmentEngine
  private let clusterGap: TimeInterval

  public init(
    assignmentEngine: AssignmentEngine = AssignmentEngine(),
    clusterGap: TimeInterval = 5 * 60
  ) {
    self.assignmentEngine = assignmentEngine
    self.clusterGap = clusterGap
  }

  public func derive(
    blocks: [ActivityBlock],
    snapshot: IssueCandidateSnapshot,
    rules: AssignmentRules,
    correctionMemories: [CorrectionMemory],
    semanticRanker: (any LocalSemanticIssueRanking)? = nil,
    includeLastCluster: Bool = true,
    now: Date = Date()
  ) async throws -> [DerivedDraft] {
    var assigned: [AssignedBlock] = []
    for block in blocks.sorted(by: { $0.startedAt < $1.startedAt }) {
      let decision = try await assignmentEngine.assign(
        block: block,
        snapshot: snapshot,
        rules: rules,
        correctionMemories: correctionMemories,
        semanticRanker: semanticRanker,
        now: now
      )
      assigned.append(AssignedBlock(block: block, decision: decision))
    }

    var clusters: [[AssignedBlock]] = []
    for item in assigned {
      if var current = clusters.last,
        let previous = current.last,
        canCluster(previous, item)
      {
        current.append(item)
        clusters[clusters.count - 1] = current
      } else {
        clusters.append([item])
      }
    }
    if !includeLastCluster && !clusters.isEmpty { clusters.removeLast() }
    let candidateByKey = Dictionary(
      uniqueKeysWithValues: snapshot.candidates.map { ($0.key.uppercased(), $0) }
    )
    return clusters.compactMap { draft(from: $0, candidates: candidateByKey) }
  }

  private func canCluster(_ left: AssignedBlock, _ right: AssignedBlock) -> Bool {
    guard left.block.localDate == right.block.localDate else { return false }
    guard right.block.startedAt.timeIntervalSince(left.block.endedAt) <= clusterGap else {
      return false
    }
    if left.decision.issueKey != nil || right.decision.issueKey != nil {
      return left.decision.issueKey == right.decision.issueKey
    }
    return left.block.context.applicationBundleIdentifier
      == right.block.context.applicationBundleIdentifier
      && left.block.context.repositoryFingerprint == right.block.context.repositoryFingerprint
  }

  private func draft(
    from cluster: [AssignedBlock],
    candidates: [String: IssueCandidate]
  ) -> DerivedDraft? {
    guard let first = cluster.first, let last = cluster.last else { return nil }
    let capturedSeconds = cluster.reduce(0) { $0 + $1.block.capturedSeconds }
    guard capturedSeconds > 0 else { return nil }
    let decision = cluster.max { $0.decision.confidence < $1.decision.confidence }!.decision
    let references = cluster.map(\.block.sourceReference).joined(separator: "|")
    let evidence = cluster.map(\.block.evidenceDigest).joined(separator: "|")
    let description: String
    if let issueKey = decision.issueKey, let candidate = candidates[issueKey] {
      description = String("Worked on \(candidate.summary)".prefix(500))
    } else {
      description = String("Focused work in \(first.block.context.applicationName)".prefix(500))
    }

    return DerivedDraft(
      sourceReference: "cluster:\(sha256Hex(references))",
      localDate: first.block.localDate,
      startedAt: first.block.startedAt,
      endedAt: last.block.endedAt,
      proposedMinutes: max(1, Int((Double(capturedSeconds) / 60).rounded())),
      description: description,
      confidence: decision.confidence,
      assignmentMethod: decision.method.rawValue,
      assignmentReasons: decision.reasons,
      assignmentAlternatives: decision.alternatives,
      rulesetVersion: decision.rulesetVersion,
      evidenceDigest: "sha256:\(sha256Hex(evidence))",
      issueKey: decision.issueKey
    )
  }
}
