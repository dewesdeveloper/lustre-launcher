// torrentScrape.cjs — сиды и пиры раздачи прямым запросом scrape к её трекерам
// (UDP — BEP 15, HTTP — /scrape). Раздача не скачивается и в qBittorrent не добавляется:
// трекер только отвечает, сколько у него раздающих и качающих. Тот же алгоритм, что
// на сервере (Lustre_beckend/torrentscrape): трекеры по популярности, пачками, пока
// у раздачи не ответят WANT трекеров; не ответивший трекер больше не спрашиваем.
const dgram = require('node:dgram')
const http = require('node:http')
const https = require('node:https')
const crypto = require('node:crypto')

const UDP_BATCH = 74
const HTTP_BATCH = 40
const DEFAULTS = { want: 2, maxRounds: 4, concurrency: 12, timeout: 4000 }

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** info hash (hex, 40 символов) из magnet; base32 переводится в hex */
function hashOf(magnet) {
  const m = /xt=urn:btih:([a-z0-9]+)/i.exec(magnet || '')
  if (!m) return ''
  const v = m[1]
  if (v.length === 40 && /^[0-9a-f]+$/i.test(v)) return v.toLowerCase()
  if (v.length === 32) {
    let bits = ''
    for (const ch of v.toUpperCase()) {
      const i = B32.indexOf(ch)
      if (i < 0) return ''
      bits += i.toString(2).padStart(5, '0')
    }
    let hex = ''
    for (let i = 0; i + 4 <= 160; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
    return hex
  }
  return ''
}

/** Один вид адреса для одного трекера; поддерживаются udp:// и http(s):// */
function normalizeTracker(raw) {
  try {
    const u = new URL(String(raw).trim())
    const scheme = u.protocol.replace(':', '').toLowerCase()
    if (!u.host) return ''
    if (scheme === 'udp') return `udp://${u.host.toLowerCase()}`
    if (scheme === 'http' || scheme === 'https') { u.hash = ''; return u.toString().replace(/\/+$/, '') }
  } catch { /* битый адрес */ }
  return ''
}

function trackersOf(magnet) {
  const out = []
  const q = String(magnet || '').split('?')[1] || ''
  for (const part of q.split('&')) {
    const [k, v] = part.split('=')
    if (k !== 'tr' || !v) continue
    let tr
    try { tr = normalizeTracker(decodeURIComponent(v.replace(/\+/g, ' '))) } catch { tr = '' }
    if (tr && !out.includes(tr)) out.push(tr)
  }
  return out
}

// ---------- UDP ----------

function scrapeUdp(hostPort, hashes, timeout) {
  return new Promise((resolve, reject) => {
    const u = new URL(`udp://${hostPort}`)
    const port = Number(u.port)
    if (!port) return reject(new Error('udp: нет порта'))
    const host = u.hostname.replace(/^\[|\]$/g, '')
    const sock = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4')
    let done = false
    const finish = (err, val) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearInterval(retry)
      try { sock.close() } catch { /* уже закрыт */ }
      if (err) reject(err); else resolve(val)
    }
    const timer = setTimeout(() => finish(new Error('udp: таймаут')), timeout)
    let stage = 'connect'
    let tid = crypto.randomBytes(4).readUInt32BE(0)
    let packet

    const connectPacket = () => {
      const b = Buffer.alloc(16)
      b.writeBigUInt64BE(0x41727101980n, 0)
      b.writeUInt32BE(0, 8)
      b.writeUInt32BE(tid, 12)
      return b
    }
    const send = () => sock.send(packet, port, host, (err) => err && finish(err))
    // UDP теряет пакеты — переспрашиваем, пока не истёк общий таймаут
    const retry = setInterval(send, Math.max(1000, timeout / 3))

    sock.on('error', (err) => finish(err))
    sock.on('message', (msg) => {
      if (msg.length < 8) return
      const action = msg.readUInt32BE(0)
      if (msg.readUInt32BE(4) !== tid) return
      if (action === 3) return finish(new Error(`udp: ${msg.slice(8).toString()}`))
      if (stage === 'connect' && action === 0 && msg.length >= 16) {
        const connId = msg.readBigUInt64BE(8)
        stage = 'scrape'
        tid = crypto.randomBytes(4).readUInt32BE(0)
        packet = Buffer.alloc(16 + 20 * hashes.length)
        packet.writeBigUInt64BE(connId, 0)
        packet.writeUInt32BE(2, 8)
        packet.writeUInt32BE(tid, 12)
        hashes.forEach((h, i) => Buffer.from(h, 'hex').copy(packet, 16 + 20 * i))
        send()
        return
      }
      if (stage === 'scrape' && action === 2) {
        const out = {}
        hashes.forEach((h, i) => {
          const off = 8 + 12 * i
          if (off + 12 <= msg.length) out[h] = { seeds: msg.readUInt32BE(off), peers: msg.readUInt32BE(off + 8) }
        })
        finish(null, out)
      }
    })
    packet = connectPacket()
    send()
  })
}

// ---------- HTTP ----------

function scrapeUrl(announce) {
  try {
    const u = new URL(announce)
    const i = u.pathname.lastIndexOf('/')
    const last = u.pathname.slice(i + 1)
    if (i < 0 || !last.startsWith('announce')) return ''
    u.pathname = u.pathname.slice(0, i + 1) + 'scrape' + last.slice('announce'.length)
    return u.toString()
  } catch { return '' }
}

/** Разбор bencode (только чтение); строки — Buffer, чтобы не портить 20-байтные хэши */
function bdecode(buf, pos = 0) {
  const c = buf[pos]
  if (c === 0x69) { // i
    const end = buf.indexOf(0x65, pos)
    return [Number(buf.slice(pos + 1, end).toString()), end + 1]
  }
  if (c >= 0x30 && c <= 0x39) {
    const colon = buf.indexOf(0x3a, pos)
    const len = Number(buf.slice(pos, colon).toString())
    return [buf.slice(colon + 1, colon + 1 + len), colon + 1 + len]
  }
  if (c === 0x6c) { // l
    const list = []
    pos++
    while (buf[pos] !== 0x65) { const [v, n] = bdecode(buf, pos); list.push(v); pos = n }
    return [list, pos + 1]
  }
  if (c === 0x64) { // d
    const dict = new Map()
    pos++
    while (buf[pos] !== 0x65) {
      const [k, n] = bdecode(buf, pos)
      const [v, m] = bdecode(buf, n)
      dict.set(k.toString('latin1'), v)
      pos = m
    }
    return [dict, pos + 1]
  }
  throw new Error('bencode: неизвестный тип')
}

function scrapeHttp(announce, hashes, timeout) {
  return new Promise((resolve, reject) => {
    const su = scrapeUrl(announce)
    if (!su) return reject(new Error('http: scrape не поддерживается'))
    const qs = hashes.map((h) => 'info_hash=' + Buffer.from(h, 'hex').toString('latin1').split('').map((ch) => {
      const code = ch.charCodeAt(0)
      return /[A-Za-z0-9.\-_~]/.test(ch) ? ch : '%' + code.toString(16).padStart(2, '0').toUpperCase()
    }).join('')).join('&')
    const full = su + (su.includes('?') ? '&' : '?') + qs
    const lib = full.startsWith('https:') ? https : http
    const req = lib.get(full, { timeout, headers: { 'User-Agent': 'Lustre/1.0' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`http: ${res.statusCode}`)) }
      const chunks = []
      let size = 0
      res.on('data', (c) => { size += c.length; if (size > 1 << 20) req.destroy(); else chunks.push(c) })
      res.on('end', () => {
        try {
          const [root] = bdecode(Buffer.concat(chunks))
          if (!(root instanceof Map)) throw new Error('http: неверный ответ')
          if (root.has('failure reason')) throw new Error(`http: ${root.get('failure reason')}`)
          const files = root.get('files')
          const out = {}
          if (files instanceof Map) {
            for (const [k, v] of files) {
              const h = Buffer.from(k, 'latin1').toString('hex')
              if (h.length === 40 && v instanceof Map) out[h] = { seeds: Number(v.get('complete') || 0), peers: Number(v.get('incomplete') || 0) }
            }
          }
          resolve(out)
        } catch (e) { reject(e) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('http: таймаут')))
    req.on('error', reject)
  })
}

function scrape(tracker, hashes, timeout) {
  if (tracker.startsWith('udp://')) return scrapeUdp(tracker.slice(6), hashes, timeout)
  return scrapeHttp(tracker, hashes, timeout)
}

/**
 * Опросить трекеры по набору magnet. Результат по каждому magnet:
 * { seeds, peers, trackers } — максимум по ответившим трекерам (trackers = 0 — данных нет).
 */
async function scrapeMagnets(magnets, opts = {}) {
  const opt = { ...DEFAULTS, ...opts }
  const states = new Map() // hash → { trackers, next, seeds, peers, answered }
  const popularity = new Map()
  const byMagnet = new Map()
  for (const magnet of new Set((magnets || []).filter(Boolean))) {
    const h = hashOf(magnet)
    if (!h) continue
    byMagnet.set(magnet, h)
    let st = states.get(h)
    if (!st) { st = { trackers: [], next: 0, seeds: 0, peers: 0, answered: 0 }; states.set(h, st) }
    for (const tr of trackersOf(magnet)) {
      if (st.trackers.includes(tr)) continue
      st.trackers.push(tr)
      popularity.set(tr, (popularity.get(tr) || 0) + 1)
    }
  }
  for (const st of states.values()) st.trackers.sort((a, b) => (popularity.get(b) || 0) - (popularity.get(a) || 0))

  const dead = new Set()
  for (let round = 0; round < opt.maxRounds; round++) {
    const byTracker = new Map()
    for (const [h, st] of states) {
      if (st.answered >= opt.want) continue
      while (st.next < st.trackers.length && dead.has(st.trackers[st.next])) st.next++
      if (st.next >= st.trackers.length) continue
      const tr = st.trackers[st.next++]
      if (!byTracker.has(tr)) byTracker.set(tr, [])
      byTracker.get(tr).push(h)
    }
    if (byTracker.size === 0) break

    const jobs = []
    for (const [tr, hs] of byTracker) {
      const size = tr.startsWith('udp://') ? UDP_BATCH : HTTP_BATCH
      for (let i = 0; i < hs.length; i += size) jobs.push([tr, hs.slice(i, i + size)])
    }
    let idx = 0
    const worker = async () => {
      while (idx < jobs.length) {
        const [tr, hs] = jobs[idx++]
        try {
          const stats = await scrape(tr, hs, opt.timeout)
          for (const h of hs) {
            const s = stats[h]
            if (!s) continue
            const st = states.get(h)
            st.answered++
            st.seeds = Math.max(st.seeds, s.seeds)
            st.peers = Math.max(st.peers, s.peers)
          }
        } catch {
          dead.add(tr)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(opt.concurrency, jobs.length) }, worker))
  }

  const result = {}
  for (const [magnet, h] of byMagnet) {
    const st = states.get(h)
    result[magnet] = { hash: h, seeds: st.seeds, peers: st.peers, trackers: st.answered }
  }
  return result
}

module.exports = { scrapeMagnets, hashOf, trackersOf, normalizeTracker, scrapeUrl, bdecode }
