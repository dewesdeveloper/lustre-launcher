// Защита разметки движка при машинном переводе.
// Теги и подстановки ({b}, [name], \C[2], %(x)s …) заменяются на HTML-элементы,
// которые Bergamot переносит вместе с переведённым текстом, а потом возвращаются назад.
//   парные теги        → <span id="N">…</span>
//   подстановки слов   → <x id="N">Ike</x> (условное слово, чтобы предложение строилось нормально)
//   прочие одиночные   → <x id="N"></x>

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')

const globalRe = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')

// Метка токена в восстановленном тексте: символы из Private Use Area, в тексте игр их нет
const MARK_L = ''
const MARK_R = ''
const MARK_RE = /(\d+)/g
const WORD = /[\p{L}\p{N}]/u
const SENTENCE_END = /[.!?…:"«“»”*\-—)]$/

/**
 * @param {string} text
 * @param {{ token: RegExp,
 *           paired?: (tok: string) => ({ open: string } | { close: string } | null),
 *           value?: (tok: string) => string | null }} grammar
 *   token  — регулярка всех служебных фрагментов;
 *   paired — для тега возвращает {open: имя} / {close: имя}, если он парный;
 *   value  — условное слово для подстановки значения (имя, число), иначе null.
 * @param {{ stubs?: boolean }} opts stubs=false — подстановки без условных слов (запасной вариант)
 * @returns {{ html: string, restore: (out: string) => string | null, plain: boolean }}
 */
function protect(text, grammar, { stubs = true } = {}) {
  const lead = text.match(/^\s*/)[0]
  const trail = text.slice(lead.length).match(/\s*$/)[0]
  const body = text.slice(lead.length, text.length - trail.length)

  const toks = [] // { raw, spaceBefore, spaceAfter, value, closes }
  const spans = new Set() // id открывающих тегов, ставших <span>
  const closers = new Map() // id открывающего → id закрывающего
  const stack = [] // открытые парные теги: { id, name }
  let html = ''
  let last = 0
  for (const m of body.matchAll(globalRe(grammar.token))) {
    html += esc(body.slice(last, m.index))
    const raw = m[0]
    const id = toks.length
    const tok = {
      raw,
      spaceBefore: m.index > 0 && /\s/.test(body[m.index - 1]),
      spaceAfter: /\s/.test(body[m.index + raw.length] || ''),
      value: false,
    }
    toks.push(tok)
    const kind = grammar.paired?.(raw)
    if (kind && 'open' in kind) {
      stack.push({ id, name: kind.open })
      html += `${id}` // временная метка: станет <span> или <x>, когда узнаем, есть ли пара
    } else if (kind && 'close' in kind && stack.length && stack[stack.length - 1].name === kind.close) {
      const open = stack.pop()
      spans.add(open.id)
      closers.set(open.id, id)
      html += '</span>'
    } else {
      const stub = grammar.value?.(raw) || null
      tok.value = !!stub
      html += stub && stubs ? `<x id="${id}">${stub}</x>` : `<x id="${id}"></x>`
    }
    last = m.index + raw.length
  }
  html += esc(body.slice(last))
  // Незакрытые парные теги (в Ren'Py {b} может тянуться до конца строки) — одиночные
  html = html.replace(/(\d+)/g, (m, n) => spans.has(+n) ? `<span id="${n}">` : `<x id="${n}"></x>`)

  const restore = (out) => {
    if (out == null) return null
    const seen = new Set()
    const open = []
    let ok = true
    const take = (id) => {
      if (!toks[id] || seen.has(id)) { ok = false; return '' }
      seen.add(id)
      return MARK_L + id + MARK_R
    }
    let res = out.replace(/<span id="(\d+)">|<\/span>|<x id="(\d+)">[^<]*<\/x>|<x id="(\d+)"\s*\/?>/g, (m, sp, x1, x2) => {
      if (sp != null) { open.push(+sp); return take(+sp) }
      if (m === '</span>') {
        const cid = closers.get(open.pop())
        if (cid == null) { ok = false; return '' }
        return take(cid)
      }
      return take(+(x1 ?? x2))
    })
    if (!ok || seen.size !== toks.length || /<[a-z/][^>]*>/i.test(res)) return null
    res = unesc(res).replace(/[ \t]{2,}/g, ' ')

    // Движок пишет слово после тега с заглавной, как начало предложения: «есть %(gold)d Золото».
    // Если перед тегом не конец предложения — возвращаем строчную.
    res = res.replace(/((?:\d+\s*)+)(\p{Lu})(?=\p{Ll}|[\s,.!?…])/gu, (m, marks, cap, off, str) => {
      const head = str.slice(0, off).replace(MARK_RE, '').trimEnd()
      if (!head || SENTENCE_END.test(head)) return m
      return marks + cap.toLowerCase()
    })
    // Пробелы вокруг подстановок: «[name] пришёл», а не «[name]пришёл»
    res = res.replace(MARK_RE, (m, n, off, str) => {
      const t = toks[+n]
      let r = t.raw
      const prev = str[off - 1], next = str[off + m.length]
      if ((t.spaceBefore || t.value) && prev && WORD.test(prev)) r = ' ' + r
      if ((t.spaceAfter || t.value) && next && WORD.test(next)) r = r + ' '
      return r
    })
    return lead + res.trim() + trail
  }

  return { html, restore, plain: toks.length === 0 }
}

// Есть ли что переводить: латиница вне служебных фрагментов и нет кириллицы
function hasWords(text, grammar) {
  const bare = text.replace(globalRe(grammar.token), ' ')
  return /[A-Za-z]{2,}/.test(bare) && !/[А-Яа-яЁё]/.test(bare)
}

// --- Грамматики движков ---

// Ren'Py: {tag}, {/tag}, {{ , [[ , [выражение], %(var)s, %%, перевод строки
const RENPY = {
  token: /\{\{|\[\[|\{[^{}]*\}|\[[^[\]]*\]|%\([^)]*\)[-#0 +]*\d*(?:\.\d+)?[sdifrxXeEgGc]|%%|\n/g,
  paired(tok) {
    const close = tok.match(/^\{\/([a-z_]+)\}$/)
    if (close) return { close: close[1] }
    const open = tok.match(/^\{([a-z_]+)(=[^}]*)?\}$/)
    // теги-команды пары не имеют
    if (open && !/^(w|p|nw|fast|done|clear|image|space|vspace|k|cps|alt|noalt)$/.test(open[1])) return { open: open[1] }
    return null
  },
  value(tok) {
    if (/^\[[^[]/.test(tok)) return 'Ike'
    const m = tok.match(/^%\([^)]*\).*?([a-zA-Z])$/)
    if (m) return /[sr]/.test(m[1]) ? 'Ike' : '5'
    return null
  },
}

// RPG Maker MV/MZ: \V[1], \N[2], \C[3], \I[4], \{ \} \$ \. \| \! \> \< \^ \\, коды плагинов \FS[20], %1
const RPGM = {
  token: /\\[A-Za-z]+\d*(?:\[[^\]]*\]|<[^>]*>)?|\\[{}$.|!><^\\]|%\d+|\n/g,
  value(tok) {
    if (/^\\[NP]\[/i.test(tok) || tok === '%1') return 'Ike'
    if (/^\\V\[/i.test(tok) || /^%\d$/.test(tok)) return '5'
    return null
  },
}

// Godot: BBCode [b]…[/b], [color=#f00]…[/color], подстановки {name} / {0}, формат %s %d, перевод строки
const GODOT = {
  token: /\[\/?[a-z_]+(?:[= ][^\]]*)?\]|\{[A-Za-z0-9_]*\}|%[-+ 0#]*\d*(?:\.\d+)?[sdifxXcv%]|\n|\t/g,
  paired(tok) {
    const close = tok.match(/^\[\/([a-z_]+)\]$/)
    if (close) return { close: close[1] }
    const open = tok.match(/^\[([a-z_]+)(?:[= ][^\]]*)?\]$/)
    if (open && !/^(img|br|lb|rb|ff|lrm|rlm|zwj|zwnj|wj|shy)$/.test(open[1])) return { open: open[1] }
    return null
  },
  value(tok) {
    if (/^\{/.test(tok) || /^%[^%]*[sv]$/.test(tok)) return 'Ike'
    if (/^%[^%]*[difxXc]$/.test(tok)) return '5'
    return null
  },
}

// Unity rich text: <b>, <color=#f00>, <size=20>, <sprite=1>; подстановки {0} / {name}, %s, перевод строки
const UNITY = {
  token: /<\/?[a-z]+(?:=[^<>]*)?(?:\s[^<>]*)?>|\{\{?[A-Za-z0-9_]*\}?\}|\[\[[A-Za-z0-9_]+\]\]|%[-+ 0#]*\d*(?:\.\d+)?[sdif%]|\n|\t/g,
  paired(tok) {
    const close = tok.match(/^<\/([a-z]+)>$/)
    if (close) return { close: close[1] }
    const open = tok.match(/^<([a-z]+)[=\s>]/)
    if (open && !/^(br|sprite|space|voffset|pos|nobr|page|indent|line-indent)$/.test(open[1])) return { open: open[1] }
    return null
  },
  value(tok) {
    if (/^\{\{?[A-Za-z_]/.test(tok) || /^%[^%]*s$/.test(tok) || /^\[\[/.test(tok)) return 'Ike'
    if (/^\{\{?\d/.test(tok) || /^%[^%]*[dif]$/.test(tok)) return '5'
    return null
  },
}

// Unreal FText: аргументы {0} / {PlayerName}, плюрали {Count}|plural(...), rich text <Style>…</>, переносы
const UNREAL = {
  token: /\{[A-Za-z0-9_]+\}(?:\|[a-z]+\([^)]*\))?|<[A-Za-z0-9_.]+(?:\s[^<>]*)?>|<\/>|<img [^<>]*\/>|\r?\n|\t/g,
  paired(tok) {
    if (tok === '</>') return { close: 'rt' }
    if (/^<[A-Za-z0-9_.]+(\s[^<>]*)?>$/.test(tok) && !/^<img /.test(tok)) return { open: 'rt' }
    return null
  },
  value(tok) {
    if (/\|plural/.test(tok)) return null
    if (/^\{\d+\}$/.test(tok)) return '5'
    if (/^\{/.test(tok)) return 'Ike'
    return null
  },
}

module.exports = { protect, hasWords, RENPY, RPGM, GODOT, UNITY, UNREAL }
