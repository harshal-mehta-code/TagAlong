import SwiftUI

// MARK: - App

@main
struct TagAlongApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                HomeView()
            }
            .environmentObject(store)
            .preferredColorScheme(.dark)
            .tint(Color(red: 0.78, green: 0.60, blue: 0.24))
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @EnvironmentObject var store: Store
    @State private var showNewTag = false

    var body: some View {
        Group {
            if store.tags.isEmpty {
                VStack(spacing: 14) {
                    Text("🎶").font(.system(size: 56))
                    Text("Start a tag").font(.title2.bold())
                    Text("Record one part; the other three\nsing along whenever they want.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Button("New tag") { showNewTag = true }
                        .buttonStyle(.borderedProminent)
                        .padding(.top, 8)
                }
            } else {
                List {
                    ForEach(store.tags) { tag in
                        NavigationLink(value: tag.id) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(tag.title).font(.headline)
                                Text("Key of \(tag.key.rawValue) · \(store.takes(for: tag.id).count) take\(store.takes(for: tag.id).count == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("TagAlong")
        .toolbar {
            Button { showNewTag = true } label: { Image(systemName: "plus") }
        }
        .sheet(isPresented: $showNewTag) { NewTagSheet() }
        .navigationDestination(for: UUID.self) { tagId in
            if let tag = store.tags.first(where: { $0.id == tagId }) {
                TagDetailView(tag: tag)
            }
        }
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
    let tag: SongTag
    @StateObject private var player = QuartetPlayer()
    @State private var recordingPart: Part?

    private var quartet: [Part: Take] { store.quartet(for: tag.id) }

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                QuartetGrid(
                    quartet: quartet,
                    player: player,
                    onOpenPart: { part in
                        player.pause()
                        recordingPart = part
                    }
                )
                if !quartet.isEmpty {
                    Button {
                        if player.isPlaying {
                            player.pause()
                        } else {
                            Task { await player.play() }
                        }
                    } label: {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title2)
                            .frame(width: 58, height: 58)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .opacity(player.isPlaying ? 0.35 : 1)
                }
            }
            .padding(.horizontal)

            if !quartet.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Part.allCases.filter { quartet[$0] != nil }) { part in
                        Button {
                            player.solo = player.solo == part ? nil : part
                        } label: {
                            Text(player.solo == part ? "\(part.label) only" : part.label)
                                .font(.caption.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(player.solo == part ? part.color : Color(.systemGray5), in: Capsule())
                                .foregroundStyle(player.solo == part ? .black : .primary)
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal)
            }
            Spacer()
        }
        .navigationTitle(tag.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Menu {
                Button(role: .destructive) { store.delete(tag: tag) } label: {
                    Label("Delete tag", systemImage: "trash")
                }
            } label: { Image(systemName: "ellipsis.circle") }
        }
        .overlay(alignment: .bottomTrailing) {
            PitchPipeFab(key: tag.key)
        }
        .onAppear { player.load(takes: quartet, store: store) }
        .onChange(of: store.takes.count) { player.load(takes: quartet, store: store) }
        .onDisappear { player.pause() }
        .fullScreenCover(item: $recordingPart) { part in
            RecordView(tag: tag, part: part)
        }
    }
}

/// 2×2 part grid: filled cells show video, open cells invite joining.
struct QuartetGrid: View {
    let quartet: [Part: Take]
    let player: QuartetPlayer
    let onOpenPart: (Part) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)], spacing: 3) {
            ForEach(Part.allCases) { part in
                ZStack(alignment: .bottomLeading) {
                    if let slot = player.slots[part] {
                        PlayerLayerView(player: slot.player)
                    } else if quartet[part] != nil {
                        Color(.systemGray6)
                    } else {
                        Button { onOpenPart(part) } label: {
                            VStack(spacing: 6) {
                                Image(systemName: "plus.circle.fill").font(.title2)
                                Text("Sing the \(part.label)").font(.caption.bold())
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(Color(.systemGray6))
                            .foregroundStyle(part.color)
                        }
                    }
                    PartBadge(part: part)
                }
                .frame(height: 168)
                .clipped()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
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
            .padding(6)
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
        VStack(spacing: 0) {
            HStack {
                Button("Close") {
                    Task { await controller.stop(tagId: nil); controller.teardown(); dismiss() }
                }
                Spacer()
                Text("Sing the \(part.label) · \(tag.title)").font(.subheadline.bold())
                Spacer()
                Text(statusText).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            .padding()

            ZStack {
                recordGrid
                if case .countIn = controller.stage {
                    Text("\(controller.countdown)")
                        .font(.system(size: 96, weight: .semibold, design: .serif))
                        .shadow(radius: 12)
                }
                if case .failed(let message) = controller.stage {
                    VStack(spacing: 12) {
                        Text(message).multilineTextAlignment(.center).padding(.horizontal, 30)
                        Button("Close") { dismiss() }
                    }
                }
            }
            .padding(.horizontal)

            Spacer()

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
                .foregroundStyle(.secondary)
                .padding(.vertical, 12)
        }
        .overlay(alignment: .bottomTrailing) {
            if controller.stage == .ready { PitchPipeFab(key: tag.key) }
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
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)], spacing: 3) {
            ForEach(Part.allCases) { p in
                ZStack(alignment: .bottomLeading) {
                    if p == part {
                        CameraPreviewView(session: controller.recorder.session)
                        PartBadge(part: p, suffix: " · YOU")
                    } else if let slot = controller.guides.slots[p] {
                        PlayerLayerView(player: slot.player)
                        PartBadge(part: p)
                    } else {
                        Color(.systemGray6)
                        PartBadge(part: p)
                    }
                }
                .frame(height: 168)
                .clipped()
                .overlay(RoundedRectangle(cornerRadius: 0).stroke(
                    p == part && controller.stage == .recording ? Color.red : .clear, lineWidth: 2))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
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
                    RoundedRectangle(cornerRadius: 6).fill(.red).frame(width: 30, height: 30)
                } else {
                    Circle().fill(.red).frame(width: 58, height: 58)
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
            Text("Lock it in").font(.title3.bold()).padding(.top, 18)

            ZStack {
                QuartetGrid(quartet: reviewTakes, player: player, onOpenPart: { _ in })
                Button {
                    if player.isPlaying { player.pause() } else { Task { await player.play() } }
                } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2)
                        .frame(width: 58, height: 58)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .opacity(player.isPlaying ? 0.35 : 1)
            }
            .padding(.horizontal)

            if !guideTakes.isEmpty {
                VStack(spacing: 6) {
                    HStack {
                        Text("Timing nudge").font(.caption.bold())
                        Spacer()
                        Text("\(nudgeMs > 0 ? "+" : "")\(Int(nudgeMs)) ms")
                            .font(.caption.monospacedDigit().bold())
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

// MARK: - Pitch pipe

struct PitchPipeFab: View {
    let key: PitchKey
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            VStack(spacing: 1) {
                Text(key.rawValue).font(.system(.title3, design: .serif).bold())
                Text("PITCH").font(.system(size: 7, weight: .bold)).tracking(1)
            }
            .frame(width: 56, height: 56)
            .background(
                RadialGradient(colors: [Color(red: 0.89, green: 0.78, blue: 0.52), Color(red: 0.54, green: 0.42, blue: 0.14)],
                               center: .init(x: 0.35, y: 0.3), startRadius: 4, endRadius: 44),
                in: Circle()
            )
            .foregroundStyle(Color(red: 0.18, green: 0.14, blue: 0.06))
            .shadow(radius: 8, y: 4)
        }
        .padding(20)
        .sheet(isPresented: $open) {
            VStack(spacing: 22) {
                Text("Your pitch").font(.headline).padding(.top, 26)
                Button { AudioClock.shared.playPitch(key) } label: {
                    VStack(spacing: 4) {
                        Text(key.rawValue).font(.system(size: 40, design: .serif).bold())
                        Text("TAP TO BLOW").font(.system(size: 9, weight: .bold)).tracking(1.5)
                    }
                    .frame(width: 136, height: 136)
                    .background(
                        RadialGradient(colors: [Color(red: 0.89, green: 0.78, blue: 0.52), Color(red: 0.54, green: 0.42, blue: 0.14)],
                                       center: .init(x: 0.35, y: 0.3), startRadius: 8, endRadius: 108),
                        in: Circle()
                    )
                    .foregroundStyle(Color(red: 0.18, green: 0.14, blue: 0.06))
                }
                Spacer()
            }
            .presentationDetents([.height(280)])
        }
    }
}

extension Part {
    // fullScreenCover(item:) needs Identifiable — Part already is.
}
