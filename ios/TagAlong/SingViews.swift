import SwiftUI

// MARK: - Sing tab v2 (docs/10 §B)

/// The Sing tab as a place: lay down a tag, redeem an invite code, see the
/// community tags missing YOUR part, then your library — in progress and
/// finished — all as TagCards.
struct SingView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @EnvironmentObject var cache: CloudCache

    @State private var showStart = false
    @State private var path: [UUID] = []
    @State private var invited: CloudTag?
    @State private var tagAlong: TagAlongRequest?
    @State private var codeText = ""
    @State private var codeBusy = false
    @State private var codeError: String?
    @State private var nameEditShown = false
    @State private var nameDraft = ""

    private var libraryOpen: [SongTag] { store.tags.filter { !store.isComplete($0.id) } }
    private var libraryFinished: [SongTag] { store.tags.filter { store.isComplete($0.id) } }

    /// "Your spot is waiting" (docs/10 §B): community tags missing MY part —
    /// invitations addressed to me, not rows in a directory. Without a part
    /// identity, any open community tag qualifies.
    private var waiting: [CloudTag] {
        cloud.cloudTags.filter { ct in
            !ct.isComplete
                && !ct.parts.isEmpty
                && ct.visibility == .publicFeed
                && !cloud.hiddenTagIds.contains(ct.id)
                && !cloud.blockedUids.contains(ct.creatorUid)
                && !store.tags.contains(where: { $0.id == ct.id })
                && (cloud.myPart.map { !ct.parts.contains($0) } ?? true)
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    layDownButton
                    codeField

                    if !waiting.isEmpty {
                        sectionHeader("Your spot is waiting")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(waiting) { ct in
                                    Button { invited = ct } label: {
                                        TagCard(model: TagCardModel(cloudTag: ct, cache: cache),
                                                style: .rail,
                                                invitationPart: invitationPart(for: ct))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if !libraryOpen.isEmpty {
                        sectionHeader("In progress")
                        ForEach(libraryOpen) { tag in
                            NavigationLink(value: tag.id) {
                                TagCard(model: TagCardModel(tag: tag, store: store),
                                        uploadProgress: uploadProgress(for: tag))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if !libraryFinished.isEmpty {
                        sectionHeader("Finished")
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())],
                                  spacing: 12) {
                            ForEach(libraryFinished) { tag in
                                NavigationLink(value: tag.id) {
                                    TagCard(model: TagCardModel(tag: tag, store: store), style: .tile)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if libraryOpen.isEmpty && libraryFinished.isEmpty {
                        emptyState
                    }
                }
                .padding(18)
            }
            .background(Theme.stageGradient.ignoresSafeArea())
            .navigationTitle("Sing")
            .toolbar { profileMenu }
            .navigationDestination(for: UUID.self) { tagId in
                if let tag = store.tags.first(where: { $0.id == tagId }) {
                    TagDetailView(tag: tag)
                }
            }
            .sheet(isPresented: $showStart) { StartTagSheet(path: $path) }
            .sheet(item: $invited) { ct in
                TagAlongSheet(cloudTag: ct) { tag, part in
                    invited = nil
                    tagAlong = TagAlongRequest(tag: tag, part: part)
                }
            }
            .fullScreenCover(item: $tagAlong) { req in
                RecordView(tag: req.tag, part: req.part)
            }
            .alert("Your name", isPresented: $nameEditShown) {
                TextField("Shown in credits and afterglow", text: $nameDraft)
                Button("Save") { cloud.setDisplayName(nameDraft) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("How the community credits your voice.")
            }
        }
    }

    // MARK: Pieces

    private var layDownButton: some View {
        Button { showStart = true } label: {
            HStack {
                Image(systemName: "plus.circle.fill")
                Text("Lay down a tag").font(.headline)
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
        .buttonStyle(PressScale())
    }

    private var codeField: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "ticket")
                    .foregroundStyle(Theme.textSecondary)
                TextField("Have a code?", text: $codeText)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .foregroundStyle(Theme.textPrimary)
                    .onSubmit(redeemCode)
                if codeBusy {
                    ProgressView().tint(Theme.brass)
                } else if !codeText.isEmpty {
                    Button("Go", action: redeemCode)
                        .font(.subheadline.bold())
                        .foregroundStyle(Theme.brass)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
            if let codeError {
                Text(codeError).font(.caption).foregroundStyle(Theme.record)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Text("🎙️").font(.system(size: 48))
            Text("Nothing in your library yet")
                .font(.headline).foregroundStyle(Theme.textPrimary)
            Text("Lay down a tag and sing one part —\nstrangers tag along on the rest.")
                .multilineTextAlignment(.center)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }

    private var profileMenu: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Picker("I sing", selection: Binding(
                    get: { cloud.myPart },
                    set: { cloud.setMyPart($0) })) {
                    ForEach(Part.allCases) { part in
                        Text(part.label).tag(Optional(part))
                    }
                    Text("Not sure yet").tag(Optional<Part>.none)
                }
                Button {
                    nameDraft = cloud.displayName ?? ""
                    nameEditShown = true
                } label: {
                    Label(cloud.displayName.map { "Name: \($0)" } ?? "Set your name",
                          systemImage: "person.crop.circle")
                }
            } label: {
                Image(systemName: "person.crop.circle")
                    .foregroundStyle(Theme.brass)
            }
        }
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .tracking(1)
            .foregroundStyle(Theme.textSecondary)
            .padding(.top, 4)
    }

    private func invitationPart(for ct: CloudTag) -> Part? {
        if let mine = cloud.myPart, !ct.parts.contains(mine) { return mine }
        return ct.openParts.first
    }

    private func uploadProgress(for tag: SongTag) -> Double? {
        let values = store.takes(for: tag.id).compactMap { cloud.uploadProgress[$0.id] }
        return values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    private func redeemCode() {
        let code = codeText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty, !codeBusy else { return }
        codeBusy = true
        codeError = nil
        Task {
            do {
                let ct = try await cloud.lookupInvite(code: code)
                codeBusy = false
                codeText = ""
                if store.tags.contains(where: { $0.id == ct.id }) {
                    path.append(ct.id)
                } else {
                    invited = ct
                }
            } catch {
                codeBusy = false
                codeError = error.localizedDescription
            }
        }
    }
}

// MARK: - The invitation, opened (docs/10 §B, §D, §F3)

/// Context for a stranger tagging along: lyrics, notes, which slots are open —
/// and the Tag Along buttons. Adopting (the one library crossing) happens
/// here, then the caller launches the record flow.
struct TagAlongSheet: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cache: CloudCache
    let cloudTag: CloudTag
    let onTagAlong: (SongTag, Part) -> Void

    @State private var adoptingPart: Part?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(cloudTag.title)
                        .font(.system(.title2, design: .serif).weight(.semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Spacer()
                    KeyChip(key: cloudTag.key)
                }
                PartChipsRow(filled: Set(cloudTag.parts))

                if let lyrics = cloudTag.lyrics { contextBlock("Lyrics", lyrics) }
                if let notes = cloudTag.notes { contextBlock("Notes", notes) }
                if cloudTag.lyrics == nil {
                    Text("Tip: in the feed, tap a filled tile to solo a part and learn it.")
                        .font(.footnote)
                        .foregroundStyle(Theme.textSecondary)
                }

                ForEach(cloudTag.openParts) { part in
                    Button { tagAlong(part) } label: {
                        HStack(spacing: 8) {
                            if adoptingPart == part {
                                ProgressView().tint(.black)
                            } else {
                                Image(systemName: "music.mic")
                            }
                            Text("Tag along — sing \(part.label.lowercased())")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(part.color, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.black.opacity(0.85))
                    }
                    .buttonStyle(PressScale())
                    .disabled(adoptingPart != nil)
                }

                if let error {
                    Text(error).font(.caption).foregroundStyle(Theme.record)
                }
            }
            .padding(22)
        }
        .background(Theme.stageGradient.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }

    private func contextBlock(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1)
                .foregroundStyle(Theme.textSecondary)
            Text(text)
                .font(.callout)
                .foregroundStyle(Theme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
    }

    private func tagAlong(_ part: Part) {
        guard adoptingPart == nil else { return }
        adoptingPart = part
        error = nil
        Task {
            do {
                let tag = try await cache.adopt(cloudTag: cloudTag, store: store)
                adoptingPart = nil
                onTagAlong(tag, part)
            } catch {
                adoptingPart = nil
                self.error = "Couldn't fetch the tag: \(error.localizedDescription)"
            }
        }
    }
}

// MARK: - "Lay down a tag" (docs/10 §D, §F3, §F8)

/// The Start flow frames the first recording as your invitation: title, key,
/// optional lyrics/notes for whoever tags along, and visibility.
struct StartTagSheet: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudStore
    @Environment(\.dismiss) private var dismiss
    @Binding var path: [UUID]

    @State private var title = ""
    @State private var key: PitchKey = .Bb
    @State private var lyrics = ""
    @State private var notes = ""
    @State private var visibility: TagVisibility = .publicFeed
    @State private var name = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Tag name (e.g. Lost Chord)", text: $title)
                    Picker("Key", selection: $key) {
                        ForEach(PitchKey.allCases) { k in Text(k.rawValue).tag(k) }
                    }
                } footer: {
                    Text("A tag is the best 30 seconds of a song. Sing one part — your recording is the invitation, and strangers finish it.")
                }
                Section("For whoever tags along") {
                    TextField("Lyrics (optional)", text: $lyrics, axis: .vertical)
                        .lineLimit(3...8)
                    TextField("Notes (e.g. Polecat #4)", text: $notes)
                }
                Section {
                    Picker("Who can find it", selection: $visibility) {
                        Text("Everyone — community feed").tag(TagVisibility.publicFeed)
                        Text("Unlisted — invite code only").tag(TagVisibility.unlisted)
                    }
                }
                if cloud.displayName == nil {
                    Section {
                        TextField("Your name (for the credits)", text: $name)
                    } footer: {
                        Text("Shown when the community credits your voice.")
                    }
                }
            }
            .navigationTitle("Lay down a tag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Lay it down") { create() }
                }
            }
        }
    }

    private func create() {
        var tag = SongTag(title: title.isEmpty ? "Untitled tag" : title, key: key)
        tag.lyrics = lyrics.isEmpty ? nil : lyrics
        tag.notes = notes.isEmpty ? nil : notes
        tag.visibility = visibility
        store.add(tag: tag)
        if !name.isEmpty { cloud.setDisplayName(name) }
        dismiss()
        path.append(tag.id)
    }
}
