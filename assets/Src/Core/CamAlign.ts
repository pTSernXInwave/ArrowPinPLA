import { Component, Camera, view, director, screen, _decorator, Canvas } from "cc"

const { ccclass, property } = _decorator;

@ccclass("CamAlign")
export class CamAlign extends Component {

    @property([Camera])
    cams: Camera[] = []

    @property(Canvas)
    canvas: Canvas = null;

    alignCamera() {
        const _visible = view.getVisibleSize();

        for(const _camera of this.cams) {
            if (_camera.targetTexture) {
                _camera.orthoHeight = _visible.height / 2;
            } else {
                const size = screen.windowSize;
                _camera.orthoHeight = size.height / view.getScaleY() / 2;
            }

            const _canvas = this.canvas || director.getScene().getComponentInChildren(Canvas);
            if (_canvas) {
                const _wp = _canvas.node.getWorldPosition();
                _camera.node.setWorldPosition(_wp.x, _wp.y, 1000);
            }
        }
    }

    protected onEnable(): void {
        this.alignCamera()
    }
}
