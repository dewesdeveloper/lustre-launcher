// RPG Maker MV / MZ: текст лежит в data/*.json (MV — www/data).
// Перевод вписывается прямо в JSON; оригиналы сохраняются в lustre_backup/ рядом с data
// и возвращаются при откате. Повторный перевод всегда идёт от оригиналов из бэкапа.
const fs = require('node:fs')
const path = require('node:path')

const BACKUP = 'lustre_backup'
const MARKER = 'lustre_translation.json'

function detect(root) {
  const cands = [root]
  try {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) cands.push(path.join(root, d.name))
  } catch { /* нет доступа */ }
  for (const dir of cands) {
    for (const base of [path.join(dir, 'www'), dir]) {
      const dataDir = path.join(base, 'data')
      if (!fs.existsSync(path.join(dataDir, 'System.json'))) continue
      const js = path.join(base, 'js')
      const mz = fs.existsSync(path.join(js, 'rmmz_core.js'))
      const mv = fs.existsSync(path.join(js, 'rpg_core.js'))
      if (!mz && !mv) continue
      return { engine: 'rpgmv', variant: mz ? 'MZ' : 'MV', baseDir: base, dataDir, backupDir: path.join(base, BACKUP) }
    }
  }
  return null
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''))

// Откуда читать оригинал файла: из бэкапа, если перевод уже ставился
function sourcePath(ctx, name) {
  const b = path.join(ctx.backupDir, 'data', name)
  return fs.existsSync(b) ? b : path.join(ctx.dataDir, name)
}

function dataFiles(ctx) {
  return fs.readdirSync(ctx.dataDir).filter(f => /\.json$/i.test(f) && !/^MapInfos\.json$/i.test(f) && !/^Animations|^Tilesets/i.test(f))
}

// --- обход данных ---
// visit(text, kind) → новый текст или undefined (не менять)

const SENT_END = /[.!?…:"'”」』)\]*~♪♥]$/

// Строки сообщения (401/405) → один текст: обычные переносы склеиваются пробелом,
// после конца предложения — остаются \n (там автор, скорее всего, хотел разрыв)
function joinLines(lines) {
  let out = ''
  lines.forEach((l, i) => {
    if (i === 0) { out = l; return }
    const prev = lines[i - 1].trimEnd()
    // строка только из кодов (\n<Имя> для окна имени и т.п.) — тоже отдельная строка
    const codesOnly = !/[\p{L}\p{N}]/u.test(prev.replace(CTRL, ''))
    out += (SENT_END.test(prev) || codesOnly ? '\n' : ' ') + l.trimStart()
  })
  return out
}

const CTRL = /\\[A-Za-z]+\d*(?:\[[^\]]*\]|<[^>]*>)?|\\[{}$.|!><^\\]|<[A-Za-z][^<>]*>/g
const visibleLen = (s) => s.replace(CTRL, (m) => (/^\\[NP]\[/i.test(m) ? 'xxxxxx' : /^\\V\[/i.test(m) ? 'xxx' : '')).length

// Перенос по словам под ширину оригинала
function wrap(text, width) {
  const out = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/ +/)) {
      if (!line) { line = word; continue }
      if (visibleLen(line + ' ' + word) > width) { out.push(line); line = word } else line += ' ' + word
    }
    out.push(line)
  }
  return out
}

// Плагины с автопереносом (<WordWrap> и т.п.) сами переносят — тогда строки не трогаем
const hasAutoWrap = (s) => /<\s*(wordwrap|br)\s*>/i.test(s)

// opts.width — ширина строки окна сообщений в символах { face, noface } (см. measureWidths)
function walkList(list, visit, opts = {}) {
  if (!Array.isArray(list)) return list
  const out = []
  let face = false
  for (let i = 0; i < list.length; i++) {
    const cmd = list[i]
    if (!cmd || typeof cmd !== 'object') { out.push(cmd); continue }
    const p = cmd.parameters || []
    switch (cmd.code) {
      case 101: { // «Показать текст»: p[0] — портрет, в MZ p[4] — имя говорящего
        face = !!p[0]
        if (typeof p[4] === 'string' && p[4]) { const t = visit(p[4], 'name'); if (t != null) p[4] = t }
        out.push(cmd)
        break
      }
      case 401: case 405: { // строки сообщения / прокручиваемого текста — собираем блок целиком
        const code = cmd.code
        const block = [cmd]
        while (list[i + 1] && list[i + 1].code === code && list[i + 1].indent === cmd.indent) block.push(list[++i])
        const lines = block.map(c => String(c.parameters?.[0] ?? ''))
        const src = joinLines(lines)
        const t = /[A-Za-z]/.test(src) ? visit(src, 'message') : null
        if (t == null) { out.push(...block); break }
        // ширина — как у окна в этой игре, но не меньше самой длинной строки оригинала
        const gameWidth = (face ? opts.width?.face : opts.width?.noface) || 0
        const width = Math.max(gameWidth, 24, ...lines.map(visibleLen))
        const newLines = hasAutoWrap(src) ? t.split('\n') : wrap(t, width)
        for (const l of newLines) out.push({ code, indent: cmd.indent, parameters: [l] })
        break
      }
      case 102: { // варианты выбора
        if (Array.isArray(p[0])) p[0] = p[0].map(s => (typeof s === 'string' ? visit(s, 'choice') ?? s : s))
        out.push(cmd)
        break
      }
      case 402: { // ветка «если выбрано …» — тот же текст, что в 102
        if (typeof p[1] === 'string') { const t = visit(p[1], 'choice'); if (t != null) p[1] = t }
        out.push(cmd)
        break
      }
      case 320: case 324: case 325: { // смена имени / прозвища / профиля
        if (typeof p[1] === 'string') { const t = visit(p[1], 'name'); if (t != null) p[1] = t }
        out.push(cmd)
        break
      }
      default:
        out.push(cmd)
    }
  }
  return out
}

function walkEventPages(pages, visit, opts) {
  for (const pg of pages || []) if (pg && Array.isArray(pg.list)) pg.list = walkList(pg.list, visit, opts)
}

function field(obj, key, kind, visit) {
  if (obj && typeof obj[key] === 'string' && obj[key]) {
    const t = visit(obj[key], kind)
    if (t != null) obj[key] = t
  }
}

const strArray = (arr, kind, visit) => Array.isArray(arr) ? arr.map(s => (typeof s === 'string' && s ? visit(s, kind) ?? s : s)) : arr

function walkFile(name, data, visit, opts) {
  if (/^Map\d+\.json$/i.test(name)) {
    field(data, 'displayName', 'name', visit)
    for (const ev of data.events || []) if (ev) walkEventPages(ev.pages, visit, opts)
    return
  }
  if (/^CommonEvents\.json$/i.test(name)) {
    for (const ev of data || []) if (ev && Array.isArray(ev.list)) ev.list = walkList(ev.list, visit, opts)
    return
  }
  if (/^Troops\.json$/i.test(name)) {
    for (const t of data || []) if (t) walkEventPages(t.pages, visit, opts)
    return
  }
  if (/^System\.json$/i.test(name)) {
    field(data, 'currencyUnit', 'term', visit)
    for (const k of ['elements', 'skillTypes', 'weaponTypes', 'armorTypes', 'equipTypes']) data[k] = strArray(data[k], 'term', visit)
    const terms = data.terms || {}
    for (const k of ['basic', 'commands', 'params']) terms[k] = strArray(terms[k], 'term', visit)
    if (terms.messages) for (const k of Object.keys(terms.messages)) field(terms.messages, k, 'term', visit)
    return
  }
  const db = DB_FIELDS[name.toLowerCase()]
  if (db && Array.isArray(data)) for (const row of data) if (row) for (const [k, kind] of db) field(row, k, kind, visit)
}

const DB_FIELDS = Object.fromEntries(Object.entries({
    'Actors.json': [['name', 'name'], ['nickname', 'name'], ['profile', 'message']],
    'Classes.json': [['name', 'name']],
    'Skills.json': [['name', 'name'], ['description', 'message'], ['message1', 'message'], ['message2', 'message']],
    'Items.json': [['name', 'name'], ['description', 'message']],
    'Weapons.json': [['name', 'name'], ['description', 'message']],
    'Armors.json': [['name', 'name'], ['description', 'message']],
    'Enemies.json': [['name', 'name']],
    'States.json': [['name', 'name'], ['message1', 'message'], ['message2', 'message'], ['message3', 'message'], ['message4', 'message']],
}).map(([k, v]) => [k.toLowerCase(), v]))

// Типичная ширина строки сообщения в игре (95-й перцентиль длины строк оригинала),
// отдельно для окон с портретом и без: под неё переносим перевод
function measureWidths(ctx) {
  const lens = { face: [], noface: [] }
  const scan = (list) => {
    let face = false
    for (const c of list || []) {
      if (!c) continue
      if (c.code === 101) face = !!c.parameters?.[0]
      else if (c.code === 401) lens[face ? 'face' : 'noface'].push(visibleLen(String(c.parameters?.[0] ?? '')))
    }
  }
  for (const name of dataFiles(ctx)) {
    if (!/^(Map\d+|CommonEvents|Troops)\.json$/i.test(name)) continue
    let data
    try { data = readJson(sourcePath(ctx, name)) } catch { continue }
    if (Array.isArray(data)) data.forEach(x => { if (x?.list) scan(x.list); x?.pages?.forEach(p => scan(p?.list)) })
    else (data.events || []).forEach(ev => ev?.pages?.forEach(p => scan(p?.list)))
  }
  const p95 = (a) => { if (a.length < 20) return 0; a.sort((x, y) => x - y); return a[Math.floor(a.length * 0.95)] }
  return { face: p95(lens.face), noface: p95(lens.noface) }
}

// --- API движка ---

function extract(ctx) {
  const segments = []
  const errors = []
  let files = 0
  for (const name of dataFiles(ctx)) {
    try {
      const data = readJson(sourcePath(ctx, name))
      walkFile(name, data, (text, kind) => { segments.push({ text, kind }); return undefined })
      files++
    } catch (e) {
      errors.push(`${name}: ${e.message}`)
    }
  }
  return { segments, scripts: files, errors, broken: [], badFonts: [] }
}

async function apply(ctx, { table }) {
  const bdir = path.join(ctx.backupDir, 'data')
  await fs.promises.mkdir(bdir, { recursive: true })
  let changed = 0
  const opts = { width: measureWidths(ctx) }
  for (const name of dataFiles(ctx)) {
    const src = sourcePath(ctx, name)
    let data
    try { data = readJson(src) } catch { continue }
    let touched = false
    walkFile(name, data, (text) => {
      const t = table[text]
      if (t == null || t === text) return undefined
      touched = true
      return t
    }, opts)
    if (!touched) continue
    const backup = path.join(bdir, name)
    if (!fs.existsSync(backup)) await fs.promises.copyFile(path.join(ctx.dataDir, name), backup)
    const tmp = path.join(ctx.dataDir, name + '.lustre-tmp')
    await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf8')
    await fs.promises.rename(tmp, path.join(ctx.dataDir, name))
    changed++
  }
  await fs.promises.writeFile(path.join(ctx.backupDir, MARKER), JSON.stringify({ lang: 'ru', at: Date.now(), files: changed }), 'utf8')
  return { files: changed }
}

async function revert(ctx) {
  const bdir = path.join(ctx.backupDir, 'data')
  if (fs.existsSync(bdir)) {
    for (const name of fs.readdirSync(bdir)) {
      await fs.promises.copyFile(path.join(bdir, name), path.join(ctx.dataDir, name))
    }
  }
  await fs.promises.rm(ctx.backupDir, { recursive: true, force: true })
}

function isApplied(ctx) {
  return fs.existsSync(path.join(ctx.backupDir, MARKER))
}

module.exports = { id: 'rpgmv', title: 'RPG Maker MV/MZ', detect, extract, apply, revert, isApplied, _internal: { joinLines, wrap } }
