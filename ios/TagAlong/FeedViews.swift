import SwiftUI

// MARK: - Watch feed v2 (docs/10 §A, §B, WP7)

/// Full-bleed vertical pager. Library performances play from Documents; the
/// community streams from the CloudCache and NEVER touches the Store —
/// watching is not keeping. Open tags interleave every few pages as
/// invitations: the partial mix plays, and the hole you'd fill is the hook.
struct WatchFeedView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @EnvironmentObject var cache: CloudCache

    @State private var currentId: UUID?
    @State private var tagAlong: TagAlongRequest?
    @State private var adopting = false
    @State private var adoptError: String?

    private struct FeedItem: Identifiable {
        let id: UUID
        let local: SongTag?
        let cloud: CloudTag?
    }

    /// Feed order: my library performances, then community performances by
    /// recency, with one open tag interleaved after every three pages. Open
    /// tags rank needs-your-part → near-complete → recent (WP7).
    private var items: [FeedItem] {
        var seen = Set<UUID>()
        var complete: [FeedItem] = []
        for tag in store.tags where store.isComplete(tag.id) {
            seen.insert(tag.id)
            complete.append(FeedItem(id: tag.id, local: tag, cloud: nil))
        }
        let visible = cloud.cloudTags.filter { ct in
            !seen.contains(ct.id)
                && ct.visibility == .publicFeed
                && !cloud.hiddenTagIds.contains(ct.id)
                && !cloud.blockedUids.contains(ct.creatorUid)
        }
        for ct in visible where ct.isComplete {
            complete.append(FeedItem(id: ct.id, local: nil, cloud: ct))
        }
        let open = visible
            .filter { ct in
                !ct.isComplete && !ct.parts.isEmpty
                    && !store.tags.contains(where: { $0.id == ct.id })
            }
            .sorted { rank($0) < rank($1) }

        var result: [FeedItem] = []
        var openIterator = open.makeIterator()
        for (i, item) in complete.enumerated() {
            result.append(item)
            if (i + 1) % 3 == 0, let next = openIterator.next() {
                result.append(FeedItem(id: next.id, local: nil, cloud: next))
            }
        }
        while let next = openIterator.next() {
            result.append(FeedItem(id: next.id, local: nil, cloud: next))
        }
        return result
    }

    private func rank(_ ct: CloudTag) -> (Int, Int, TimeInterval) {
        let needsMe = cloud.myPart.map { ct.parts.contains($0) ? 1 : 0 } ?? 1
        return (needsMe, ct.openParts.count, -ct.createdAt.timeIntervalSince1970)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Theme.stageGradient.ignoresSafeArea()
                if items.isEmpty {
                    FeedEmptyState().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView(.vertical) {
                        LazyVStack(spacing: 0) {
                            ForEach(items) { item in
                                page(for: item, insets: geo.safeAreaInsets)
                                    .containerRelativeFrame([.horizontal, .vertical])
                                    .id(item.id)
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollTargetBehavior(.paging)
                    .scrollPosition(id: $currentId)
                    .scrollIndicators(.hidden)
                    .ignoresSafeArea()
                    .onAppear { if currentId == nil { currentId = items.first?.id } }
                }

                if adopting {
                    ZStack {
                        Color.black.opacity(0.5).ignoresSafeArea()
                        VStack(spacing: 12) {
                            ProgressView().tint(Theme.brass).controlSize(.large)
                            Text("Pulling up a chair…")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.textPrimary)
                        }
                        .padding(26)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                    }
                }
            }
        }
        .fullScreenCover(item: $tagAlong) { req in
            RecordView(tag: req.tag, part: req.part)
        }
        .alert("Couldn't tag along", isPresented: Binding(
            get: { adoptError != nil },
            set: { if !$0 { adoptError = nil } })) {
            Button("OK", role: .cancel) { adoptError = nil }
        } message: {
            Text(adoptError ?? "")
        }
    }

    @ViewBuilder
    private func page(for item: FeedItem, insets: EdgeInsets) -> some View {
        if let tag = store.tags.first(where: { $0.id == item.id }), store.isComplete(item.id) {
            FeedPage(tag: tag, isCurrent: currentId == item.id, insets: insets)
        } else if let ct = item.cloud {
            CloudPerformancePage(cloudTag: ct,
                                 isCurrent: currentId == item.id,
                                 insets: insets,
                                 onTagAlong: { part in beginTagAlong(ct, part) })
        }
    }

    /// The explicit crossing (docs/10 §A): adopt into the library, then record.
    private func beginTagAlong(_ ct: CloudTag, _ part: Part) {
        guard !adopting else { return }
        adopting = true
        Task {
            do {
                let tag = try await cache.adopt(cloudTag: ct, store: store)
                tagAlong = TagAlongRequest(tag: tag, part: part)
            } catch {
                adoptError = error.localizedDescription
                Diagnostics.logError("feed.adopt", error)
            }
            adopting = false
        }
    }
}

struct FeedEmptyState: View {
    @State private var breathe = false

    var body: some View {
        VStack(spacing: 16) {
            // Brass music-note motif, softly breathing.
            HStack(spacing: 14) {
                Image(systemName: "music.note").font(.system(size: 26))
                    .foregroundStyle(Theme.brass.opacity(0.7))
                Image(systemName: "music.note").font(.system(size: 44))
                    .foregroundStyle(Theme.brassSoft)
                Image(systemName: "music.note").font(.system(size: 26))
                    .foregroundStyle(Theme.brass.opacity(0.7))
            }
            .shadow(color: Theme.brass.opacity(0.4), radius: 10)
            .scaleEffect(breathe ? 1.06 : 0.96)
            .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: breathe)
            .padding(.bottom, 6)

            Text("The stage is empty")
                .font(.system(.title2, design: .serif).weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
            Text("Lay down a tag and sing the first part —\nwhen all four voices join, the quartet\ntakes the stage right here.")
                .multilineTextAlignment(.center)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
            Text("Head to the Sing tab to begin →")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.brass)
                .padding(.top, 4)
        }
        .padding(40)
        .onAppear { breathe = true }
    }
}

// MARK: - Library performance page

/// One full-bleed LIBRARY performance page. Auto-plays and loops while
/// current. Delete menu is role-aware (docs/10 §A).
struct FeedPage: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    let tag: SongTag
    let isCurrent: Bool
    let insets: EdgeInsets

    @StateObject private var player = QuartetPlayer()
    @State private var userPaused = false
    @State private var exportTrigger = false
    @State private var confirmDeleteEveryone = false
    @State private var ringFlash = false

    private var quartet: [Part: Take] { store.quartet(for: tag.id) }
    /// Published tags have a live cloud twin → the social rail (docs/10 §C).
    private var matchingCloud: CloudTag? { cloud.cloudTags.first(where: { $0.id == tag.id }) }
    private var creditOwners: [Part: String?] {
        quartet.mapValues { store.isMine($0) ? nil : $0.ownerUid }
    }

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

            if let ct = matchingCloud {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        SocialRailHost(cloudTag: ct,
                                       owners: creditOwners,
                                       onShareVideo: { exportTrigger = true },
                                       onRang: shimmer)
                    }
                }
                .padding(.trailing, 6)
                .padding(.bottom, insets.bottom + 84)
            }

            // Golden shimmer when a ring lands (docs/10 §C).
            Theme.brass.opacity(ringFlash ? 0.2 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(false)

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
        .performanceExport(isActive: $exportTrigger, tag: tag, quartet: quartet, store: store) {
            userPaused = true
            player.pause()
        }
        .confirmationDialog("Delete this tag for everyone?",
                            isPresented: $confirmDeleteEveryone, titleVisibility: .visible) {
            Button("Delete for everyone", role: .destructive) {
                Task {
                    do { try await cloud.deleteTagEverywhere(tag: tag, store: store) }
                    catch { cloud.errorMessage = error.localizedDescription }
                }
            }
        } message: {
            Text("Every voice on “\(tag.title)” disappears from the community. This can't be undone.")
        }
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(tag.title)
                    .font(.system(.title3, design: .serif).bold())
                    .foregroundStyle(.white)
                    .shadow(radius: 4)
                KeyChip(key: tag.key)
            }
            Spacer()
            if matchingCloud == nil {
                ShareChromeButton { exportTrigger = true }
            }
            Menu {
                roleAwareDeleteItems
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

    /// Role-aware delete (docs/10 §A): creator can delete everywhere or just
    /// locally; contributor can pull their voice; everything local-only for
    /// unpublished tags.
    @ViewBuilder
    private var roleAwareDeleteItems: some View {
        if tag.publishedAt == nil {
            Button(role: .destructive) { store.delete(tag: tag) } label: {
                Label("Delete tag", systemImage: "trash")
            }
        } else {
            switch store.role(for: tag) {
            case .creator:
                Button(role: .destructive) { confirmDeleteEveryone = true } label: {
                    Label("Delete tag for everyone", systemImage: "trash")
                }
                Button { store.delete(tag: tag) } label: {
                    Label("Remove from my phone", systemImage: "iphone.slash")
                }
            case .contributor:
                Button(role: .destructive) {
                    Task {
                        do { try await cloud.removeMyVoice(from: tag, store: store) }
                        catch { cloud.errorMessage = error.localizedDescription }
                    }
                } label: {
                    Label("Remove my voice", systemImage: "mic.slash")
                }
                Button { store.delete(tag: tag) } label: {
                    Label("Remove from my phone", systemImage: "iphone.slash")
                }
            case .viewer:
                Button { store.delete(tag: tag) } label: {
                    Label("Remove from my phone", systemImage: "iphone.slash")
                }
            }
        }
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

    private func shimmer() {
        withAnimation(.easeOut(duration: 0.15)) { ringFlash = true }
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            withAnimation(.easeOut(duration: 0.7)) { ringFlash = false }
        }
    }
}

// MARK: - Community page (complete = the show, open = the invitation)

/// A community tag page streaming from the CloudCache (docs/10 §A — the
/// library is never touched by watching). Complete tags play the quartet;
/// open tags play the partial mix with pulsing empty tiles and the
/// "Tag along — sing bass" CTA (§B, §D).
struct CloudPerformancePage: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @EnvironmentObject var cache: CloudCache
    let cloudTag: CloudTag
    let isCurrent: Bool
    let insets: EdgeInsets
    let onTagAlong: (Part) -> Void

    @StateObject private var player = QuartetPlayer()
    @State private var takeSet: CloudCache.TakeSet?
    @State private var fetching = false
    @State private var failed: String?
    @State private var userPaused = false
    @State private var exportTrigger = false
    @State private var ringFlash = false

    var body: some View {
        ZStack {
            Color.black
            if let takeSet {
                QuartetGrid(quartet: takeSet.featured, player: player, soloable: true,
                            onOpenPart: { part in onTagAlong(part) })
            } else if let failed {
                VStack(spacing: 12) {
                    Text("Couldn't load this performance").foregroundStyle(.white)
                    Text(failed).font(.caption).foregroundStyle(Theme.textSecondary)
                    Button("Retry") { self.failed = nil; fetchAndPlay() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(24)
            } else {
                VStack(spacing: 14) {
                    ProgressView().tint(.white)
                    Text(cloudTag.title)
                        .font(.system(.headline, design: .serif))
                        .foregroundStyle(.white)
                    Text(cloudTag.isComplete ? "Raising the curtain…" : "Warming up the invitation…")
                        .font(.caption).foregroundStyle(Theme.textSecondary)
                }
            }

            VStack {
                topBar
                Spacer()
                if let solo = player.solo { SoloPill(part: solo).padding(.bottom, 10) }
                if !cloudTag.isComplete && takeSet != nil { tagAlongCTA.padding(.bottom, 8) }
            }
            .padding(.top, insets.top)
            .padding(.bottom, insets.bottom + 12)

            if let takeSet {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        SocialRailHost(cloudTag: cloudTag,
                                       owners: takeSet.featured.mapValues { $0.ownerUid },
                                       onShareVideo: cloudTag.isComplete ? { exportTrigger = true } : nil,
                                       onRang: shimmer)
                    }
                }
                .padding(.trailing, 6)
                .padding(.bottom, insets.bottom + (cloudTag.isComplete ? 84 : 150))
            }

            // Golden shimmer when a ring lands (docs/10 §C).
            Theme.brass.opacity(ringFlash ? 0.2 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            if takeSet != nil { transportButton }
        }
        .onAppear { if isCurrent { activate() } }
        .onChange(of: isCurrent) { _, cur in cur ? activate() : deactivate() }
        .onDisappear { deactivate() }
        .onChange(of: player.isPlaying) { _, playing in
            if !playing, isCurrent, !userPaused, !player.slots.isEmpty {
                Task { await player.play() }
            }
        }
        .performanceExport(isActive: $exportTrigger,
                           title: cloudTag.title,
                           quartet: takeSet?.featured ?? [:],
                           mediaURL: { cache.url(for: $0) }) {
            userPaused = true
            player.pause()
        }
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(cloudTag.title)
                    .font(.system(.title3, design: .serif).bold())
                    .foregroundStyle(.white)
                    .shadow(radius: 4)
                KeyChip(key: cloudTag.key)
            }
            Spacer()
            Menu {
                Button {
                    cloud.hide(tagId: cloudTag.id)
                } label: {
                    Label("Not interested", systemImage: "hand.raised")
                }
                // Moderation minimums (docs/10 §F5) — required for UGC.
                Menu {
                    ForEach(["Inappropriate", "Copyright", "Spam", "Something else"], id: \.self) { reason in
                        Button(reason) { cloud.report(tagId: cloudTag.id, reason: reason) }
                    }
                } label: {
                    Label("Report", systemImage: "flag")
                }
                Button(role: .destructive) {
                    cloud.block(uid: cloudTag.creatorUid)
                } label: {
                    Label("Block this singer", systemImage: "nosign")
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
        .background(Theme.scrim(.top).padding(.top, -insets.top))
    }

    /// The part offered by the CTA: your part when it's open, else the first
    /// open slot.
    private var ctaPart: Part {
        if let mine = cloud.myPart, cloudTag.openParts.contains(mine) { return mine }
        return cloudTag.openParts.first ?? .lead
    }

    private var tagAlongCTA: some View {
        Button { onTagAlong(ctaPart) } label: {
            HStack(spacing: 8) {
                Image(systemName: "music.mic")
                Text("Tag along — sing \(ctaPart.label.lowercased())").font(.headline)
            }
            .foregroundStyle(Color(hex: 0x2E2410))
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .background(
                LinearGradient(colors: [Theme.brassSoft, Theme.brass],
                               startPoint: .top, endPoint: .bottom),
                in: Capsule())
            .shadow(color: Theme.brass.opacity(0.4), radius: 10, y: 4)
        }
        .buttonStyle(PressScale())
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
        .opacity(player.isPlaying ? 0.35 : 1)
        .animation(.easeInOut(duration: 0.2), value: player.isPlaying)
    }

    private func activate() {
        userPaused = false
        if let takeSet {
            startPlayback(takeSet)
        } else {
            fetchAndPlay()
        }
    }

    private func fetchAndPlay() {
        guard !fetching else { return }
        fetching = true
        failed = nil
        Task {
            do {
                let set = try await cache.fetch(cloudTag: cloudTag)
                takeSet = set
                if isCurrent { startPlayback(set) }
            } catch {
                failed = error.localizedDescription
                Diagnostics.logError("feed.fetch", error)
            }
            fetching = false
        }
    }

    private func startPlayback(_ set: CloudCache.TakeSet) {
        player.load(takes: set.featured) { cache.url(for: $0) }
        Task { await player.play() }
    }

    private func deactivate() { player.unload() }

    private func shimmer() {
        withAnimation(.easeOut(duration: 0.15)) { ringFlash = true }
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            withAnimation(.easeOut(duration: 0.7)) { ringFlash = false }
        }
    }
}
