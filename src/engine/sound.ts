function connectNodes(first: AudioNode, ...nodes: AudioNode[]) {
  let current = first;
  for (const next of nodes) {
    current = current.connect(next);
  }
  return current;
}

class MusicPlayer {
  private preloaded: {[src: string]: HTMLAudioElement} = {}
  private current = new Audio();
  private next = new Audio();
  // private readonly context: AudioContext;
  // private readonly gain: GainNode;
  readonly parent: Sound;
  private readonly volume: GainNode;

  private preloadProgress = 1;
  private preloading = Promise.resolve();

  constructor(s: Sound, context: AudioContext, nodes: AudioNode[], options?: {preload?: string[]}) {
    this.parent = s;
    // this.context = context;
    // this.gain = gain;

    const track1 = context.createMediaElementSource(this.current);
    const track2 = context.createMediaElementSource(this.next);

    this.volume = context.createGain();

    // this.next
    connectNodes(track1, ...nodes, this.volume, context.destination);
    connectNodes(track2, ...nodes, this.volume, context.destination);

    if (options) {
      if (options.preload) {
        this.preloadProgress = 0;
        const srcReqs: Promise<[string, Blob]>[] = [];
        for (const src of options.preload) {
          srcReqs.push(
            fetch(src)
            .then(res => {
              if (!res.ok) throw Error(src + " preload failed.");
              return res.blob();
            })
            .then(blob => {
              this.preloadProgress += 1/srcReqs.length;
              return [src, blob]
            })
          );
        }
        this.preloading = Promise.all(srcReqs)
        .then(rawlist => {
          this.preloadProgress = 1;
          for (const raw of rawlist) {
            const a = new Audio();
            a.srcObject = raw[1];
            this.preloaded[raw[0]] = a;
          }
        });
      }
    }
  }

  /**
   * @returns 0 - 1
   */
  getPreloadProgress() {
    return this.preloadProgress;
  }

  /** Promise that resolves when preload is done and rejects if it fails. */
  preloadDone() {
    return this.preloading;
  }

  /**
   * @param v 0 - 1
   */
  setVolume(v: number) {
    v = Math.min(1, Math.max(0, v));
    this.volume.gain.value = v;
  }

  // ---@class MusicInfo
  // ---@field name string
  // ---@field introName string
  // ---@field folder? string
  // ---@field extension? string
  // ---@field targetVolume? number
  // ---@field forceRestart? boolean
  // ---@field previousFadeOut? number
  // ---@field fadeSpeed? number
  // ---@field silenceDuration? number
  setMusic(src: string) {
    this.current.src = src;
    this.current.loop = true;
    this.current.play();
  }
}

export class Sound {
  private readonly context = new AudioContext();
  private readonly gain = this.context.createGain();

  // sound options
  constructor() {
  }

  createMusicPlayer() {
    return new MusicPlayer(this, this.context, [this.gain]);
  }

  setGain(value: number) {
    this.gain.gain.value = value;
  }
}