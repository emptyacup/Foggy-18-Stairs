// 环境声：全部 WebAudio 合成。雨声（粉噪 + 高通）、城市低频轰鸣。首次点击后启动。
export class Ambience {
  constructor() { this.ctx = null; this.started = false; }

  start() {
    if (this.started || typeof AudioContext === 'undefined') return;
    this.started = true;
    const ac = this.ctx = new AudioContext();
    const len = ac.sampleRate * 4;
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {        // 粉噪
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
    }
    const master = ac.createGain(); master.gain.value = 0.0; master.connect(ac.destination);
    master.gain.linearRampToValueAtTime(0.9, ac.currentTime + 3);

    const rain = ac.createBufferSource(); rain.buffer = buf; rain.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g1 = ac.createGain(); g1.gain.value = 0.55;
    rain.connect(hp).connect(g1).connect(master); rain.start();

    const rumble = ac.createBufferSource(); rumble.buffer = buf; rumble.loop = true; rumble.playbackRate.value = 0.5;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g2 = ac.createGain(); g2.gain.value = 0.7;
    rumble.connect(lp).connect(g2).connect(master); rumble.start();
  }

  update() {}
}
