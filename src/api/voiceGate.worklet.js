// Гейт голосовой активности (AudioWorklet): открывает микрофон, когда уровень выше порога,
// и плавно закрывает после паузы. Работает в аудиопотоке, поэтому не зависит от таймеров
// окна — у свёрнутого лаунчера Chromium замедляет setInterval до раза в секунду, и прежний
// VAD на таймере «рвал» речь, пока человек был в игре.
//
// Сообщения из основного потока (port): { mode, auto, thresholdDb, holdMs }
//   mode: 'vad' — по голосу, 'open' — всегда открыт (рация нажата), 'closed' — закрыт.
// В основной поток каждые ~45 мс: { db, threshold, open } — для индикатора и «говорит».

const BLOCK_MS = (128 / sampleRate) * 1000;
const FLOOR_RISE_DB = 1.2 * (BLOCK_MS / 1000); // шумовой пол поднимается ~1.2 дБ/с
const ATTACK = 0.5;   // открытие за пару блоков — первый слог не теряется
const RELEASE = 0.03; // затухание ~90 мс — без щелчков

class LustreVoiceGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mode = 'vad';
    this.auto = true;
    this.thresholdDb = -50;
    this.holdMs = 800;
    this.floorDb = -70;
    this.levelDb = -100;
    this.open = false;
    this.sinceAbove = Infinity;
    this.gain = 0;
    this.blocks = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.mode === 'vad' || d.mode === 'open' || d.mode === 'closed') this.mode = d.mode;
      if (typeof d.auto === 'boolean') this.auto = d.auto;
      if (typeof d.thresholdDb === 'number') this.thresholdDb = d.thresholdDb;
      if (typeof d.holdMs === 'number') this.holdMs = d.holdMs;
    };
  }

  threshold() {
    if (!this.auto) return this.thresholdDb;
    // автопорог: на 15 дБ выше фонового шума, в разумных пределах
    return Math.min(-25, Math.max(-65, this.floorDb + 15));
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const ch = input && input[0];
    if (!ch || ch.length === 0) {
      for (const o of output) o.fill(0);
      return true;
    }

    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    const db = 20 * Math.log10(Math.max(Math.sqrt(sum / ch.length), 1e-5));
    // индикатор: быстрый подъём, медленный спад
    this.levelDb = db > this.levelDb ? db : this.levelDb + (db - this.levelDb) * 0.08;

    // шумовой пол: мгновенно вниз, медленно вверх (речь его почти не поднимает)
    if (db < this.floorDb) this.floorDb += (db - this.floorDb) * 0.3;
    else this.floorDb += Math.min(db - this.floorDb, FLOOR_RISE_DB);

    const thr = this.threshold();
    if (this.mode === 'open') {
      this.open = true;
    } else if (this.mode === 'closed') {
      this.open = false;
    } else if (!this.auto && thr <= -100) {
      this.open = true; // порог на минимуме — передаётся всё
    } else if (db >= thr) {
      this.open = true;
      this.sinceAbove = 0;
    } else {
      this.sinceAbove += BLOCK_MS;
      if (this.sinceAbove > this.holdMs) this.open = false;
    }

    const from = this.gain;
    const target = this.open ? 1 : 0;
    this.gain += (target - this.gain) * (target > this.gain ? ATTACK : RELEASE);
    if (this.gain < 0.001) this.gain = 0;
    const step = (this.gain - from) / ch.length;
    for (let c = 0; c < output.length; c++) {
      const src = input[c] || ch;
      const out = output[c];
      let g = from;
      for (let i = 0; i < out.length; i++) {
        g += step;
        out[i] = src[i] * g;
      }
    }

    if (++this.blocks >= 16) {
      this.blocks = 0;
      this.port.postMessage({ db: this.levelDb, threshold: thr, open: this.open });
    }
    return true;
  }
}

registerProcessor('lustre-voice-gate', LustreVoiceGate);
