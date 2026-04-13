
import { _decorator, Vec3, v3, Component, Node, tween, Tween } from "cc";

const { ccclass, property } = _decorator;

@ccclass("MoveCir")
export class MoveCir extends Component {
    @property({ })
    pos: Vec3 = v3()

    @property(Node)
    target: Node = null
    protected _root: Vec3 = null

    protected onLoad(): void {
        this._root = this.target.getPosition().clone();
    }

    onProgress(c: number, m: number) {
        const _v = c/m;
        const _target = this._root.clone().lerp(this.pos, _v);
        this.target.setPosition(_target)
    }
}
