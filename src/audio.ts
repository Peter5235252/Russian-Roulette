import { vibrateGamepad, getControllerSettings } from './controller';

const SOUND_URLS = {
  cock: 'https://cdn.freesound.org/previews/402/402790_7111288-hq.mp3',
  gunshot: 'https://cdn.freesound.org/previews/396/396316_5937039-hq.mp3',
  click: 'https://cdn.freesound.org/previews/677/677159_7157894-hq.mp3',
  splatter: 'https://cdn.freesound.org/previews/406/406582_6068748-hq.mp3',
  heartbeat: 'https://cdn.freesound.org/previews/332/332821_5859881-lq.mp3',
  load: 'https://cdn.freesound.org/previews/139/139001_2534439-hq.mp3',
  ambient: 'https://cdn.freesound.org/previews/799/799355_2520418-lq.mp3',
  item: 'https://cdn.freesound.org/previews/538/538000_3377875-hq.mp3',
  tap: 'https://cdn.freesound.org/previews/253/253168_4404552-hq.mp3',
  purchase: 'https://cdn.freesound.org/previews/209/209578_2558531-hq.mp3',
  syringeCap: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABgAZGF0YQQAAAAAAAAA',
  syringeSlam: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABgAZGF0YQQAAAAAAAAA',
  thump: 'https://cdn.freesound.org/previews/454/454418_612689-hq.mp3',
  pliers: 'https://pixabay.com/sound-effects/download/film-special-effects-pliers-155627/'
};

const audioInstances = new Map<string, HTMLAudioElement>();

let globalMasterVolume = 1.0;
let globalAmbientVolume = 0.4;

export const setMasterVolume = (vol: number) => {
  globalMasterVolume = Math.max(0, Math.min(1, vol));
  const ambient = audioInstances.get('ambient');
  if (ambient) ambient.volume = globalAmbientVolume * globalMasterVolume;
  const heartbeat = audioInstances.get('heartbeat');
  if (heartbeat) heartbeat.volume = 1.0 * globalMasterVolume;
};

export const setAmbientVolume = (vol: number) => {
  globalAmbientVolume = Math.max(0, Math.min(1, vol));
  const ambient = audioInstances.get('ambient');
  if (ambient) ambient.volume = globalAmbientVolume * globalMasterVolume;
};

export const getMasterVolume = () => globalMasterVolume;
export const getAmbientVolume = () => globalAmbientVolume;

export const initAudio = () => {
  // Preload all audio
  for (const [key, url] of Object.entries(SOUND_URLS)) {
    if (!audioInstances.has(key)) {
      const audio = new Audio(url);
      if (key === 'ambient' || key === 'heartbeat') {
        audio.loop = true;
      }
      audioInstances.set(key, audio);
    }
  }
};

const playSound = (key: string, restart = true, baseVolume = 1.0) => {
  let audio = audioInstances.get(key);
  if (!audio && key in SOUND_URLS) {
     audio = new Audio(SOUND_URLS[key as keyof typeof SOUND_URLS]);
     if (key === 'ambient' || key === 'heartbeat') audio.loop = true;
     audioInstances.set(key, audio);
  }
  if (audio) {
    if (restart) {
      audio.currentTime = 0;
    }
    const finalVol = key === 'ambient' ? (globalAmbientVolume * globalMasterVolume) : (baseVolume * globalMasterVolume);
    audio.volume = finalVol;
    audio.play().catch(e => console.warn(`Audio play failed for ${key}:`, e));
  }
};

const stopSound = (key: string) => {
  const audio = audioInstances.get(key);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
};

export const playStartAudio = () => {
  initAudio();
};

export const startAmbientDrone = () => {
  playSound('ambient', false, 0.4);
};

export const playGunshot = () => {
  playSound('gunshot', true, 1.0);
};

export const playCockSound = () => {
  playSound('cock', true, 1.0);
  // Hammer pull tension followed by the crisp lock
  setTimeout(() => vibrateGamepad('rumble', { duration: 80, weak: 0.3, strong: 0.0 }), 50);
  setTimeout(() => vibrateGamepad('click', { duration: 30, weak: 0.8, strong: 0.6 }), 280);
};

export const playEmptyClick = () => {
  playSound('click', true, 1.0);
};

export const playItemSound = () => {
  playSound('item', true, 0.8);
};

export const playTapSound = () => {
  playSound('tap', true, 0.6);
};

export const playPurchaseSound = () => {
  playSound('purchase', true, 0.8);
};

export const playBloodSplatter = () => {
  const s = getControllerSettings();
  if (s.bloodEffectsEnabled === false) return;
  playSound('splatter', true, 0.9);
};

export const playPliersSound = () => {
  playSound('pliers', true, 1.0);
};

// Web Audio API Synthesizers for beautiful custom sounds!
const getAudioContext = (): AudioContext | null => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!(window as any)._gameAudioCtx) {
    (window as any)._gameAudioCtx = new AudioContextClass();
  }
  const ctx = (window as any)._gameAudioCtx as AudioContext;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
};

let heartbeatPlaying = false;
let heartbeatInterval: number | null = null;

const synthHeartbeat = () => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        
        // Thump 1
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8 * globalMasterVolume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.2);
        vibrateGamepad('rumble', { duration: 150, weak: 0.6, strong: 0.15 });

        // Thump 2
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(65, now + 0.25);
        osc2.frequency.exponentialRampToValueAtTime(25, now + 0.35);
        gain2.gain.setValueAtTime(0, now + 0.23);
        gain2.gain.linearRampToValueAtTime(1.0 * globalMasterVolume, now + 0.27);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc2.start(now + 0.25);
        osc2.stop(now + 0.55);
        setTimeout(() => vibrateGamepad('rumble', { duration: 250, weak: 0.8, strong: 0.25 }), 250);
        
        setTimeout(() => {
          try { osc.disconnect(); gain.disconnect(); osc2.disconnect(); gain2.disconnect(); } catch(e){}
        }, 700);
    } catch(e) {}
};

export const setHeartbeatStatus = (active: boolean) => {
  if (active && !heartbeatPlaying) {
    heartbeatPlaying = true;
    synthHeartbeat();
    heartbeatInterval = window.setInterval(() => {
      if (heartbeatPlaying) synthHeartbeat();
    }, 1200);
  } else if (!active && heartbeatPlaying) {
    heartbeatPlaying = false;
    if (heartbeatInterval !== null) {
      window.clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }
};

export const playHeartbeat = () => {
  // We don't trigger one-offs anymore, we use setHeartbeatStatus for smooth looping
};

export const playBulletLoad = () => {
  playSound('load', true, 0.6);
};

export const playSyringeCap = () => {
  playSound('syringeCap', true, 0.85);
  // Trigger Web Audio synthetic layer too for consistent high-quality feel
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // High-pitched click/snap
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4500, now);
    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.06);
    gain.gain.setValueAtTime(0.35 * globalMasterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.07);

    // Complementary snap sound
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(280, now);
    osc2.frequency.linearRampToValueAtTime(70, now + 0.04);
    gain2.gain.setValueAtTime(0.45 * globalMasterVolume, now);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc2.start(now);
    osc2.stop(now + 0.06);

    // Completely prune references on completion to avoid node-retention in WebAudio graphs
    setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
        osc2.disconnect();
        gain2.disconnect();
      } catch (err) {}
    }, 150);
  } catch (e) {
    console.warn("Synth cap sound failed:", e);
  }
};

export const playRazorSlice = () => {
  playBloodSplatter();
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Sharp metallic razor blade scrape (filtered noise)
    const bufferSize = ctx.sampleRate * 0.25;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(5500, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.22);
    filter.Q.value = 7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.85 * globalMasterVolume, now + 0.03);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.24);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.25);

    // 2. High metallic blade ring
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(3800, now);
    ring.frequency.exponentialRampToValueAtTime(900, now + 0.18);
    ringGain.gain.setValueAtTime(0.55 * globalMasterVolume, now);
    ringGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    ring.start(now);
    ring.stop(now + 0.22);

    // 3. Deep visceral skin cut thud & squelch
    const cut = ctx.createOscillator();
    const cutGain = ctx.createGain();
    cut.connect(cutGain);
    cutGain.connect(ctx.destination);
    cut.type = 'sine';
    cut.frequency.setValueAtTime(220, now + 0.02);
    cut.frequency.linearRampToValueAtTime(45, now + 0.25);
    cutGain.gain.setValueAtTime(0, now);
    cutGain.gain.linearRampToValueAtTime(0.95 * globalMasterVolume, now + 0.04);
    cutGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    cut.start(now + 0.02);
    cut.stop(now + 0.32);

    setTimeout(() => {
      try {
        noise.disconnect(); filter.disconnect(); noiseGain.disconnect();
        ring.disconnect(); ringGain.disconnect();
        cut.disconnect(); cutGain.disconnect();
      } catch (e) {}
    }, 400);
  } catch (e) {
    console.warn("Razor slice sound failed:", e);
  }
};

export const playScalpelCut = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.30);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4800, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.28);
    filter.Q.value = 6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.75 * globalMasterVolume, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.30);

    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(3400, now);
    ring.frequency.exponentialRampToValueAtTime(2800, now + 0.28);

    ringGain.gain.setValueAtTime(0.3 * globalMasterVolume, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(now);
    ring.stop(now + 0.30);
  } catch (e) {
    console.warn("Scalpel cut audio failed:", e);
  }
};

export const playCigaretteLighting = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Zippo Lighter Metal Cap Flip "CLINK"
    const flipOsc = ctx.createOscillator();
    const flipGain = ctx.createGain();
    flipOsc.type = 'triangle';
    flipOsc.frequency.setValueAtTime(3200, now);
    flipOsc.frequency.exponentialRampToValueAtTime(1400, now + 0.05);
    flipGain.gain.setValueAtTime(0.7 * globalMasterVolume, now);
    flipGain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
    flipOsc.connect(flipGain);
    flipGain.connect(ctx.destination);
    flipOsc.start(now);
    flipOsc.stop(now + 0.07);

    // 2. Flint Wheel Strike Friction Spark Scrape
    const strikeTime = now + 0.18;
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const spark = ctx.createBufferSource();
    spark.buffer = buffer;
    const sparkFilter = ctx.createBiquadFilter();
    sparkFilter.type = 'bandpass';
    sparkFilter.frequency.setValueAtTime(4500, strikeTime);
    sparkFilter.Q.value = 4;
    const sparkGain = ctx.createGain();
    sparkGain.gain.setValueAtTime(0.85 * globalMasterVolume, strikeTime);
    sparkGain.gain.exponentialRampToValueAtTime(0.01, strikeTime + 0.14);
    spark.connect(sparkFilter);
    sparkFilter.connect(sparkGain);
    sparkGain.connect(ctx.destination);
    spark.start(strikeTime);
    spark.stop(strikeTime + 0.15);

    // 3. Gas Flame Ignition Whoosh & Steady Burn
    const flameTime = strikeTime + 0.08;
    const flameBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const flameData = flameBuffer.getChannelData(0);
    for (let i = 0; i < flameBuffer.length; i++) {
      flameData[i] = (Math.random() * 2 - 1);
    }
    const flame = ctx.createBufferSource();
    flame.buffer = flameBuffer;
    const flameFilter = ctx.createBiquadFilter();
    flameFilter.type = 'lowpass';
    flameFilter.frequency.setValueAtTime(1200, flameTime);
    flameFilter.frequency.linearRampToValueAtTime(600, flameTime + 0.7);
    const flameGain = ctx.createGain();
    flameGain.gain.setValueAtTime(0, flameTime);
    flameGain.gain.linearRampToValueAtTime(0.5 * globalMasterVolume, flameTime + 0.05);
    flameGain.gain.exponentialRampToValueAtTime(0.01, flameTime + 0.75);
    flame.connect(flameFilter);
    flameFilter.connect(flameGain);
    flameGain.connect(ctx.destination);
    flame.start(flameTime);
    flame.stop(flameTime + 0.8);

    // 4. Crackling Tobacco Sizzle / Inhale Drag
    const sizzleTime = flameTime + 0.2;
    const sizzleBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.9, ctx.sampleRate);
    const sizzleData = sizzleBuffer.getChannelData(0);
    for (let i = 0; i < sizzleBuffer.length; i++) {
      sizzleData[i] = (Math.random() > 0.88 ? (Math.random() * 2 - 1) : 0);
    }
    const sizzle = ctx.createBufferSource();
    sizzle.buffer = sizzleBuffer;
    const sizzleFilter = ctx.createBiquadFilter();
    sizzleFilter.type = 'highpass';
    sizzleFilter.frequency.value = 3500;
    const sizzleGain = ctx.createGain();
    sizzleGain.gain.setValueAtTime(0, sizzleTime);
    sizzleGain.gain.linearRampToValueAtTime(0.4 * globalMasterVolume, sizzleTime + 0.2);
    sizzleGain.gain.exponentialRampToValueAtTime(0.01, sizzleTime + 0.85);
    sizzle.connect(sizzleFilter);
    sizzleFilter.connect(sizzleGain);
    sizzleGain.connect(ctx.destination);
    sizzle.start(sizzleTime);
    sizzle.stop(sizzleTime + 0.9);

  } catch (e) {
    console.warn("Cigarette lighting sound failed:", e);
  }
};

export const playSmokeExhale = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Soft warm breath exhale noise
    const bufferSize = ctx.sampleRate * 1.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const exhale = ctx.createBufferSource();
    exhale.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.linearRampToValueAtTime(800, now + 0.5);
    filter.frequency.linearRampToValueAtTime(300, now + 1.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35 * globalMasterVolume, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.15);

    exhale.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    exhale.start(now);
    exhale.stop(now + 1.2);
  } catch (e) {
    console.warn("Smoke exhale sound failed:", e);
  }
};

export const playSyringeSlam = () => {
  playSound('syringeSlam', true, 1.0);
  // Trigger Web Audio synthetic slam Layer for raw visceral satisfying impact
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // 1. Desending aerodynamic whoosh
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.6 * globalMasterVolume, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.17);
    osc.start(now);
    osc.stop(now + 0.18);

    // 2. Visceral chest impact flesh thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.type = 'sine';
    thud.frequency.setValueAtTime(110, now + 0.08);
    thud.frequency.linearRampToValueAtTime(25, now + 0.22);
    thudGain.gain.setValueAtTime(0, now);
    thudGain.gain.setValueAtTime(0.9 * globalMasterVolume, now + 0.08);
    thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    thud.start(now + 0.08);
    thud.stop(now + 0.3);

    // 3. Liquid injection friction squish
    const squirt = ctx.createOscillator();
    const squirtGain = ctx.createGain();
    squirt.connect(squirtGain);
    squirtGain.connect(ctx.destination);
    squirt.type = 'triangle';
    squirt.frequency.setValueAtTime(1100, now + 0.12);
    squirt.frequency.exponentialRampToValueAtTime(2400, now + 0.34);
    squirtGain.gain.setValueAtTime(0, now);
    squirtGain.gain.setValueAtTime(0.35 * globalMasterVolume, now + 0.12);
    squirtGain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
    squirt.start(now + 0.12);
    squirt.stop(now + 0.4);

    // Completely prune references on completion to avoid node-retention in WebAudio graphs
    setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
        thud.disconnect();
        thudGain.disconnect();
        squirt.disconnect();
        squirtGain.disconnect();
      } catch (err) {}
    }, 500);
  } catch (e) {
    console.warn("Synth slam sound failed:", e);
  }
};

export const playThumpSound = () => {
  playSound('thump', true, 1.0);
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep chest impact / floor thud frequency sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.45);
    
    gain.gain.setValueAtTime(1.0 * globalMasterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    
    osc.start(now);
    osc.stop(now + 0.48);

    // High frequency surface impact (wooden table/floor board knock)
    const board = ctx.createOscillator();
    const boardGain = ctx.createGain();
    board.connect(boardGain);
    boardGain.connect(ctx.destination);
    
    board.type = 'triangle';
    board.frequency.setValueAtTime(180, now);
    board.frequency.linearRampToValueAtTime(45, now + 0.12);
    
    boardGain.gain.setValueAtTime(0.4 * globalMasterVolume, now);
    boardGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    
    board.start(now);
    board.stop(now + 0.15);

    // Completely prune references on completion to avoid node-retention in WebAudio graphs
    setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
        board.disconnect();
        boardGain.disconnect();
      } catch (err) {}
    }, 600);
  } catch (e) {
    console.warn("Synth thump sound failed:", e);
  }
};



export const playGlassBreakSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    // High frequency noise burst for the glass shattering
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      // Create noisy, jagged wave representing glass shards
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.1));
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 6000;
    bandpass.Q.value = 0.5;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 3000;
    
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(1.5 * globalMasterVolume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    noiseSource.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Also add a low thump for the bottle body hitting the ground
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.1);
    
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.8 * globalMasterVolume, ctx.currentTime);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    
    osc.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);

    noiseSource.start(ctx.currentTime);
  } catch (e) {
    console.error('Failed to play glass break sound', e);
  }
};
