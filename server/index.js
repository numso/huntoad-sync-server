import http from 'http'
import fs from 'node:fs'
import path from 'node:path'
import { Server } from 'socket.io'

const shareRE = /^\/share\/([0-9a-f-]+)\/([0-9a-f]+)\/?$/

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    return res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }).end(`
    <style>*{font-family:sans-serif}</style>
    <div style="display:flex;align-items:center;flex-direction:column">
      <h1>HUNTOAD Share Options</h1>
      <p>Make sure you've set <span id="host" style="background:#ddd;padding:4px 8px"></span> as your "Share Server" in settings.</p>
      <p>Enter the URL for your local HUNTOAD instance for automatic share redirects.</p>
      <input id="url" type="text" style="width:300px;padding:8px 16px" placeholder="Your Server URL"/>
      <div id="example" style="display:none;color:#333;font-size:12px;flex-direction:column;align-items:center;padding-top:32px">
        <div id="from"></div>
        <p>↓</p>
        <div id="to"></div>
      </div>
      <p id="error" style="display:none;color:red">Invalid URL</p>
      <script>
        const $url = document.getElementById("url")
        const $example = document.getElementById("example")
        const $to = document.getElementById("to")
        const $error = document.getElementById("error")
        document.getElementById("from").innerText = buildUrl(window.location)
        document.getElementById("host").innerText = window.location.origin
        function buildUrl(url) {
          return url.origin + url.pathname + "share/XXXX/YYYY" + url.search + url.hash
        }
        function parseUrl(url) {
          if (!url) {
            $example.style.display = "none"
            $error.style.display = "none"
            return ""
          }
          try {
            const parsed = new URL(url)
            $to.innerText = buildUrl(parsed)
            $example.style.display = "flex"
            $error.style.display = "none"
            return url
          } catch {
            $example.style.display = "none"
            $error.style.display = "block"
          }
        }
        document.getElementById("url").addEventListener("input", e => {
          const url = parseUrl(e.target.value)
          if (url != null) {
            localStorage.setItem("huntoad-redirect", url)
          }
        })
        const initialUrl = localStorage.getItem("huntoad-redirect")
        parseUrl(initialUrl)
        $url.value = initialUrl
      </script>
    </div>
    `)
  }

  const share = shareRE.exec(req.url)
  if (share) {
    const [, id, secret] = share
    return res.writeHead(200, { 'Content-Type': 'text/html' }).end(`
    <style>*{font-family:sans-serif}</style>
    <div id="root" style="display:none;align-items:center;flex-direction:column">
      <h1>HUNTOAD Share</h1>
      <p>Make sure you've set <span id="host" style="background:#ddd;padding:4px 8px"></span> as your "Share Server" in settings.</p>
      <p>Visit this path in your HUNTOAD instance to accept the share</p>
      <input type="text" value="${req.url}" disabled style="width:620px;padding:8px 16px"/>
      <h2 style="padding-top:128px">Auto-accept shares</h2>
      <p>This server can redirect share requests to your private HUNTOAD instance.</p>
      <p><a href="/">Click here</a> to set up the automatic redirect.</p>
      <script>
        try {
          document.getElementById("host").innerText = window.location.origin
          const initialUrl = localStorage.getItem("huntoad-redirect")
          const url = new URL(initialUrl)
          const redirect = url.origin + url.pathname + "share/${id}/${secret}" + url.search + url.hash
          window.location = redirect
        } catch {
          document.getElementById("root").style.display = "flex"
        }
      </script>
    </div>
    `)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found\n')
})

const p = path.join(process.cwd(), 'data', 'db.json')
let shares = {}
try {
  shares = JSON.parse(fs.readFileSync(p, 'utf-8'))
} catch {}

const io = new Server(server, { serveClient: false })

io.on('connection', socket => {
  socket.notes = {}
  socket.on('share', ({ id, secret, data }, cb) => {
    if (shares[id]) return cb?.('exists')
    shares[id] = { data, secret }
    socket.join(`note:${id}`)
    socket.notes[id] = true
    persist()
    cb?.('ok')
  })

  socket.on('join', ({ id, secret }, cb) => {
    if (!shares[id]) return cb?.('not_found')
    if (shares[id].secret !== secret) return cb?.('unauthed')
    socket.join(`note:${id}`)
    socket.notes[id] = true
    cb?.('ok', shares[id].data)
  })

  socket.on('leave', ({ id }, cb) => {
    if (!socket.notes[id]) return cb?.('ok')
    socket.leave(`note:${id}`)
    delete socket.notes[id]
    cb?.('ok')
  })

  socket.on('update', ({ id, type, data }, cb) => {
    if (!shares[id]) return cb?.('not_found')
    if (!socket.notes[id]) return cb?.('unauthed')
    switch (type) {
      case 'WRITEFILE': {
        shares[id].data[data.id] = data
        delete shares[id].data[data.id].deleted
        break
      }
      case 'RM': {
        shares[id].data[data.id] = shares[id].data[data.id] || {}
        shares[id].data[data.id].deleted = true
        break
      }
      default: {
        console.error(id, type, data)
        throw new Error(`UNKNOWN STATE: ${type}`)
      }
    }
    socket.to(`note:${id}`).emit('update', { id, type, data })
    persist()
    cb?.('ok')
  })
})

function persist () {
  fs.writeFileSync(p, JSON.stringify(shares, null, 2), 'utf-8')
}

server.listen(process.env.PORT || 3000)
