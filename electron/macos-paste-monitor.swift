import AppKit
import ApplicationServices
import Carbon.HIToolbox
import Foundation

if #available(macOS 10.15, *) {
  if !CGPreflightListenEventAccess() {
    _ = CGRequestListenEventAccess()
  }
}

let trustedPromptKey = kAXTrustedCheckOptionPrompt.takeRetainedValue() as String
let trustedPrompt = [trustedPromptKey: true] as CFDictionary
_ = AXIsProcessTrustedWithOptions(trustedPrompt)

struct MonitorEvent: Codable {
  let type: String
  let reason: String?
  let entropy: Double?
  let length: Int?
}

func emit(_ event: MonitorEvent) {
  do {
    let data = try JSONEncoder().encode(event)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
  } catch {
    // ignore
  }
}

func logErr(_ message: String) {
  if let data = (message + "\n").data(using: .utf8) {
    FileHandle.standardError.write(data)
  }
}

let clipboardAnalysisLimit = 20000

func readClipboardText() -> String {
  guard let text = NSPasteboard.general.string(forType: .string) else {
    return ""
  }

  if text.count <= clipboardAnalysisLimit {
    return text
  }

  let idx = text.index(text.startIndex, offsetBy: clipboardAnalysisLimit)
  return String(text[..<idx])
}

func shannonEntropy(_ text: String) -> Double {
  if text.isEmpty {
    return 0
  }

  let scalars = Array(text.unicodeScalars)
  let len = Double(scalars.count)
  if len == 0 {
    return 0
  }

  var counts: [UInt32: Int] = [:]
  counts.reserveCapacity(64)

  for scalar in scalars {
    counts[scalar.value, default: 0] += 1
  }

  var entropy = 0.0
  for (_, count) in counts {
    let p = Double(count) / len
    entropy -= p * log2(p)
  }

  return entropy
}

func isTokenScalar(_ scalar: UnicodeScalar) -> Bool {
  if CharacterSet.alphanumerics.contains(scalar) {
    return true
  }

  switch scalar.value {
  case 43, 45, 46, 47, 61, 95:
    // + - . / = _
    return true
  default:
    return false
  }
}

func maxTokenEntropy(in text: String) -> (entropy: Double, tokenLength: Int) {
  let minTokenLen = 20

  var bestEntropy = 0.0
  var bestLen = 0

  var current: [UnicodeScalar] = []
  current.reserveCapacity(128)

  func flush() {
    if current.count >= minTokenLen {
      let segment = String(String.UnicodeScalarView(current))
      let entropy = shannonEntropy(segment)
      if entropy > bestEntropy {
        bestEntropy = entropy
        bestLen = current.count
      }
    }

    current.removeAll(keepingCapacity: true)
  }

  for scalar in text.unicodeScalars {
    if isTokenScalar(scalar) {
      current.append(scalar)
    } else {
      flush()
    }
  }

  flush()
  return (bestEntropy, bestLen)
}

// How long the user has to press paste again after we block the first paste.
// In practice, 1.25s is too tight and feels "broken" in many apps.
let confirmationWindowSeconds = 2.5
let entropyThreshold = 4.4
let entropyMinTokenLen = 24

let keyDownMask = CGEventMask(1) << CGEventType.keyDown.rawValue
let keyUpMask = CGEventMask(1) << CGEventType.keyUp.rawValue
let keyEventMask = keyDownMask | keyUpMask

let leftCommandKey = CGKeyCode(kVK_Command)
let rightCommandKey = CGKeyCode(kVK_RightCommand)
let leftControlKey = CGKeyCode(kVK_Control)
let rightControlKey = CGKeyCode(kVK_RightControl)
let vKey = CGKeyCode(kVK_ANSI_V)

func isPasteComboPressed() -> Bool {
  let commandPressed =
    CGEventSource.keyState(.combinedSessionState, key: leftCommandKey)
    || CGEventSource.keyState(.combinedSessionState, key: rightCommandKey)

  let controlPressed =
    CGEventSource.keyState(.combinedSessionState, key: leftControlKey)
    || CGEventSource.keyState(.combinedSessionState, key: rightControlKey)

  let vPressed = CGEventSource.keyState(.combinedSessionState, key: vKey)

  return vPressed && (commandPressed || controlPressed)
}

var currentEventTap: CFMachPort?
var allowPasteUntil = Date.distantPast
var swallowNextKeyUp = false

let eventTapCallback: CGEventTapCallBack = { _, type, event, _ in
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if let eventTap = currentEventTap {
      CGEvent.tapEnable(tap: eventTap, enable: true)
    }

    return Unmanaged.passUnretained(event)
  }

  let keyCode = event.getIntegerValueField(.keyboardEventKeycode)

  if swallowNextKeyUp && type == .keyUp && keyCode == Int64(kVK_ANSI_V) {
    swallowNextKeyUp = false
    return nil
  }

  guard type == .keyDown else {
    return Unmanaged.passUnretained(event)
  }

  if keyCode != Int64(kVK_ANSI_V) {
    return Unmanaged.passUnretained(event)
  }

  let isCommandPressed = event.flags.contains(.maskCommand)
  let isControlPressed = event.flags.contains(.maskControl)
  if !isCommandPressed && !isControlPressed {
    return Unmanaged.passUnretained(event)
  }

  let clipboard = readClipboardText()
  let clipboardLen = clipboard.count
  let metrics = maxTokenEntropy(in: clipboard)
  let entropy = metrics.entropy
  let tokenLen = metrics.tokenLength
  let highEntropy = tokenLen >= entropyMinTokenLen && entropy >= entropyThreshold
  let reason = highEntropy ? "entropy" : "confirm"

  let now = Date()
  if now <= allowPasteUntil {
    allowPasteUntil = Date.distantPast
    swallowNextKeyUp = false
    emit(MonitorEvent(type: "paste-allowed", reason: reason, entropy: entropy, length: clipboardLen))
    return Unmanaged.passUnretained(event)
  }

  allowPasteUntil = now.addingTimeInterval(confirmationWindowSeconds)
  swallowNextKeyUp = true
  emit(MonitorEvent(type: "paste-blocked", reason: reason, entropy: entropy, length: clipboardLen))
  return nil
}

let runLoop = CFRunLoopGetCurrent()

if let eventTap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .defaultTap,
  eventsOfInterest: keyEventMask,
  callback: eventTapCallback,
  userInfo: nil
) {
  currentEventTap = eventTap

  if let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0) {
    CFRunLoopAddSource(runLoop, runLoopSource, .commonModes)
    CGEvent.tapEnable(tap: eventTap, enable: true)
  } else {
    logErr("monitor_run_loop_source_failed")
  }

  emit(MonitorEvent(type: "monitor-ready", reason: nil, entropy: nil, length: nil))
} else {
  logErr("monitor_permission_required")
  emit(MonitorEvent(type: "monitor-ready", reason: nil, entropy: nil, length: nil))

  var lastComboActive = false

  let pollTimer = CFRunLoopTimerCreateWithHandler(
    kCFAllocatorDefault,
    CFAbsoluteTimeGetCurrent(),
    0.03,
    0,
    0
  ) { _ in
    let comboActive = isPasteComboPressed()
    if comboActive && !lastComboActive {
      emit(MonitorEvent(type: "paste-shortcut", reason: nil, entropy: nil, length: nil))
    }

    lastComboActive = comboActive
  }

  CFRunLoopAddTimer(runLoop, pollTimer, .commonModes)
}

CFRunLoopRun()
