// A tiny lo-fi jazz band, made of oscillators. No audio files: every note is
// generated in the browser with the Web Audio API, so there's nothing to
// download and nothing anyone owns.
//
// Four moods, one per screen:
//   lounge     the menu: slow, soft, lots of space
//   shopping   the store: medium swing, walking bass
//   cooking    the kitchen: up-tempo, a little urgent, still happy
//   celebrate  the results: warm and bright
//
// The usual jazz ingredients: seventh chords, a ii-V-I-ish progression,
// swung eighth notes (the first of each pair is longer), a bass that walks
// to the next chord, and a ride cymbal going "ding, ding-da-ding".

type Mood = "lounge" | "shopping" | "cooking" | "celebrate";

// chords as MIDI notes: root first
const C = (root: number, kind: "maj7" | "m7" | "7" | "6") =>
  ({ maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], "6": [0, 4, 7, 9] })[kind].map((i) => root + i);

const SONGS: Record<Mood, { bpm: number; chords: number[][]; scale: number[]; density: number; drums: number; lead: OscillatorType }> = {
  lounge: {
    bpm: 84,
    chords: [C(43, "m7"), C(48, "7"), C(41, "maj7"), C(38, "7")], // Gm7 C7 Fmaj7 D7
    scale: [0, 2, 4, 5, 7, 9, 11].map((n) => n + 65), // F major
    density: 0.32,
    drums: 0.5,
    lead: "triangle",
  },
  shopping: {
    bpm: 132,
    chords: [C(46, "6"), C(43, "7"), C(48, "m7"), C(41, "7")], // Bb6 G7 Cm7 F7
    scale: [0, 2, 4, 5, 7, 9, 10].map((n) => n + 70), // Bb mixolydian-ish
    density: 0.55,
    drums: 0.8,
    lead: "square",
  },
  cooking: {
    bpm: 164,
    chords: [C(38, "m7"), C(43, "7"), C(36, "maj7"), C(45, "7")], // Dm7 G7 Cmaj7 A7
    scale: [0, 2, 4, 5, 7, 9, 11].map((n) => n + 72), // C major
    density: 0.62,
    drums: 1,
    lead: "square",
  },
  celebrate: {
    bpm: 104,
    chords: [C(39, "maj7"), C(36, "m7"), C(41, "m7"), C(46, "7")], // Ebmaj7 Cm7 Fm7 Bb7
    scale: [0, 2, 4, 5, 7, 9, 11].map((n) => n + 63), // Eb major
    density: 0.45,
    drums: 0.6,
    lead: "triangle",
  },
};

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Jukebox {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private mood: Mood | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0; // eighth notes since the song started
  private lastLead = 0;
  private seed = 1;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem("potluck-muted") === "1";
    } catch {
      /* private window: default to sound on */
    }
  }

  // Browsers only allow sound after a tap or key press, so the first one wakes us.
  private wake() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    // lo-fi: a gentle low-pass over everything
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(lp).connect(this.ctx.destination);
    return this.ctx;
  }

  play(mood: Mood | null) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!mood) return;
    const ctx = this.wake();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    this.step = 0;
    this.lastLead = SONGS[mood].scale[2];
    this.nextTime = ctx.currentTime + 0.08;
    if (mood === "celebrate") this.sfx("fanfare");
    // schedule a little ahead, often: steady timing even if the page stutters
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem("potluck-muted", m ? "1" : "0");
    } catch {
      /* fine */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  // Call from any tap/keypress so the browser lets audio start.
  unlock() {
    const ctx = this.wake();
    if (ctx?.state === "suspended") ctx.resume();
  }

  private rand() {
    // small seeded generator so a song sounds like a song, not static
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.mood) return;
    const song = SONGS[this.mood];
    const beat = 60 / song.bpm;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const eighth = this.step % 8; // 8 eighths per bar
      const bar = Math.floor(this.step / 8);
      const chord = song.chords[bar % song.chords.length];
      const next = song.chords[(bar + 1) % song.chords.length];
      // swing: the "and" lands two-thirds of the way through the beat
      const t = this.nextTime;
      const len = eighth % 2 === 0 ? beat * (2 / 3) : beat * (1 / 3);
      const onBeat = eighth % 2 === 0;
      const beatNo = eighth >> 1;

      // walking bass on every beat
      if (onBeat) {
        const root = chord[0] - 12;
        const notes = [root, chord[1] - 12 + (this.rand() < 0.5 ? 0 : 12), chord[2] - 12, next[0] - 12 + (this.rand() < 0.5 ? -1 : 1)];
        this.note(notes[beatNo], t, beat * 0.9, "triangle", 0.32);
      }

      // piano-ish comping: the Charleston rhythm (beat 1, and the "and" of 2)
      if (eighth === 0 || eighth === 3) {
        for (const n of [chord[1], chord[3], chord[2] + 12]) this.note(n + 12, t, beat * 0.5, "square", 0.035);
      }

      // a lead line that wanders the scale, landing on chord tones on the beat
      if (this.rand() < song.density * (onBeat ? 1.1 : 0.8)) {
        let n = this.lastLead;
        if (onBeat && this.rand() < 0.6) {
          const tones = chord.map((c) => c + 24).flatMap((c) => [c, c + 12]).filter((c) => c >= 62 && c <= 86);
          n = tones.reduce((a, b) => (Math.abs(b - this.lastLead) < Math.abs(a - this.lastLead) ? b : a));
        } else {
          const i = song.scale.indexOf(song.scale.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)));
          const j = Math.max(0, Math.min(song.scale.length - 1, i + Math.round((this.rand() - 0.5) * 4)));
          n = song.scale[j] + (this.rand() < 0.15 ? 12 : 0);
        }
        this.lastLead = n;
        this.note(n, t, len * 0.95, song.lead, 0.07);
      }

      // drums: ride "ding, ding-da-ding", soft kick, brushed snare on 2 and 4
      if (song.drums) {
        if (onBeat || eighth % 4 === 3) this.noise(t, 0.08, 7000, 0.05 * song.drums);
        if (eighth === 0 || eighth === 4) this.kick(t, 0.25 * song.drums);
        if (eighth === 2 || eighth === 6) this.noise(t, 0.12, 2500, 0.035 * song.drums);
      }

      this.nextTime += len;
      this.step++;
    }
  }

  private note(midi: number, t: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq(midi);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, hp: number, vol: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  private kick(t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.16);
  }

  // Little sounds for things happening. Every grade gets a happy sound.
  sfx(name: "step" | "buy" | "nope" | "door" | "Super!" | "Great!" | "Good" | "OK" | "fanfare") {
    const ctx = this.wake();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const seq: Record<string, [number, number][]> = {
      step: [[84, 0.03]],
      buy: [[76, 0.06], [83, 0.1]],
      nope: [[67, 0.08], [64, 0.12]],
      door: [[72, 0.08], [76, 0.08], [79, 0.14]],
      "Super!": [[76, 0.07], [80, 0.07], [83, 0.07], [88, 0.2]],
      "Great!": [[76, 0.07], [79, 0.07], [84, 0.16]],
      Good: [[74, 0.08], [79, 0.14]],
      OK: [[72, 0.1], [76, 0.14]],
      fanfare: [[67, 0.12], [72, 0.12], [76, 0.12], [79, 0.3], [76, 0.1], [79, 0.4]],
    };
    let at = t;
    for (const [n, d] of seq[name]) {
      this.note(n, at, d * 1.4, name === "step" ? "triangle" : "square", name === "step" ? 0.03 : 0.09);
      at += d;
    }
  }
}

export const jukebox = new Jukebox();
