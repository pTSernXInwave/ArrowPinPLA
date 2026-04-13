import { _decorator, Component, Color, Sprite } from "cc";

const { ccclass, property } = _decorator;

@ccclass("_SpriteHelper")
class _SpriteHelper {
    @property(Sprite)
    target: Sprite = null;

    @property({})
    numFillStart: number = 1;

    @property({})
    numFillRange: number = 1;
    @property({})
    isReverse: boolean = false;

    init(color: Color) {
        this.target.fillRange = this.numFillRange;
        this.target.fillStart = this.numFillStart;
        color && ( this.target.color = color.clone() )
    }

    apply(prog: number, color: Color) {
        this.target.fillRange = this.isReverse ? 1 - prog : prog;
        color && ( this.target.color = color.clone() )

    }
}

@ccclass("SpriteCircle")
export class SpriteCircle extends Component {

    @property([_SpriteHelper])
    sprites: _SpriteHelper[] = []

    @property([Color])
    colors: Color[] = []

    protected onLoad(): void {
        this.sprites.forEach(_ => _.init(this.colors[0]))
    }

    onProgress(current: number, max: number) {
        const _value = current / max;
        const _idx = Math.max(0, Math.floor(_value * this.colors.length));
        const _color = this.lerpColor(this.colors[_idx], this.colors[_idx + 1] || this.colors[_idx], _value)
        this.sprites.forEach(_ => _.apply(_value, _color))
    }

    private lerpColor(colorA: Color, colorB: Color, t: number): Color {
        t = Math.max(0, Math.min(1, t));
        return new Color(
            Math.round(colorA.r + (colorB.r - colorA.r) * t),
            Math.round(colorA.g + (colorB.g - colorA.g) * t),
            Math.round(colorA.b + (colorB.b - colorA.b) * t),
            Math.round(colorA.a + (colorB.a - colorA.a) * t)
        );
    }

}
