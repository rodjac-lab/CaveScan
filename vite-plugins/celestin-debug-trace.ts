import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Local sink for Celestin real traces. Only mounts during `vite dev`, so it has
// zero effect on production builds. The client pushes each trace via a small
// fetch in appendCelestinRealTrace; here we append it as JSONL to a file that
// Claude (and any dev tooling) can read without going through the browser.
//
// The file lives at `.celestin-debug/traces.jsonl` at the repo root. It is
// rotated (truncated) when it grows past MAX_BYTES to avoid unbounded growth
// during long dev sessions.

const TRACE_DIR = '.celestin-debug'
const TRACE_FILE = 'traces.jsonl'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

function handleTracePost(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks).toString('utf8')
      JSON.parse(body) // validate
      const outDir = path.resolve(TRACE_DIR)
      mkdirSync(outDir, { recursive: true })
      const outPath = path.join(outDir, TRACE_FILE)
      try {
        const stat = statSync(outPath)
        if (stat.size > MAX_BYTES) writeFileSync(outPath, '')
      } catch {
        // file does not exist yet, appendFileSync will create it
      }
      appendFileSync(outPath, body.replace(/\n/g, ' ') + '\n')
      res.statusCode = 204
      res.end()
    } catch (err) {
      res.statusCode = 400
      res.end(err instanceof Error ? err.message : String(err))
    }
  })
}

export function celestinDebugTrace(): Plugin {
  return {
    name: 'celestin-debug-trace',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__debug/trace', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        handleTracePost(req, res)
      })
    },
  }
}
