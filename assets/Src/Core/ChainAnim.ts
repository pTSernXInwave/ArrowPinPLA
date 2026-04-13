import { _decorator, CCString, Component, sp } from "cc";

const { ccclass, property } = _decorator;

@ccclass("ChainAnim")
export class ChainAnim extends Component {
    @property(sp.Skeleton)
    skeleton: sp.Skeleton = null;

    @property([CCString])
    anims: string[] = []

    @property({})
    isOnLoad: boolean = false;
    @property({})
    isLoopOnEnd: boolean = true;
    @property({})
    isEnableMix: boolean = true;
    @property({})
    numScale: number = 1

    play() {
        this.skeleton.timeScale = this.numScale
        this.anims.forEach((_, _idx) => {
            console.log("SET >>", _)
            if(this.isEnableMix) {
                const _last = this.anims[_idx - 1];
                _last && this.skeleton.setMix(_last, _, 0.25);
            }
            _idx == 0 ? this.skeleton.setAnimation(0, _, false) : this.skeleton.addAnimation(0, _, this.isLoopOnEnd ? _idx === this.anims.length - 1 : false)
        })

        console.log("PLAY", this.anims)
    }

    protected start(): void {
        this.anims.forEach(_ => console.log(">>", _))
        this.isOnLoad && this.play();
    }
}
