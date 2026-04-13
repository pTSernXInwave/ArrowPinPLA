import { _decorator, Component, EventHandler } from "cc";

const { ccclass, property } = _decorator

@ccclass("CountDown")
export class CountDown extends Component {
    @property({ min: 0, })
    amount: number = 30;

    @property([EventHandler])
    api: EventHandler[] = []

    @property([EventHandler])
    onEnds: EventHandler[] = []

    protected _count: number = 0;
    protected update(dt: number): void {
        this._count += dt;
        if(this._count >= this.amount) {

            EventHandler.emitEvents(this.onEnds);
            this.destroy();
            return;
        }

        EventHandler.emitEvents(this.api, this._count, this.amount);
    }
}
