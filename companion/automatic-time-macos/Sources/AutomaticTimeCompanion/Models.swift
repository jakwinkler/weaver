import Foundation

public struct DerivedDraft: Codable, Equatable, Sendable {
  public let sourceReference: String
  public let localDate: String
  public let startedAt: Date
  public let endedAt: Date
  public let proposedMinutes: Int
  public let description: String
  public let confidence: Double
  public let assignmentMethod: String
  public let assignmentReasons: [String]
  public let assignmentAlternatives: [AssignmentAlternative]
  public let rulesetVersion: String
  public let evidenceDigest: String
  public let correctionContextDigest: String?
  public let issueKey: String?

  public init(
    sourceReference: String,
    localDate: String,
    startedAt: Date,
    endedAt: Date,
    proposedMinutes: Int,
    description: String,
    confidence: Double,
    assignmentMethod: String,
    assignmentReasons: [String],
    assignmentAlternatives: [AssignmentAlternative] = [],
    rulesetVersion: String = AssignmentEngine.rulesetVersion,
    evidenceDigest: String,
    correctionContextDigest: String? = nil,
    issueKey: String? = nil
  ) {
    self.sourceReference = sourceReference
    self.localDate = localDate
    self.startedAt = startedAt
    self.endedAt = endedAt
    self.proposedMinutes = proposedMinutes
    self.description = description
    self.confidence = confidence
    self.assignmentMethod = assignmentMethod
    self.assignmentReasons = assignmentReasons
    self.assignmentAlternatives = assignmentAlternatives
    self.rulesetVersion = rulesetVersion
    self.evidenceDigest = evidenceDigest
    self.correctionContextDigest = correctionContextDigest
    self.issueKey = issueKey
  }

  private enum CodingKeys: String, CodingKey {
    case sourceReference
    case localDate
    case startedAt
    case endedAt
    case proposedMinutes
    case description
    case confidence
    case assignmentMethod
    case assignmentReasons
    case assignmentAlternatives
    case rulesetVersion
    case evidenceDigest
    case correctionContextDigest
    case issueKey
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    sourceReference = try container.decode(String.self, forKey: .sourceReference)
    localDate = try container.decode(String.self, forKey: .localDate)
    startedAt = try container.decode(Date.self, forKey: .startedAt)
    endedAt = try container.decode(Date.self, forKey: .endedAt)
    proposedMinutes = try container.decode(Int.self, forKey: .proposedMinutes)
    description = try container.decode(String.self, forKey: .description)
    confidence = try container.decode(Double.self, forKey: .confidence)
    assignmentMethod = try container.decode(String.self, forKey: .assignmentMethod)
    assignmentReasons = try container.decode([String].self, forKey: .assignmentReasons)
    assignmentAlternatives =
      try container.decodeIfPresent([AssignmentAlternative].self, forKey: .assignmentAlternatives)
      ?? []
    rulesetVersion =
      try container.decodeIfPresent(String.self, forKey: .rulesetVersion) ?? "legacy-v1"
    evidenceDigest = try container.decode(String.self, forKey: .evidenceDigest)
    correctionContextDigest = try container.decodeIfPresent(
      String.self,
      forKey: .correctionContextDigest
    )
    issueKey = try container.decodeIfPresent(String.self, forKey: .issueKey)
  }
}

public struct DeviceCredential: Codable, Equatable, Sendable {
  public let deviceID: String
  public let tenantID: String
  public let token: String
  public let scopes: [String]
  public let expiresAt: Date

  public init(
    deviceID: String,
    tenantID: String,
    token: String,
    scopes: [String],
    expiresAt: Date
  ) {
    self.deviceID = deviceID
    self.tenantID = tenantID
    self.token = token
    self.scopes = scopes
    self.expiresAt = expiresAt
  }
}

public struct PairingSession: Codable, Equatable, Sendable {
  public let pairingCode: String
  public let userCode: String
  public let verificationUri: String
  public let expiresAt: Date
  public let intervalSeconds: Int

  public init(
    pairingCode: String,
    userCode: String,
    verificationUri: String,
    expiresAt: Date,
    intervalSeconds: Int
  ) {
    self.pairingCode = pairingCode
    self.userCode = userCode
    self.verificationUri = verificationUri
    self.expiresAt = expiresAt
    self.intervalSeconds = intervalSeconds
  }
}

public enum PairingExchangeResult: Equatable, Sendable {
  case pending
  case paired(DeviceCredential)
}
