
import { UITransform } from "cc";
import { Component, _decorator } from "cc";
import { EDITOR } from "cc/env";
import { game } from "cc";
import { view } from "cc";
import { sys } from "cc";

const { ccclass, property } = _decorator;

@ccclass("Auto_ResizeCanvas")
export class Auto_ResizeCanvas extends Component {
    @property({})
    isNoCorssDesign: boolean = true;

    @property({})
    protected _isSmart: boolean = true;

    @property({})
    get isSmart(): boolean { return this._isSmart }
    set isSmart(x: boolean) {
        this._isSmart = x
        x && !EDITOR && this._smart();
    }

    @property({ type: [UITransform] })
    protected _targets: UITransform[] = []
    @property({ type: [UITransform], readonly: false })
    get targets() { return this._targets }
    set targets(x: UITransform[]) {
        this._targets = x;
        !EDITOR && this._resize();
    }


    protected _smartF: Function = null

    protected onLoad(): void {
        if(!sys.isBrowser) {
            this.destroy();
            return;
        }

        view.on('canvas-resize', this._resize, this);
        this._smart();
    }

    protected onEnable(): void {
        this._resize();
    }

    protected _smart() {
        this._smartF = this._isSmart ? (list, w, h) => list.forEach( _ => _.isValid && _?.node?.activeInHierarchy && _.setContentSize(w, h) ) : (list, w, h) => list.forEach(_ => _.setContentSize(w, h))
    }

    protected _resize() {
        const _rect = game.canvas;
        const _sx = view.getScaleX();
        const _sy = view.getScaleY();

        let _w = _rect.width / _sx
        let _h = _rect.height / _sy

        if(this.isNoCorssDesign) {
            const _ds = view.getDesignResolutionSize();
            _w = Math.max(_w, _ds.width);
            _h = Math.max(_h, _ds.height);
        }

        this._smartF(this._targets, _w, _h);
    }

}
