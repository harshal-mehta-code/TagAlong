import Darwin
import FirebaseAuth
import FirebaseFirestore
import Foundation
import UIKit

/// Lightweight, dependency-free visibility into crashes and non-fatal errors
/// on beta testers' phones. Not full symbolicated crash reporting (that needs
/// Crashlytics + a dSYM upload build phase) — just enough that a friend
/// hitting a bug doesn't have to describe it accurately over text.
enum Diagnostics {
    private static let documentsURL = FileManager.default
        .urls(for: .documentDirectory, in: .userDomainMask)[0]
    fileprivate static let crashMarkerURL = documentsURL.appendingPathComponent(".crash-marker")
    fileprivate static let exceptionMarkerURL = documentsURL.appendingPathComponent(".exception-marker")
    /// Precomputed so the signal handler never has to touch Swift string
    /// machinery — only the raw POSIX write below.
    fileprivate static let crashMarkerPathCString: ContiguousArray<CChar> =
        ContiguousArray(crashMarkerURL.path.utf8CString)

    /// Call once, first thing in app launch — before FirebaseApp.configure() —
    /// so even a startup crash gets caught.
    static func install() {
        NSSetUncaughtExceptionHandler(tagalong_exceptionHandler)
        for sig in [SIGABRT, SIGILL, SIGSEGV, SIGFPE, SIGBUS, SIGTRAP] {
            signal(sig, tagalong_crashSignalHandler)
        }
    }

    /// Look for a marker left by a crash on the previous launch and, if
    /// found, upload it. Best-effort, fire-and-forget — must never throw or
    /// block launch. Always clears BOTH marker files together: a single hard
    /// crash typically trips the exception handler AND its terminating
    /// signal, and leaving one behind would misattribute it to some later,
    /// perfectly fine launch.
    static func flushPendingCrash() {
        let appVersion = self.appVersion
        let deviceModel = UIDevice.current.model
        let osVersion = UIDevice.current.systemVersion
        let uid = Auth.auth().currentUser?.uid
        Task {
            var payload: [String: Any] = [
                "type": "crash",
                "createdAt": FieldValue.serverTimestamp(),
                "appVersion": appVersion,
                "device": deviceModel,
                "osVersion": osVersion
            ]
            var found = false
            if let data = try? Data(contentsOf: exceptionMarkerURL),
               let text = String(data: data, encoding: .utf8), !text.isEmpty {
                payload["kind"] = "exception"
                payload["detail"] = String(text.prefix(4000))
                found = true
            } else if let data = try? Data(contentsOf: crashMarkerURL), let byte = data.first {
                payload["kind"] = "signal"
                payload["detail"] = signalName(Int32(byte))
                found = true
            }
            try? FileManager.default.removeItem(at: exceptionMarkerURL)
            try? FileManager.default.removeItem(at: crashMarkerURL)
            guard found else { return }
            if let uid { payload["uid"] = uid }
            _ = try? await Firestore.firestore().collection("diagnostics").addDocument(data: payload)
        }
    }

    /// Non-fatal error visibility from a catch block. Fire-and-forget, never throws.
    static func logError(_ context: String, _ error: Error) {
        let appVersion = self.appVersion
        let deviceModel = UIDevice.current.model
        let osVersion = UIDevice.current.systemVersion
        let uid = Auth.auth().currentUser?.uid
        let message = String(describing: error)
        Task {
            var payload: [String: Any] = [
                "type": "error",
                "context": context,
                "message": String(message.prefix(2000)),
                "createdAt": FieldValue.serverTimestamp(),
                "appVersion": appVersion,
                "device": deviceModel,
                "osVersion": osVersion
            ]
            if let uid { payload["uid"] = uid }
            _ = try? await Firestore.firestore().collection("diagnostics").addDocument(data: payload)
        }
    }

    private static func signalName(_ sig: Int32) -> String {
        switch sig {
        case SIGABRT: return "SIGABRT (assertion / fatalError / force-unwrap)"
        case SIGILL: return "SIGILL (illegal instruction / Swift trap)"
        case SIGSEGV: return "SIGSEGV (bad memory access)"
        case SIGFPE: return "SIGFPE (arithmetic, e.g. divide by zero)"
        case SIGBUS: return "SIGBUS (bus error)"
        case SIGTRAP: return "SIGTRAP (trap)"
        default: return "signal \(sig)"
        }
    }

    private static var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }
}

/// Must be a non-capturing C function (not a closure) to satisfy
/// NSSetUncaughtExceptionHandler's @convention(c) requirement.
private func tagalong_exceptionHandler(_ exception: NSException) {
    let text = "\(exception.name.rawValue): \(exception.reason ?? "")\n"
        + exception.callStackSymbols.joined(separator: "\n")
    try? Data(text.utf8).write(to: Diagnostics.exceptionMarkerURL)
}

/// Async-signal-safe: a raw POSIX write of a single byte (the signal number)
/// to a fixed, precomputed path, then re-raise so the OS still terminates the
/// process normally. Must stay a non-capturing C function — no Swift string
/// or Foundation work happens here.
private func tagalong_crashSignalHandler(_ sig: Int32) {
    Diagnostics.crashMarkerPathCString.withUnsafeBufferPointer { buf in
        guard let base = buf.baseAddress else { return }
        let fd = open(base, O_WRONLY | O_CREAT | O_TRUNC, 0o644)
        if fd >= 0 {
            var byte = UInt8(truncatingIfNeeded: sig)
            _ = Darwin.write(fd, &byte, 1)
            close(fd)
        }
    }
    signal(sig, SIG_DFL)
    raise(sig)
}
