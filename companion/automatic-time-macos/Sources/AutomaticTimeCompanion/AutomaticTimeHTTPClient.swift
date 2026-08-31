import Foundation

public protocol PairingTransport: AnyObject {
  func requestPairing(
    displayName: String,
    companionVersion: String
  ) async throws -> PairingSession
  func exchange(pairingCode: String) async throws -> PairingExchangeResult
}

public final class AutomaticTimeHTTPClient:
  PairingTransport, DraftTransport, IssueCandidateTransport, RetentionStateTransport
{
  public static let companionVersion = "0.2.0"
  private let apiBaseURL: URL
  private let tenantID: String
  private let session: URLSession

  public init(apiBaseURL: URL, tenantID: String, session: URLSession = .shared) {
    self.apiBaseURL = apiBaseURL
    self.tenantID = tenantID
    self.session = session
  }

  public func requestPairing(
    displayName: String,
    companionVersion: String
  ) async throws -> PairingSession {
    struct Request: Encodable {
      let displayName: String
      let platform = "macos"
      let companionVersion: String
    }
    let response = try await send(
      path: "pairing/requests",
      method: "POST",
      body: Request(displayName: displayName, companionVersion: companionVersion)
    )
    guard response.status == 201 else { throw mapError(response.status) }
    return try decoder.decode(PairingSession.self, from: response.data)
  }

  public func exchange(pairingCode: String) async throws -> PairingExchangeResult {
    struct Request: Encodable { let pairingCode: String }
    let response = try await send(
      path: "pairing/exchange",
      method: "POST",
      body: Request(pairingCode: pairingCode)
    )
    if response.status == 202 { return .pending }
    guard response.status == 201 else { throw mapError(response.status) }

    struct Exchange: Decodable {
      let deviceId: String
      let deviceToken: String
      let scopes: [String]
      let expiresAt: Date
    }
    let exchange = try decoder.decode(Exchange.self, from: response.data)
    return .paired(
      DeviceCredential(
        deviceID: exchange.deviceId,
        tenantID: tenantID,
        token: exchange.deviceToken,
        scopes: exchange.scopes,
        expiresAt: exchange.expiresAt
      )
    )
  }

  public func sync(drafts: [DerivedDraft], credential: DeviceCredential) async throws -> Int {
    struct Request: Encodable { let drafts: [DerivedDraft] }
    let response = try await send(
      path: "device/drafts",
      method: "POST",
      body: Request(drafts: drafts),
      bearerToken: credential.token
    )
    guard response.status == 201 else { throw mapError(response.status) }
    let synced = try decoder.decode([SyncedDraft].self, from: response.data)
    return synced.count
  }

  public func fetchIssueCandidates(
    credential: DeviceCredential
  ) async throws -> [IssueCandidate] {
    let response = try await send(
      path: "device/issue-candidates",
      method: "GET",
      bearerToken: credential.token
    )
    guard response.status == 200 else { throw mapError(response.status) }
    return try decoder.decode([IssueCandidate].self, from: response.data)
  }

  public func fetchReleasedDays(credential: DeviceCredential) async throws -> [ReleasedDay] {
    let response = try await send(
      path: "device/released-days",
      method: "GET",
      bearerToken: credential.token
    )
    guard response.status == 200 else { throw mapError(response.status) }
    return try decoder.decode([ReleasedDay].self, from: response.data)
  }

  private struct SyncedDraft: Decodable { let id: String }
  private struct Response { let status: Int; let data: Data }

  private var decoder: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }

  private func send<Body: Encodable>(
    path: String,
    method: String,
    body: Body,
    bearerToken: String? = nil
  ) async throws -> Response {
    var request = request(path: path, method: method, bearerToken: bearerToken)
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    request.httpBody = try encoder.encode(body)

    return try await perform(request)
  }

  private func send(
    path: String,
    method: String,
    bearerToken: String? = nil
  ) async throws -> Response {
    try await perform(request(path: path, method: method, bearerToken: bearerToken))
  }

  private func request(path: String, method: String, bearerToken: String?) -> URLRequest {
    let route = "plugin-companion-routes/@weaver~plugin-automatic-time/\(path)"
    let url = apiBaseURL.appendingPathComponent(route)
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue(tenantID, forHTTPHeaderField: "X-Tenant-ID")
    request.setValue(Self.companionVersion, forHTTPHeaderField: "X-Companion-Version")
    if let bearerToken {
      request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    }
    return request
  }

  private func perform(_ request: URLRequest) async throws -> Response {
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        throw CompanionTransportError.invalidResponse
      }
      return Response(status: http.statusCode, data: data)
    } catch let error as CompanionTransportError {
      throw error
    } catch {
      throw CompanionTransportError.offline
    }
  }

  private func mapError(_ status: Int) -> CompanionTransportError {
    status == 401 ? .unauthorized : .server(status: status)
  }
}
