import Combine
import FirebaseCore
import SwiftUI

// MARK: - App

@main
struct TagAlongApp: App {
    @StateObject private var store = Store()
    @StateObject private var cloud = CloudStore()
    @StateObject private var cache = CloudCache()

    init() {
        // Catch even a startup crash.
        Diagnostics.install()
        // Must run before any CloudStore (Auth/Firestore) is created. @StateObject
        // defers CloudStore()'s autoclosure until first body eval, i.e. after this.
        FirebaseApp.configure()
        Haptics.prepare()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(cloud)
                .environmentObject(cache)
                .preferredColorScheme(.dark)
                .tint(Theme.brass)
        }
    }
}

// MARK: - Root (Watch feed + Sing tab)

struct RootView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @State private var tab: Tab = .watch
    @State private var showOnboarding = false
    enum Tab { case watch, sing }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            Group {
                switch tab {
                case .watch: WatchFeedView()
                case .sing:  SingView()
                }
            }
        }
        // The bar is a safe-area inset, not an overlay: everything lays out
        // above it by default, and full-bleed layers opt out explicitly with
        // .ignoresSafeArea() — nothing lands under the bar by accident.
        .safeAreaInset(edge: .bottom, spacing: 0) { BottomBar(tab: $tab) }
        .ignoresSafeArea(.keyboard)
        // Central surface for fire-and-forget publish failures.
        .alert("Community sync failed",
               isPresented: Binding(get: { cloud.errorMessage != nil },
                                    set: { if !$0 { cloud.errorMessage = nil } })) {
            Button("OK", role: .cancel) { cloud.errorMessage = nil }
        } message: {
            Text(cloud.errorMessage ?? "")
        }
        // The Store needs to know whose takes are "mine" (docs/10 §A/§F4).
        .onReceive(cloud.$uid) { store.myUid = $0 }
        .onAppear { showOnboarding = !cloud.hasOnboarded }
        .onChange(of: cloud.hasOnboarded) { _, done in if done { showOnboarding = false } }
        .fullScreenCover(isPresented: $showOnboarding) { OnboardingView() }
    }
}

struct BottomBar: View {
    @Binding var tab: RootView.Tab

    var body: some View {
        HStack(spacing: 0) {
            item(.watch, "play.rectangle.on.rectangle", "Watch")
            item(.sing,  "music.mic", "Sing")
        }
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(.ultraThinMaterial) // extends into the home-indicator area
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 0.5) }
    }

    private func item(_ t: RootView.Tab, _ icon: String, _ label: String) -> some View {
        let on = tab == t
        return Button {
            withAnimation(.easeInOut(duration: 0.15)) { tab = t }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 20))
                Text(label).font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(on ? Theme.brass : Theme.textSecondary)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Onboarding (docs/10 §D + §F1, M5-40 explainer)

/// A skippable 3-card explainer (what a tag is, how tagging along works,
/// headphones matter) followed by the "what do you sing" question that
/// actually completes onboarding. Swipeable or button-advanced; skip jumps
/// straight to the question. The whole thing clears in well under 15s.
struct OnboardingView: View {
    @EnvironmentObject var cloud: CloudStore
    @State private var page = 0
    private let pageCount = 4

    private func hint(_ part: Part) -> String {
        switch part {
        case .tenor: return "the high harmony"
        case .lead:  return "the melody"
        case .bari:  return "the in-between notes"
        case .bass:  return "the foundation"
        }
    }

    var body: some View {
        ZStack {
            Theme.stageGradient.ignoresSafeArea()
            TabView(selection: $page) {
                explainerCard(
                    emoji: "🎤",
                    title: "What's a tag?",
                    body: "A tag is the best 30 seconds of a song — four-part harmony, no instruments. Sing one part; the other three are strangers' voices, whenever they get to it."
                ).tag(0)
                explainerCard(
                    emoji: "🤝",
                    title: "Tagging along",
                    body: "Find an open part and sing along with what's already there. When the fourth voice lands, everyone gets notified — the chord rings."
                ).tag(1)
                explainerCard(
                    emoji: "🎧",
                    title: "Wear headphones",
                    body: "Recording without them lets your mic pick up the other parts through your speaker, and the mix turns to mud. Headphones keep every voice clean."
                ).tag(2)
                partPickerCard.tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            VStack {
                HStack {
                    Spacer()
                    if page < pageCount - 1 {
                        Button("Skip") { withAnimation { page = pageCount - 1 } }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                Spacer()
                if page < pageCount - 1 {
                    pageDots.padding(.bottom, 24)
                }
            }
        }
    }

    private func explainerCard(emoji: String, title: String, body text: String) -> some View {
        VStack(spacing: 18) {
            Spacer()
            Text(emoji).font(.system(size: 56))
            Text(title)
                .font(.system(.title2, design: .serif).weight(.semibold))
                .foregroundStyle(Theme.ivory)
            Text(text)
                .multilineTextAlignment(.center)
                .font(.body)
                .foregroundStyle(Theme.textPrimary)
                .padding(.horizontal, 12)
            Spacer()
            Button {
                withAnimation { page += 1 }
            } label: {
                Text("Next")
                    .font(.headline)
                    .foregroundStyle(Color(hex: 0x2E2410))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        LinearGradient(colors: [Theme.brassSoft, Theme.brass],
                                       startPoint: .top, endPoint: .bottom),
                        in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(PressScale())
            Spacer().frame(height: 36)
        }
        .padding(28)
    }

    private var partPickerCard: some View {
        VStack(spacing: 14) {
            Spacer()
            Text("TagAlong")
                .font(.system(size: 40, design: .serif).weight(.semibold))
                .foregroundStyle(Theme.ivory)
                .shadow(color: Theme.brass.opacity(0.4), radius: 10)
            Spacer()
            Text("WHAT DO YOU SING?")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(Theme.textSecondary)
            ForEach(Part.allCases) { part in
                Button { finish(part) } label: {
                    HStack(spacing: 10) {
                        Circle().fill(part.color).frame(width: 10, height: 10)
                        Text(part.label).font(.headline).foregroundStyle(Theme.textPrimary)
                        Spacer()
                        Text(hint(part)).font(.caption).foregroundStyle(Theme.textSecondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 13)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14)
                        .stroke(part.color.opacity(0.35), lineWidth: 1))
                }
                .buttonStyle(PressScale(scale: 0.97))
            }
            Button("Not sure yet") { finish(nil) }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.textSecondary)
                .padding(.top, 4)
            Spacer()
        }
        .padding(28)
    }

    private var pageDots: some View {
        HStack(spacing: 6) {
            ForEach(0..<pageCount, id: \.self) { i in
                Circle()
                    .fill(i == page ? Theme.brass : Theme.textSecondary.opacity(0.35))
                    .frame(width: 6, height: 6)
            }
        }
    }

    private func finish(_ part: Part?) {
        Haptics.success()
        cloud.completeOnboarding(part: part)
    }
}

// MARK: - Shared pills

struct SoloPill: View {
    let part: Part
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(part.color).frame(width: 8, height: 8)
            Text("Solo: \(part.label) — tap a tile to switch or exit")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(part.color.opacity(0.6), lineWidth: 1))
    }
}

// MARK: - Tag detail (the hub: watch + tag along)

/// What the record flow is asked to do: sing an open part, or replace a take.
struct RecordRequest: Identifiable {
    let part: Part
    let replacing: Take?
    var id: String { part.id }
}

struct TagDetailView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @Environment(\.dismiss) private var dismiss
    let tag: SongTag
    @StateObject private var player = QuartetPlayer()
    @State private var recording: RecordRequest?
    @State private var exportTrigger = false
    // Tile action model (docs/10 §G): the tapped tile, driving the action bar.
    @State private var focused: Part?
    @State private var nudgeTake: Take?
    @State private var creditsShown = false
    @State private var lyricsShown = false
    @State private var inviteShareShown = false
    @State private var confirmDeleteEveryone = false
    // Completion celebration: fires once on the false→true flip of isComplete
    // observed while this view is alive (i.e. the fourth part just landed).
    @State private var celebrating = false
    @State private var wasComplete = false

    /// Live tag so a re-key from the pitch pipe reflects immediately.
    private var liveTag: SongTag { store.tags.first(where: { $0.id == tag.id }) ?? tag }
    private var quartet: [Part: Take] { store.quartet(for: tag.id) }
    private var ownedParts: Set<Part> {
        Set(quartet.filter { store.isMine($0.value) }.keys)
    }

    var body: some View {
        // One coherent rule (see QuartetGrid doc): the video bleeds edge-to-edge
        // via .ignoresSafeArea(); every control lives in a chrome layer padded by
        // the real safe-area insets — which, on this pushed screen, INCLUDE the
        // custom tab bar's height — so nothing lands under the bar/home indicator.
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            ZStack {
                Color.black.ignoresSafeArea()
                QuartetGrid(
                    quartet: quartet,
                    player: player,
                    soloable: true,
                    ownedParts: ownedParts,
                    onRerecord: { part in resing(part) },
                    onDeleteTake: { part in removeVoice(part) },
                    onTileTap: { part in tapTile(part) },
                    onOpenPart: { part in startRecording(part) }
                )
                .ignoresSafeArea()

                VStack {
                    topBar(insets: insets)
                    Spacer()
                    bottomChrome
                }
                .padding(.bottom, insets.bottom + 16)
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: focused)

                if !quartet.isEmpty && focused == nil {
                    Button {
                        if player.isPlaying { player.pause() } else { Task { await player.play() } }
                    } label: {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(.white)
                            .frame(width: 64, height: 64)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .opacity(player.isPlaying ? 0.35 : 1)
                    .animation(.easeInOut(duration: 0.2), value: player.isPlaying)
                }

                // Pitch pipe floats fully above the tab bar (its own 20pt inset
                // sits on top of the safe-area bottom inset → clear of the bar).
                // Hidden while the action bar owns the bottom edge.
                if focused == nil {
                    VStack {
                        Spacer()
                        HStack { Spacer(); PitchPipeFab(tag: liveTag) }
                    }
                    .padding(.bottom, insets.bottom)
                }

                if celebrating {
                    CelebrationView(subtitle: "You tagged along — the chord rings") {
                        celebrating = false
                        player.load(takes: quartet, store: store)
                        Task { await player.play() }
                    }
                    .transition(.opacity)
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            player.load(takes: quartet, store: store)
            wasComplete = store.isComplete(tag.id)
        }
        .onChange(of: store.takes) { _, _ in
            player.load(takes: quartet, store: store)
            let nowComplete = store.isComplete(tag.id)
            if nowComplete && !wasComplete { celebrating = true }
            wasComplete = nowComplete
        }
        .onDisappear { player.pause() }
        .fullScreenCover(item: $recording) { req in
            RecordView(tag: liveTag, part: req.part, replacing: req.replacing)
        }
        .sheet(item: $nudgeTake) { take in NudgeSheet(take: take) }
        .sheet(isPresented: $creditsShown) {
            CreditsSheet(title: liveTag.title, owners: creditOwners)
        }
        .sheet(isPresented: $lyricsShown) { LyricsSheet(tag: liveTag) }
        .sheet(isPresented: $inviteShareShown) { ActivityView(items: [inviteMessage]) }
        .performanceExport(isActive: $exportTrigger, tag: liveTag, quartet: quartet, store: store) {
            player.pause()
        }
        .confirmationDialog("Delete this tag for everyone?",
                            isPresented: $confirmDeleteEveryone, titleVisibility: .visible) {
            Button("Delete for everyone", role: .destructive) {
                Task {
                    do {
                        try await cloud.deleteTagEverywhere(tag: liveTag, store: store)
                        dismiss()
                    } catch {
                        cloud.errorMessage = error.localizedDescription
                        Diagnostics.logError("deleteTagEverywhere", error)
                    }
                }
            }
        } message: {
            Text("Every voice on “\(liveTag.title)” disappears from the community. This can't be undone.")
        }
    }

    // MARK: Bottom chrome: action bar > solo pill > learn hint

    @ViewBuilder
    private var bottomChrome: some View {
        if let part = focused {
            TileActionBar(
                part: part,
                context: barContext(part),
                onResing: { resing(part) },
                onNudge: { if let take = quartet[part] { nudgeTake = take } },
                onRemoveVoice: { removeVoice(part) },
                onSingInstead: { singInstead(part) },
                onCredit: { creditsShown = true },
                onTagAlong: { startRecording(part) },
                onDismiss: { focused = nil; player.solo = nil }
            )
            .padding(.horizontal, 14)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if let solo = player.solo {
            SoloPill(part: solo)
        } else if !quartet.isEmpty && !store.isComplete(tag.id) {
            // The learn flow, surfaced (docs/10 §F3).
            Text("Tap a tile — solo a part to learn it")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Theme.textSecondary)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(.ultraThinMaterial, in: Capsule())
        }
    }

    private func barContext(_ part: Part) -> TileActionBar.Context {
        guard let take = quartet[part] else { return .empty }
        return store.isMine(take) ? .mine : .theirs
    }

    // MARK: Tile actions (docs/10 §G)

    private func tapTile(_ part: Part) {
        Haptics.select()
        // An empty tile has exactly one action — skip the bar and go straight
        // to recording, same as tapping "Tag Along" would. The action bar earns
        // its keep only where there's an actual choice (mine/theirs).
        guard quartet[part] != nil else {
            startRecording(part)
            return
        }
        if focused == part {
            focused = nil
            player.solo = nil
        } else {
            focused = part
            player.solo = part
        }
    }

    private func startRecording(_ part: Part) {
        player.pause()
        focused = nil
        recording = RecordRequest(part: part, replacing: nil)
    }

    private func resing(_ part: Part) {
        player.pause()
        focused = nil
        recording = RecordRequest(part: part, replacing: quartet[part])
    }

    /// "Sing this part instead" (docs/10 §F4): record WITHOUT replacing — the
    /// cloud keeps all takes, my cast switches to mine after the save.
    private func singInstead(_ part: Part) {
        player.pause()
        focused = nil
        recording = RecordRequest(part: part, replacing: nil)
    }

    private func removeVoice(_ part: Part) {
        guard let take = quartet[part], store.isMine(take) else { return }
        player.pause()
        focused = nil
        Task {
            do { try await cloud.removeMyTake(take, from: liveTag, store: store) }
            catch { cloud.errorMessage = error.localizedDescription }
        }
    }

    private var creditOwners: [Part: String?] {
        quartet.mapValues { store.isMine($0) ? nil : $0.ownerUid }
    }

    private var inviteMessage: String {
        let open = Part.allCases.first(where: { quartet[$0] == nil })
        let partText = open.map { "the \($0.label.lowercased())" } ?? "a part"
        let code = liveTag.inviteCode ?? ""
        return "Sing \(partText) with me on “\(liveTag.title)” — TagAlong code \(code)"
    }

    // MARK: Top bar

    private func topBar(insets: EdgeInsets) -> some View {
        HStack(alignment: .top) {
            Button { player.pause(); dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.ultraThinMaterial, in: Circle())
            }
            Spacer()
            VStack(spacing: 4) {
                Text(liveTag.title)
                    .font(.system(.headline, design: .serif))
                    .foregroundStyle(.white).shadow(radius: 4)
                KeyChip(key: liveTag.key)
            }
            Spacer()
            if liveTag.lyrics != nil || liveTag.notes != nil {
                Button { lyricsShown = true } label: {
                    Image(systemName: "text.quote")
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                }
            }
            if store.isComplete(tag.id) {
                ShareChromeButton { exportTrigger = true }
            }
            menu
        }
        .padding(.horizontal, 14)
        .padding(.top, insets.top + 6)
        .padding(.bottom, 40)
        .background(Theme.scrim(.top).padding(.top, -insets.top))
    }

    private var menu: some View {
        Menu {
            if liveTag.publishedAt == nil {
                Button {
                    Task {
                        do {
                            try await cloud.publish(tag: liveTag, takes: store.takes(for: tag.id), store: store)
                            cloud.failedTagIds.remove(liveTag.id)
                        } catch {
                            cloud.errorMessage = error.localizedDescription
                            cloud.failedTagIds.insert(liveTag.id)
                            Diagnostics.logError("publish", error)
                        }
                    }
                } label: { Label("Publish to community", systemImage: "icloud.and.arrow.up") }
                Button(role: .destructive) {
                    store.delete(tag: tag); dismiss()
                } label: { Label("Delete tag", systemImage: "trash") }
            } else {
                if cloud.failedTagIds.contains(liveTag.id) {
                    Button {
                        Task { await cloud.retryPublish(tag: liveTag, store: store) }
                    } label: { Label("Retry upload", systemImage: "arrow.clockwise.icloud") }
                }
                if let code = liveTag.inviteCode {
                    Button { inviteShareShown = true } label: {
                        Label("Share invite — code \(code)", systemImage: "ticket")
                    }
                }
                Button { creditsShown = true } label: {
                    Label("Credits", systemImage: "person.2")
                }
                // Role-aware delete (docs/10 §A).
                switch store.role(for: liveTag) {
                case .creator:
                    Button(role: .destructive) { confirmDeleteEveryone = true } label: {
                        Label("Delete tag for everyone", systemImage: "trash")
                    }
                    Button { store.delete(tag: tag); dismiss() } label: {
                        Label("Remove from my phone", systemImage: "iphone.slash")
                    }
                case .contributor:
                    Button(role: .destructive) {
                        Task {
                            do { try await cloud.removeMyVoice(from: liveTag, store: store) }
                            catch { cloud.errorMessage = error.localizedDescription }
                        }
                    } label: { Label("Remove my voice", systemImage: "mic.slash") }
                    Button { store.delete(tag: tag); dismiss() } label: {
                        Label("Remove from my phone", systemImage: "iphone.slash")
                    }
                case .viewer:
                    Button { store.delete(tag: tag); dismiss() } label: {
                        Label("Remove from my phone", systemImage: "iphone.slash")
                    }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.title3.bold())
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
        }
    }
}

/// Lyrics + notes for whoever's tagging along (docs/10 §F3).
struct LyricsSheet: View {
    let tag: SongTag

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(tag.title)
                    .font(.system(.title3, design: .serif).weight(.semibold))
                    .foregroundStyle(Theme.textPrimary)
                if let notes = tag.notes {
                    Text(notes)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.brassSoft)
                }
                if let lyrics = tag.lyrics {
                    Text(lyrics)
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(Theme.textPrimary)
                        .lineSpacing(5)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
        }
        .background(Theme.stageGradient.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }
}

/// Full-screen 2×2 part grid. Filled tiles play video; a tap either solos
/// (feed) or routes through the tile action model via `onTileTap` (detail —
/// docs/10 §G). Long-press stays as a shortcut on YOUR tiles only. Open tiles
/// invite tagging along. Part badges hug the CENTER seam — anchored to the
/// inner corner of each cell — so they can never fall under the notch, home
/// indicator, or tab bar no matter how far the grid bleeds.
struct QuartetGrid: View {
    let quartet: [Part: Take]
    @ObservedObject var player: QuartetPlayer
    var soloable: Bool = false
    /// Parts whose takes are mine — gates the long-press shortcut menu.
    var ownedParts: Set<Part> = []
    var onRerecord: ((Part) -> Void)? = nil
    var onDeleteTake: ((Part) -> Void)? = nil
    /// When set, ALL tile taps route here instead of the default tap-to-solo.
    var onTileTap: ((Part) -> Void)? = nil
    let onOpenPart: (Part) -> Void

    private let rows: [[Part]] = [[.tenor, .lead], [.bari, .bass]]

    var body: some View {
        VStack(spacing: 2) {
            ForEach(rows.indices, id: \.self) { r in
                HStack(spacing: 2) {
                    ForEach(rows[r]) { part in cell(part, topRow: r == 0) }
                }
            }
        }
    }

    @ViewBuilder
    private func cell(_ part: Part, topRow: Bool) -> some View {
        let soloed = player.solo == part
        let dimmed = player.solo != nil && !soloed

        ZStack(alignment: topRow ? .bottomLeading : .topLeading) {
            if player.slots[part] != nil {
                filledCell(part)
            } else if quartet[part] != nil {
                Rectangle().fill(Theme.card)   // decoding / not loaded
            } else {
                EmptyPartCell(part: part) {
                    if let onTileTap { onTileTap(part) } else { onOpenPart(part) }
                }
            }

            if dimmed { Color.black.opacity(0.45).allowsHitTesting(false) }
            PartBadge(part: part)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        // a filled tile eases in with a soft spring as its part lands
        .animation(.spring(response: 0.5, dampingFraction: 0.72), value: player.slots[part] != nil)
        .overlay {
            if soloed {
                Rectangle().stroke(part.color, lineWidth: 3)
                    .shadow(color: part.color.opacity(0.8), radius: 6)
                    .allowsHitTesting(false)
            }
        }
    }

    @ViewBuilder
    private func filledCell(_ part: Part) -> some View {
        let soloed = player.solo == part
        let base = PlayerLayerView(player: player.slots[part]!.player)
            .contentShape(Rectangle())
            .onTapGesture {
                if let onTileTap {
                    onTileTap(part)
                } else if soloable {
                    Haptics.select()
                    player.solo = soloed ? nil : part
                }
            }
        if let onRerecord, let onDeleteTake, ownedParts.contains(part) {
            base.contextMenu {
                Button { onRerecord(part) } label: {
                    Label("Re-sing", systemImage: "arrow.counterclockwise.circle")
                }
                Button(role: .destructive) { onDeleteTake(part) } label: {
                    Label("Remove my voice", systemImage: "mic.slash")
                }
            }
        } else {
            base
        }
    }
}

/// Dark cell tinted with the part color, inviting the user to tag along.
struct EmptyPartCell: View {
    let part: Part
    let onJoin: () -> Void

    var body: some View {
        Button(action: onJoin) {
            VStack(spacing: 8) {
                Image(systemName: "plus.circle.fill").font(.system(size: 30))
                Text("Tag Along").font(.subheadline.bold())
                Text("SING THE \(part.label.uppercased())")
                    .font(.system(size: 9, weight: .bold)).tracking(1.5)
                    .foregroundStyle(Theme.textSecondary)
            }
            .foregroundStyle(part.color)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                LinearGradient(colors: [part.color.opacity(0.18), Theme.card],
                               startPoint: .top, endPoint: .bottom)
            )
        }
        .buttonStyle(.plain)
    }
}

struct PartBadge: View {
    let part: Part
    var suffix: String = ""

    var body: some View {
        Text(part.label.uppercased() + suffix)
            .font(.system(size: 9, weight: .bold))
            .tracking(0.8)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(part.color, in: Capsule())
            .foregroundStyle(.black)
            .padding(8)
    }
}

// MARK: - Record

struct RecordView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @Environment(\.dismiss) private var dismiss
    let tag: SongTag
    let part: Part
    var replacing: Take? = nil
    @StateObject private var controller = RecordController()

    private var guideTakes: [Part: Take] {
        store.quartet(for: tag.id).filter { $0.key != part }
    }

    var body: some View {
        // Same rule as the rest of the app: camera/guides bleed edge-to-edge;
        // controls sit in chrome padded by the real insets. No tab bar here
        // (this is a fullScreenCover), so insets.bottom is the home indicator —
        // the record button and pitch pipe both clear it.
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            ZStack {
                Color.black.ignoresSafeArea()
                recordGrid.ignoresSafeArea()

                VStack {
                    HStack {
                        Button("Close") {
                            Task { await controller.stop(tagId: nil); controller.teardown(); dismiss() }
                        }
                        .foregroundStyle(.white)
                        Spacer()
                        Text("Tag along — \(part.label.lowercased())")
                            .font(.subheadline.bold()).foregroundStyle(.white)
                        Spacer()
                        Text(statusText)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(Theme.textSecondary)
                            .frame(minWidth: 56, alignment: .trailing)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, insets.top + 6)
                    .padding(.bottom, 36)
                    .background(Theme.scrim(.top).padding(.top, -insets.top))
                    Spacer()
                }

                if case .countIn = controller.stage {
                    Text("\(controller.countdown)")
                        .font(.system(size: 110, weight: .semibold, design: .serif))
                        .foregroundStyle(.white)
                        .shadow(radius: 14)
                }
                if case .failed(let message) = controller.stage {
                    VStack(spacing: 14) {
                        Text(message)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 30)
                        Button("Close") { dismiss() }.buttonStyle(.borderedProminent)
                    }
                    .padding(24)
                    .background(Theme.card.opacity(0.95), in: RoundedRectangle(cornerRadius: 18))
                    .padding(30)
                }

                VStack {
                    Spacer()
                    VStack(spacing: 10) {
                        // The joiner's context (docs/10 §F3): lyrics stay on
                        // screen through the count-in and the take itself.
                        if let lyrics = tag.lyrics {
                            ScrollView {
                                Text(lyrics)
                                    .font(.system(.callout, design: .serif))
                                    .foregroundStyle(.white)
                                    .multilineTextAlignment(.center)
                                    .frame(maxWidth: .infinity)
                            }
                            .frame(maxHeight: 110)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))
                            .padding(.horizontal, 28)
                        }
                        if let notes = tag.notes {
                            Text(notes)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Theme.brassSoft)
                        }
                        if controller.stage == .ready {
                            RecordButton(recording: false) { controller.begin(store: store) }
                        } else if controller.stage == .countIn || controller.stage == .recording {
                            RecordButton(recording: true) { stopAndSave() }
                        }
                        Text(guideTakes.isEmpty
                             ? "Tap the pipe for your pitch — four clicks count you in"
                             : "🎧 The other parts sing in your ears — four clicks, then join them")
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity)
                    .background(Theme.scrim(.bottom).padding(.bottom, -insets.bottom))
                }
                .padding(.bottom, insets.bottom)

                // Pitch pipe lifted above the record-button cluster, clear of the
                // home indicator and fully tappable beside the centered button.
                if controller.stage == .ready {
                    VStack {
                        Spacer()
                        HStack { Spacer(); PitchPipeFab(tag: tag) }
                    }
                    .padding(.bottom, insets.bottom + 88)
                }
            }
        }
        .task { await controller.prepare(guideTakes: guideTakes, store: store) }
        .onDisappear { controller.teardown() }
        // Tick a light impact with each count-in click the UI shows (observing
        // the controller's published stage — never driving the audio clock).
        .onChange(of: controller.countdown) { _, _ in
            if case .countIn = controller.stage { Haptics.light() }
        }
    }

    /// Stop → auto-save, no review step. When replacing (re-singing MY OWN
    /// take), the old take goes through store.delete — the only sanctioned way
    /// to remove a take's file. When singing a part someone else filled, both
    /// takes stay (docs/10 §F4 — swap-in, don't stomp) and my cast selection
    /// pins the new one.
    private func stopAndSave() {
        Task {
            await controller.stop(tagId: tag.id)
            guard var take = controller.pendingTake else { return } // stop failed → stage shows the error
            take.part = part
            if let replacing { store.delete(take: replacing) }
            store.add(take: take)
            store.setCast(tagId: tag.id, part: part, takeId: take.id)
            Haptics.success()
            controller.confirmSaved() // BEFORE teardown/dismiss — or the discard path deletes the saved file
            controller.teardown()
            publishToCloud(take)
            dismiss()
        }
    }

    /// Every tag is an open invitation, so the FIRST saved take publishes the
    /// whole tag; once published, each further take just uploads itself. Both
    /// are fire-and-forget — a failure surfaces via the app-level alert.
    private func publishToCloud(_ take: Take) {
        let liveTag = store.tags.first(where: { $0.id == tag.id }) ?? tag
        Task {
            do {
                if liveTag.publishedAt == nil {
                    try await cloud.publish(tag: liveTag, takes: store.takes(for: tag.id), store: store)
                } else {
                    try await cloud.publishTake(take, for: liveTag, store: store)
                }
                cloud.failedTagIds.remove(liveTag.id)
            } catch {
                cloud.errorMessage = error.localizedDescription
                cloud.failedTagIds.insert(liveTag.id)
                Diagnostics.logError("publish", error)
            }
        }
    }

    private var statusText: String {
        switch controller.stage {
        case .recording: return String(format: "REC %.0fs", controller.elapsedSec)
        case .countIn: return "count-in…"
        case .ready: return "ready"
        default: return ""
        }
    }

    private var recordGrid: some View {
        VStack(spacing: 2) {
            ForEach([0, 1], id: \.self) { r in
                HStack(spacing: 2) {
                    ForEach(r == 0 ? [Part.tenor, .lead] : [Part.bari, .bass]) { p in
                        ZStack(alignment: r == 0 ? .bottomLeading : .topLeading) {
                            if p == part {
                                CameraPreviewView(session: controller.recorder.session)
                                PartBadge(part: p, suffix: " · YOU")
                            } else if let slot = controller.guides.slots[p] {
                                PlayerLayerView(player: slot.player)
                                PartBadge(part: p)
                            } else {
                                Rectangle().fill(Theme.card)
                                PartBadge(part: p)
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                        .overlay {
                            if p == part && controller.stage == .recording {
                                Rectangle().stroke(Theme.record, lineWidth: 3)
                            }
                        }
                    }
                }
            }
        }
    }
}

struct RecordButton: View {
    let recording: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.medium()
            action()
        } label: {
            ZStack {
                Circle().stroke(.white.opacity(0.85), lineWidth: 4).frame(width: 74, height: 74)
                if recording {
                    RoundedRectangle(cornerRadius: 6).fill(Theme.record).frame(width: 30, height: 30)
                } else {
                    Circle().fill(Theme.record).frame(width: 58, height: 58)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.6), value: recording)
        }
        .buttonStyle(PressScale())
    }
}

// MARK: - Pitch pipe (editable key)

struct PitchPipeFab: View {
    @EnvironmentObject var store: Store
    let tag: SongTag
    @State private var open = false
    @State private var key: PitchKey

    init(tag: SongTag) {
        self.tag = tag
        _key = State(initialValue: tag.key)
    }

    var body: some View {
        Button { open = true } label: {
            VStack(spacing: 1) {
                Text(key.rawValue).font(.system(.title3, design: .serif).bold())
                Text("PITCH").font(.system(size: 7, weight: .bold)).tracking(1)
            }
            .frame(width: 56, height: 56)
            .background(brassOrb(center: .init(x: 0.35, y: 0.3), radius: 44), in: Circle())
            .foregroundStyle(Color(hex: 0x2E2410))
            .shadow(radius: 8, y: 4)
        }
        .padding(20)
        .sheet(isPresented: $open) { sheet }
    }

    private var sheet: some View {
        VStack(spacing: 20) {
            Text("Your pitch").font(.headline).foregroundStyle(Theme.textPrimary).padding(.top, 24)

            Button { AudioClock.shared.playPitch(key) } label: {
                VStack(spacing: 4) {
                    Text(key.rawValue).font(.system(size: 40, design: .serif).bold())
                    Text("TAP TO BLOW").font(.system(size: 9, weight: .bold)).tracking(1.5)
                }
                .frame(width: 130, height: 130)
                .background(brassOrb(center: .init(x: 0.35, y: 0.3), radius: 104), in: Circle())
                .foregroundStyle(Color(hex: 0x2E2410))
            }

            Text("Set the key — tap any note")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.textSecondary)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                ForEach(PitchKey.allCases) { k in
                    let selected = k == key
                    Button { select(k) } label: {
                        Text(k.rawValue)
                            .font(.system(.body, design: .serif).weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(selected ? Theme.brass : Theme.card,
                                        in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(selected ? Color(hex: 0x2E2410) : Theme.textPrimary)
                            .overlay(RoundedRectangle(cornerRadius: 10)
                                .stroke(selected ? Color.clear : Theme.line, lineWidth: 1))
                    }
                }
            }
            .padding(.horizontal, 20)
            Spacer(minLength: 8)
        }
        .background(Theme.stageGradient.ignoresSafeArea())
        .presentationDetents([.height(440)])
    }

    /// Play the note and, since the pipe is always opened in a tag's context,
    /// re-key the tag immediately.
    private func select(_ k: PitchKey) {
        Haptics.select()
        key = k
        AudioClock.shared.playPitch(k)
        var t = store.tags.first(where: { $0.id == tag.id }) ?? tag
        if t.key != k {
            t.key = k
            store.update(tag: t)
        }
    }

    private func brassOrb(center: UnitPoint, radius: CGFloat) -> RadialGradient {
        RadialGradient(colors: [Theme.brassSoft, Color(hex: 0x8A6A24)],
                       center: center, startRadius: 6, endRadius: radius)
    }
}
