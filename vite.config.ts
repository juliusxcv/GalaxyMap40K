import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const STYLE_SHEET_FILE = fileURLToPath(new URL('./src/theme/uiStyleSheet.json', import.meta.url))

/** Dev-server endpoint the in-app style editor (F2) saves through: a POSTed
 * style sheet replaces src/theme/uiStyleSheet.json. The app sanitizes the
 * file whenever it loads it, so this only checks the shape. Same-origin
 * JSON requests only — a JSON content type forces other sites into a CORS
 * preflight, which this never approves. */
function styleSheetSaver(): Plugin {
  return {
    name: 'ui-style-sheet-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ui-style-sheet', (req, res) => {
        const fail = (status: number, message: string) => {
          res.statusCode = status
          res.end(message)
        }
        if (req.method !== 'POST') return fail(405, 'POST only')
        if (!req.headers['content-type']?.startsWith('application/json')) return fail(415, 'JSON only')
        const site = req.headers['sec-fetch-site']
        if (site && site !== 'same-origin') return fail(403, 'Same-origin only')

        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size <= 512 * 1024) chunks.push(chunk)
        })
        req.on('end', async () => {
          if (size > 512 * 1024) return fail(413, 'Too large')
          try {
            const text = Buffer.concat(chunks).toString('utf8')
            const data = JSON.parse(text)
            if (data?.version !== 1 || typeof data.elements !== 'object' || data.elements === null) {
              return fail(400, 'Not a UI style sheet')
            }
            await writeFile(STYLE_SHEET_FILE, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, file: 'src/theme/uiStyleSheet.json' }))
          } catch (err) {
            fail(400, err instanceof Error ? err.message : String(err))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/GalaxyMap40K/, not the domain
  // root, so every asset URL needs this prefix.
  base: '/GalaxyMap40K/',
  plugins: [react(), styleSheetSaver()],
})
