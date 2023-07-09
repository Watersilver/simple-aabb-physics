type MusicInput = {
  fadeOutPrev?: number;
  fadeIn?: number;
  silence?: number;
  src?: string;
  loopStart?: number;
  loopEnd?: number;
}

function connectNodes(first: AudioNode, ...nodes: AudioNode[]) {
  let current = first;
  for (const next of nodes) {
    current = current.connect(next);
  }
  return current;
}

class MusicPlayer {
  readonly parent: Sound;

  private loaded: {[src: string]: AudioBuffer} = {};
  private readonly volume: GainNode;
  private readonly fade: GainNode;
  private activeAudio?: AudioBufferSourceNode;
  private nodes: AudioNode[] = [];
  private context: AudioContext;

  private loadingProgress = 1;
  private loading = Promise.resolve();

  constructor(s: Sound, context: AudioContext, nodes: AudioNode[], srcs: string[]) {
    this.parent = s;
    this.context = context;

    this.volume = context.createGain();
    this.fade = context.createGain();

    this.nodes = [...nodes, this.volume, this.fade, context.destination];

    this.loadingProgress = 0;
    const srcReqs: Promise<[string, AudioBuffer]>[] = [];
    for (const src of srcs) {
      srcReqs.push(
        fetch(src)
        .then(res => {
          if (!res.ok) throw Error(src + " preload failed.");
          return res.arrayBuffer();
        })
        .then(arr => context.decodeAudioData(arr))
        .then(aud => {
          this.loadingProgress += 1/srcReqs.length;
          return [src, aud]
        })
      );
    }
    this.loading = Promise.all(srcReqs).then(rawlist => {
      this.loadingProgress = 1;
      for (const [src, buffer] of rawlist) {
        this.loaded[src] = buffer;
      }
    });

    let silenceCounter = 0;
    let prev = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = (now - prev) / 1000;
      prev = now;

      if (this.state === "changed") {
        this.state = 'fadeout';

        // Check if next data sources are equal to current data
        if (
          this.nextData?.src === this.currentData?.src
        ) {
          // If so replace current data
          this.currentData = this.nextData;
          if (this.currentData) this.currentData.fadeIn = this.currentData.fadeOutPrev;
          this.nextData = undefined;
          this.state = "fadein";
        }
      }

      if (this.state === "fadeout") {
        if (this.nextData) {
          if (this.fade.gain.value) {
            // Fade out if currently playing current data
            if (this.nextData.fadeOutPrev) {
              this.fade.gain.value -= dt / this.nextData.fadeOutPrev;
              this.fade.gain.value = Math.min(Math.max(0, this.fade.gain.value), 1);
            } else if (this.nextData.silence) {
              this.fade.gain.value = 0;
              this.state = "silenceStart";
            } else {
              this.state = "ready";
            }
          } else {
            this.state = "silenceStart";
          }
        } else {
          this.state = "fadein";
        }
      }

      if (this.state === 'silenceStart') {
        silenceCounter = 0;
        this.state = "silence";
      }

      if (this.state === "silence") {
        silenceCounter += dt;
        if (silenceCounter >= (this.nextData?.silence ?? 0)) {
          this.state = "ready";
        }
      }

      if (this.state === "ready") {
        this.currentData = this.nextData;
        this.nextData = undefined;

        this.playCurrent();
        this.state = "fadein";
      }

      if (this.state === "fadein") {
        // Fade in if currently playing current data
        if (this.currentData?.fadeIn) {
          this.fade.gain.value += dt / this.currentData.fadeIn;
          this.fade.gain.value = Math.min(Math.max(0, this.fade.gain.value), 1);
          if (this.fade.gain.value === 1) this.state = undefined;
        } else {
          this.fade.gain.value = 1;
          this.state = undefined;
        }
      }
    });
  }

  /**
   * @returns 0 - 1
   */
  getloadingProgress() {
    return this.loadingProgress;
  }

  /** Promise that resolves when preload is done and rejects if it fails. */
  preloadDone() {
    return this.loading;
  }

  /**
   * @param v 0 - 1 (values outside range get clamped)
   */
  setVolume(v: number) {
    v = Math.min(1, Math.max(0, v));
    this.volume.gain.value = v;
  }

  private playCurrent() {
    const a = this.setActiveAudio(this.currentData?.src);
    if (!a) return;
    a.loop = true;
    if (this.currentData?.loopStart !== undefined) a.loopStart = this.currentData.loopStart;
    a.loopEnd = a.buffer?.duration ?? this.currentData?.loopEnd ?? 0;
    a.start();
  }

  private setActiveAudio(src?: string) {
    if (this.activeAudio) {
      this.activeAudio.stop();
      this.activeAudio.disconnect();
    }
    if (!src) return;
    const b = this.loaded[src];
    if (!b) return;
    const newActiveAudio = this.context.createBufferSource();
    newActiveAudio.buffer = b;
    this.activeAudio = newActiveAudio;
    connectNodes(newActiveAudio, ...this.nodes);
    return newActiveAudio;
  }

  private nextData?: MusicInput;
  private currentData?: MusicInput;
  private state?: "changed" | "silenceStart" | "silence" | "fadeout" | "fadein" | "ready";
  setMusic(music: MusicInput) {
    const m = {...music};

    this.nextData = m;
    if (this.state !== "silence") {
      this.state = "changed";
    }
  }
}

export class Sound {
  private readonly context = new AudioContext();
  private readonly gain = this.context.createGain();

  // sound options
  constructor() {
  }

  init() {
    this.context.resume();
  }

  createMusicPlayer(srcs: string[]) {
    return new MusicPlayer(this, this.context, [this.gain], srcs);
  }

  setGain(value: number) {
    this.gain.gain.value = value;
  }
}