import Foundation
import XCTest

@testable import AutomaticTimeCompanion

final class LocalInferenceClientTests: XCTestCase {
  override func tearDown() {
    LocalInferenceURLProtocol.handler = nil
    super.tearDown()
  }

  func testRejectsNonLoopbackInferenceEndpoints() {
    XCTAssertThrowsError(
      try LocalInferenceConfiguration(
        baseURL: URL(string: "https://api.example.com/v1")!,
        model: "remote-model"
      )
    ) { error in
      XCTAssertEqual(error as? LocalInferenceError, .nonLoopbackEndpoint)
    }
  }

  func testRanksOnlyTheProvidedBoundedCandidatesThroughLoopback() async throws {
    LocalInferenceURLProtocol.handler = { request in
      XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:8000/v1/chat/completions")
      XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
      let body = try requestBody(request)
      let bodyText = String(decoding: body, as: UTF8.self)
      XCTAssertTrue(bodyText.contains("ATM-1"))
      XCTAssertTrue(bodyText.contains("ATM-2"))
      XCTAssertFalse(bodyText.contains("GHOST-99"))
      return (
        HTTPURLResponse(
          url: request.url!,
          statusCode: 200,
          httpVersion: nil,
          headerFields: ["Content-Type": "application/json"]
        )!,
        Data(
          #"{"choices":[{"message":{"content":"{\"issueKey\":\"ATM-2\",\"score\":0.92}"}}]}"#.utf8
        )
      )
    }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [LocalInferenceURLProtocol.self]
    let client = try LocalInferenceClient(
      configuration: LocalInferenceConfiguration(
        baseURL: URL(string: "http://127.0.0.1:8000/v1")!,
        model: "synthetic-model"
      ),
      session: URLSession(configuration: configuration)
    )

    let result = try await client.rank(
      context: CapturedContext(
        applicationBundleIdentifier: "com.apple.dt.Xcode",
        applicationName: "Xcode",
        windowTitle: "Synthetic local-only assignment work"
      ),
      candidates: [
        IssueCandidate(id: "1", key: "ATM-1", summary: "First candidate"),
        IssueCandidate(id: "2", key: "ATM-2", summary: "Second candidate"),
      ]
    )

    XCTAssertEqual(result, SemanticIssueRank(issueKey: "ATM-2", score: 0.92))
  }
}

private func requestBody(_ request: URLRequest) throws -> Data {
  if let body = request.httpBody { return body }
  let stream = try XCTUnwrap(request.httpBodyStream)
  stream.open()
  defer { stream.close() }
  var data = Data()
  let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
  defer { buffer.deallocate() }
  while stream.hasBytesAvailable {
    let count = stream.read(buffer, maxLength: 4_096)
    if count < 0 { throw stream.streamError ?? LocalInferenceError.invalidResponse }
    if count == 0 { break }
    data.append(buffer, count: count)
  }
  return data
}

private final class LocalInferenceURLProtocol: URLProtocol {
  static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      let (response, data) = try XCTUnwrap(Self.handler)(request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}
