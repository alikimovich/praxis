// Vite resolves static asset imports to their emitted URL string.
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
