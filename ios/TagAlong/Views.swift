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
        ZStack(alignment: .bottom) {
            Theme.bg.ignoresSafeArea()
            Group {
                switch tab {
                case .watch: WatchFeedView()
                case .sing:  SingView()
                }
            }
            BottomBar(tab: $tab)
        }
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
        .background(.ultraThinMaterial)
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
        ZStack {
            Theme.stageGradient.ignoresSafeArea()
            if completed.isEmpty {
                FeedEmptyState()
            } else {
                ScrollView(.vertical) {
                    LazyVStack(spacing: 0) {
                        ForEach(completed) { tag in
                            FeedPage(tag: tag, isCurrent: currentId == tag.id)
                                .containerRelativeFrame([.horizontal, .vertical])
                                .id(tag.id)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $currentId)
                .ignoresSafeArea()
                .onAppear { if currentId == nil { currentId = completed.first?.id } }
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

    @StateObject private var player = QuartetPlayer()
    @State private var userPaused = false
    @State private var showedSoloHint = false

    private var quartet: [Part: Take] { store.quartet(for: tag.id) }

    var body: some View {
        ZStack {
            Color.black
            QuartetGrid(quartet: quartet, player: player, soloable: true, onOpenPart: { _ in })
                .ignoresSafeArea()

            VStack {
                topBar
                Spacer()
            }

            transportButton

            if let solo = player.solo {
                VStack {
                    Spacer()
                    SoloPill(part: solo).padding(.bottom, 96)
                }
            }
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
        .padding(.top, 8)
        .padding(.bottom, 40)
        .background(Theme.scrim(.top).ignoresSafeArea(edges: .top))
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
        .opacity(player.isPlaying ? 0.0 : 1)
        .animation(.easeInOut(duration: 0.2), value: player.isPlaying)
        .allowsHitTesting(!player.isPlaying)
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
            .safeAreaPadding(.bottom, 60)
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

struct TagDetailView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let tag: SongTag
    @StateObject private var player = QuartetPlayer()
    @State private var recordingPart: Part?

    /// Live tag so a re-key from the pitch pipe reflects immediately.
    private var liveTag: SongTag { store.tags.first(where: { $0.id == tag.id }) ?? tag }
    private var quartet: [Part: Take] { store.quartet(for: tag.id) }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            QuartetGrid(
                quartet: quartet,
                player: player,
                soloable: true,
                onOpenPart: { part in
                    player.pause()
                    recordingPart = part
                }
            )
            .ignoresSafeArea()

            VStack {
                topBar
                Spacer()
                if let solo = player.solo { SoloPill(part: solo).padding(.bottom, 24) }
            }

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
                .opacity(player.isPlaying ? 0.0 : 1)
                .animation(.easeInOut(duration: 0.2), value: player.isPlaying)
                .allowsHitTesting(!player.isPlaying)
            }
        }
        .overlay(alignment: .bottomTrailing) { PitchPipeFab(tag: liveTag) }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { player.load(takes: quartet, store: store) }
        .onChange(of: store.takes.count) { _, _ in player.load(takes: quartet, store: store) }
        .onDisappear { player.pause() }
        .fullScreenCover(item: $recordingPart) { part in
            RecordView(tag: liveTag, part: part)
        }
    }

    private var topBar: some View {
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
        .padding(.top, 8)
        .padding(.bottom, 40)
        .background(Theme.scrim(.top).ignoresSafeArea(edges: .top))
    }
}

/// Full-screen 2×2 part grid. Filled tiles play video and toggle solo on tap;
/// open tiles invite joining. Fills whatever container it is placed in.
struct QuartetGrid: View {
    let quartet: [Part: Take]
    let player: QuartetPlayer
    var soloable: Bool = false
    let onOpenPart: (Part) -> Void

    private let rows: [[Part]] = [[.tenor, .lead], [.bari, .bass]]

    var body: some View {
        VStack(spacing: 2) {
            ForEach(rows.indices, id: \.self) { r in
                HStack(spacing: 2) {
                    ForEach(rows[r]) { part in cell(part) }
                }
            }
        }
    }

    @ViewBuilder
    private func cell(_ part: Part) -> some View {
        let soloed = player.solo == part
        let dimmed = player.solo != nil && !soloed

        ZStack(alignment: .bottomLeading) {
            if let slot = player.slots[part] {
                PlayerLayerView(player: slot.player)
                    .contentShape(Rectangle())
                    .onTapGesture { if soloable { player.solo = soloed ? nil : part } }
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
    @StateObject private var controller = RecordController()

    private var guideTakes: [Part: Take] {
        store.quartet(for: tag.id).filter { $0.key != part }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            recordGrid.ignoresSafeArea()

            // top scrim + controls
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
                .padding(.top, 8)
                .padding(.bottom, 36)
                .background(Theme.scrim(.top).ignoresSafeArea(edges: .top))
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

            // bottom scrim + transport
            VStack {
                Spacer()
                VStack(spacing: 10) {
                    if controller.stage == .ready {
                        RecordButton(recording: false) { controller.begin(store: store) }
                    } else if controller.stage == .countIn || controller.stage == .recording {
                        RecordButton(recording: true) {
                            Task { await controller.stop(tagId: tag.id) }
                        }
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
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity)
                .background(Theme.scrim(.bottom).ignoresSafeArea(edges: .bottom))
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if controller.stage == .ready { PitchPipeFab(tag: tag).padding(.bottom, 90) }
        }
        .task { await controller.prepare(guideTakes: guideTakes, store: store) }
        .onDisappear { controller.teardown() }
        .sheet(isPresented: Binding(
            get: { controller.stage == .review },
            set: { if !$0 { controller.discardPending() } }
        )) {
            if let pending = controller.pendingTake {
                ReviewView(
                    tag: tag,
                    part: part,
                    pending: pending,
                    guideTakes: guideTakes,
                    onSave: { take in
                        var t = take
                        t.part = part
                        store.add(take: t)
                        controller.confirmSaved() // before dismiss — or the discard handler deletes the saved file
                        controller.teardown()
                        dismiss()
                    },
                    onRetake: { controller.discardPending() }
                )
                .interactiveDismissDisabled()
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
            ForEach([[Part.tenor, .lead], [Part.bari, .bass]], id: \.self) { row in
                HStack(spacing: 2) {
                    ForEach(row) { p in
                        ZStack(alignment: .bottomLeading) {
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

// MARK: - Review

struct ReviewView: View {
    @EnvironmentObject var store: Store
    let tag: SongTag
    let part: Part
    let pending: Take
    let guideTakes: [Part: Take]
    let onSave: (Take) -> Void
    let onRetake: () -> Void

    @StateObject private var player = QuartetPlayer()
    @State private var nudgeMs: Double = 0

    var body: some View {
        VStack(spacing: 18) {
            Text("Lock it in").font(.title3.bold()).foregroundStyle(Theme.textPrimary).padding(.top, 18)

            ZStack {
                QuartetGrid(quartet: reviewTakes, player: player, soloable: true, onOpenPart: { _ in })
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                Button {
                    if player.isPlaying { player.pause() } else { Task { await player.play() } }
                } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .frame(width: 58, height: 58)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .opacity(player.isPlaying ? 0.0 : 1)
                .allowsHitTesting(!player.isPlaying)
            }
            .padding(.horizontal)

            if !guideTakes.isEmpty {
                VStack(spacing: 6) {
                    HStack {
                        Text("Timing nudge").font(.caption.bold()).foregroundStyle(Theme.textSecondary)
                        Spacer()
                        Text("\(nudgeMs > 0 ? "+" : "")\(Int(nudgeMs)) ms")
                            .font(.caption.monospacedDigit().bold())
                            .foregroundStyle(Theme.textPrimary)
                    }
                    Slider(value: $nudgeMs, in: -150...150, step: 5) { editing in
                        if !editing { reloadPlayer() }
                    }
                }
                .padding(.horizontal, 24)
            }

            Spacer()

            HStack(spacing: 12) {
                Button("Re-record") { player.pause(); onRetake() }
                    .buttonStyle(.bordered)
                Button("Sounds locked ✓") {
                    player.pause()
                    var take = pending
                    take.nudgeSec = nudgeMs / 1000
                    onSave(take)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(.bottom, 24)
        }
        .background(Theme.stageGradient.ignoresSafeArea())
        .onAppear { reloadPlayer() }
        .onDisappear { player.pause() }
    }

    private var reviewTakes: [Part: Take] {
        var takes = guideTakes
        var mine = pending
        mine.part = part
        mine.nudgeSec = nudgeMs / 1000
        takes[part] = mine
        return takes
    }

    private func reloadPlayer() {
        let wasPlaying = player.isPlaying
        player.load(takes: reviewTakes, store: store)
        if wasPlaying { Task { await player.play() } }
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
