import { _decorator, Component, Widget, view, UITransform, Node, screen } from 'cc';
const { ccclass, property, executeInEditMode, menu, requireComponent } = _decorator;

@ccclass('UIScreenResolution')
@executeInEditMode(true) // Bật cái này để check ngay trong Editor cho tiện
@requireComponent(Widget)
@requireComponent(UITransform)
@menu('UI/UIScreenResolution')
export class UIScreenResolution extends Component {
    @property(Node) Doc: Node = null!;
    @property(Node) Ngang: Node = null!;

    private widget: Widget = null!;
    private uiTransform: UITransform = null!;

    onLoad() {
        this.assignField();
        // Chạy kiểm tra ngay lần đầu tiên
        this.resizeToFullScreen();
    }

    private assignField() {
        this.widget = this.getComponent(Widget)!;
        this.uiTransform = this.getComponent(UITransform)!;

        this.widget.isAlignLeft = true;
        this.widget.isAlignRight = true;
        this.widget.isAlignTop = true;
        this.widget.isAlignBottom = true;
        this.widget.left = 0;
        this.widget.right = 0;
        this.widget.top = 0;
        this.widget.bottom = 0;
    }

    onEnable() {
        // Cách tốt nhất để bắt sự kiện thay đổi màn hình/xoay điện thoại
        view.on('canvas-resize', this.resizeToFullScreen, this);
        // Vẫn giữ cái này để hỗ trợ thay đổi từ phía layout cha
        this.node.on(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    onDisable() {
        view.off('canvas-resize', this.resizeToFullScreen, this);
        this.node.off(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    public resizeToFullScreen() {
        // Lấy kích thước thật của cửa sổ trình duyệt (Không thông qua Cocos)
        let w = screen.windowSize.width;
        let h = screen.windowSize.height;

        // console.log("Kích thước trình duyệt thực tế: ", w, "x", h);

        if (w > h) {
            // console.log("KẾT QUẢ: NGANG");
            if (this.Ngang) this.Ngang.active = true;
            if (this.Doc) this.Doc.active = false;
        } else {
            // console.log("KẾT QUẢ: DỌC");
            if (this.Doc) this.Doc.active = true;
            if (this.Ngang) this.Ngang.active = false;
        }

        // Cập nhật lại Widget để UI không bị lệch
        if (this.widget) this.widget.updateAlignment();
    }
}