import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadAudio(mockCtx) {
  const code = fs.readFileSync(new URL('../audio.js', import.meta.url), 'utf8');
  const sandbox = {
    window: mockCtx ? { AudioContext: function () { return mockCtx; } } : {},
    setInterval: () => 0,
    setTimeout: () => 1,
    clearTimeout: () => {},
    Math,
  };
  vm.runInNewContext(code + '\nthis.__Sound = Sound;', sandbox);
  return sandbox.__Sound;
}

function makeMockAudioContext() {
  const calls = [];
  const makeParam = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });
  return {
    calls,
    currentTime: 1.0,
    sampleRate: 44100,
    destination: { id: 'dest' },
    resume: () => {},
    createGain: () => ({ gain: makeParam(), connect: () => {} }),
    createBiquadFilter: () => {
      const f = { type: 'lowpass', frequency: makeParam(), Q: makeParam(), connect: () => {} };
      calls.push(['filter', f]);
      return f;
    },
    createOscillator: () => {
      const o = { type: 'sine', frequency: makeParam(), detune: makeParam(), connect: () => {}, start: () => {}, stop: () => {} };
      calls.push(['osc', o]);
      return o;
    },
    createBuffer: (ch, len, sr) => {
      const data = new Float32Array(len);
      calls.push(['buffer', len]);
      return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => data };
    },
    createBufferSource: () => {
      const s = { buffer: null, connect: () => {}, start: () => {}, stop: () => {} };
      calls.push(['noise', s]);
      return s;
    },
  };
}

test('Sound exposes step, land, splash, roll, lockOn and reuses noise buffer', () => {
  const ctx = makeMockAudioContext();
  const Sound = loadAudio(ctx);
  // Safe before start()
  assert.doesNotThrow(() => {
    Sound.step('grass');
    Sound.land(0.7);
    Sound.splash(0.8);
    Sound.roll();
    Sound.jump();
    Sound.swing(1);
    Sound.hitImpact(true);
    Sound.slam();
    Sound.hurt();
    Sound.heartPickup();
    Sound.death();
    Sound.respawn();
    Sound.lockOn(true);
  });

  Sound.start();
  const before = ctx.calls.length;
  Sound.step('grass');
  Sound.step('stone');
  Sound.step('sand');
  Sound.step('snow');
  Sound.step('water');
  Sound.land(0.8);
  Sound.splash(0.9);
  Sound.roll();
  Sound.jump();
  Sound.swing(1);
  Sound.swing(3);
  Sound.hitImpact(true);
  Sound.slam();
  Sound.hurt();
  Sound.heartPickup();
  Sound.death();
  Sound.respawn();
  Sound.lockOn(true);
  Sound.lockOn(false);

  const added = ctx.calls.slice(before);
  const bufferCreates = added.filter(([k]) => k === 'buffer').length;
  const noisePlays = added.filter(([k]) => k === 'noise').length;
  const oscPlays = added.filter(([k]) => k === 'osc').length;

  assert.equal(bufferCreates, 1, 'noise buffer should be created once and cached');
  assert.ok(noisePlays >= 7, 'step/land/splash/roll should trigger filtered noise');
  assert.ok(oscPlays >= 4, 'lockOn and land should trigger tonal oscillators');
});

test('Sound provides 7 distinct generative regional soundtracks & soundscapes strictly on-key (C-D-E-F-G-A-B)', () => {
  const ctx = makeMockAudioContext();
  const Sound = loadAudio(ctx);
  Sound.start();

  const regionIds = [
    'sanctuary', 'sunlitRuins', 'whisperingForest',
    'twilightCoast', 'canyonOasis', 'frostpeak', 'sunkenCity',
  ];
  // Diatonic C-major / relative-mode pitch classes: C=0, D=2, E=4, F=5, G=7, A=9, B=11
  const allowedPitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
  const modesSeen = new Set();
  const ambientsSeen = new Set();
  const timbresSeen = new Set();
  const groovesSeen = new Set();
  const temposSeen = new Set();

  for (const id of regionIds) {
    assert.equal(Sound.setRegion(id), id);
    assert.equal(Sound.getRegion(), id);
    const theme = Sound.getRegionTheme(id);
    assert.ok(theme && theme.chords.length === 4 && theme.scale.length >= 7, `${id} must define 4 chords and >=7 scale notes`);
    assert.ok(Array.isArray(theme.motif) && theme.motif.length >= 16, `${id} must define a distinct composed melodic motif`);
    assert.ok(Array.isArray(theme.entryMotif) && theme.entryMotif.length >= 3, `${id} must define a region-entry stinger motif`);
    modesSeen.add(theme.mode);
    ambientsSeen.add(theme.ambient);
    timbresSeen.add(theme.melodyTimbre);
    groovesSeen.add(theme.groove);
    temposSeen.add(theme.stepMs);

    // Every chord tone, bass note, and melody scale note must stay strictly on-key with C-major SFX!
    const allFreqs = [...theme.chords.flat(), ...theme.bass, ...theme.scale];
    for (const f of allFreqs) {
      const midi = Math.round(69 + 12 * Math.log2(f / 440));
      const pc = ((midi % 12) + 12) % 12;
      assert.ok(
        allowedPitchClasses.has(pc),
        `Region ${id} note ${f}Hz (pitch class ${pc}) clashes outside C-D-E-F-G-A-B harmonic family!`
      );
    }

    // Play chord, groove beat steps, melody pluck, and ambient soundscape cue without throwing
    const before = ctx.calls.length;
    Sound.playChord();
    for (let s = 0; s < 8; s++) Sound.playBeatStep();
    Sound.pluck();
    Sound.playAmbientCue();
    assert.ok(ctx.calls.length > before, `Region ${id} must synthesize audio nodes for chord, beat groove, pluck & ambient cue`);
  }

  assert.equal(modesSeen.size, 7, 'Each of the 7 regions should have a distinct musical mode/voicing');
  assert.equal(ambientsSeen.size, 7, 'Each of the 7 regions should have a distinct ambient soundscape');
  assert.equal(timbresSeen.size, 7, 'Each of the 7 regions should have a distinct lead instrument timbre');
  assert.equal(groovesSeen.size, 7, 'Each of the 7 regions should have a distinct rhythmic accompaniment groove');
  assert.equal(temposSeen.size, 7, 'Each of the 7 regions should have a distinct tempo/step pacing');
  assert.equal(Sound.setRegion('unknownRegion'), 'sanctuary', 'Unknown regions gracefully fall back to sanctuary');

  // Verify every pitched SFX bling note stays strictly on-key (C-D-E-F-G-A-B) across all regions!
  const sfxFreqs = [];
  const origBling = Sound.bling.bind(Sound);
  Sound.bling = (freq, ...rest) => { sfxFreqs.push(freq); return origBling(freq, ...rest); };
  [1, 2, 3, 'fan', 'comet', 'nova'].forEach(v => Sound.shoot(v));
  [1, 2, 3, 'roll', 'dashCut', 'sprint', 'dashWhirl'].forEach(s => Sound.swing(s));
  Sound.sparkle();
  Sound.chime();
  Sound.fanfare();
  Sound.hitImpact(false);
  Sound.hitImpact(true);
  Sound.slam();
  Sound.heartPickup();
  Sound.death();
  Sound.respawn();
  Sound.lockOn(true);
  Sound.lockOn(false);
  assert.ok(sfxFreqs.length >= 30, 'Should verify all tonal SFX notes');
  for (const f of sfxFreqs) {
    const midi = Math.round(69 + 12 * Math.log2(f / 440));
    const pc = ((midi % 12) + 12) % 12;
    assert.ok(
      allowedPitchClasses.has(pc),
      `SFX note ${f}Hz (pitch class ${pc}) clashes outside C-D-E-F-G-A-B harmonic family!`
    );
  }
});

test('Martial bo-staff swing() produces Doppler bandpass sweeps and hitImpact() layers hardwood crack strictly on-key', () => {
  const ctx = makeMockAudioContext();
  const filterSweeps = [];
  const oscFreqs = [];
  const origFilter = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const f = origFilter();
    const origRamp = f.frequency.exponentialRampToValueAtTime;
    f.frequency.exponentialRampToValueAtTime = (val, t) => {
      filterSweeps.push(val);
      return origRamp(val, t);
    };
    return f;
  };
  const origOsc = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = origOsc();
    const origSet = o.frequency.setValueAtTime;
    o.frequency.setValueAtTime = (val, t) => {
      oscFreqs.push(val);
      return origSet(val, t);
    };
    return o;
  };

  const Sound = loadAudio(ctx);
  Sound.start();

  // Each single swing (Hit 1, Hit 2, Hit 3) must produce EXACTLY 1 coherent whoosh sweep (never choppy double/triple swooshes!)
  const countSweeps = (fn) => {
    const before = filterSweeps.length;
    fn();
    return filterSweeps.length - before;
  };
  assert.equal(countSweeps(() => Sound.swing(1)), 1, 'Hit 1 must produce exactly 1 clean whoosh sweep');
  assert.equal(countSweeps(() => Sound.swing(2)), 1, 'Hit 2 must produce exactly 1 clean whoosh sweep (not 2 swooshes on 1 swing!)');
  assert.equal(countSweeps(() => Sound.swing(3)), 1, 'Hit 3 Spin360 must produce 1 continuous sweeping whirlwind roar (not 3 choppy swooshes!)');
  assert.equal(countSweeps(() => Sound.swing('dashWhirl')), 1, 'dashWhirl must produce 1 continuous sweeping whirlwind roar');
  assert.equal(countSweeps(() => Sound.swing('sprint')), 1, 'sprint drill must produce 1 continuous whir sweep');
  assert.equal(countSweeps(() => Sound.swing('plunge')), 1, 'plunge must produce 1 clean dive whoosh');
  Sound.hitImpact(false);
  Sound.hitImpact(true);

  assert.equal(filterSweeps.length, 6, `All 6 melee moves must emit 1 clean Doppler bandpass sweep each, got ${filterSweeps.length}`);
  const allowedPitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
  for (const hz of oscFreqs) {
    if (hz >= 300) {
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      const pc = ((midi % 12) + 12) % 12;
      assert.ok(allowedPitchClasses.has(pc), `Combat tonal note ${hz.toFixed(2)}Hz (pc=${pc}) must stay strictly on-key in C-D-E-F-G-A-B`);
    }
  }
});
