import { _decorator, sp, Component, Node, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass("RunSke")
export class RunSke extends Component {
    @property(sp.Skeleton)
    sp: sp.Skeleton = null;

    @property({})
    get isLoop() { return this.sp.loop }
    set isLoop(x) { this.sp.loop = x }

    @property({})
    get anim() { return this.sp.animation || ""  }
    set anim(x) {
        if(!this.sp) return;
        if(this.anim === x) return;
        this.sp?.setAnimation(0, x, this.isLoop);
    }


}
