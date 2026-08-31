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
  public let evidenceDigest: String
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
    evidenceDigest: String,
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
    self.evidenceDigest = evidenceDigest
    self.issueKey = issueKey
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
