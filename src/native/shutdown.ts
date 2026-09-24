/** Run native cleanup for terminal interrupts, terminal closure and normal exit. */
export function installShutdown(cleanup: () => void) {
  process.once('exit', cleanup)
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) {
    process.once(signal, () => {
      cleanup()
      process.exit(code)
    })
  }
}
