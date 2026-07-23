import SwiftUI

// MARK: - Social rail (docs/10 §C)

/// Right-rail overlay on feed pages: barbershop-native names in the app's
/// voice — ivory glyphs, serif counts, brass accents. Ring it · Afterglow ·
/// Share · Credits.
struct SocialRail: View {
    let ringCount: Int
    let commentCount: Int
    let isRung: Bool
    let onRing: () -> Void
    let onAfterglow: () -> Void
    let onShare: () -> Void
    let onCredits: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            railButton(icon: "tuningfork",
                       label: ringCount > 0 ? "\(ringCount)" : "Ring it",
                       tint: isRung ? Theme.brass : Theme.ivory,
                       action: onRing)
            railButton(icon: "bubble.left.and.bubble.right",
                       label: commentCount > 0 ? "\(commentCount)" : "Afterglow",
                       action: onAfterglow)
            railButton(icon: "square.and.arrow.up", label: "Share", action: onShare)
            railButton(icon: "person.2", label: "Credits", action: onCredits)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        // The rail sits directly over a video tile that's tap-to-solo across
        // its ENTIRE bounds. Without this, a tap that lands in the gap
        // between two rail buttons falls straight through the VStack's empty
        // space to the tile underneath and solos the wrong part. Shielding
        // the rail's whole footprint — buttons still get first crack at their
        // own taps — turns a near-miss into a no-op instead of a misfire.
        .contentShape(Rectangle())
        .onTapGesture {}
    }

    private func railButton(icon: String, label: String,
                            tint: Color = Theme.ivory,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 23, weight: .semibold))
                    .foregroundStyle(tint)
                    .shadow(color: .black.opacity(0.6), radius: 4)
                Text(label)
                    .font(.system(.caption2, design: .serif).weight(.semibold))
                    .foregroundStyle(Theme.ivory.opacity(0.9))
                    .shadow(color: .black.opacity(0.6), radius: 3)
            }
            // Full 44pt+ tap target (Apple HIG minimum) instead of just the
            // drawn glyph bounds.
            .frame(width: 56, height: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScale(scale: 0.88))
    }
}

/// The rail plus everything it opens: ring state (optimistic, listener-backed
/// counts), the afterglow sheet, credits, and the two-action share (video
/// leads on complete tags, the invite leads on open ones — docs/10 §C).
struct SocialRailHost: View {
    @EnvironmentObject var cloud: CloudStore
    let cloudTag: CloudTag
    /// part → ownerUid (nil = me) for the credits sheet.
    let owners: [Part: String?]
    /// nil = video share unavailable here (nothing decodable yet).
    var onShareVideo: (() -> Void)? = nil
    /// Fires when a ring lands — the page runs its golden shimmer.
    var onRang: () -> Void = {}

    @State private var isRung = false
    @State private var checked = false
    @State private var busy = false
    /// Optimistic count bump until the feed listener echoes the increment.
    @State private var ringDelta = 0
    @State private var afterglowShown = false
    @State private var creditsShown = false
    @State private var shareDialogShown = false
    @State private var inviteShown = false

    var body: some View {
        SocialRail(ringCount: max(0, cloudTag.ringCount + ringDelta),
                   commentCount: cloudTag.commentCount,
                   isRung: isRung,
                   onRing: toggleRing,
                   onAfterglow: { afterglowShown = true },
                   onShare: { shareDialogShown = true },
                   onCredits: { creditsShown = true })
        .task {
            guard !checked else { return }
            checked = true
            isRung = await cloud.hasRung(tagId: cloudTag.id)
        }
        .onChange(of: cloudTag.ringCount) { _, _ in ringDelta = 0 }
        .sheet(isPresented: $afterglowShown) {
            AfterglowSheet(tagId: cloudTag.id, title: cloudTag.title)
        }
        .sheet(isPresented: $creditsShown) {
            CreditsSheet(title: cloudTag.title, owners: owners)
        }
        .sheet(isPresented: $inviteShown) { ActivityView(items: [inviteText]) }
        .confirmationDialog("Share “\(cloudTag.title)”",
                            isPresented: $shareDialogShown, titleVisibility: .visible) {
            if cloudTag.isComplete, let onShareVideo {
                Button("Share video", action: onShareVideo)
            }
            if cloudTag.inviteCode != nil {
                Button(cloudTag.isComplete ? "Share invite" : "Share invite — someone's spot is open") {
                    inviteShown = true
                }
            }
        }
    }

    private var inviteText: String {
        let code = cloudTag.inviteCode ?? ""
        if cloudTag.isComplete {
            return "Hear “\(cloudTag.title)” on TagAlong — code \(code)"
        }
        let part = cloudTag.openParts.first.map { "the \($0.label.lowercased())" } ?? "a part"
        return "Sing \(part) with me on “\(cloudTag.title)” — TagAlong code \(code)"
    }

    /// Optimistic ring: flip immediately (ding + shimmer), reconcile on error.
    private func toggleRing() {
        guard !busy else { return }
        busy = true
        let target = !isRung
        isRung = target
        ringDelta += target ? 1 : -1
        if target {
            Haptics.medium()
            onRang()
        } else {
            Haptics.select()
        }
        Task {
            do {
                try await cloud.setRing(tagId: cloudTag.id, ringing: target)
            } catch {
                isRung = !target
                ringDelta += target ? -1 : 1
                Diagnostics.logError("ring", error)
            }
            busy = false
        }
    }
}

// MARK: - Afterglow (docs/10 §C)

/// The after-show hangout — which is literally what a comment section under a
/// performance is. Newest last, 280 chars. First post asks for a name (§F2).
struct AfterglowSheet: View {
    @EnvironmentObject var cloud: CloudStore
    let tagId: UUID
    let title: String

    @State private var comments: [CloudComment] = []
    @State private var loading = true
    @State private var text = ""
    @State private var sending = false
    @State private var nameDraft = ""
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            Text("Afterglow")
                .font(.system(.headline, design: .serif))
                .foregroundStyle(Theme.textPrimary)
                .padding(.top, 18)
            Text(title)
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
                .padding(.top, 2)
                .padding(.bottom, 10)

            if loading {
                Spacer()
                ProgressView().tint(Theme.brass)
                Spacer()
            } else if comments.isEmpty {
                Spacer()
                Text("The hangout after the show.\nSay something about this quartet.")
                    .multilineTextAlignment(.center)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                Spacer()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(comments) { comment in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(comment.name ?? "A stranger")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(Theme.brassSoft)
                                Text(comment.text)
                                    .font(.callout)
                                    .foregroundStyle(Theme.textPrimary)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18)
                }
                .defaultScrollAnchor(.bottom)
            }

            if let error {
                Text(error).font(.caption).foregroundStyle(Theme.record).padding(.bottom, 4)
            }
            inputBar
        }
        .background(Theme.stageGradient.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .task { await refresh() }
    }

    /// Composer — or, before the first-ever post, the one-time name ask.
    @ViewBuilder
    private var inputBar: some View {
        Group {
            if cloud.displayName == nil {
                HStack(spacing: 8) {
                    TextField("First, a name for the credits", text: $nameDraft)
                        .foregroundStyle(Theme.textPrimary)
                    Button("Save") { cloud.setDisplayName(nameDraft) }
                        .font(.subheadline.bold())
                        .foregroundStyle(Theme.brass)
                        .disabled(nameDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } else {
                HStack(spacing: 8) {
                    TextField("Add to the afterglow…", text: $text, axis: .vertical)
                        .lineLimit(1...3)
                        .foregroundStyle(Theme.textPrimary)
                        .onSubmit(send)
                    if sending {
                        ProgressView().tint(Theme.brass)
                    } else {
                        Button(action: send) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .foregroundStyle(Theme.brass)
                        }
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.card)
    }

    private func refresh() async {
        do {
            comments = try await cloud.comments(tagId: tagId)
            error = nil
        } catch {
            self.error = error.localizedDescription
            Diagnostics.logError("afterglow.refresh", error)
        }
        loading = false
    }

    private func send() {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !sending else { return }
        sending = true
        Task {
            do {
                try await cloud.postComment(tagId: tagId, text: message)
                text = ""
                await refresh()
            } catch {
                self.error = error.localizedDescription
                Diagnostics.logError("afterglow.postComment", error)
            }
            sending = false
        }
    }
}
