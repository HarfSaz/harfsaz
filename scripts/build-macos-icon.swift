// Rebuild only the macOS ICNS with Dock-sized artwork on a transparent canvas.
// Usage: swift scripts/build-macos-icon.swift SOURCE.png OUTPUT.iconset
import AppKit
let args = CommandLine.arguments
guard args.count == 3, let source = NSImage(contentsOfFile: args[1]) else { fatalError("Supply a source PNG and output iconset path") }
try FileManager.default.createDirectory(atPath: args[2], withIntermediateDirectories: true)
for points in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let size = points * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil, pixelsWide:size, pixelsHigh:size, bitsPerSample:8, samplesPerPixel:4, hasAlpha:true, isPlanar:false, colorSpaceName:.deviceRGB, bytesPerRow:0, bitsPerPixel:0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:bitmap)
    NSGraphicsContext.current?.imageInterpolation = .high
    let side = Double(size) * 0.8125
    source.draw(in:NSRect(x:(Double(size)-side)/2, y:(Double(size)-side)/2, width:side, height:side), from:.zero, operation:.copy, fraction:1)
    NSGraphicsContext.restoreGraphicsState()
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    try bitmap.representation(using:.png, properties:[:])!.write(to:URL(fileURLWithPath:args[2]).appendingPathComponent(name))
  }
}
