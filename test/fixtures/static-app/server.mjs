// Minimal zero-dependency "dev server" for tests: serves one page and prints a
// localhost URL the way a real dev server does, so the runner's detect/launch/
// parse/ready path can be exercised without auth or a real framework.
import { createServer } from 'node:http'

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(
    '<!doctype html><meta charset="utf-8">' +
      '<body style="font:16px system-ui;margin:0;display:grid;place-items:center;height:100vh">' +
      '<h1 id="fixture-ok">dsgn fixture running</h1></body>'
  )
})

server.listen(0, () => {
  const { port } = server.address()
  console.log(`  ➜  Local:   http://localhost:${port}/`)
})
