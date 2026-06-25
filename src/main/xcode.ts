/**
 * Turn an opaque `xcrun simctl …` failure into actionable guidance. The raw
 * rejection is unhelpful ("Command failed: xcrun …"), so we sniff stderr + the
 * error code to tell the distinct cases apart instead of always blaming a
 * missing toolchain. Pure (no electron) so it's unit-testable.
 */
export function xcodeFailureReason(err: unknown): string {
  const e = (err ?? {}) as { stderr?: string; message?: string; code?: string | number }
  const text = `${e.stderr ?? ''} ${e.message ?? ''}`.toLowerCase()

  // Xcode IS installed — the license just hasn't been accepted (exit 69).
  if (text.includes('license')) {
    return 'Xcode is installed, but its license has not been accepted. Run `sudo xcodebuild -license accept` in a terminal, then reopen the project.'
  }
  // simctl needs full Xcode; this fires when only the CLT are selected, the
  // developer dir is wrong, or xcrun isn't on PATH.
  if (
    e.code === 'ENOENT' ||
    text.includes('xcode-select') ||
    text.includes('unable to find utility') ||
    text.includes('no developer tools') ||
    text.includes('cannot be located') ||
    text.includes('command line tools')
  ) {
    return 'Xcode is not installed or not selected. Install the full Xcode app, then run `sudo xcode-select -s /Applications/Xcode.app` and `xcodebuild -runFirstLaunch`.'
  }
  return `Could not run the iOS simulator tools: ${e.message ?? String(err)}`
}
