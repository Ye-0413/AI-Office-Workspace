// Real single-window capture. No desktop capture, UI automation or synthetic frames.
// Build: swiftc -parse-as-library record-window.swift -o /tmp/office-record-window
// List:  /tmp/office-record-window list
// Record: /tmp/office-record-window record --window-id 123 --output /tmp/take.mov --duration 30
import Foundation
import AppKit
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import CoreVideo
import Darwin

struct CaptureFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

struct Options {
    var command = ""
    var windowID: UInt32 = 0
    var output = ""
    var duration: Double = 30
    var fps: Int32 = 30
    var cursor = true
    var codec = "h264"
    var maxWidth: Int?
    init(_ arguments: [String]) throws {
        guard let first = arguments.first, ["list", "record"].contains(first) else {
            throw CaptureFailure("Usage: record-window list | record --window-id ID --output FILE.mov --duration SECONDS [--fps 30] [--cursor yes|no] [--codec h264|prores] [--max-width PIXELS]")
        }
        command = first
        var index = 1
        while index < arguments.count {
            let key = arguments[index]
            guard index + 1 < arguments.count else { throw CaptureFailure("Missing value for \(key)") }
            let value = arguments[index + 1]; index += 2
            switch key {
            case "--window-id": guard let id = UInt32(value), id > 0 else { throw CaptureFailure("Invalid window ID") }; windowID = id
            case "--output": output = value
            case "--duration": guard let number = Double(value), number.isFinite, number > 0, number <= 600 else { throw CaptureFailure("Duration must be 0–600 seconds") }; duration = number
            case "--fps": guard let number = Int32(value), [24, 30, 60].contains(number) else { throw CaptureFailure("FPS must be 24, 30 or 60") }; fps = number
            case "--cursor": guard ["yes", "no"].contains(value) else { throw CaptureFailure("Cursor must be yes or no") }; cursor = value == "yes"
            case "--codec": guard ["h264", "prores"].contains(value) else { throw CaptureFailure("Codec must be h264 or prores") }; codec = value
            case "--max-width": guard let number = Int(value), number >= 320 else { throw CaptureFailure("Invalid maximum width") }; maxWidth = number
            default: throw CaptureFailure("Unknown option: \(key)")
            }
        }
        if command == "record" && (windowID == 0 || output.isEmpty) { throw CaptureFailure("record requires --window-id and --output") }
    }
}

@available(macOS 14.0, *)
final class WindowRecorder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let queue = DispatchQueue(label: "office.single-window-recorder")
    private let options: Options
    private let window: SCWindow
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private let filter: SCContentFilter
    private let configuration: SCStreamConfiguration
    private let target: URL
    private let partial: URL
    private var stream: SCStream!
    private var completion: CheckedContinuation<Void, Error>?
    private var timer: DispatchSourceTimer?
    private var startupTimer: DispatchSourceTimer?
    private var signals: [DispatchSourceSignal] = []
    private var latest: CVPixelBuffer?
    private var latestSerial = 0, previousSerial = -1
    private var frames: Int64 = 0, received = 0, held = 0
    private var stopped = false, writing = false
    private var reason = "duration"
    private var failure: Error?
    private let totalFrames: Int64

    init(window: SCWindow, options: Options) throws {
        self.options = options; self.window = window
        totalFrames = max(1, Int64((options.duration * Double(options.fps)).rounded()))
        target = URL(fileURLWithPath: options.output).standardizedFileURL
        guard !FileManager.default.fileExists(atPath: target.path) else { throw CaptureFailure("Output already exists; choose a new take filename: \(target.path)") }
        guard ["mov", "mp4"].contains(target.pathExtension.lowercased()) else { throw CaptureFailure("Output must end in .mov or .mp4") }
        if options.codec == "prores" && target.pathExtension.lowercased() != "mov" { throw CaptureFailure("ProRes requires a .mov output") }
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        partial = target.deletingLastPathComponent().appendingPathComponent(".\(target.lastPathComponent).\(UUID().uuidString).partial")
        filter = SCContentFilter(desktopIndependentWindow: window)
        configuration = SCStreamConfiguration()
        let nativeWidth = filter.contentRect.width * CGFloat(filter.pointPixelScale)
        let nativeHeight = filter.contentRect.height * CGFloat(filter.pointPixelScale)
        guard nativeWidth > 0, nativeHeight > 0 else { throw CaptureFailure("The selected window has no capturable content") }
        let ratio = min(1, CGFloat(options.maxWidth ?? Int(ceil(nativeWidth))) / nativeWidth)
        configuration.width = max(2, Int(ceil(nativeWidth * ratio / 2)) * 2)
        configuration.height = max(2, Int(ceil(nativeHeight * ratio / 2)) * 2)
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: options.fps)
        configuration.queueDepth = 6
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.captureResolution = .best
        configuration.scalesToFit = false
        configuration.preservesAspectRatio = true
        configuration.ignoreShadowsSingleWindow = true
        configuration.showsCursor = options.cursor
        configuration.capturesAudio = false
        configuration.colorSpaceName = CGColorSpace.itur_709
        if #available(macOS 15.0, *) {
            configuration.captureMicrophone = false
            configuration.captureDynamicRange = .SDR
        }
        writer = try AVAssetWriter(outputURL: partial, fileType: target.pathExtension.lowercased() == "mp4" ? .mp4 : .mov)
        var settings: [String: Any] = [AVVideoCodecKey: options.codec == "prores" ? AVVideoCodecType.proRes422HQ : AVVideoCodecType.h264,
            AVVideoWidthKey: configuration.width, AVVideoHeightKey: configuration.height,
            AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2]]
        if options.codec == "h264" {
            settings[AVVideoCompressionPropertiesKey] = [AVVideoAverageBitRateKey: max(12_000_000, min(50_000_000, Int(Double(configuration.width * configuration.height) * Double(options.fps) * 0.22))),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoExpectedSourceFrameRateKey: options.fps,
                AVVideoMaxKeyFrameIntervalKey: options.fps * 2,
                AVVideoAllowFrameReorderingKey: false]
        }
        guard writer.canApply(outputSettings: settings, forMediaType: .video) else { throw CaptureFailure("Encoder does not support this configuration") }
        input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw CaptureFailure("Cannot attach video writer input") }
        writer.add(input)
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: configuration.width,
            kCVPixelBufferHeightKey as String: configuration.height])
        super.init()
        stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
    }

    func run() async throws {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                self.completion = continuation
                for number in [SIGINT, SIGTERM] {
                    signal(number, SIG_IGN)
                    let source = DispatchSource.makeSignalSource(signal: number, queue: self.queue)
                    source.setEventHandler { self.stop(reason: "signal-\(number)") }; source.resume(); self.signals.append(source)
                }
                let timeout = DispatchSource.makeTimerSource(queue: self.queue)
                timeout.schedule(deadline: .now() + 12)
                timeout.setEventHandler { self.stop(reason: "no-frames", error: CaptureFailure("No complete window frame arrived within 12 seconds")) }
                timeout.resume(); self.startupTimer = timeout
                Task {
                    do { try await self.stream.startCapture() }
                    catch { self.queue.async { self.stop(reason: "start-failed", error: error) } }
                }
            }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard !stopped, type == .screen, sampleBuffer.isValid,
            let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
            let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue,
            let pixels = sampleBuffer.imageBuffer else { return }
        latest = pixels; latestSerial += 1; received += 1
        if !writing {
            startupTimer?.cancel(); startupTimer = nil
            guard writer.startWriting() else { stop(reason: "encoder-start", error: writer.error ?? CaptureFailure("Encoder did not start")); return }
            writer.startSession(atSourceTime: .zero); writing = true
            let ready: [String: Any] = ["event": "recording-started", "windowID": window.windowID,
                "width": configuration.width, "height": configuration.height, "fps": options.fps,
                "output": target.path, "audio": false]
            if let data = try? JSONSerialization.data(withJSONObject: ready, options: [.sortedKeys]) {
                FileHandle.standardError.write(data); FileHandle.standardError.write(Data("\n".utf8))
            }
            // A single CFR sampler holds the latest genuinely captured frame
            // during unchanged UI. It never interpolates or invents app pixels.
            let clock = DispatchSource.makeTimerSource(queue: queue)
            clock.schedule(deadline: .now(), repeating: 1.0 / Double(options.fps), leeway: .milliseconds(1))
            clock.setEventHandler { self.writeFrame() }; clock.resume(); timer = clock
        }
    }

    private func writeFrame() {
        guard !stopped, let pixels = latest else { return }
        if frames >= totalFrames { stop(reason: "duration"); return }
        guard input.isReadyForMoreMediaData else {
            stop(reason: "encoder-backpressure", error: CaptureFailure("Encoder fell behind at frame \(frames); take rejected rather than silently dropping frames")); return
        }
        guard adaptor.append(pixels, withPresentationTime: CMTime(value: frames, timescale: options.fps)) else {
            stop(reason: "append-failed", error: writer.error ?? CaptureFailure("Cannot append captured frame")); return
        }
        if previousSerial == latestSerial { held += 1 }; previousSerial = latestSerial; frames += 1
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) { queue.async { self.stop(reason: "capture-stopped", error: error) } }

    private func stop(reason: String, error: Error? = nil) {
        guard !stopped else { return }; stopped = true; self.reason = reason; failure = error
        timer?.cancel(); timer = nil; startupTimer?.cancel(); startupTimer = nil
        Task {
            do { try await stream.stopCapture() } catch { /* A failed stream may already be stopped. */ }
            queue.async {
                guard self.writing, self.frames > 0 else { self.writer.cancelWriting(); self.finish(); return }
                self.writer.endSession(atSourceTime: CMTime(value: self.frames, timescale: self.options.fps))
                self.input.markAsFinished()
                self.writer.finishWriting { self.queue.async { self.finish() } }
            }
        }
    }

    private func finish() {
        for signal in signals { signal.cancel() }; signals.removeAll(); latest = nil
        if failure == nil && writer.status != .completed { failure = writer.error ?? CaptureFailure("Recording contains no complete frames") }
        if failure == nil {
            do {
                try FileManager.default.moveItem(at: partial, to: target)
                let report: [String: Any] = ["ok": true, "output": target.path, "windowID": window.windowID,
                    "owner": window.owningApplication?.applicationName ?? "", "title": window.title ?? "",
                    "width": configuration.width, "height": configuration.height, "pixelScale": filter.pointPixelScale,
                    "fps": options.fps, "frames": frames, "duration": Double(frames) / Double(options.fps),
                    "completeCaptureFrames": received, "heldOutputFrames": held, "codec": options.codec,
                    "cursor": options.cursor, "audio": false, "stopReason": reason]
                let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
                print(String(decoding: data, as: UTF8.self))
            } catch { failure = error }
        }
        if let error = failure {
            try? FileManager.default.removeItem(at: partial)
            completion?.resume(throwing: error)
        } else { completion?.resume() }
        completion = nil
    }
}

@main struct RecordWindowCLI {
    @MainActor
    static func main() async {
        do {
            // A command-line process has no NSApplication startup. Window
            // filters query CoreGraphics/WindowServer and require AppKit's
            // connection to be initialized on the main thread first.
            let application = NSApplication.shared
            application.setActivationPolicy(.prohibited)
            _ = CGMainDisplayID()
            let options = try Options(Array(CommandLine.arguments.dropFirst()))
            guard #available(macOS 14.0, *) else { throw CaptureFailure("This recording helper requires macOS 14 or later") }
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            let windows = content.windows.filter { $0.frame.width > 0 && $0.frame.height > 0 && $0.owningApplication != nil }
            if options.command == "list" {
                let rows: [[String: Any]] = windows.sorted { $0.windowID < $1.windowID }.map { window in
                    ["id": window.windowID, "owner": window.owningApplication?.applicationName ?? "",
                     "bundleID": window.owningApplication?.bundleIdentifier ?? "", "pid": window.owningApplication?.processID ?? 0,
                     "title": window.title ?? "", "widthPoints": window.frame.width, "heightPoints": window.frame.height]
                }
                print(String(decoding: try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]), as: UTF8.self))
            } else {
                guard let window = windows.first(where: { $0.windowID == options.windowID }) else { throw CaptureFailure("Window ID is no longer available; run list again") }
                try await WindowRecorder(window: window, options: options).run()
            }
        } catch {
            FileHandle.standardError.write(Data(("record-window: \(error)\nScreen capture permission, if requested by macOS, must be handled through the real system UI.\n").utf8))
            exit(1)
        }
    }
}
