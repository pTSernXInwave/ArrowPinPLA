import {
    _decorator,
    Camera,
    Component,
    RenderTexture,
    SpriteFrame,
    Node,
    Sprite,
    UITransform,
    Vec3,
    Enum,
} from "cc";

const { ccclass, property } = _decorator;

enum BackgroundFitMode {
    STRETCH = 0,
    CONTAIN = 1,
    COVER = 2,
}

@ccclass("CameraRenderer")
export class CameraRenderer extends Component {
    @property(Camera)
    cam: Camera = null;

    @property(RenderTexture)
    render: RenderTexture = null;

    @property(SpriteFrame)
    frame: SpriteFrame = null;

    @property({ tooltip: "Enable SpriteFrame background for camera" })
    useSpriteBackground: boolean = true;

    @property({ type: Node, tooltip: "Optional parent for generated background node. Default: camera node" })
    backgroundRoot: Node = null;

    @property({ tooltip: "Distance from camera along -Z. Increase if scene objects render in front." })
    backgroundDepth: number = 10;

    @property({ type: Enum(BackgroundFitMode), tooltip: "How SpriteFrame fits camera view" })
    fitMode: BackgroundFitMode = BackgroundFitMode.COVER;

    @property({ tooltip: "Force update every frame (useful if camera size changes dynamically)" })
    updateEveryFrame: boolean = true;

    private _bgNode: Node | null = null;
    private _bgSprite: Sprite | null = null;
    private _bgTransform: UITransform | null = null;
    private _lastW = -1;
    private _lastH = -1;

    protected onEnable(): void {
        this.refreshBackground();
    }

    protected lateUpdate(): void {
        if (this.updateEveryFrame) {
            this.refreshBackground();
        }
    }

    protected onDisable(): void {
        if (this._bgNode && this._bgNode.isValid) {
            this._bgNode.active = false;
        }
    }

    private refreshBackground(): void {
        if (!this.cam) {
            this.cam = this.getComponent(Camera);
        }

        if (!this.cam || !this.useSpriteBackground || !this.frame) {
            this.hideBackgroundNode();
            return;
        }

        this.ensureBackgroundNode();
        if (!this._bgNode || !this._bgSprite || !this._bgTransform) return;

        this._bgNode.active = true;
        this._bgSprite.spriteFrame = this.frame;
        this._bgSprite.priority = -32768;
        this._bgNode.setPosition(0, 0, -Math.max(0.001, this.backgroundDepth));

        const viewHeight = this.cam.orthoHeight * 2;
        const viewWidth = viewHeight * this.cam.aspect;

        if (viewWidth <= 0 || viewHeight <= 0) return;

        if (this._lastW === viewWidth && this._lastH === viewHeight && this._bgSprite.spriteFrame === this.frame) {
            return;
        }

        this._lastW = viewWidth;
        this._lastH = viewHeight;

        const srcSize = this.frame.originalSize;
        const srcW = Math.max(1, srcSize.x);
        const srcH = Math.max(1, srcSize.y);
        const srcAspect = srcW / srcH;
        const viewAspect = viewWidth / viewHeight;

        let outW = viewWidth;
        let outH = viewHeight;

        switch (this.fitMode) {
            case BackgroundFitMode.CONTAIN:
                if (srcAspect > viewAspect) {
                    outW = viewWidth;
                    outH = outW / srcAspect;
                } else {
                    outH = viewHeight;
                    outW = outH * srcAspect;
                }
                break;
            case BackgroundFitMode.COVER:
                if (srcAspect > viewAspect) {
                    outH = viewHeight;
                    outW = outH * srcAspect;
                } else {
                    outW = viewWidth;
                    outH = outW / srcAspect;
                }
                break;
            case BackgroundFitMode.STRETCH:
            default:
                outW = viewWidth;
                outH = viewHeight;
                break;
        }

        this._bgTransform.setContentSize(outW, outH);
    }

    private ensureBackgroundNode(): void {
        if (this._bgNode && this._bgNode.isValid) {
            return;
        }

        const parent = this.backgroundRoot || this.cam.node;
        const node = new Node("CameraSpriteBackground");
        node.parent = parent;
        node.layer = this.cam.node.layer;
        node.setRotationFromEuler(Vec3.ZERO);

        const transform = node.addComponent(UITransform);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        this._bgNode = node;
        this._bgSprite = sprite;
        this._bgTransform = transform;
    }

    private hideBackgroundNode(): void {
        if (this._bgNode && this._bgNode.isValid) {
            this._bgNode.active = false;
        }
    }
}
