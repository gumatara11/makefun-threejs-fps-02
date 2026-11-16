// All sound is synthesized with WebAudio — no audio files, no network.
// Functional sounds only: shots, reload, hit tick, bomb beeps, plant/defuse,
// round stingers. The context is created by the player's first gesture (the
// frozen start screen), and resumed on focus when the browser suspends it.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume();
    return true;
  }

  function noiseBuffer(duration) {
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    return buffer;
  }

  function playNoise(duration, filterFreq, gainValue, when = 0) {
    if (!context) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(context.currentTime + when);
  }

  function playTone(freq, duration, gainValue, type = 'sine', when = 0) {
    if (!context) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + when + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(context.currentTime + when);
    oscillator.stop(context.currentTime + when + duration);
  }

  return {
    ensure,
    get ready() {
      return context !== null;
    },
    shot(kind, distant = false) {
      if (!context) return;
      if (kind === 'vk') playNoise(0.09, 2400, distant ? 0.15 : 0.5);
      else playNoise(0.07, 3200, distant ? 0.1 : 0.35);
      if (!distant) playTone(kind === 'vk' ? 140 : 190, 0.05, 0.25, 'square');
    },
    reload() {
      playTone(700, 0.04, 0.15, 'square');
      playTone(500, 0.04, 0.15, 'square', 0.12);
    },
    hit(killed) {
      playTone(killed ? 1320 : 990, killed ? 0.12 : 0.06, 0.25, 'sine');
    },
    hurt() {
      playTone(180, 0.12, 0.3, 'sawtooth');
    },
    dryFire() {
      playTone(300, 0.03, 0.12, 'square');
    },
    // Footstep: a short low thud. Alternate pitch slightly so repeated steps
    // do not sound like a machine. Gain follows speed (crouch = quiet).
    step(fast = false, alternate = false) {
      if (!context) return;
      playNoise(0.06, fast ? 700 : 420, fast ? 0.14 : 0.09);
      playTone(alternate ? 95 : 80, 0.05, 0.08, 'sine');
    },
    // Grenade throw: pin click, then a short whoosh as it leaves the hand.
    throwFrag() {
      playTone(1200, 0.03, 0.15, 'square');
      if (!context) return;
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(0.25);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, context.currentTime);
      filter.frequency.exponentialRampToValueAtTime(2400, context.currentTime + 0.22);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.25, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
      source.connect(filter).connect(gain).connect(master);
      source.start(context.currentTime);
    },
    plantTick() {
      playTone(880, 0.05, 0.15, 'sine');
    },
    beep(fast) {
      playTone(fast ? 1200 : 880, 0.07, 0.2, 'sine');
    },
    explosion() {
      playNoise(0.7, 500, 0.9);
      playTone(55, 0.6, 0.6, 'sine');
    },
    roundWin() {
      playTone(523, 0.12, 0.25, 'sine');
      playTone(659, 0.12, 0.25, 'sine', 0.12);
      playTone(784, 0.2, 0.25, 'sine', 0.24);
    },
    roundLose() {
      playTone(392, 0.15, 0.25, 'sine');
      playTone(330, 0.2, 0.25, 'sine', 0.15);
    },
    buy() {
      playTone(1046, 0.06, 0.2, 'sine');
    },
    denied() {
      playTone(220, 0.08, 0.2, 'square');
    },
    click() {
      playTone(660, 0.03, 0.12, 'sine');
    },
  };
}
