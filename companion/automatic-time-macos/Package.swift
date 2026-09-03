// swift-tools-version: 5.10

import PackageDescription

let package = Package(
  name: "AutomaticTimeMacOS",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "AutomaticTimeCompanion", targets: ["AutomaticTimeCompanion"]),
    .executable(name: "automatic-time-companion", targets: ["AutomaticTimeMenuBar"]),
  ],
  targets: [
    .target(
      name: "AutomaticTimeCompanion",
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("ApplicationServices"),
        .linkedFramework("Security"),
      ]
    ),
    .executableTarget(
      name: "AutomaticTimeMenuBar",
      dependencies: ["AutomaticTimeCompanion"],
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("SwiftUI"),
      ]
    ),
    .testTarget(
      name: "AutomaticTimeCompanionTests",
      dependencies: ["AutomaticTimeCompanion"]
    ),
  ]
)
