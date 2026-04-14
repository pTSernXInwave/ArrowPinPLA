import { AudioSource, Component, _decorator } from "cc";

const { ccclass, property } = _decorator

@ccclass("AudioPlayer")
export class AudioPlayer extends Component {
    @property(AudioSource)
    source: AudioSource = null;

    @property({})
    predelay: number = 0;

    @property({})
    isPlayOnEnable: boolean = true;

    @property({})
    isLoop: boolean = true;

    @property({})
    delayEachLoop: number = 0

    protected onEnable(): void {
        this.source.loop = false
        this.isPlayOnEnable && this.playWithPreDelay()
    }

    playWithPreDelay() {
        this.scheduleOnce( () => this.play(), this.predelay);
    }

    play() {
        this.source?.play();
        if(this.isLoop) {
            const _delay = this.source.duration + this.delayEachLoop;
            this.scheduleOnce( () => this.play(), _delay )
        }
    }

    stop() {
        this.unscheduleAllCallbacks();
        this.source.stop();
    }

}
