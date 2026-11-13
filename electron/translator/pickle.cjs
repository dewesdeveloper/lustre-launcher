// Минимальный читатель Python pickle (протоколы 0–5) без исполнения кода.
// Классы не импортируются: GLOBAL даёт заглушку { module, name }, а объект —
// { __class__: 'module.Name', __args__, __state__ } (+ поля состояния, если это dict).
// Этого хватает, чтобы пройти по AST Ren'Py (.rpyc) и индексу архивов .rpa.

class PyClass {
  constructor(module, name) { this.module = module; this.name = name }
  get full() { return `${this.module}.${this.name}` }
}

class PyObject {
  constructor(cls, args) {
    this.__class__ = cls ? cls.full : '?'
    this.__args__ = args || []
  }
}

const MARK = Symbol('mark')

function makeObject(cls, args) {
  if (cls instanceof PyClass) {
    // copy_reg._reconstructor(cls, base, state)
    if (/^copy_?reg$/.test(cls.module) && cls.name === '_reconstructor') {
      const o = new PyObject(args[0], [])
      if (args[2] != null) o.__args__ = [args[2]]
      return o
    }
    if (cls.module === '__builtin__' || cls.module === 'builtins') {
      if (cls.name === 'set' || cls.name === 'frozenset') return new Set(args[0] || [])
      if (cls.name === 'bytearray') return Buffer.from(args[0] || [])
      if ((cls.name === 'unicode' || cls.name === 'str') && typeof args[0] === 'string') return args[0]
    }
    if (cls.module === '_codecs' && cls.name === 'encode') return Buffer.from(String(args[0]), 'latin1')
  }
  return new PyObject(cls, args)
}

function setState(obj, state) {
  if (!(obj instanceof PyObject)) return
  obj.__state__ = state
  // (dict, slots) или dict
  const apply = (d) => {
    if (d && typeof d === 'object' && d.constructor === Object) Object.assign(obj, d)
    else if (d instanceof Map) for (const [k, v] of d) if (typeof k === 'string') obj[k] = v
  }
  if (Array.isArray(state)) { apply(state[0]); apply(state[1]) } else apply(state)
}

// Python dict → обычный объект, если все ключи строки; иначе Map
function finishDict(map) {
  for (const k of map.keys()) if (typeof k !== 'string') return map
  const o = {}
  for (const [k, v] of map) o[k] = v
  return o
}

function loads(buf) {
  let pos = 0
  const stack = []
  const memo = new Map()
  const u8 = () => buf[pos++]
  const u16 = () => { const v = buf.readUInt16LE(pos); pos += 2; return v }
  const i32 = () => { const v = buf.readInt32LE(pos); pos += 4; return v }
  const u32 = () => { const v = buf.readUInt32LE(pos); pos += 4; return v }
  const u64 = () => { const v = Number(buf.readBigUInt64LE(pos)); pos += 8; return v }
  const bytes = (n) => { const b = buf.subarray(pos, pos + n); pos += n; return b }
  const line = () => { const e = buf.indexOf(0x0a, pos); const s = buf.toString('latin1', pos, e); pos = e + 1; return s }
  const popMark = () => {
    const items = stack.splice(stack.lastIndexOf(MARK))
    items.shift()
    return items
  }
  const top = () => stack[stack.length - 1]
  // Подклассы list/dict (RevertableList и т.п.) — PyObject: элементы в __items__ / __map__
  const dictSet = (d, k, v) => {
    if (d instanceof Map) d.set(k, v)
    else if (d instanceof PyObject) (d.__map__ ||= new Map()).set(k, v)
    else if (d && typeof d === 'object') d[k] = v
  }
  const listPush = (l, items) => {
    if (Array.isArray(l)) l.push(...items)
    else if (l instanceof PyObject) (l.__items__ ||= []).push(...items)
    else if (l instanceof Set) items.forEach(i => l.add(i))
  }
  const pyLong = (b) => {
    if (!b.length) return 0
    let v = 0n
    for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i])
    if (b[b.length - 1] & 0x80) v -= 1n << BigInt(b.length * 8)
    return Number(v)
  }
  const strArg = (s) => {
    // протокол 0: строка в кавычках с python-экранированием
    const q = s[0]
    if ((q === "'" || q === '"') && s.endsWith(q)) s = s.slice(1, -1)
    return s.replace(/\\x([0-9a-f]{2})|\\(.)/gi, (m, hex, c) => hex ? String.fromCharCode(parseInt(hex, 16)) : ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }[c] ?? m))
  }

  for (;;) {
    const op = u8()
    if (op === undefined) throw new Error('pickle: неожиданный конец данных')
    switch (op) {
      case 0x80: u8(); break // PROTO
      case 0x95: pos += 8; break // FRAME
      case 0x2e: return stack.pop() // STOP
      case 0x28: stack.push(MARK); break // MARK
      case 0x30: stack.pop(); break // POP
      case 0x31: popMark(); break // POP_MARK
      case 0x32: stack.push(top()); break // DUP
      case 0x4e: stack.push(null); break // NONE
      case 0x88: stack.push(true); break // NEWTRUE
      case 0x89: stack.push(false); break // NEWFALSE
      case 0x49: { const s = line(); stack.push(s === '01' ? true : s === '00' ? false : Number(s)); break } // INT
      case 0x4a: stack.push(i32()); break // BININT
      case 0x4b: stack.push(u8()); break // BININT1
      case 0x4d: stack.push(u16()); break // BININT2
      case 0x4c: stack.push(Number(line().replace(/L$/, ''))); break // LONG
      case 0x8a: stack.push(pyLong(bytes(u8()))); break // LONG1
      case 0x8b: stack.push(pyLong(bytes(i32()))); break // LONG4
      case 0x46: stack.push(parseFloat(line())); break // FLOAT
      case 0x47: { const v = buf.readDoubleBE(pos); pos += 8; stack.push(v); break } // BINFLOAT
      // Строки py2 (str) — байты; в Ren'Py это почти всегда ASCII/UTF-8
      case 0x53: stack.push(strArg(line())); break // STRING
      case 0x54: stack.push(bytes(i32()).toString('utf8')); break // BINSTRING
      case 0x55: stack.push(bytes(u8()).toString('utf8')); break // SHORT_BINSTRING
      case 0x56: stack.push(line().replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))); break // UNICODE
      case 0x58: stack.push(bytes(u32()).toString('utf8')); break // BINUNICODE
      case 0x8c: stack.push(bytes(u8()).toString('utf8')); break // SHORT_BINUNICODE
      case 0x8d: stack.push(bytes(u64()).toString('utf8')); break // BINUNICODE8
      case 0x42: stack.push(Buffer.from(bytes(u32()))); break // BINBYTES
      case 0x43: stack.push(Buffer.from(bytes(u8()))); break // SHORT_BINBYTES
      case 0x8e: stack.push(Buffer.from(bytes(u64()))); break // BINBYTES8
      case 0x96: stack.push(Buffer.from(bytes(u64()))); break // BYTEARRAY8
      case 0x5d: stack.push([]); break // EMPTY_LIST
      case 0x29: stack.push([]); break // EMPTY_TUPLE
      case 0x7d: stack.push(new Map()); break // EMPTY_DICT
      case 0x8f: stack.push(new Set()); break // EMPTY_SET
      case 0x6c: stack.push(popMark()); break // LIST
      case 0x74: stack.push(popMark()); break // TUPLE
      case 0x85: stack.push([stack.pop()]); break // TUPLE1
      case 0x86: { const b = stack.pop(); const a = stack.pop(); stack.push([a, b]); break } // TUPLE2
      case 0x87: { const c = stack.pop(); const b = stack.pop(); const a = stack.pop(); stack.push([a, b, c]); break } // TUPLE3
      case 0x91: stack.push(new Set(popMark())); break // FROZENSET
      case 0x64: { const items = popMark(); const d = new Map(); for (let i = 0; i < items.length; i += 2) d.set(items[i], items[i + 1]); stack.push(d); break } // DICT
      case 0x61: { const v = stack.pop(); listPush(top(), [v]); break } // APPEND
      case 0x65: { const items = popMark(); listPush(top(), items); break } // APPENDS
      case 0x73: { const v = stack.pop(); const k = stack.pop(); dictSet(top(), k, v); break } // SETITEM
      case 0x75: { const items = popMark(); const d = top(); for (let i = 0; i < items.length; i += 2) dictSet(d, items[i], items[i + 1]); break } // SETITEMS
      case 0x90: { const items = popMark(); const s = top(); if (s instanceof Set) items.forEach(i => s.add(i)); break } // ADDITEMS
      case 0x67: memoGet(Number(line())); break // GET
      case 0x68: memoGet(u8()); break // BINGET
      case 0x6a: memoGet(u32()); break // LONG_BINGET
      case 0x70: memo.set(Number(line()), top()); break // PUT
      case 0x71: memo.set(u8(), top()); break // BINPUT
      case 0x72: memo.set(u32(), top()); break // LONG_BINPUT
      case 0x94: memo.set(memo.size, top()); break // MEMOIZE
      case 0x63: { const mod = line(); const name = line(); stack.push(new PyClass(mod, name)); break } // GLOBAL
      case 0x93: { const name = stack.pop(); const mod = stack.pop(); stack.push(new PyClass(mod, name)); break } // STACK_GLOBAL
      case 0x52: { const args = stack.pop(); const cls = stack.pop(); stack.push(makeObject(cls, args)); break } // REDUCE
      case 0x81: { const args = stack.pop(); const cls = stack.pop(); stack.push(makeObject(cls, args)); break } // NEWOBJ
      case 0x92: { stack.pop(); const args = stack.pop(); const cls = stack.pop(); stack.push(makeObject(cls, args)); break } // NEWOBJ_EX
      case 0x69: { const mod = line(); const name = line(); const args = popMark(); stack.push(makeObject(new PyClass(mod, name), args)); break } // INST
      case 0x6f: { const items = popMark(); const cls = items.shift(); stack.push(makeObject(cls, items)); break } // OBJ
      case 0x62: { const state = stack.pop(); setState(top(), state); break } // BUILD
      case 0x50: stack.push(new PyObject(new PyClass('persistent', line()), [])); break // PERSID
      case 0x51: stack.push(new PyObject(new PyClass('persistent', 'id'), [stack.pop()])); break // BINPERSID
      case 0x97: break // NEXT_BUFFER (не встречается)
      case 0x98: break // READONLY_BUFFER
      default:
        throw new Error(`pickle: неизвестный опкод 0x${op.toString(16)} на позиции ${pos - 1}`)
    }
  }

  function memoGet(i) { stack.push(memo.get(i)) }
}

// Словари после разбора: Map → объект, если ключи строки (для удобного обхода)
function normalize(v, seen = new Set()) {
  if (v == null || typeof v !== 'object' || seen.has(v)) return v
  seen.add(v)
  if (v instanceof Map) {
    for (const [k, x] of v) v.set(k, normalize(x, seen))
    return finishDict(v)
  }
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = normalize(v[i], seen); return v }
  if (v instanceof PyObject) {
    for (const k of Object.keys(v)) v[k] = normalize(v[k], seen)
    return v
  }
  return v
}

module.exports = { loads: (buf) => normalize(loads(buf)), PyObject, PyClass }
