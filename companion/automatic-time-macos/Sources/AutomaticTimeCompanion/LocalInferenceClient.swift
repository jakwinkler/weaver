import Foundation

public enum LocalInferenceError: Error, Equatable {
  case nonLoopbackEndpoint
  case invalidResponse
  case server(status: Int)
  case invalidModelResponse
}

public struct LocalInferenceConfiguration: Codable, Equatable, Sendable {
  public let baseURL: URL
  public let model: String

  public init(baseURL: URL, model: String) throws {
    guard
      let host = baseURL.host?.lowercased(),
      ["127.0.0.1", "localhost", "::1"].contains(host),
      ["http", "https"].contains(baseURL.scheme?.lowercased() ?? ""),
      !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      throw LocalInferenceError.nonLoopbackEndpoint
    }
    self.baseURL = baseURL
    self.model = model
  }
}

public final class LocalInferenceClient: LocalSemanticIssueRanking, @unchecked Sendable {
  private struct ChatMessage: Codable {
    let role: String
    let content: String
  }

  private struct ChatRequest: Codable {
    let model: String
    let temperature: Double
    let messages: [ChatMessage]
  }

  private struct ChatResponse: Decodable {
    struct Choice: Decodable {
      struct Message: Decodable { let content: String }
      let message: Message
    }
    let choices: [Choice]
  }

  private let configuration: LocalInferenceConfiguration
  private let session: URLSession

  public init(configuration: LocalInferenceConfiguration, session: URLSession = .shared) throws {
    _ = try LocalInferenceConfiguration(
      baseURL: configuration.baseURL,
      model: configuration.model
    )
    self.configuration = configuration
    self.session = session
  }

  public func rank(
    context: CapturedContext,
    candidates: [IssueCandidate]
  ) async throws -> SemanticIssueRank? {
    let boundedCandidates = Array(candidates.prefix(100))
    guard !boundedCandidates.isEmpty else { return nil }
    let input = RankingInput(context: context, candidates: boundedCandidates)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let payload = String(decoding: try encoder.encode(input), as: UTF8.self)
    let request = ChatRequest(
      model: configuration.model,
      temperature: 0,
      messages: [
        ChatMessage(
          role: "system",
          content: "Choose one issue key only from the supplied candidates. Return JSON with issueKey and score from 0 to 1. Never create a key."
        ),
        ChatMessage(role: "user", content: payload),
      ]
    )
    let content = try await complete(request)
    guard let data = jsonObjectData(in: content) else {
      throw LocalInferenceError.invalidModelResponse
    }
    let rank = try JSONDecoder().decode(SemanticIssueRank.self, from: data)
    let allowedKeys = Set(boundedCandidates.map { $0.key.uppercased() })
    return allowedKeys.contains(rank.issueKey) ? rank : nil
  }

  private func complete(_ body: ChatRequest) async throws -> String {
    let endpoint = configuration.baseURL.appendingPathComponent("chat/completions")
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw LocalInferenceError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      throw LocalInferenceError.server(status: http.statusCode)
    }
    guard let content = try JSONDecoder().decode(ChatResponse.self, from: data).choices.first?
      .message.content
    else {
      throw LocalInferenceError.invalidResponse
    }
    return content
  }

  private func jsonObjectData(in value: String) -> Data? {
    guard let start = value.firstIndex(of: "{"), let end = value.lastIndex(of: "}"), start <= end
    else { return nil }
    return Data(value[start...end].utf8)
  }
}

private struct RankingInput: Encodable {
  struct Context: Encodable {
    let application: String
    let windowTitle: String?
    let browserDomain: String?
    let browserTitle: String?
    let gitBranch: String?
    let weaverIssueKey: String?
  }

  struct Candidate: Encodable {
    let key: String
    let summary: String
    let projectKey: String?
    let statusCategory: String?
  }

  let context: Context
  let candidates: [Candidate]

  init(context: CapturedContext, candidates: [IssueCandidate]) {
    self.context = Context(
      application: context.applicationName,
      windowTitle: context.windowTitle,
      browserDomain: context.browserDomain,
      browserTitle: context.browserTitle,
      gitBranch: context.gitBranch,
      weaverIssueKey: context.weaverIssueKey
    )
    self.candidates = candidates.map {
      Candidate(
        key: $0.key,
        summary: $0.summary,
        projectKey: $0.projectKey,
        statusCategory: $0.statusCategory
      )
    }
  }
}
