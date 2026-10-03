import AppKit
import WebKit

final class PreviewDownloads: NSObject, WKDownloadDelegate {
    weak var parent: NSWindow?
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard let parent else { completionHandler(nil); return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = suggestedFilename; panel.canCreateDirectories = true
        panel.beginSheetModal(for: parent) { answer in completionHandler(answer == .OK ? panel.url : nil) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { if (error as NSError).code != NSURLErrorCancelled { emit(["event":"download-error", "message":error.localizedDescription]) } }
    func downloadDidFinish(_ download: WKDownload) { emit(["event":"download-finished"]) }
}
extension Host {
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = downloads }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = downloads }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { decisionHandler(response.canShowMIMEType ? .allow : .download) }
}
