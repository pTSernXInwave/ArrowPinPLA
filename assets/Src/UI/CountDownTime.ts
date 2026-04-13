import { _decorator, Component, Node, Sprite, Color, Label, Vec2 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CountDownTime')
export class CountDownTime extends Component {
    @property({ type: Sprite, tooltip: 'Sprite icon ở giữa' })
    iconSprite: Sprite = null;

    @property(Sprite)
    bg : Sprite = null;

    @property({ type: Sprite, tooltip: 'Sprite viền circle (Type: FILLED, Fill Type: RADIAL)' })
    circleBorderSprite: Sprite = null;

    @property({ type: Label, tooltip: 'Label hiển thị số giây (optional)' })
    timerLabel: Label = null;

    @property({ tooltip: 'Thời gian countdown (giây)' })
    totalTime: number = 60;

    @property({ tooltip: 'Tự động bắt đầu khi start' })
    autoStart: boolean = true;

    @property({ tooltip: 'Màu bắt đầu (xanh lá)' })
    startColor: Color = new Color(0, 255, 0, 255);  // Green

    @property({ tooltip: 'Màu giữa (vàng) - tại 50%' })
    middleColor: Color = new Color(255, 255, 0, 255);  // Yellow

    @property({ tooltip: 'Màu kết thúc (đỏ đậm)' })
    endColor: Color = new Color(180, 0, 0, 255);  // Dark red

    @property({ tooltip: 'Vị trí bắt đầu fill (0.25 = đỉnh 12h, 0 = phải 3h, 0.5 = trái 9h, 0.75 = đáy 6h)', range: [0, 1, 0.01] })
    fillStart: number = 0.25;  // Mặc định: đỉnh (12 giờ)

    @property({ tooltip: 'Tâm của radial fill (0.5, 0.5 = giữa)' })
    fillCenter: Vec2 = new Vec2(0.5, 0.5);

    @property({ tooltip: 'Bật cập nhật màu background theo progress' })
    updateBgColor: boolean = true;

    @property({ tooltip: 'Độ nhạt của background (0-255, càng nhỏ càng nhạt)', range: [0, 255, 1] })
    bgAlpha: number = 80;

    // Private
    private _currentTime: number = 0;
    private _isRunning: boolean = false;
    private _onCompleteCallback: (() => void) | null = null;
    private _onTickCallback: ((remainingTime: number) => void) | null = null;

    start() {
        // Setup circle border sprite cho radial fill
        if (this.circleBorderSprite) {
            this.circleBorderSprite.fillCenter = this.fillCenter;
            this.circleBorderSprite.fillStart = this.fillStart;
        }

        this._currentTime = this.totalTime;
        this.updateVisuals();

        if (this.autoStart) {
            this.startCountdown();
        }
    }

    /**
     * Bắt đầu countdown
     */
    public startCountdown() {
        this._currentTime = this.totalTime;
        this._isRunning = true;
        this.updateVisuals();
    }

    /**
     * Tạm dừng countdown
     */
    public pauseCountdown() {
        this._isRunning = false;
    }

    /**
     * Tiếp tục countdown
     */
    public resumeCountdown() {
        this._isRunning = true;
    }

    /**
     * Reset về thời gian ban đầu
     */
    public resetCountdown() {
        this._currentTime = this.totalTime;
        this._isRunning = false;
        this.updateVisuals();
    }

    /**
     * Set thời gian còn lại
     */
    public setTime(time: number) {
        this._currentTime = Math.max(0, Math.min(time, this.totalTime));
        this.updateVisuals();
    }

    /**
     * Lấy thời gian còn lại
     */
    public getRemainingTime(): number {
        return this._currentTime;
    }

    /**
     * Kiểm tra countdown đang chạy
     */
    public isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Set callback khi countdown hoàn thành
     */
    public setOnComplete(callback: () => void) {
        this._onCompleteCallback = callback;
    }

    /**
     * Set callback mỗi giây
     */
    public setOnTick(callback: (remainingTime: number) => void) {
        this._onTickCallback = callback;
    }

    update(deltaTime: number) {
        if (!this._isRunning) return;

        const previousSecond = Math.ceil(this._currentTime);
        this._currentTime -= deltaTime;

        // Tick callback mỗi giây
        const currentSecond = Math.ceil(this._currentTime);
        if (currentSecond !== previousSecond && this._onTickCallback) {
            this._onTickCallback(currentSecond);
        }

        if (this._currentTime <= 0) {
            this._currentTime = 0;
            this._isRunning = false;

            if (this._onCompleteCallback) {
                this._onCompleteCallback();
            }
        }

        this.updateVisuals();
    }

    /**
     * Cập nhật visuals (fill, color, label)
     */
    private updateVisuals() {
        const progress = this._currentTime / this.totalTime;  // 1 -> 0

        // Update circle border fill
        if (this.circleBorderSprite) {
            // Set fill center (tâm của radial fill)
            this.circleBorderSprite.fillCenter = this.fillCenter;

            // Set fill start position (0.25 = đỉnh 12 giờ)
            this.circleBorderSprite.fillStart = this.fillStart;

            // Unfill theo chiều kim đồng hồ từ đỉnh:
            // - fillRange dương = fill ngược chiều kim đồng hồ (phần còn lại)
            // - Khi progress giảm từ 1 về 0, phần filled co lại ngược chiều kim đồng hồ
            // - Nghĩa là phần UNFILLED tăng theo chiều kim đồng hồ từ đỉnh
            this.circleBorderSprite.fillRange = progress;

            // Update color
            const color = this.getColorForProgress(progress);
            this.circleBorderSprite.color = color;
        }

        // Update icon color (optional - có thể comment nếu không muốn)
        if (this.iconSprite) {
            const color = this.getColorForProgress(progress);
            this.iconSprite.color = color;
        }

        // Update background color (cùng màu nhưng nhạt hơn)
        if (this.bg && this.updateBgColor) {
            const color = this.getColorForProgress(progress);
            // Tạo màu nhạt hơn bằng cách giảm alpha
            const bgColor = new Color(color.r, color.g, color.b, this.bgAlpha);
            this.bg.color = bgColor;
        }

        // Update label
        if (this.timerLabel) {
            const seconds = Math.ceil(this._currentTime);
            this.timerLabel.string = seconds.toString();
        }
    }

    /**
     * Tính màu dựa trên progress (1 = xanh, 0.5 = vàng, 0 = đỏ)
     * Sử dụng interpolation 2 giai đoạn: xanh -> vàng -> đỏ
     */
    private getColorForProgress(progress: number): Color {
        // progress: 1 (start) -> 0 (end)
        // 1.0 - 0.5: xanh -> vàng
        // 0.5 - 0.0: vàng -> đỏ

        if (progress > 0.5) {
            // Giai đoạn 1: Xanh -> Vàng (progress 1.0 -> 0.5)
            const t = (progress - 0.5) / 0.5;  // 1 -> 0
            return this.lerpColor(this.middleColor, this.startColor, t);
        } else {
            // Giai đoạn 2: Vàng -> Đỏ (progress 0.5 -> 0)
            const t = progress / 0.5;  // 1 -> 0
            return this.lerpColor(this.endColor, this.middleColor, t);
        }
    }

    /**
     * Linear interpolation giữa 2 màu
     */
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
