// avalet-ocr: recognizes text in an image with Apple Vision and prints JSON.
// Usage: avalet-ocr <image-path> [lang1,lang2]
// Boxes are normalized 0-1 with the origin at the TOP-LEFT. Layout
// reconstruction (reading order, indentation) lives in electron/ocr/layout.ts.
import Foundation
import ImageIO
import Vision

struct Observation: Encodable {
    let text: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let confidence: Float
}

struct Output: Encodable {
    let width: Int
    let height: Int
    let observations: [Observation]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: avalet-ocr <image-path> [lang1,lang2]") }
let requested = args.count >= 3 ? args[2].split(separator: ",").map(String.init) : ["ru-RU", "en-US"]

guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fail("cannot read image: \(args[1])")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
if let supported = try? request.supportedRecognitionLanguages() {
    let usable = requested.filter { supported.contains($0) }
    if !usable.isEmpty { request.recognitionLanguages = usable }
}

do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
    fail("recognition failed: \(error.localizedDescription)")
}

var observations: [Observation] = []
for item in request.results ?? [] {
    guard let candidate = item.topCandidates(1).first else { continue }
    let box = item.boundingBox
    observations.append(Observation(
        text: candidate.string,
        x: Double(box.minX),
        y: Double(1.0 - box.maxY),
        w: Double(box.width),
        h: Double(box.height),
        confidence: candidate.confidence
    ))
}

guard let data = try? JSONEncoder().encode(Output(width: image.width, height: image.height, observations: observations)) else {
    fail("cannot encode result")
}
FileHandle.standardOutput.write(data)
