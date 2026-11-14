// Проверка разбора ссылок файлообменников (electron/hosts.cjs): node scripts/dev/hosts-test.cjs
const assert = require('node:assert/strict')
const hosts = require('../../electron/hosts.cjs')

const kinds = {
  'https://pixeldrain.com/u/abc123': 'pixeldrain',
  'https://mega.nz/file/AbCd#key': 'mega',
  'https://mega.nz/folder/AbCd#key': 'mega',
  'https://www.mediafire.com/file/xyz/game.zip/file': 'mediafire',
  'https://download1234.mediafire.com/abc/game.zip': 'direct',
  'https://gofile.io/d/RTfZGkzF': 'browser',
  'https://mixdrop.ag/f/abc': 'browser',
  'https://m1xdrop.net/f/abc': 'browser',
  'https://example.com/game.zip': 'direct',
  'https://notgofile.io.evil.com/x': 'direct',
}
for (const [url, kind] of Object.entries(kinds)) assert.equal(hosts.hostKind(url), kind, url)
assert.equal(hosts.hostKind('https://example.com/page', 'browser'), 'browser')

assert.equal(hosts.pixeldrainUrl('https://pixeldrain.com/u/abc123'), 'https://pixeldrain.com/api/file/abc123?download')
assert.equal(hosts.pixeldrainUrl('https://pixeldrain.com/l/list9'), 'https://pixeldrain.com/api/list/list9/zip')

const direct = 'https://download2393.mediafire.com/abc/def/game.zip'
assert.equal(hosts.parseMediafirePage(`<a class="input popsok" aria-label="Download file" href="${direct}" id="downloadButton">`), direct)
const scrambled = Buffer.from(direct).toString('base64')
assert.equal(hosts.parseMediafirePage(`<a id="downloadButton" href="#" data-scrambled-url="${scrambled}">`), direct)
assert.equal(hosts.parseMediafirePage('<a id="downloadButton" href="https://evil.example/x">'), '')
assert.equal(hosts.parseMediafirePage(`<a id="downloadButton" href="${direct}?a=1&amp;b=2">`), `${direct}?a=1&b=2`)

assert.equal(hosts.hostLabel('https://gofile.io/d/x'), 'Gofile')
assert.equal(hosts.hostLabel('https://mixdrop.ag/f/x'), 'Mixdrop')
console.log('hosts: ok')
