import Foundation

public struct DeterministicSegmenter: Sendable {
  public let smoothingThreshold: TimeInterval
  public let maximumSignalGap: TimeInterval
  public let calendar: Calendar

  public init(
    smoothingThreshold: TimeInterval = 120,
    maximumSignalGap: TimeInterval = 90,
    calendar: Calendar = .current
  ) {
    self.smoothingThreshold = smoothingThreshold
    self.maximumSignalGap = maximumSignalGap
    self.calendar = calendar
  }

  public func segment(signals: [ActivitySignal], through endDate: Date) throws -> [ActivityBlock] {
    let ordered = signals
      .filter { $0.occurredAt <= endDate }
      .sorted {
        $0.occurredAt == $1.occurredAt
          ? $0.id.uuidString < $1.id.uuidString
          : $0.occurredAt < $1.occurredAt
      }
    guard !ordered.isEmpty else { return [] }

    var context: CapturedContext?
    var suppressions = Set<Suppression>()
    var slices: [Slice] = []

    for index in ordered.indices {
      let signal = ordered[index]
      apply(signal, context: &context, suppressions: &suppressions)
      let intervalEnd = index + 1 < ordered.count ? ordered[index + 1].occurredAt : endDate
      let duration = intervalEnd.timeIntervalSince(signal.occurredAt)
      guard
        duration > 0,
        duration <= maximumSignalGap,
        suppressions.isEmpty,
        let context
      else { continue }
      slices.append(
        contentsOf: splitAtDayBoundaries(
          start: signal.occurredAt,
          end: intervalEnd,
          context: context,
          evidenceID: signal.id
        )
      )
    }

    return smooth(buildBlocks(from: slices)).map(makeActivityBlock)
  }

  private enum Suppression: Hashable {
    case idle
    case pause
    case lock
    case sleep
  }

  private struct Slice {
    let start: Date
    let end: Date
    let localDate: String
    let context: CapturedContext
    let evidenceID: UUID
  }

  private struct WorkingBlock {
    var start: Date
    var end: Date
    let localDate: String
    let context: CapturedContext
    var evidenceIDs: [UUID]

    var capturedSeconds: Int {
      max(0, Int(end.timeIntervalSince(start).rounded()))
    }
  }

  private func apply(
    _ signal: ActivitySignal,
    context: inout CapturedContext?,
    suppressions: inout Set<Suppression>
  ) {
    switch signal.kind {
    case .context:
      context = signal.context
    case .idleStarted:
      suppressions.insert(.idle)
    case .idleEnded:
      suppressions.remove(.idle)
    case .paused:
      suppressions.insert(.pause)
    case .resumed:
      suppressions.remove(.pause)
    case .locked:
      suppressions.insert(.lock)
    case .unlocked:
      suppressions.remove(.lock)
    case .sleep:
      suppressions.insert(.sleep)
    case .wake:
      suppressions.remove(.sleep)
    case .gap:
      context = nil
    }
  }

  private func splitAtDayBoundaries(
    start: Date,
    end: Date,
    context: CapturedContext,
    evidenceID: UUID
  ) -> [Slice] {
    var result: [Slice] = []
    var cursor = start
    while cursor < end {
      let startOfDay = calendar.startOfDay(for: cursor)
      guard let nextDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else { break }
      let boundary = min(end, nextDay)
      result.append(
        Slice(
          start: cursor,
          end: boundary,
          localDate: localDate(for: cursor),
          context: context,
          evidenceID: evidenceID
        )
      )
      cursor = boundary
    }
    return result
  }

  private func localDate(for date: Date) -> String {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }

  private func buildBlocks(from slices: [Slice]) -> [WorkingBlock] {
    var blocks: [WorkingBlock] = []
    for slice in slices where slice.end > slice.start {
      if let last = blocks.last,
        last.end == slice.start,
        last.localDate == slice.localDate,
        last.context == slice.context
      {
        blocks[blocks.count - 1].end = slice.end
        blocks[blocks.count - 1].evidenceIDs.append(slice.evidenceID)
      } else {
        blocks.append(
          WorkingBlock(
            start: slice.start,
            end: slice.end,
            localDate: slice.localDate,
            context: slice.context,
            evidenceIDs: [slice.evidenceID]
          )
        )
      }
    }
    return blocks
  }

  private func smooth(_ input: [WorkingBlock]) -> [WorkingBlock] {
    var blocks = input
    var index = 1
    while index + 1 < blocks.count {
      let previous = blocks[index - 1]
      let interruption = blocks[index]
      let next = blocks[index + 1]
      if previous.localDate == interruption.localDate,
        interruption.localDate == next.localDate,
        previous.end == interruption.start,
        interruption.end == next.start,
        previous.context == next.context,
        interruption.context.exactIssueKey == nil,
        interruption.capturedSeconds < Int(smoothingThreshold)
      {
        blocks[index - 1].end = next.end
        blocks[index - 1].evidenceIDs += interruption.evidenceIDs + next.evidenceIDs
        blocks.removeSubrange(index...(index + 1))
        if index > 1 { index -= 1 }
      } else {
        index += 1
      }
    }
    return blocks
  }

  private func makeActivityBlock(_ block: WorkingBlock) -> ActivityBlock {
    let evidence = block.evidenceIDs.map(\.uuidString).joined(separator: ":")
    let digest = sha256Hex(
      "\(block.localDate):\(block.start.timeIntervalSince1970):\(block.end.timeIntervalSince1970):\(evidence)"
    )
    return ActivityBlock(
      sourceReference: "capture:\(digest)",
      localDate: block.localDate,
      startedAt: block.start,
      endedAt: block.end,
      capturedSeconds: block.capturedSeconds,
      context: block.context,
      evidenceDigest: "sha256:\(digest)"
    )
  }
}
