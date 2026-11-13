#!/usr/bin/env node
/**
 * Проверка адреса API перед боевой сборкой.
 * Падает сборка, если в .env.production осталась заглушка или пусто —
 * иначе бета-сборка уехала бы к людям с адресом localhost.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.production');
const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

const line = raw.split('\n').find((l) => l.trim().startsWith('VITE_API_URL'));
const value = line ? line.split('=')[1].trim() : '';

const isPlaceholder = !value || /example\.com|ваш-домен|ЗАПОЛНИ/i.test(value);
const isLocal = /localhost|127\.0\.0\.1/i.test(value);

if (isPlaceholder || isLocal) {
  console.error('');
  console.error('  СБОРКА ОСТАНОВЛЕНА: VITE_API_URL не настроен.');
  console.error('  Файл: .env.production');
  console.error(`  Сейчас: "${value || '(пусто)'}"`);
  console.error('  Нужен адрес сервера с https, например:');
  console.error('    VITE_API_URL=https://api.lustre.example');
  console.error('');
  process.exit(1);
}

console.log('VITE_API_URL:', value);
