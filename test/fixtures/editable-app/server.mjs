// Serves index.html fresh on each request so an agent edit is reflected live.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

const server = createServer(async (_req, res) => {
  try {
    const html = await readFile(join(dir, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  } catch {
    res.writeHead(500)
    res.end('error')
  }
})

server.listen(0, () => {
  console.log(`  ➜  Local:   http://localhost:${server.address().port}/`)
})
