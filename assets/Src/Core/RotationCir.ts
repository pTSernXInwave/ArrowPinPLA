import { _decorator, Component, Node, tween, Tween } from "cc";

const { ccclass, property } = _decorator;

@ccclass("RotationCir")
export class RotationCir extends Component {
    @property({  })
    rotation: number = 180;

    @property({  })
    dur: number = 0.5;

    @property({ })
    delay: number = 1

    @property(Node)
    target: Node = null;

    protected _tw: Tween<Node> = null;
    protected onLoad(): void {
        this._tw = tween(this.target).repeatForever(tween().by(this.dur, { angle: this.rotation }).delay(this.delay)).start()
    }
    stop() {
        this._tw?.stop();

    }
}
