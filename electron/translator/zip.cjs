// Минимальная распаковка zip (stored / deflate) без зависимостей — для пакетов BepInEx и XUnity.
const zlib = require('node:zlib')

// → [{ name, isDir, data: () => Buffer }]
function readZip(buf) {
  // End of central directory: ищем сигнатуру с конца (комментарий архива до 64 КБ)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Повреждённый zip-архив')
  const count = buf.readUInt16LE(eocd + 10)
  let pos = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Повреждённый zip-архив')
    const method = buf.readUInt16LE(pos + 10)
    const csize = buf.readUInt32LE(pos + 20)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const local = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen).replace(/\\/g, '/')
    pos += 46 + nameLen + extraLen + commentLen
    const lNameLen = buf.readUInt16LE(local + 26)
    const lExtraLen = buf.readUInt16LE(local + 28)
    const start = local + 30 + lNameLen + lExtraLen
    out.push({
      name,
      isDir: name.endsWith('/'),
      data: () => {
        const raw = buf.subarray(start, start + csize)
        if (method === 0) return Buffer.from(raw)
        if (method === 8) return zlib.inflateRawSync(raw)
        throw new Error(`Неподдерживаемое сжатие zip: ${method}`)
      },
    })
  }
  return out
}

module.exports = { readZip }
