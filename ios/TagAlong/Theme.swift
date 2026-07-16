import SwiftUI

/// Warm dark-stage palette lifted from the web prototype's "curtain" tokens.
enum Theme {
    static let bg          = Color(hex: 0x221537) // curtain-deep — stage backdrop
    static let bgElevated  = Color(hex: 0x33224A) // curtain
    static let card        = Color(hex: 0x2C1D42) // curtain-card
    static let line        = Color(hex: 0x3A2C4C) // curtain-line
    static let brass       = Color(hex: 0xC79A3D)
    static let brassSoft   = Color(hex: 0xE3C685)
    static let record      = Color(hex: 0xD64545)
    static let ivory       = Color(hex: 0xFAF7F0)
    static let textPrimary   = Color(hex: 0xF0EAE0)
    static let textSecondary = Color(hex: 0xA99FB6)

    /// Subtle top-lit curtain gradient for large surfaces.
    static var stageGradient: LinearGradient {
        LinearGradient(colors: [Color(hex: 0x2E1D46), Color(hex: 0x1A0F2B)],
                       startPoint: .top, endPoint: .bottom)
    }

    /// Readable scrim behind floating controls over video.
    static func scrim(_ edge: UnitPoint) -> LinearGradient {
        LinearGradient(colors: [Color.black.opacity(0.62), Color.black.opacity(0)],
                       startPoint: edge, endPoint: edge == .top ? .bottom : .top)
    }
}

extension Color {
    init(hex: UInt) {
        self.init(.sRGB,
                  red:   Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >> 8)  & 0xff) / 255,
                  blue:  Double( hex        & 0xff) / 255,
                  opacity: 1)
    }
}

/// Small brass-outlined key chip used on cards and feed overlays.
struct KeyChip: View {
    let key: PitchKey
    var body: some View {
        Text(key.rawValue)
            .font(.system(size: 12, weight: .semibold, design: .serif))
            .monospacedDigit()
            .foregroundStyle(Theme.brassSoft)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Theme.brass.opacity(0.16), in: Capsule())
            .overlay(Capsule().stroke(Theme.brass.opacity(0.45), lineWidth: 1))
    }
}
