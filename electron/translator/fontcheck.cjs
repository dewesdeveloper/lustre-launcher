// Есть ли в шрифте кириллица (TTF/OTF/TTC): читаем таблицу cmap.
// null — формат не разобрали (woff и т.п.), считаем «неизвестно».
const SAMPLE = [0x0410, 0x0430, 0x044f, 0x0416, 0x0451] // А а я Ж ё

function hasCyrillic(buf) {
  try {
    let base = 0
    if (buf.toString('latin1', 0, 4) === 'ttcf') base = buf.readUInt32BE(12)
    const tag = buf.toString('latin1', base, base + 4)
    if (tag === 'wOFF' || tag === 'wOF2') return null
    const numTables = buf.readUInt16BE(base + 4)
    let cmap = -1
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16
      if (buf.toString('latin1', rec, rec + 4) === 'cmap') { cmap = buf.readUInt32BE(rec + 8); break }
    }
    if (cmap < 0) return null
    const n = buf.readUInt16BE(cmap + 2)
    let seenUnicode = false
    for (let i = 0; i < n; i++) {
      const platform = buf.readUInt16BE(cmap + 4 + i * 8)
      const encoding = buf.readUInt16BE(cmap + 6 + i * 8)
      const off = cmap + buf.readUInt32BE(cmap + 8 + i * 8)
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
      if (!unicode) continue
      seenUnicode = true
      const format = buf.readUInt16BE(off)
      if (format === 4 && covers4(buf, off)) return true
      if (format === 12 && covers12(buf, off)) return true
    }
    return seenUnicode ? false : null
  } catch { return null }
}

function covers4(buf, off) {
  const segX2 = buf.readUInt16BE(off + 6)
  const ends = off + 14
  const starts = ends + segX2 + 2
  const has = (cp) => {
    for (let s = 0; s < segX2; s += 2) {
      const end = buf.readUInt16BE(ends + s)
      if (cp > end) continue
      return cp >= buf.readUInt16BE(starts + s)
    }
    return false
  }
  return SAMPLE.every(has)
}

function covers12(buf, off) {
  const groups = buf.readUInt32BE(off + 12)
  const has = (cp) => {
    for (let g = 0; g < groups; g++) {
      const p = off + 16 + g * 12
      if (cp >= buf.readUInt32BE(p) && cp <= buf.readUInt32BE(p + 4)) return true
    }
    return false
  }
  return SAMPLE.every(has)
}

module.exports = { hasCyrillic }
