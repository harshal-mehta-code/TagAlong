import SwiftUI
import UIKit

// MARK: - Haptics

/// Prepared feedback generators, kept warm so taps land without the ~50ms
/// cold-start lag. All UIKit generators → main actor. Fire-and-forget.
@MainActor
enum Haptics {
    private static let notif     = UINotificationFeedbackGenerator()
    private static let softImpact = UIImpactFeedbackGenerator(style: .soft)
    private static let lightImpact = UIImpactFeedbackGenerator(style: .light)
    private static let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    private static let selection = UISelectionFeedbackGenerator()

    static func prepare() {
        notif.prepare(); softImpact.prepare(); lightImpact.prepare()
        mediumImpact.prepare(); selection.prepare()
    }

    static func success() { notif.notificationOccurred(.success); notif.prepare() }
    static func soft()    { softImpact.impactOccurred(); softImpact.prepare() }
    static func light()   { lightImpact.impactOccurred(); lightImpact.prepare() }
    static func medium()  { mediumImpact.impactOccurred(); mediumImpact.prepare() }
    static func select()  { selection.selectionChanged(); selection.prepare() }
}

// MARK: - Press-scale button style

/// Springy scale-down while pressed — used for the record button and primary
/// CTAs. Restrained: a small dip that settles with a soft spring.
struct PressScale: ButtonStyle {
    var scale: CGFloat = 0.94
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6),
                       value: configuration.isPressed)
    }
}

// MARK: - Completion celebration

/// The payoff: fires once when a tag's fourth part lands. A staggered brass
/// glow sweeps the four tiles clockwise, confetti in the part colors falls,
/// and "Quartet complete" breathes in and out — then the caller auto-plays
/// the finished performance. Respects Reduce Motion (plain fade + text).
struct CelebrationView: View {
    /// House-vocabulary flourish under the title (docs/10 §D), e.g.
    /// "You tagged along — the chord rings".
    var subtitle: String? = nil
    /// Clockwise from the top-left tile: tenor → lead → bass → bari.
    let onFinish: () -> Void

    private static let sweep: [Part] = [.tenor, .lead, .bass, .bari]

    @State private var dim: Double = 0
    @State private var glowing: Set<Part> = []
    @State private var titleShown = false
    @State private var confettiStart: Date?

    private var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    var body: some View {
        ZStack {
            Color.black.opacity(dim).ignoresSafeArea()

            if !reduceMotion {
                glowLayer
                if let start = confettiStart {
                    ConfettiCanvas(start: start).ignoresSafeArea().allowsHitTesting(false)
                }
            }

            VStack(spacing: 10) {
                Text("Quartet complete")
                    .font(.system(size: 34, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ivory)
                    .shadow(color: Theme.brass.opacity(0.6), radius: 12)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(.subheadline, design: .serif))
                        .foregroundStyle(Theme.brassSoft)
                }
            }
            .opacity(titleShown ? 1 : 0)
            .scaleEffect(titleShown ? 1 : 0.92)
        }
        .allowsHitTesting(false)
        .task { reduceMotion ? await runReduced() : await runFull() }
    }

    /// Clockwise brass glow over each quadrant, matching the 2×2 grid layout.
    private var glowLayer: some View {
        GeometryReader { geo in
            let w = geo.size.width / 2
            let h = geo.size.height / 2
            ForEach(Part.allCases) { part in
                let (col, row) = quadrant(part)
                Rectangle()
                    .fill(RadialGradient(
                        colors: [part.color.opacity(0.55), Theme.brass.opacity(0.25), .clear],
                        center: .center, startRadius: 0, endRadius: max(w, h) * 0.9))
                    .frame(width: w, height: h)
                    .position(x: w * (0.5 + Double(col)), y: h * (0.5 + Double(row)))
                    .blendMode(.screen)
                    .opacity(glowing.contains(part) ? 1 : 0)
            }
        }
        .ignoresSafeArea()
    }

    /// (column, row) of a part in the tenor/lead over bari/bass grid.
    private func quadrant(_ part: Part) -> (Int, Int) {
        switch part {
        case .tenor: return (0, 0)
        case .lead:  return (1, 0)
        case .bari:  return (0, 1)
        case .bass:  return (1, 1)
        }
    }

    private func runFull() async {
        Haptics.success()
        withAnimation(.easeOut(duration: 0.3)) { dim = 0.5 }
        try? await Task.sleep(for: .seconds(0.28))

        for part in Self.sweep {
            Haptics.soft()
            withAnimation(.easeOut(duration: 0.4)) { _ = glowing.insert(part) }
            try? await Task.sleep(for: .seconds(0.15))
        }

        confettiStart = Date()
        withAnimation(.easeInOut(duration: 0.6)) { titleShown = true }

        // glows ease back out under the falling confetti
        try? await Task.sleep(for: .seconds(0.5))
        withAnimation(.easeInOut(duration: 0.9)) { glowing.removeAll() }

        try? await Task.sleep(for: .seconds(1.3))
        withAnimation(.easeInOut(duration: 0.55)) { titleShown = false; dim = 0 }
        try? await Task.sleep(for: .seconds(0.6))
        onFinish()
    }

    private func runReduced() async {
        Haptics.success()
        withAnimation(.easeInOut(duration: 0.5)) { dim = 0.5; titleShown = true }
        try? await Task.sleep(for: .seconds(1.6))
        withAnimation(.easeInOut(duration: 0.5)) { titleShown = false; dim = 0 }
        try? await Task.sleep(for: .seconds(0.5))
        onFinish()
    }
}

// MARK: - Confetti

private struct Confetto {
    let x: CGFloat        // start, fraction of width
    let delay: Double
    let duration: Double
    let color: Color
    let size: CGFloat
    let drift: CGFloat    // horizontal sway amplitude, fraction of width
    let spin: Double      // rotations over its fall
    let isRect: Bool
}

/// Pure-SwiftUI confetti: one seeded particle set, drawn each frame by a
/// Canvas driven off a TimelineView. No timers, no external libs.
private struct ConfettiCanvas: View {
    let start: Date
    private let pieces: [Confetto]
    private let life: Double = 2.4

    init(start: Date) {
        self.start = start
        let colors = Part.allCases.map(\.color) + [Theme.brass, Theme.brassSoft]
        var rng = SystemRandomNumberGenerator()
        pieces = (0..<110).map { _ in
            Confetto(
                x: .random(in: 0...1, using: &rng),
                delay: .random(in: 0...0.5, using: &rng),
                duration: .random(in: 1.6...2.3, using: &rng),
                color: colors.randomElement(using: &rng)!,
                size: .random(in: 6...12, using: &rng),
                drift: .random(in: 0.03...0.1, using: &rng),
                spin: .random(in: 1...3, using: &rng),
                isRect: Bool.random(using: &rng)
            )
        }
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                let elapsed = timeline.date.timeIntervalSince(start)
                for p in pieces {
                    let t = (elapsed - p.delay) / p.duration
                    guard t >= 0, t <= 1 else { continue }
                    let y = (-0.08 + t * 1.16) * size.height
                    let sway = sin(t * .pi * 2.2) * p.drift * size.width
                    let x = p.x * size.width + sway
                    let fade = t > 0.85 ? (1 - t) / 0.15 : 1

                    var rect = ctx
                    rect.translateBy(x: x, y: y)
                    rect.rotate(by: .radians(t * p.spin * 2 * .pi))
                    rect.opacity = fade
                    let box = CGRect(x: -p.size / 2, y: -p.size / 2,
                                     width: p.size, height: p.size * (p.isRect ? 0.55 : 1))
                    let path = p.isRect
                        ? Path(roundedRect: box, cornerRadius: 1.5)
                        : Path(ellipseIn: box)
                    rect.fill(path, with: .color(p.color))
                }
            }
        }
    }
}
