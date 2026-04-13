import { _decorator, Component, Node, Collider2D, Contact2DType, IPhysics2DContact } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Ground')
export class Ground extends Component {

    private collider: Collider2D = null;

    onLoad() {
        this.collider = this.getComponent(Collider2D);
    }

    start() {
        // Đăng ký contact listener cho ground
        if (this.collider) {
            this.collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        } else {
            console.error('[Ground] No collider found! Please add Collider2D component.');
        }
    }

    onDestroy() {
        if (this.collider) {
            this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
    }

    /**
     * Xử lý collision - chỉ để log, logic xử lý ở FoxController
     */
    private onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {

    }

    update(deltaTime: number) {

    }
}


