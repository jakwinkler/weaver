// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "AutomaticTimeMacOSSpike",
  platforms: [.macOS(.v13)],
  products: [
    .library(
      name: "AutomaticTimeCompanionSpike",
      targets: ["AutomaticTimeCompanionSpike"]
    ),
    .executable(
      name: "automatic-time-spike",
      targets: ["automatic-time-spike"]
    ),
  ],
  targets: [
    .target(
      name: "AutomaticTimeCompanionSpike",
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("ApplicationServices"),
        .linkedFramework("Security"),
      ]
    ),
    .executableTarget(
      name: "automatic-time-spike",
      dependencies: ["AutomaticTimeCompanionSpike"]
    ),
    .testTarget(
      name: "AutomaticTimeCompanionSpikeTests",
      dependencies: ["AutomaticTimeCompanionSpike"]
    ),
  ]
)
