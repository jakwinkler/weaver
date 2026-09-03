import Foundation
import XCTest

@testable import AutomaticTimeCompanion

final class AutomaticTimeHTTPClientTests: XCTestCase {
  func testRequiresTLSForNonLocalWeaverHosts() throws {
    XCTAssertNoThrow(
      try AutomaticTimeHTTPClient(
        apiBaseURL: XCTUnwrap(URL(string: "https://weaver.example.com/api/v1")),
        tenantID: "tenant-1"
      )
    )
    XCTAssertNoThrow(
      try AutomaticTimeHTTPClient(
        apiBaseURL: XCTUnwrap(URL(string: "http://localhost:3000/api/v1")),
        tenantID: "tenant-1"
      )
    )
    XCTAssertNoThrow(
      try AutomaticTimeHTTPClient(
        apiBaseURL: XCTUnwrap(URL(string: "http://127.0.0.1:3000/api/v1")),
        tenantID: "tenant-1"
      )
    )
    XCTAssertThrowsError(
      try AutomaticTimeHTTPClient(
        apiBaseURL: XCTUnwrap(URL(string: "http://weaver.example.com/api/v1")),
        tenantID: "tenant-1"
      )
    ) { error in
      XCTAssertEqual(error as? CompanionTransportError, .insecureBaseURL)
    }
  }
}
