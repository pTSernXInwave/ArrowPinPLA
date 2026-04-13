import { _decorator, Component, Node, sp, Vec3 } from 'cc';
import {GameManager} from "db://assets/PLAGameFoundation/gameControl/core/manager/gameManager";
import {Constant} from "db://assets/constant/constant";
const { ccclass, property } = _decorator;

@ccclass('KnightController')
export class KnightController extends Component {
    // ========== Components ==========
    @property({ type: sp.Skeleton, tooltip: 'Spine skeleton của Knight' })
    skeleton: sp.Skeleton = null;

    // ========== Animation Names ==========
    @property({ tooltip: 'Animation idle (chống đỡ boulder)' })
    idleAnim: string = 'idle';

    @property({ tooltip: 'Animation dead (bị quái vật giết)' })
    deadAnim: string = 'dead';

    @property({ tooltip: 'Animation khi được cứu (win)' })
    savedAnim: string = 'happy';

    // ========== State ==========
    public _isDead: boolean = false;
    public _isSaved: boolean = false;
    private _startPos: Vec3 = new Vec3();

    // ========== Callbacks ==========
    private _onReachedMonster: (() => void) | null = null;
    private _onSaved: (() => void) | null = null;
    private _onDeadAnimComplete: (() => void) | null = null;

    onLoad() {
        this._startPos = this.node.position.clone();
    }

    // ========== PUBLIC METHODS ==========

    public initialize() {
        this._isDead = false;
        this._isSaved = false;
        this.node.setPosition(this._startPos);
        this.playAnimation(this.idleAnim, true);
    }

    /**
     * Knight bị đẩy đến Monster - LOSE
     */
    public onReachedMonster() {
        if (this._isDead || this._isSaved) return;

        GameManager.instance.audioManager.playSound(Constant.AUDIO_NAME.LOSE);
        this._isDead = true;

        this.playDeadAnimation();

        if (this._onReachedMonster) {
            this._onReachedMonster();
        }
    }

    /**
     * Knight được cứu (clear đủ stone) - WIN
     */
    public onSavedByStoneClearing() {
        if (this._isDead || this._isSaved) return;

        this._isSaved = true;

        if (this.savedAnim) {
            this.playAnimation(this.savedAnim, true);
        }

        if (this._onSaved) {
            this._onSaved();
        }
    }

    public reset() {
        this.initialize();
    }

    // ========== State Queries ==========
    public isDead(): boolean { return this._isDead; }
    public isSaved(): boolean { return this._isSaved; }

    // ========== Callback Registration ==========
    public setOnReachedMonster(callback: () => void) { this._onReachedMonster = callback; }
    public setOnSaved(callback: () => void) { this._onSaved = callback; }
    public setOnDeadAnimComplete(callback: () => void) { this._onDeadAnimComplete = callback; }

    // ========== PRIVATE METHODS ==========

    private playAnimation(animName: string, loop: boolean) {
        if (!this.skeleton || !animName) return;
        this.skeleton.setAnimation(0, animName, loop);
    }

    private playDeadAnimation() {
        if (!this.skeleton || !this.deadAnim) return;

        this.skeleton.setCompleteListener((trackEntry) => {
            if (trackEntry.animation.name === this.deadAnim) {
                this.skeleton.setCompleteListener(null);
                if (this._onDeadAnimComplete) {
                    this._onDeadAnimComplete();
                }
            }
        });

        this.skeleton.setAnimation(0, this.deadAnim, false);
    }
}
