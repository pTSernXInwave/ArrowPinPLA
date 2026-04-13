import { _decorator, Component, EventHandler } from "cc";

const { ccclass, property } = _decorator

@ccclass("_Amount")
class _Amount {
    @property({})
    amount: number = 0;

    @property([EventHandler])
    events: EventHandler[] = []

    protected _isInvoked: boolean = false;
    check(amount: number) {
        if(this._isInvoked) return;
        if(amount >= this.amount) {
            this._isInvoked = true;
            EventHandler.emitEvents(this.events)
        }

    }
}

@ccclass("CountDown")
export class CountDown extends Component {
    @property({ min: 0, })
    amount: number = 30;

    @property([EventHandler])
    api: EventHandler[] = []

    @property([EventHandler])
    onEnds: EventHandler[] = []

    @property([_Amount])
    apis: _Amount[] = []

    protected _count: number = 0;
    protected update(dt: number): void {
        this._count += dt;
        if(this._count >= this.amount) {

            EventHandler.emitEvents(this.onEnds);
            this.destroy();
            return;
        }

        const _v = this._count / this.amount;
        this.apis.forEach(_ => _.check(_v))
        EventHandler.emitEvents(this.api, this._count, this.amount);
    }
}
