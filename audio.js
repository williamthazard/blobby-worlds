// ============================================================
// audio.js - cohesive generative regional soundtracks, ambient
// soundscapes, and harmonic sound effects (zero external files).
//
// Music theory guarantee: ALL 7 regional themes use relative modes
// of the exact same diatonic pitch family (C-D-E-F-G-A-B, zero
// clashing accidentals!), so every SFX (sparkle, chime, fanfare,
// star shots, lock-on, hearts) remains 100% on-key in every realm!
// ============================================================

const Sound = {
  ctx: null,
  master: null,   // volume
  tone: null,     // lowpass filter (drops when underwater)
  muted: false,
  activeRegion: 'sanctuary',
  chordIndex: 0,
  melodyStep: 2,
  phraseLeft: 4,
  beatIndex: 0,
  barIndex: 0,
  _chordTimer: null,
  _pluckTimer: null,
  _beatTimer: null,
  _ambTimer: null,

  // Legacy defaults preserved (C Ionian — Star Sanctuary)
  chords: [
    [261.63, 329.63, 392.00], // C
    [220.00, 261.63, 329.63], // Am
    [174.61, 220.00, 261.63], // F
    [196.00, 246.94, 293.66], // G
  ],
  bassNotes: [130.81, 110.00, 87.31, 98.00],
  pentatonic: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.5, 1174.7, 1318.5],

  // 7 distinct modal themes ALL strictly within C-D-E-F-G-A-B (on-key with all SFX!)
  REGIONS: {
    sanctuary: {
      // C Ionian: Serene 3/4 Celestial Music-Box Waltz & Shimmering Harp
      mode: 'C Ionian',
      chordMs: 4200,
      stepMs: 360,
      stepsPerBar: 6,
      pluckMin: 650, pluckSpan: 1350,
      padWaveA: 'sine', padWaveB: 'triangle', padDetune: 5, padVol: 0.044,
      melodyTimbre: 'celesta', melodyVol: 0.115, melodyDur: 1.05,
      groove: 'waltzHarp',
      chords: [
        [261.63, 329.63, 392.00, 493.88], // Cmaj7
        [220.00, 261.63, 329.63, 392.00], // Am7
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [196.00, 246.94, 293.66, 329.63], // G6
      ],
      bass: [130.81, 110.00, 87.31, 98.00],
      scale: [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51],
      motif: [0, -1, 2, 3, -1, 6, 4, -1, 3, 2, -1, 1, 0, -1, 3, 5, -1, 6, 4, -1, 3, -1, 2, -1],
      entryMotif: [0, 2, 3, 6],
      ambient: 'breeze',
    },
    sunlitRuins: {
      // F Lydian: Bright Upbeat Heroic Adventure Jig (Pan-Flute + Bouncy Strum + Travel Percussion!)
      mode: 'F Lydian',
      chordMs: 3200,
      stepMs: 220,
      stepsPerBar: 8,
      pluckMin: 360, pluckSpan: 720,
      padWaveA: 'triangle', padWaveB: 'sine', padDetune: 4, padVol: 0.038,
      melodyTimbre: 'flute', melodyVol: 0.135, melodyDur: 0.54,
      groove: 'heroicStrum',
      chords: [
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [196.00, 246.94, 293.66, 329.63], // G6
        [164.81, 196.00, 246.94, 293.66], // Em7
        [220.00, 261.63, 329.63, 392.00], // Am7
      ],
      bass: [87.31, 98.00, 82.41, 110.00],
      scale: [349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
      motif: [0, 2, 4, -1, 3, 4, 6, -1, 7, 6, 4, -1, 5, 4, 2, -1, 0, 2, 4, 6, 7, -1, 8, -1, 6, 4, 3, 4, 2, -1, -1, -1],
      entryMotif: [0, 2, 4, 7],
      ambient: 'meadow',
    },
    whisperingForest: {
      // D Dorian: Playful Syncopated Woodland Marimba + Plucky Bouncing Bass + Woodblock Ticks!
      mode: 'D Dorian',
      chordMs: 3600,
      stepMs: 255,
      stepsPerBar: 8,
      pluckMin: 340, pluckSpan: 720,
      padWaveA: 'sine', padWaveB: 'triangle', padDetune: 7, padVol: 0.032,
      melodyTimbre: 'marimba', melodyVol: 0.145, melodyDur: 0.34,
      groove: 'forestBounce',
      chords: [
        [146.83, 220.00, 261.63, 329.63], // Dm9
        [196.00, 246.94, 293.66, 329.63], // G6
        [220.00, 261.63, 329.63, 392.00], // Am7
        [164.81, 246.94, 293.66, 329.63], // Em7(add11)
      ],
      bass: [146.83, 98.00, 110.00, 82.41],
      scale: [587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66],
      motif: [0, 2, 4, -1, 0, 2, 4, -1, 5, 4, 3, 2, 1, -1, 0, -1, 2, 4, 5, -1, 7, 5, 4, -1, 3, 2, 1, 2, 0, -1, -1, -1],
      entryMotif: [0, 2, 4, 5],
      ambient: 'forest',
    },
    twilightCoast: {
      // A Aeolian: Sweeping 6/8 Sea-Shanty / Rolling Coastal Accordion-Reed & Rolling Wave Harp!
      mode: 'A Aeolian',
      chordMs: 4200,
      stepMs: 310,
      stepsPerBar: 6,
      pluckMin: 520, pluckSpan: 1100,
      padWaveA: 'sine', padWaveB: 'triangle', padDetune: 6, padVol: 0.045,
      melodyTimbre: 'reed', melodyVol: 0.115, melodyDur: 0.92,
      groove: 'coastalSway',
      chords: [
        [220.00, 261.63, 329.63, 493.88], // Am9
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [261.63, 329.63, 392.00, 493.88], // Cmaj7
        [196.00, 261.63, 293.66, 392.00], // Gsus4
      ],
      bass: [110.00, 87.31, 130.81, 98.00],
      scale: [440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
      motif: [0, -1, 2, 4, -1, 3, 2, -1, 1, 0, -1, -1, 2, -1, 4, 6, -1, 5, 4, -1, 2, 1, 0, -1],
      entryMotif: [0, 2, 4, 6],
      ambient: 'ocean',
    },
    canyonOasis: {
      // E Phrygian: Driving Sun-Baked Desert Oud & Darabuka Hand-Drum Groove (100% white-key E-F-G-A-B-C-D!)
      mode: 'E Phrygian',
      chordMs: 2800,
      stepMs: 195,
      stepsPerBar: 8,
      pluckMin: 280, pluckSpan: 600,
      padWaveA: 'triangle', padWaveB: 'sine', padDetune: 3, padVol: 0.032,
      melodyTimbre: 'oud', melodyVol: 0.145, melodyDur: 0.42,
      groove: 'desertDrums',
      chords: [
        [164.81, 246.94, 329.63, 392.00], // Em(open 5th)
        [174.61, 220.00, 261.63, 329.63], // Fmaj7 (Phrygian bII!)
        [196.00, 246.94, 293.66, 392.00], // G
        [164.81, 196.00, 246.94, 329.63], // Em
      ],
      bass: [82.41, 87.31, 98.00, 82.41],
      scale: [329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99],
      motif: [0, 1, 0, 2, 1, 0, -1, 4, 5, 4, 2, 1, 0, -1, 1, 0, 7, 8, 7, 5, 4, 5, 4, 2, 1, 2, 1, 0, -1, 0, 1, 0],
      entryMotif: [7, 8, 7, 4, 1, 0],
      ambient: 'canyon',
    },
    frostpeak: {
      // G Mixolydian: Sparkling High-Altitude Ice Glockenspiel + Frost Chimes + Crisp Sleigh Tinkle!
      mode: 'G Mixolydian',
      chordMs: 5200,
      stepMs: 410,
      stepsPerBar: 8,
      pluckMin: 720, pluckSpan: 1400,
      padWaveA: 'sine', padWaveB: 'sine', padDetune: 3, padVol: 0.042,
      melodyTimbre: 'bell', melodyVol: 0.125, melodyDur: 1.85,
      groove: 'frostBells',
      chords: [
        [196.00, 293.66, 392.00, 440.00], // Gsus2
        [174.61, 261.63, 329.63, 392.00], // Fmaj9
        [261.63, 392.00, 493.88, 587.33], // Cmaj9
        [196.00, 261.63, 293.66, 392.00], // Gsus4
      ],
      bass: [98.00, 87.31, 130.81, 98.00],
      scale: [783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51, 1567.98, 1760.00],
      motif: [6, -1, 4, -1, 3, 4, 6, -1, 7, -1, 6, 4, 3, -1, -1, -1, 4, -1, 2, -1, 0, 2, 4, -1, 3, -1, 1, -1, 0, -1, -1, -1],
      entryMotif: [6, 4, 6, 7],
      ambient: 'alpine',
    },
    sunkenCity: {
      // A/C Ethereal Suspended: Deep-Sea Echoing Kalimba-WaterHarp + Triple Dub Echo + Sub-Pulse!
      mode: 'A/C Suspended',
      chordMs: 5600,
      stepMs: 460,
      stepsPerBar: 8,
      pluckMin: 700, pluckSpan: 1400,
      padWaveA: 'sine', padWaveB: 'sine', padDetune: 9, padVol: 0.054,
      melodyTimbre: 'waterHarp', melodyVol: 0.130, melodyDur: 1.55,
      groove: 'sunkenSonar',
      chords: [
        [220.00, 293.66, 329.63, 392.00], // Am11
        [174.61, 261.63, 329.63, 392.00], // Fmaj9
        [261.63, 329.63, 392.00, 587.33], // Cmaj9
        [164.81, 246.94, 293.66, 392.00], // Em7
      ],
      bass: [110.00, 87.31, 130.81, 82.41],
      scale: [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50, 1318.51],
      motif: [4, -1, -1, 2, -1, 3, -1, -1, 6, -1, -1, 4, -1, 2, -1, -1, 3, -1, -1, 1, -1, 0, -1, -1, 2, -1, 4, -1, 7, -1, -1, -1],
      entryMotif: [0, 3, 4, 7],
      ambient: 'sunken',
    },
  },

  getRegionTheme(id) {
    return this.REGIONS[id] || this.REGIONS.sanctuary;
  },

  getRegion() {
    return this.activeRegion;
  },

  setRegion(regionId) {
    const next = this.REGIONS[regionId] ? regionId : 'sanctuary';
    if (next === this.activeRegion) return this.activeRegion;
    this.activeRegion = next;
    // Reset phrase & groove indices so the new biome's signature theme enters IMMEDIATELY & unmistakably!
    this.chordIndex = 0;
    this.melodyStep = 2;
    this.phraseLeft = 4;
    this.beatIndex = 0;
    this.barIndex = 0;
    if (this.ctx && !this.muted) {
      if (typeof clearTimeout === 'function') {
        if (this._chordTimer) clearTimeout(this._chordTimer);
        if (this._beatTimer) clearTimeout(this._beatTimer);
        if (this._pluckTimer) clearTimeout(this._pluckTimer);
        if (this._ambTimer) clearTimeout(this._ambTimer);
      }
      this.playRegionIntro(next);
      this._chordTimer = setTimeout(() => {
        this.playChord();
        this.scheduleChord();
      }, 260);
      this._beatTimer = setTimeout(() => {
        this.playBeatStep();
        this.scheduleBeat();
      }, 320);
      this._ambTimer = setTimeout(() => {
        this.playAmbientCue();
        this.scheduleAmbient();
      }, 650);
    }
    return this.activeRegion;
  },

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.56;
    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 16000;              // open air
    this.master.connect(this.tone);
    this.tone.connect(this.ctx.destination);

    this.playChord();
    this.scheduleChord();
    this.playBeatStep();
    this.scheduleBeat();
    this.scheduleAmbient();
  },

  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.56, this.ctx.currentTime, 0.1);
    return this.muted;
  },

  // sound gets dull and distant when the camera dives
  setMuffled(under) {
    if (!this.tone) return;
    this.tone.frequency.setTargetAtTime(under ? 620 : 16000, this.ctx.currentTime, 0.22);
  },

  // ---------- cohesive modal generative music & regional soundscapes ----------

  playRegionIntro(regionId) {
    if (!this.ctx || this.muted) return;
    const theme = this.getRegionTheme(regionId || this.activeRegion);
    const intro = theme.entryMotif || [0, 2, 3];
    const t0 = this.ctx.currentTime + 0.04;
    const gap = Math.min(0.16, (theme.stepMs || 280) / 1700);
    for (let i = 0; i < intro.length; i++) {
      const f = theme.scale[intro[i] % theme.scale.length];
      this.playLeadNote(f, t0 + i * gap, theme.melodyTimbre, theme.melodyVol * 1.12, Math.min(1.1, theme.melodyDur));
    }
    this.playAmbientCue();
  },

  scheduleChord() {
    const theme = this.getRegionTheme(this.activeRegion);
    this._chordTimer = setTimeout(() => {
      this.playChord();
      this.scheduleChord();
    }, theme.chordMs);
  },

  playChord() {
    const theme = this.getRegionTheme(this.activeRegion);
    const len = theme.chords.length;
    const idx = this.chordIndex % len;
    this.chordIndex = (idx + 1) % len;
    if (!this.ctx || this.muted) return;

    const t = this.ctx.currentTime;
    const durSec = theme.chordMs / 1000;
    const chord = theme.chords[idx];
    for (let i = 0; i < chord.length; i++) {
      this.padTone(chord[i], t, theme.padVol, durSec, theme.padWaveA, theme.padWaveB, theme.padDetune);
    }
    this.padTone(theme.bass[idx % theme.bass.length], t, theme.padVol * 1.38, durSec, 'sine', 'triangle', 3);
  },

  scheduleBeat() {
    const theme = this.getRegionTheme(this.activeRegion);
    const ms = theme.stepMs || 320;
    this._beatTimer = setTimeout(() => {
      this.playBeatStep();
      this.scheduleBeat();
    }, ms);
  },

  playBeatStep() {
    if (!this.ctx || this.muted) return;
    const theme = this.getRegionTheme(this.activeRegion);
    const step = this.beatIndex;
    const spb = theme.stepsPerBar || 8;
    const inBar = step % spb;
    const chordIdx = ((this.chordIndex - 1) + theme.chords.length) % theme.chords.length;
    const chord = theme.chords[chordIdx];
    const bassF = theme.bass[chordIdx % theme.bass.length];
    const t = this.ctx.currentTime;

    // 1. Distinct Regional Accompaniment Groove & Percussion (makes every biome unmistakable in 1-2s!)
    const gKind = theme.groove;
    if (gKind === 'waltzHarp') {
      if (inBar === 0) {
        this.bling(bassF * 2, t, 0.055, 0.65, 'sine');
      } else if (inBar === 2 || inBar === 4) {
        this.bling(chord[inBar === 2 ? 1 : 2], t, 0.044, 0.55, 'sine');
      }
    } else if (gKind === 'heroicStrum') {
      if (inBar === 0 || inBar === 4) {
        this.softDrum(t, bassF, 0.068);
        this.bling(bassF * 2, t, 0.062, 0.24, 'triangle');
      } else if (inBar === 2 || inBar === 6) {
        this.bling(chord[1], t, 0.042, 0.16, 'triangle');
        this.bling(chord[2], t + 0.018, 0.042, 0.16, 'triangle');
        this.noiseBurst(3800, 1.8, 'highpass', 0.045, 0.024);
      } else if (inBar % 2 === 1) {
        this.noiseBurst(5200, 2.0, 'bandpass', 0.03, 0.012);
      }
    } else if (gKind === 'forestBounce') {
      if (inBar === 0 || inBar === 3 || inBar === 6) {
        this.bling(bassF * 2, t, 0.072, 0.22, 'triangle');
      }
      if (inBar === 2 || inBar === 5) {
        this.woodTick(t, inBar === 2 ? 880 : 1174.66, 0.048);
      } else if (inBar === 7) {
        this.noiseBurst(2600, 2.5, 'bandpass', 0.035, 0.018);
      }
    } else if (gKind === 'coastalSway') {
      const arpMap = [0, 1, 2, 3, 2, 1];
      const note = chord[arpMap[inBar] % chord.length];
      this.bling(note * (inBar === 0 ? 1 : 2), t, inBar === 0 ? 0.062 : 0.036, 0.62, 'sine');
    } else if (gKind === 'desertDrums') {
      if (inBar === 0 || inBar === 3 || inBar === 6) {
        this.softDrum(t, inBar === 0 ? 82.41 : 98.0, inBar === 0 ? 0.105 : 0.075);
      }
      if (inBar === 2 || inBar === 4 || inBar === 7) {
        this.noiseBurst(2200, 2.2, 'bandpass', 0.048, 0.042);
        this.softDrum(t, 164.81, 0.042);
      }
      if (inBar === 0 || inBar === 4) {
        this.playLeadNote(bassF * 2, t, 'oud', 0.056, 0.24);
      }
    } else if (gKind === 'frostBells') {
      if (inBar === 0 || inBar === 4) {
        this.noiseBurst(6400, 3.0, 'bandpass', 0.075, 0.022);
      }
      if (inBar === 2 || inBar === 6) {
        this.bling(chord[3] * 2, t, 0.030, 0.95, 'sine');
      }
    } else if (gKind === 'sunkenSonar') {
      if (inBar === 0) {
        this.softDrum(t, bassF, 0.060);
      } else if (inBar === 4) {
        this.bling(chord[0] * 2, t, 0.038, 0.85, 'sine');
        this.bling(chord[2] * 2, t + 0.16, 0.026, 0.75, 'sine');
      }
    }

    // 2. Signature Composed Melodic Hook (3 bars of recognizable theme + 1 gentle breathing bar)
    const motif = theme.motif;
    const cycleBar = Math.floor(step / spb) % 4;
    if (motif && motif.length > 0 && cycleBar < 3) {
      const mIdx = motif[step % motif.length];
      if (mIdx >= 0) {
        const vary = this.barIndex >= 4 && Math.random() < 0.14 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        const sIdx = Math.max(0, Math.min(theme.scale.length - 1, mIdx + vary));
        const freq = theme.scale[sIdx];
        this.playLeadNote(freq, t, theme.melodyTimbre, theme.melodyVol, theme.melodyDur);
      }
    } else if (cycleBar === 3 && inBar === 0 && Math.random() < 0.65) {
      this.playLeadNote(theme.scale[0], t, theme.melodyTimbre, theme.melodyVol * 0.75, theme.melodyDur * 1.15);
    }

    this.beatIndex = (step + 1) % (motif ? motif.length : spb * 4);
    if (inBar === spb - 1) this.barIndex++;
  },

  woodTick(t, freq, volume) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = freq;
    flt.Q.value = 3.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.065);
    osc.connect(flt); flt.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
  },

  softDrum(t, freq, volume) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.55, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.68, t + 0.13);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.18);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.2);
  },

  padTone(freq, t, volume = 0.045, dur = 4.0, waveA = 'sine', waveB = 'triangle', detune = 5) {
    const o1 = this.ctx.createOscillator(); o1.type = waveA; o1.frequency.value = freq;
    const o2 = this.ctx.createOscillator(); o2.type = waveB; o2.frequency.value = freq; o2.detune.value = detune;
    const gain = this.ctx.createGain();
    const atk = Math.min(1.4, dur * 0.32);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + atk);
    gain.gain.linearRampToValueAtTime(0, t + dur - 0.08);
    o1.connect(gain); o2.connect(gain); gain.connect(this.master);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },

  playLeadNote(freq, t, timbre, vol, dur) {
    if (!this.ctx || this.muted) return;
    if (timbre === 'celesta') {
      // Star Sanctuary sparkling music-box celesta: warm fundamental + glassy octave chime
      this.bling(freq, t, vol, dur, 'sine');
      this.bling(freq * 2, t + 0.004, vol * 0.34, dur * 0.55, 'sine');
    } else if (timbre === 'marimba') {
      // Whispering Forest woody hollow marimba: punchy triangle + crisp short 2x woody overtone
      this.bling(freq, t, vol, dur, 'triangle');
      this.bling(freq * 2, t, vol * 0.36, dur * 0.26, 'sine');
    } else if (timbre === 'oud') {
      // Canyon Oasis twangy desert oud: resonant filtered sawtooth with snappy attack & double-string shimmer
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(2800, t);
      flt.frequency.exponentialRampToValueAtTime(540, t + dur);
      flt.Q.value = 2.4;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(flt); flt.connect(gain); gain.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.05);
      this.bling(freq * 2, t + 0.006, vol * 0.24, dur * 0.45, 'triangle');
    } else if (timbre === 'bell') {
      // Frostpeak Ridge crystalline ice glockenspiel: pure bell fundamental + 2x & 4x frosty shimmer
      this.bling(freq, t, vol, dur, 'sine');
      this.bling(freq * 2, t + 0.008, vol * 0.38, dur * 0.72, 'sine');
      this.bling(freq * 4, t + 0.012, vol * 0.14, dur * 0.38, 'sine');
    } else if (timbre === 'waterHarp') {
      // Sunken City dreamy echoing kalimba/water-harp with lush 3-tap aquatic dub echo
      this.bling(freq, t, vol, dur, 'sine');
      this.bling(freq * 0.5, t + 0.015, vol * 0.28, dur * 0.9, 'sine');
      this.bling(freq, t + 0.38, vol * 0.50, dur * 0.82, 'sine');
      this.bling(freq, t + 0.76, vol * 0.24, dur * 0.65, 'sine');
    } else if (timbre === 'flute') {
      // Sunlit Ruins bright pastoral pan-flute/ocarina with gentle breathy onset
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 2400;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(flt); flt.connect(gain); gain.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.05);
      this.noiseBurst(freq * 2, 4.5, 'bandpass', 0.06, vol * 0.16);
    } else if (timbre === 'reed') {
      // Twilight Coast expressive sea-shanty concertina / accordion reed with warm detuned pair
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = freq;
      const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq; o2.detune.value = 8;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(1250, t);
      flt.frequency.linearRampToValueAtTime(1650, t + 0.14);
      flt.frequency.exponentialRampToValueAtTime(700, t + dur);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.72, t + 0.10);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o1.connect(flt); o2.connect(flt); flt.connect(gain); gain.connect(this.master);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    } else {
      this.bling(freq, t, vol, dur, 'sine');
    }
  },

  schedulePluck() {
    const theme = this.getRegionTheme(this.activeRegion);
    const phraseRest = this.phraseLeft <= 0 ? 1100 + Math.random() * 900 : 0;
    if (this.phraseLeft <= 0) this.phraseLeft = 3 + Math.floor(Math.random() * 4);
    const delay = theme.pluckMin + Math.random() * theme.pluckSpan + phraseRest;
    this._pluckTimer = setTimeout(() => {
      this.pluck();
      this.schedulePluck();
    }, delay);
  },

  pluck() {
    if (!this.ctx || this.muted) return;
    const theme = this.getRegionTheme(this.activeRegion);
    const scale = theme.scale;
    const delta = Math.random() < 0.18
      ? (Math.random() < 0.5 ? -2 : 2)
      : (Math.random() < 0.5 ? -1 : 1);
    this.melodyStep = Math.max(0, Math.min(scale.length - 1, this.melodyStep + delta));
    this.phraseLeft--;
    this.playLeadNote(scale[this.melodyStep], this.ctx.currentTime, theme.melodyTimbre, theme.melodyVol, theme.melodyDur);
  },

  scheduleAmbient() {
    const delay = 2200 + Math.random() * 2000;
    this._ambTimer = setTimeout(() => {
      this.playAmbientCue();
      this.scheduleAmbient();
    }, delay);
  },

  playAmbientCue() {
    if (!this.ctx || this.muted) return;
    const theme = this.getRegionTheme(this.activeRegion);
    const kind = theme.ambient;
    const t = this.ctx.currentTime;

    if (kind === 'ocean') {
      // Unmistakable rolling coastal surf wave wash onto Twilight Basalt Coast
      this.noiseBurst(420, 0.7, 'lowpass', 2.6, 0.062, 0, 0.85);
      this.noiseBurst(1180, 0.9, 'bandpass', 1.6, 0.028, 0.55, 0.45);
    } else if (kind === 'forest') {
      // Crisp woodland canopy breeze + bright playful songbird/firefly twinkles (D6 -> E6)
      this.noiseBurst(940, 1.4, 'bandpass', 1.5, 0.030, 0, 0.48);
      if (Math.random() < 0.72) {
        this.bling(1174.66, t + 0.10, 0.040, 0.18, 'sine');
        this.bling(1318.51, t + 0.22, 0.036, 0.28, 'sine');
      }
    } else if (kind === 'meadow') {
      // Bright sunlit meadow breeze + joyful skylark chirp (G6 -> A6 -> C7)
      this.noiseBurst(700, 1.0, 'bandpass', 1.4, 0.026, 0, 0.44);
      if (Math.random() < 0.70) {
        this.bling(1567.98, t + 0.08, 0.036, 0.14, 'sine');
        this.bling(1760.00, t + 0.18, 0.036, 0.14, 'sine');
        this.bling(2093.00, t + 0.28, 0.032, 0.22, 'sine');
      }
    } else if (kind === 'canyon') {
      // Warm resonant desert canyon wind howl
      this.noiseBurst(1180, 3.6, 'bandpass', 2.2, 0.038, 0, 0.70);
    } else if (kind === 'alpine') {
      // Crisp icy high-altitude Frostpeak gale + shimmering wind-chime glints
      this.noiseBurst(1950, 3.0, 'bandpass', 2.3, 0.042, 0, 0.72);
      if (Math.random() < 0.65) {
        this.bling(1567.98, t + 0.25, 0.030, 0.65, 'sine');
        this.bling(1760.00, t + 0.42, 0.024, 0.72, 'sine');
      }
    } else if (kind === 'sunken') {
      // Deep underwater current swell + signature rising harmonic bubble triad (C5 -> E5 -> G5 -> C6)
      this.noiseBurst(320, 0.8, 'lowpass', 2.1, 0.052, 0, 0.65);
      if (Math.random() < 0.78) {
        this.bling(523.25, t + 0.08, 0.038, 0.16, 'sine');
        this.bling(659.25, t + 0.18, 0.036, 0.18, 'sine');
        this.bling(783.99, t + 0.28, 0.034, 0.20, 'sine');
        this.bling(1046.50, t + 0.38, 0.030, 0.28, 'sine');
      }
    } else {
      // Star Sanctuary gentle starlight night breeze
      this.noiseBurst(540, 1.0, 'lowpass', 1.8, 0.024, 0, 0.55);
    }
  },

  // ---------- sound effects ----------

  bling(freq, t, volume, length, type = 'sine') {
    const osc = this.ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + length + 0.05);
  },

  shoot(variant = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (variant === 2) {
      // Twin Starlight Bolts: rising dual harmonic chime (A5 -> E6, pure C-major family!)
      this.bling(880.00, t, 0.055, 0.16, 'triangle');
      this.bling(1318.51, t + 0.045, 0.055, 0.18, 'triangle');
    } else if (variant === 3) {
      // Grand Star-Orb Finisher: resonant C5-C6-G6 chime + bass launch
      this.bling(523.25, t, 0.08, 0.24, 'triangle');
      this.bling(1046.50, t + 0.03, 0.075, 0.28, 'sine');
      this.bling(1567.98, t + 0.07, 0.06, 0.26, 'sine');
      this.noiseBurst(720, 1.1, 'bandpass', 0.16, 0.065);
    } else if (variant === 'fan') {
      // Click -> F Star-Fan Scatter: crisp 3-note fan shimmer
      this.bling(784, t, 0.055, 0.16, 'triangle');
      this.bling(988, t + 0.035, 0.055, 0.17, 'triangle');
      this.bling(1175, t + 0.07, 0.055, 0.18, 'triangle');
      this.noiseBurst(980, 1.2, 'bandpass', 0.12, 0.05);
    } else if (variant === 'comet') {
      // Click -> Click -> F Piercing Comet: roaring celestial lance
      this.bling(659, t, 0.085, 0.26, 'triangle');
      this.bling(1318, t + 0.025, 0.08, 0.30, 'sine');
      this.noiseBurst(1150, 0.9, 'bandpass', 0.24, 0.09);
    } else if (variant === 'nova') {
      // Click x3 -> F Constellation Nova: radiant 4-note star chord
      [587.3, 880, 1174.7, 1760].forEach((f, i) => this.bling(f, t + i * 0.03, 0.075, 0.34, 'sine'));
      this.noiseBurst(860, 0.8, 'bandpass', 0.26, 0.08);
    } else {
      this.bling(880, t, 0.05, 0.15, 'triangle');
    }
  },
  sparkle() { // star or pearl pickup
    if (!this.ctx || this.muted) return;
    this.bling(1567.98, this.ctx.currentTime, 0.06, 0.35);
    this.bling(2093.00, this.ctx.currentTime + 0.07, 0.06, 0.3);
  },
  poof()    { // gloom defeated
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + 0.5);
  },
  chime()   { // rescued a Starling
    if (!this.ctx || this.muted) return;
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.bling(f, this.ctx.currentTime + i * 0.09, 0.12, 0.6));
  },
  steal()   { // gloom took a star
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(250, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + 0.6);
  },
  fanfare() { // totem lit!
    if (!this.ctx || this.muted) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.bling(f, this.ctx.currentTime + i * 0.13, 0.14, 1.0));
  },

  noiseBuf: null,

  getNoiseBuffer() {
    if (this.noiseBuf || !this.ctx) return this.noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 2.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  },

  noiseBurst(freq, q, filterType, duration, volume, delay = 0, attack = 0.012) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    if (duration > 1.5) src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    const atk = Math.min(attack, duration * 0.45);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.03);
  },

  whooshSweep(fStart, fEnd, q, duration, volume, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(40, fStart), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, fEnd), t + duration);
    const gain = this.ctx.createGain();
    const atk = Math.min(0.018, duration * 0.28);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.03);
  },

  step(surface = 'grass') {
    if (!this.ctx || this.muted) return;
    const jitter = 0.9 + Math.random() * 0.2;
    if (surface === 'stone') {
      this.noiseBurst(1600 * jitter, 2.2, 'bandpass', 0.055, 0.045);
      this.bling(190 * jitter, this.ctx.currentTime, 0.025, 0.05, 'triangle');
    } else if (surface === 'sand' || surface === 'snow') {
      this.noiseBurst(950 * jitter, 1.0, 'bandpass', 0.085, 0.035);
    } else if (surface === 'water') {
      this.noiseBurst(1250 * jitter, 1.4, 'bandpass', 0.14, 0.055);
    } else {
      this.noiseBurst(680 * jitter, 1.1, 'bandpass', 0.065, 0.032);
    }
  },

  land(intensity = 0.5) {
    if (!this.ctx || this.muted) return;
    const k = Math.max(0.2, Math.min(1, intensity));
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09 * k, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
    this.noiseBurst(520, 0.9, 'lowpass', 0.12, 0.06 * k);
  },

  splash(intensity = 0.6) {
    if (!this.ctx || this.muted) return;
    const k = Math.max(0.2, Math.min(1, intensity));
    this.noiseBurst(1400, 0.8, 'bandpass', 0.26, 0.085 * k);
    this.noiseBurst(650, 0.7, 'lowpass', 0.32, 0.07 * k, 0.04);
  },

  roll() {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(420, 0.9, 'bandpass', 0.22, 0.07);
    this.noiseBurst(780, 1.2, 'bandpass', 0.16, 0.04, 0.08);
  },

  jump() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(410, t + 0.11);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.055, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
    this.noiseBurst(760, 1.1, 'bandpass', 0.09, 0.032);
  },

  swing(step = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (step === 'plunge') {
      // High overhead staff windmill -> plummeting meteor dive cut!
      this.whooshSweep(1480, 420, 1.5, 0.24, 0.095);
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440.0, t); // A4 (strictly on-key!)
      osc.frequency.exponentialRampToValueAtTime(146.83, t + 0.22); // D3
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.065, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.26);
      return;
    }
    if (step === 'sprint') {
      // ONE sustained axial bo-staff star-drill spin-whir across the 0.56s slide glide!
      this.whooshSweep(720, 2150, 1.8, 0.30, 0.095, 0.02);
      this.bling(783.99, t, 0.065, 0.22, 'triangle');
      this.bling(1318.51, t + 0.06, 0.055, 0.22, 'sine');
      return;
    }
    if (step === 'roll' || step === 'dashCut') {
      // ONE clean rising uppercut staff cleave across 0.46s
      this.whooshSweep(500, 1820, 1.6, 0.24, 0.095, 0.04);
      this.bling(step === 'dashCut' ? 880 : 659.25, t + 0.04, 0.06, 0.20, 'triangle');
      if (step === 'dashCut') this.bling(1318.51, t + 0.09, 0.05, 0.20, 'sine');
      return;
    }
    const isSpin = step === 3 || step === 'dashWhirl';
    if (isSpin) {
      // ONE long, continuous sweeping whirlwind roar across the 0.74s airborne 360° leap (never choppy triple swooshes!)
      this.whooshSweep(460, 1860, 1.4, 0.44, 0.10, 0.08);
      this.bling(step === 'dashWhirl' ? 987.77 : 783.99, t + 0.12, 0.07, 0.34, 'triangle');
      if (step === 'dashWhirl') this.bling(1567.98, t + 0.20, 0.065, 0.30, 'sine');
      return;
    }
    if (step === 2) {
      // ONE crisp overhead-diagonal bo-cleave whip whoosh!
      this.whooshSweep(580, 1740, 1.5, 0.26, 0.09, 0.06);
      return;
    }
    // Hit 1: ONE deep, clean bamboo/hardwood horizontal bo-sweep whoosh!
    this.whooshSweep(420, 1280, 1.4, 0.24, 0.085, 0.06);
  },

  hitImpact(heavy = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    // Deep kinetic body thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 196.0 : 261.63, t); // G3 / C4
    osc.frequency.exponentialRampToValueAtTime(heavy ? 55.0 : 82.41, t + (heavy ? 0.19 : 0.11));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(heavy ? 0.17 : 0.115, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.21 : 0.13));
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.23);
    // Crisp 2.2kHz hardwood bo-staff crack transient + mid air snap
    this.noiseBurst(2200, 1.8, 'bandpass', 0.048, heavy ? 0.14 : 0.095);
    this.noiseBurst(heavy ? 1150 : 1550, 1.2, 'bandpass', heavy ? 0.14 : 0.08, heavy ? 0.105 : 0.065);
    // Sparkling on-key Star-Lantern resonance (D6 + A6 on heavy, B5 on light)
    this.bling(heavy ? 1174.66 : 987.77, t, heavy ? 0.085 : 0.055, heavy ? 0.26 : 0.14, 'sine');
    if (heavy) this.bling(1760.0, t + 0.03, 0.055, 0.22, 'triangle');
  },

  slam() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.34);
    this.noiseBurst(420, 0.8, 'lowpass', 0.26, 0.12);
    [523.25, 783.99, 1046.5].forEach((f, idx) => this.bling(f, t + idx * 0.035, 0.06, 0.32, 'triangle'));
  },

  hurt() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(92, t + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.095, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.24);
    this.noiseBurst(460, 1.0, 'lowpass', 0.16, 0.08);
  },

  heartPickup() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    // Pure C-E-G-C ascending heart chime (100% diatonic with all 7 regional modal soundtracks!)
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => this.bling(f, t + i * 0.06, 0.075, 0.28, 'sine'));
  },

  death() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [392.0, 349.23, 293.66, 220.0].forEach((f, i) => this.bling(f, t + i * 0.18, 0.09, 0.55, 'triangle'));
  },

  respawn() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [329.63, 440.0, 523.25, 659.25].forEach((f, i) => this.bling(f, t + i * 0.1, 0.08, 0.55, 'sine'));
  },

  lockOn(locked) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (locked) {
      this.bling(880, t, 0.055, 0.09, 'triangle');
      this.bling(1318.5, t + 0.05, 0.06, 0.14, 'sine');
    } else {
      this.bling(784, t, 0.04, 0.1, 'triangle');
      this.bling(523.25, t + 0.045, 0.04, 0.12, 'sine');
    }
  },
};
