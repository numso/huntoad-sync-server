import { Server } from 'socket.io'

const shares = {}

const io = new Server(3000)

io.on('connection', socket => {
  socket.notes = {}
  socket.on('share', ({ id, secret, data }, cb) => {
    if (shares[id]) return cb('exists')
    shares[id] = { states: [{ type: 'INIT', data, v: 0 }], secret }
    socket.join(`note:${id}`)
    socket.notes[id] = true
    cb('ok')
  })

  socket.on('join', ({ id, secret }, cb) => {
    if (!shares[id]) return cb('not_found')
    if (shares[id].secret !== secret) return cb('unauthed')
    socket.join(`note:${id}`)
    socket.notes[id] = true
    for (const state of shares[id].states) socket.emit('update', { id, state })
    cb('ok')
  })

  socket.on('leave', ({ id, secret }, cb) => {
    if (!socket.notes[id]) return cb('ok')
    socket.leave(`note:${id}`)
    delete socket.notes[id]
    cb('ok')
  })

  socket.on('update', ({ id, type, data, version }, cb) => {
    if (!shares[id]) return cb('not_found')
    if (!socket.notes[id]) return cb('unauthed')
    if (shares[id].states.at(-1).v !== version) return cb('bad_version')
    const state = { type, data, v: version + 1 }
    shares[id].states.push(state)
    io.to(`note:${id}`).emit('update', { id, state })
  })
})
