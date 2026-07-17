import SwiftUI

// MARK: - App

@main
struct TagAlongApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .tint(Theme.brass)
        }
    }
}

// MARK: - Root (Watch feed + Sing tab)

struct RootView: View {
    @State private var tab: Tab = .watch
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

// MARK: - Watch feed

struct WatchFeedView: View {
    @EnvironmentObject var store: Store
    @State private var currentId: UUID?

    private var completed: [SongTag] {
        store.tags.filter { store.isComplete($0.id) }
    }

    var body: some View {
        // The GeometryReader sits in normal, safe-area-respecting layout, so
        // its insets are the real device + tab-bar insets. Only the pager goes
        // full-bleed; each page pads its overlay chrome by these insets.
        GeometryReader { geo in
            ZStack {
                Theme.stageGradient.ignoresSafeArea()
                if completed.isEmpty {
                    FeedEmptyState().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView(.vertical) {
                        LazyVStack(spacing: 0) {
                            ForEach(completed) { tag in
                                FeedPage(tag: tag,
                                         isCurrent: currentId == tag.id,
                                         insets: geo.safeAreaInsets)
                                    .containerRelativeFrame([.horizontal, .vertical])
                                    .id(tag.id)
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollTargetBehavior(.paging)
                    .scrollPosition(id: $currentId)
                    .scrollIndicators(.hidden)
                    .ignoresSafeArea()
                    .onAppear { if currentId == nil { currentId = completed.first?.id } }
                }
            }
        }
    }
}

struct FeedEmptyState: View {
    var body: some View {
        VStack(spacing: 14) {
            Text("🎭").font(.system(size: 60))
            Text("No performances yet").font(.title2.bold()).foregroundStyle(Theme.textPrimary)
            Text("When all four parts of a tag are sung,\nthe quartet takes the stage here.")
                .multilineTextAlignment(.center)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
            Text("Head to the Sing tab to start one →")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.brass)
                .padding(.top, 4)
        }
        .padding(40)
    }
}

/// One full-bleed performance page. Auto-plays and loops while current; the
/// only page allowed to hold a loaded QuartetPlayer (4 AVPlayers).
struct FeedPage: View {
    @EnvironmentObject var store: Store
    let tag: SongTag
    let isCurrent: Bool
    let insets: EdgeInsets

    @StateObject private var player = QuartetPlayer()
    @State private var userPaused = false

    private var quartet: [Part: Take] { store.quartet(for: tag.id) }

    var body: some View {
        ZStack {
            Color.black
            QuartetGrid(quartet: quartet, player: player, soloable: true, onOpenPart: { _ in })

            // overlay chrome padded by the real safe-area insets (the pager
            // ignores safe areas, so they must be applied by hand here)
            VStack {
                topBar
                Spacer()
                if let solo = player.solo {
                    SoloPill(part: solo).padding(.bottom, 16)
                }
            }
            .padding(.top, insets.top)
            .padding(.bottom, insets.bottom)

            transportButton
        }
        .onAppear { if isCurrent { activate() } }
        .onChange(of: isCurrent) { _, cur in cur ? activate() : deactivate() }
        .onDisappear { deactivate() }
        .onChange(of: player.isPlaying) { _, playing in
            // natural end (not a manual pause) → loop the performance
            if !playing, isCurrent, !userPaused, !player.slots.isEmpty {
                Task { await player.play() }
            }
        }
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(tag.title)
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .shadow(radius: 4)
                KeyChip(key: tag.key)
            }
            Spacer()
            Menu {
                Button(role: .destructive) { store.delete(tag: tag) } label: {
                    Label("Delete performance", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
        .padding(.bottom, 40)
        .background(Theme.scrim(.top).padding(.top, -insets.top)) // scrim reaches the physical top
    }

    private var transportButton: some View {
        Button {
            if player.isPlaying {
                userPaused = true
                player.pause()
            } else {
                userPaused = false
                Task { await player.play() }
            }
        } label: {
            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 26))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.2), lineWidth: 1))
        }
        // stays faintly visible while playing — transport must never be
        // unreachable (a hidden button + a stalled player = a dead screen)
        .opacity(player.isPlaying ? 0.35 : 1)
        .animation(.easeInOut(duration: 0.2), value: player.isPlaying)
    }

    private func activate() {
        userPaused = false
        player.load(takes: quartet, store: store)
        Task { await player.play() }
    }
    private func deactivate() { player.unload() }
}

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

// MARK: - Sing tab

struct SingView: View {
    @EnvironmentObject var store: Store
    @State private var showNewTag = false

    private var openTags: [SongTag] {
        store.tags.filter { !store.isComplete($0.id) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Button { showNewTag = true } label: {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                            Text("Start a Tag").font(.headline)
                        }
                        .foregroundStyle(Color(hex: 0x2E2410))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(
                            LinearGradient(colors: [Theme.brassSoft, Theme.brass],
                                           startPoint: .top, endPoint: .bottom),
                            in: RoundedRectangle(cornerRadius: 16))
                        .shadow(color: Theme.brass.opacity(0.35), radius: 10, y: 4)
                    }

                    if openTags.isEmpty {
                        VStack(spacing: 10) {
                            Text("🎙️").font(.system(size: 48))
                            Text("Nothing in progress")
                                .font(.headline).foregroundStyle(Theme.textPrimary)
                            Text("Start a tag and record one part —\nothers can tag along on the rest.")
                                .multilineTextAlignment(.center)
                                .font(.subheadline)
                                .foregroundStyle(Theme.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else {
                        Text("In progress")
                            .font(.caption.weight(.bold))
                            .tracking(1)
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.top, 4)
                        ForEach(openTags) { tag in
                            NavigationLink(value: tag.id) { OpenTagCard(tag: tag) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                .padding(18)
            }
            .background(Theme.stageGradient.ignoresSafeArea())
            .navigationTitle("Sing")
            .navigationDestination(for: UUID.self) { tagId in
                if let tag = store.tags.first(where: { $0.id == tagId }) {
                    TagDetailView(tag: tag)
                }
            }
            .sheet(isPresented: $showNewTag) { NewTagSheet() }
        }
    }
}

struct OpenTagCard: View {
    @EnvironmentObject var store: Store
    let tag: SongTag

    private var quartet: [Part: Take] { store.quartet(for: tag.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(tag.title).font(.headline).foregroundStyle(Theme.textPrimary)
                Spacer()
                KeyChip(key: tag.key)
            }
            HStack(spacing: 8) {
                ForEach(Part.allCases) { part in
                    let filled = quartet[part] != nil
                    HStack(spacing: 5) {
                        Circle()
                            .fill(filled ? part.color : Color.clear)
                            .overlay(Circle().stroke(part.color.opacity(filled ? 0 : 0.7),
                                                     style: StrokeStyle(lineWidth: 1.5, dash: [2.5])))
                            .frame(width: 9, height: 9)
                        Text(part.label)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(filled ? Theme.textPrimary : Theme.textSecondary)
                    }
                    if part != Part.allCases.last { Spacer() }
                }
            }
        }
        .padding(16)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line, lineWidth: 1))
    }
}

struct NewTagSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var key: PitchKey = .Bb

    var body: some View {
        NavigationStack {
            Form {
                TextField("Tag name (e.g. Lost Chord)", text: $title)
                Picker("Key", selection: $key) {
                    ForEach(PitchKey.allCases) { k in Text(k.rawValue).tag(k) }
                }
            }
            .navigationTitle("New tag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        store.add(tag: SongTag(title: title.isEmpty ? "Untitled tag" : title, key: key))
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Tag detail (the hub: watch + join)

/// What the record flow is asked to do: sing an open part, or replace a take.
struct RecordRequest: Identifiable {
    let part: Part
    let replacing: Take?
    var id: String { part.id }
}

struct TagDetailView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let tag: SongTag
    @StateObject private var player = QuartetPlayer()
    @State private var recording: RecordRequest?

    /// Live tag so a re-key from the pitch pipe reflects immediately.
    private var liveTag: SongTag { store.tags.first(where: { $0.id == tag.id }) ?? tag }
    private var quartet: [Part: Take] { store.quartet(for: tag.id) }

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
                    onRerecord: { part in
                        player.pause()
                        recording = RecordRequest(part: part, replacing: quartet[part])
                    },
                    onDeleteTake: { part in
                        player.pause()
                        if let take = quartet[part] { store.delete(take: take) }
                    },
                    onOpenPart: { part in
                        player.pause()
                        recording = RecordRequest(part: part, replacing: nil)
                    }
                )
                .ignoresSafeArea()

                VStack {
                    topBar(insets: insets)
                    Spacer()
                    if let solo = player.solo { SoloPill(part: solo) }
                }
                .padding(.bottom, insets.bottom + 16)

                if !quartet.isEmpty {
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
                VStack {
                    Spacer()
                    HStack { Spacer(); PitchPipeFab(tag: liveTag) }
                }
                .padding(.bottom, insets.bottom)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { player.load(takes: quartet, store: store) }
        .onChange(of: store.takes.count) { _, _ in player.load(takes: quartet, store: store) }
        .onDisappear { player.pause() }
        .fullScreenCover(item: $recording) { req in
            RecordView(tag: liveTag, part: req.part, replacing: req.replacing)
        }
    }

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
                Text(liveTag.title).font(.headline).foregroundStyle(.white).shadow(radius: 4)
                KeyChip(key: liveTag.key)
            }
            Spacer()
            Menu {
                Button(role: .destructive) {
                    store.delete(tag: tag); dismiss()
                } label: { Label("Delete tag", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, insets.top + 6)
        .padding(.bottom, 40)
        .background(Theme.scrim(.top).padding(.top, -insets.top))
    }
}

/// Full-screen 2×2 part grid. Filled tiles play video and toggle solo on tap
/// (long-press for re-record/delete when those closures are provided); open
/// tiles invite joining. Part badges hug the CENTER seam — anchored to the
/// inner corner of each cell — so they can never fall under the notch, home
/// indicator, or tab bar no matter how far the grid bleeds.
struct QuartetGrid: View {
    let quartet: [Part: Take]
    let player: QuartetPlayer
    var soloable: Bool = false
    var onRerecord: ((Part) -> Void)? = nil
    var onDeleteTake: ((Part) -> Void)? = nil
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
                EmptyPartCell(part: part) { onOpenPart(part) }
            }

            if dimmed { Color.black.opacity(0.45).allowsHitTesting(false) }
            PartBadge(part: part)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
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
            .onTapGesture { if soloable { player.solo = soloed ? nil : part } }
        if let onRerecord, let onDeleteTake {
            base.contextMenu {
                Button { onRerecord(part) } label: {
                    Label("Re-record part", systemImage: "arrow.counterclockwise.circle")
                }
                Button(role: .destructive) { onDeleteTake(part) } label: {
                    Label("Delete take", systemImage: "trash")
                }
            }
        } else {
            base
        }
    }
}

/// Dark cell tinted with the part color, inviting the user to sing it.
struct EmptyPartCell: View {
    let part: Part
    let onJoin: () -> Void

    var body: some View {
        Button(action: onJoin) {
            VStack(spacing: 8) {
                Image(systemName: "plus.circle.fill").font(.system(size: 30))
                Text("Sing the \(part.label)").font(.subheadline.bold())
                Text("OPEN SLOT")
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
                        Text("Sing the \(part.label)").font(.subheadline.bold()).foregroundStyle(.white)
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
    }

    /// Stop → auto-save, no review step. When replacing, the old take goes
    /// through store.delete (the only sanctioned way to remove a take's file)
    /// so quartet(for:) — which picks the FIRST take per part — sees only the
    /// new one.
    private func stopAndSave() {
        Task {
            await controller.stop(tagId: tag.id)
            guard var take = controller.pendingTake else { return } // stop failed → stage shows the error
            take.part = part
            if let replacing { store.delete(take: replacing) }
            store.add(take: take)
            controller.confirmSaved() // BEFORE teardown/dismiss — or the discard path deletes the saved file
            controller.teardown()
            dismiss()
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
        Button(action: action) {
            ZStack {
                Circle().stroke(.white.opacity(0.85), lineWidth: 4).frame(width: 74, height: 74)
                if recording {
                    RoundedRectangle(cornerRadius: 6).fill(Theme.record).frame(width: 30, height: 30)
                } else {
                    Circle().fill(Theme.record).frame(width: 58, height: 58)
                }
            }
        }
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
