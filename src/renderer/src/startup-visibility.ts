import { createContext } from 'react'

// Native views cannot inherit the renderer's opacity. Keep their bounds empty
// until the shell crossfade finishes; browser iframes fade with their parent.
export const StartupVisibility = createContext(true)
