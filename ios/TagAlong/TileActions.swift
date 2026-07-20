import SwiftUI

// MARK: - Tile action bar (docs/10 §G)

/// One rule: tap a tile → solo it + this contextual bar slides up. No hidden
/// long-presses as the only path. Same bar everywhere TagDetail appears, so
/// feed → detail → action is one learnable pattern.
struct TileActionBar: View {
    enum Context {
        case mine    // my take fills the tile
        case theirs  // someone else's take
        case empty   // open slot
    }

    let part: Part
    let context: Context
    var onResing: () -> Void = {}
    var onNudge: () -> Void = {}
    var onRemoveVoice: () -> Void = {}
    var onSingInstead: () -> Void = {}
    var onCredit: () -> Void = {}
    var onTagAlong: () -> Void = {}
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            switch context {
            case .mine:
                pill("Re-sing", "arrow.counterclockwise.circle", action: onResing)
                pill("Nudge sync", "metronome", action: onNudge)
                pill("Remove my voice", "trash", tint: Theme.record, action: onRemoveVoice)
            case .theirs:
                pill("Sing this part instead", "music.mic", action: onSingInstead)
                pill("Credit", "person.crop.circle", action: onCredit)
            case .empty:
                pill("Tag Along — sing \(part.label.lowercased())", "plus.circle.fill",
                     tint: part.color, action: onTagAlong)
            }
            Spacer(minLength: 0)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(width: 30, height: 30)
                    .background(Theme.card, in: Circle())
            }
        }
        .padding(10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(part.color.opacity(0.5), lineWidth: 1))
    }

    private func pill(_ label: String, _ icon: String,
                      tint: Color = Theme.ivory,
                      action: @escaping () -> Void) -> some View {
        Button {
            Haptics.select()
            action()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 12, weight: .semibold))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .background(Theme.card.opacity(0.85), in: Capsule())
            .overlay(Capsule().stroke(tint.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(PressScale(scale: 0.96))
    }
}

// MARK: - Nudge sync (docs/10 §G "Nudge sync")

/// Fine sync adjustment for MY take. Positive skips further into the file, so
/// the voice lands EARLIER against the others — the fix when you came in late.
struct NudgeSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let take: Take
    @State private var nudgeMs: Double

    init(take: Take) {
        self.take = take
        _nudgeMs = State(initialValue: take.nudgeSec * 1000)
    }

    var body: some View {
        VStack(spacing: 16) {
            Text("Nudge sync")
                .font(.system(.headline, design: .serif))
                .foregroundStyle(Theme.textPrimary)
                .padding(.top, 22)
            Text(String(format: "%+.0f ms", nudgeMs))
                .font(.system(size: 42, weight: .semibold, design: .serif).monospacedDigit())
                .foregroundStyle(Theme.brassSoft)
            Text("Came in late? Nudge +. Came in early? Nudge −.")
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)

            HStack(spacing: 10) {
                bumpButton("-50", -50)
                bumpButton("-10", -10)
                bumpButton("+10", +10)
                bumpButton("+50", +50)
            }

            Button("Reset") { apply(0) }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.textSecondary)

            Text("Close and replay to hear the change.")
                .font(.system(size: 10))
                .foregroundStyle(Theme.textSecondary)
                .padding(.bottom, 10)
        }
        .frame(maxWidth: .infinity)
        .background(Theme.stageGradient.ignoresSafeArea())
        .presentationDetents([.height(300)])
    }

    private func bumpButton(_ label: String, _ delta: Double) -> some View {
        Button { apply(nudgeMs + delta) } label: {
            Text("\(label) ms")
                .font(.system(.subheadline, weight: .semibold).monospacedDigit())
                .frame(width: 70, height: 44)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line, lineWidth: 1))
                .foregroundStyle(Theme.textPrimary)
        }
        .buttonStyle(PressScale(scale: 0.95))
    }

    private func apply(_ ms: Double) {
        Haptics.select()
        nudgeMs = max(-500, min(500, ms))
        store.updateNudge(takeId: take.id, nudgeSec: nudgeMs / 1000)
    }
}

// MARK: - Credits (docs/10 §C "Credits")

/// Who sang what: each part's contributor by display name. The credit loop
/// from docs/07 — names resolve from users/{uid}, "A stranger" until someone
/// introduces themselves.
struct CreditsSheet: View {
    @EnvironmentObject var cloud: CloudStore
    let title: String
    /// part → ownerUid; nil owner = me.
    let owners: [Part: String?]
    @State private var names: [Part: String] = [:]

    var body: some View {
        VStack(spacing: 14) {
            Text(title)
                .font(.system(.title3, design: .serif).weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
                .padding(.top, 24)
            Text("WHO SANG WHAT")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(Theme.textSecondary)

            VStack(spacing: 10) {
                ForEach(Part.allCases.filter { owners.keys.contains($0) }) { part in
                    HStack(spacing: 10) {
                        Circle().fill(part.color).frame(width: 10, height: 10)
                        Text(part.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.textPrimary)
                        Spacer()
                        Text(names[part] ?? "…")
                            .font(.system(.subheadline, design: .serif))
                            .foregroundStyle(Theme.brassSoft)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal, 20)
            Spacer(minLength: 10)
        }
        .frame(maxWidth: .infinity)
        .background(Theme.stageGradient.ignoresSafeArea())
        .presentationDetents([.height(330)])
        .task {
            for (part, owner) in owners {
                if let owner {
                    names[part] = await cloud.displayName(for: owner) ?? "A stranger"
                } else {
                    names[part] = cloud.displayName ?? "You"
                }
            }
        }
    }
}
