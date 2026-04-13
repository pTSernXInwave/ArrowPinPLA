import { AnimationClip, Animation, sp, tween, UIOpacity, v3, UITransform } from 'cc';
import { Camera } from 'cc';
import { Vec3, Vec2, Color } from 'cc';
import { _decorator, Component, Node, RigidBody2D, ERigidBody2DType } from 'cc';
import {GameManager} from "db://assets/PLAGameFoundation/gameControl/core/manager/gameManager";
import gameEndHandler from "db://assets/PLAGameFoundation/gameControl/utilities/handler/gameEndHandler";
import { GenMultiPathArrow } from './GenMultiPathArrow';
import { KnightController } from '../Element/FoxController';
import { StoneManager } from '../Element/StoneManager';
import {ConfettiManager} from "db://assets/Asset/VFX nonogram/Script/ConfettiManager";
import {Constant} from "db://assets/constant/constant";
import { AudioManager } from '../../PLAGameFoundation/gameControl/utilities/framework/audioManager';
const { ccclass, property } = _decorator;

@ccclass('GameControl')
export class GameControl extends Component {
    // Singleton instance
    private static _instance: GameControl = null;
    public static get instance(): GameControl {
        return GameControl._instance;
    }
    @property(Node)
    butNode: Node = null
    @property(Camera)
    camMove : Camera = null;
    @property(Node)
    textTut : Node = null;
    checkFirstTap : boolean = false;
    @property(Node)
    Fail_Button : Node = null;
    @property(Node)
    textTutFull : Node = null;

    @property(Node)
    butJump : Node = null;
    @property(Node)
    textTutWin : Node = null;

    @property(Node)
    BGM : Node = null;
    @property(Node)
    RootUI : Node = null;

    @property(Node)
    handTut : Node = null;

    @property({ tooltip: 'ID của arrow đầu tiên để set position cho handTap' })
    firstArrowId: string = 'path-8';

    @property({ tooltip: 'Delay mở input khi game start (giây)' })
    startInputDelay: number = 2.5;

    @property({ tooltip: 'Delay mở input sau khi reset (giây)' })
    resetInputDelay: number = 2.5;

    @property(ConfettiManager)
    confettiManager : ConfettiManager = null;

    @property(Node)
    fakeLevel : Node = null;

    @property(Node)
    gameMain : Node = null;

    // ========== Knight Controller ==========
    @property({ type: KnightController, tooltip: 'KnightController component' })
    knightController: KnightController = null;

    @property({ type: GenMultiPathArrow, tooltip: 'Reference to GenMultiPathArrow component' })
    arrowController: GenMultiPathArrow = null;

    @property({ type: GenMultiPathArrow, tooltip: 'GenMultiPathArrow của fakeLevel' })
    fakeLevelArrowController: GenMultiPathArrow = null;

    // ========== Stone System ==========
    @property({ type: StoneManager, tooltip: 'StoneManager component' })
    stoneManager: StoneManager = null;

    @property(Node)
    textTryAgain: Node = null;

    // ========== Brick (boulder đẩy knight) ==========
    @property({ type: Node, tooltip: 'Node surface_brick (cần có RigidBody2D Kinematic)' })
    brickNode: Node = null;

    @property({ tooltip: 'Tốc độ brick di chuyển (m/s) — velocity X' })
    brickVelocityX: number = 0;

    @property({ tooltip: 'Tốc độ brick di chuyển (m/s) — velocity Y (giá trị nhỏ = chậm, vd: -0.3)' })
    brickVelocityY: number = -0.15;

    @property({ type: Node, tooltip: 'Node enemy (quái vật)' })
    enemyNode: Node = null;

    @property({ type: sp.Skeleton, tooltip: 'Spine skeleton của enemy (cyclo)' })
    enemySkeleton: sp.Skeleton = null;

    @property(sp.Skeleton)
    princess : sp.Skeleton = null;



    @property({ tooltip: 'Tên animation attack của enemy' })
    enemyAttackAnim: string = 'attack';

    @property({ tooltip: 'Tên animation idle của enemy' })
    enemyIdleAnim: string = 'idle';

    @property({ tooltip: 'Khoảng cách giữa knight và enemy để thua (pixels)' })
    loseDistance: number = 80;
    @property(Node)
    nodeJumpStore : Node = null;

    checkToStore : boolean = false;
    public arrowPassCount: number = 0;
    posEndFall : Vec3 = new Vec3(310,-540,0);
    checkCanTouch: boolean = false;

    // Stone data cho reset
    private _currentStoneData: { row: number, col: number }[] = [];

    // Brick state
    private _brickRb: RigidBody2D = null;
    private _brickStartPos: Vec3 = new Vec3();
    private _brickMoving: boolean = false;
    private _gameOver: boolean = false;

    // Knight state
    private _knightRb: RigidBody2D = null;
    private _knightStartScale: Vec3 = new Vec3(1, 1, 1);
    countTapArrow : number = 0;
    totalArrow : number = 0;
    private _hasHandledLevelInitialized: boolean = false;

    protected _saveCamPos: Vec3 = v3()
    onLoad() {
        this._savedZoom = this.camFocus.orthoHeight
        this._saveCamPos = this.camFocus.node.worldPosition.clone();

        GameControl._instance = this;
        GameManager.instance.SetupManagerInit()
        this.checkCanTouch = false;
        this.checkFirstTap = false;

        // Cache brick info
        if (this.brickNode) {
            this._brickRb = this.brickNode.getComponent(RigidBody2D);
            this._brickStartPos = this.brickNode.position.clone();
        }

        // Cache knight info
        if (this.knightController) {
            this._knightRb = this.knightController.node.getComponent(RigidBody2D);
            this._knightStartScale = this.knightController.node.scale.clone();
        }
    }
    onDestroy() {
        if (this.arrowController && this.arrowController.node) {
            this.arrowController.node.off(
                GenMultiPathArrow.EVENT_LEVEL_INITIALIZED,
                this.onArrowLevelInitialized,
                this
            );
        }
    }

    NextLevel(){
        GameManager.instance.audioManager.stopSingleSound("sfx_voice_terriblesing")
        this.offNodex.forEach(_ => _.active = false)
        this.confettiManager.node.active = false;
        this.camFocus.node.setWorldPosition(this._saveCamPos)
        this.camFocus.orthoHeight = this._savedZoom;
        this.gameMain.active = false;
        this.fakeLevel.active = true;
        this.textTutWin.active = true;
        this.textTutFull.active = false;

        this.scheduleOnce(() => {
            this.setupFakeLevelTutorial();
        }, 0.5);
    }


    start() {
        this._hasHandledLevelInitialized = false;
        // Đăng ký callbacks với ArrowController
        if (this.arrowController) {
            this.arrowController.setOnArrowEnteredTarget((arrowId) => {
                this.onArrowEnteredTarget(arrowId);
            });

            this.arrowController.setOnArrowCollision((arrowId) => {
                this.onArrowCollision(arrowId);
            });

            this.arrowController.setOnArrowPassedNoCollision((arrowId) => {
                this.onArrowPassedNoCollision(arrowId);
            });

            this.arrowController.setOnArrowTapped((arrowId) => {
                this.onArrowTapped(arrowId);
            });

            // Cell release callback → stone system
            this.arrowController.setOnCellReleased((row, col) => {
                this.onCellReleased(row, col);
            });

            this.arrowController.node.on(
                GenMultiPathArrow.EVENT_LEVEL_INITIALIZED,
                this.onArrowLevelInitialized,
                this
            );
        }

        // Setup knight
        this.setupKnight();

        // Block touch theo cấu hình
        this.checkCanTouch = false;
        this.scheduleOnce(() => {
            this.checkCanTouch = true;
        }, Math.max(0, this.startInputDelay));

        // Fallback: nếu event init bị miss thì vẫn thử setup tại đây
        this.onArrowLevelInitialized();
    }

    /**
     * Setup tutorial màu xanh nhấp nháy cho first arrow + handTut ở giữa path-8
     */
    private onArrowLevelInitialized() {
        if (!this.arrowController || this._hasHandledLevelInitialized) return;

        const levelData = this.arrowController.getCurrentLevelData();
        if (!levelData) return;

        //this.setupStoneSystem();
        this.setupFirstArrowTutorial();
        this.totalArrow = this.arrowController.getActiveArrows().length;
        this._hasHandledLevelInitialized = true;
    }

    private setupFirstArrowTutorial() {
        if (!this.arrowController || !this.firstArrowId) return;
        this.arrowController.setTutorialArrow(this.firstArrowId);

        // Show handTut tại cell giữa của firstArrow
        if (this.handTut) {
            const centerWorldPos = this.arrowController.getArrowCenterWorldPosition(this.firstArrowId);
            if (centerWorldPos) {
                const localPos = new Vec3();
                this.handTut.parent.inverseTransformPoint(localPos, centerWorldPos);
                this.handTut.setPosition(localPos);
                this.handTut.active = true;
            }
        }
    }

    /**
     * Setup tutorial cho fakeLevel
     */
    private setupFakeLevelTutorial() {
        if (!this.fakeLevelArrowController) {
            console.warn('[FakeLevelTut] fakeLevelArrowController is NULL!');
            return;
        }

        const activeArrows = this.fakeLevelArrowController.getActiveArrows();
        this.fakeLevelArrowController.setTutorialArrow('path-1');

        if (this.handTut) {
            const centerWorldPos = this.fakeLevelArrowController.getArrowCenterWorldPosition('path-1');
            if (centerWorldPos) {
                const localPos = new Vec3();
                this.handTut.parent.inverseTransformPoint(localPos, centerWorldPos);
                this.handTut.setPosition(localPos);
                this.handTut.active = true;
            }
        }
    }

    /**
     * Setup Knight — chỉ init animation + callbacks, không sliding
     */
    private setupKnight() {
        if (!this.knightController) return;

        this.knightController.initialize();

        this.knightController.setOnReachedMonster(() => {
            this.onKnightDead();
        });

        this.knightController.setOnSaved(() => {
            this.onKnightSaved();
        });

        this.knightController.setOnDeadAnimComplete(() => {
            this.onKnightDeadAnimComplete();
        });
    }

    /**
     * Setup stone system từ level data
     */
    private setupStoneSystem() {
        if (!this.stoneManager || !this.arrowController) return;

        const levelData = this.arrowController.getCurrentLevelData();
        const genGrid = this.arrowController.genGrid;
        if (!levelData || !genGrid) return;

        // Lưu stone data cho reset
        if (levelData.stones && levelData.stones.length > 0) {
            this._currentStoneData = levelData.stones;
        }

        // Callback khi tất cả stones đã spawn xong → cho phép touch
        this.stoneManager.setOnAllSpawned(() => {
            this.checkCanTouch = true;
        });

        // Không cần điều kiện win từ stone — chỉ có thua

        // Callback khi mỗi stone bị clear
        this.stoneManager.setOnStoneClear((row, col) => {
            GameManager.instance.audioManager.playSound(Constant.AUDIO_NAME.CLICK);
        });

        // Bắt đầu spawn stones
        const grid2D = genGrid.getGrid2D();
        const gridRows = genGrid.getRows();
        const gridCols = genGrid.getColumns();
        const gridSize = genGrid.gridSize;
        this.stoneManager.startSpawning(grid2D, gridRows, gridCols, gridSize);
    }

    /**
     * Được gọi khi arrow tail rời khỏi 1 cell
     */
    private onCellReleased(row: number, col: number) {
        if (this.stoneManager) {
            this.stoneManager.onCellReleased(row, col);
        }
    }

    /**
     * Được gọi mỗi lần tap vào arrow
     */
    private onArrowTapped(arrowId: string) {

        console.log("TAP TAP", arrowId)
        if (!this.checkCanTouch) return;

        // Kiểm tra nếu là tap lần đầu tiên
        if (!this.checkFirstTap){
            this.checkFirstTap = true;
            this.BGM.active = true;

            // Ẩn hand tutorial
            if (this.handTut) {
                this.handTut.active = false;
            }
            this.textTut.active = false;
            this.textTutFull.active = true;
            // Tắt tutorial glow
            if (this.arrowController) {
                this.arrowController.stopTutorial();
            }

            // Brick bắt đầu di chuyển ngay khi tap
            this.startBrick();
        }
    }

    // ========== BRICK CONTROL ==========

    /** Dynamic + set velocity → brick bắt đầu đẩy knight */
    private startBrick() {
        if (!this._brickRb) return;
        this._brickMoving = true;
        this._brickRb.type = ERigidBody2DType.Dynamic;
        this._brickRb.gravityScale = 0;
        this._brickRb.fixedRotation = true;
        this._brickRb.wakeUp();
        this._brickRb.linearVelocity = new Vec2(this.brickVelocityX, this.brickVelocityY);

        // Knight: tắt gravity + tăng linearDamping để kháng lực đẩy từ stones
        if (this._knightRb) {
            this._knightRb.gravityScale = 0;
            this._knightRb.linearDamping = 100;
        }
    }

    /** Brick dừng hẳn */
    private stopBrick() {
        if (!this._brickRb) return;
        this._brickMoving = false;
        this._brickRb.linearVelocity = Vec2.ZERO;
        this._brickRb.angularVelocity = 0;
        this._brickRb.type = ERigidBody2DType.Static;
    }

    /** Reset brick về Kinematic + vị trí ban đầu (cho retry) */
    private resetBrick() {
        if (!this._brickRb) return;
        this._brickMoving = false;
        this._brickRb.linearVelocity = Vec2.ZERO;
        this._brickRb.angularVelocity = 0;
        this._brickRb.type = ERigidBody2DType.Kinematic;
        if (this.brickNode) {
            this.brickNode.setPosition(this._brickStartPos);
        }
    }

    // ========== CALLBACKS ==========

    private onArrowEnteredTarget(arrowId: string) {

    }

    private onArrowCollision(arrowId: string) {
    }

    private onArrowPassedNoCollision(arrowId: string) {
        this.arrowPassCount++;
        console.log(this.arrowPassCount, "/", this.totalArrow)
        if(this.totalArrow - this.arrowPassCount <= 1) {
            this.butNode.active = true;
            return;
        }
        if(this.arrowPassCount >= this.totalArrow ){

            this.actWin();

            // this.nodeJumpStore.active = true;
            //this.butJump.active = true;
        }
    }

    @property({  })
    extraDelay: number = 0.5;

    @property({ type: Animation })
    animWin: Animation = null;

    @property({ type: Camera })
    camFocus: Camera = null;
    @property({ min: 0 })
    targetZoom: number = 700;
    @property({  })
    zoomDur: number = 0.5
    @property(Node)
    focusNode: Node = null;
    @property([Node])
    offNodex: Node[] =[] 
    @property({})
    winAnim: string = ''

    protected _savedZoom = 0
    protected actWin() {
        this.confettiManager.playWin();
        GameManager.instance.audioManager.playSound('sfx_ui_win')
        GameManager.instance.audioManager.playSound('Firework')
        GameManager.instance.audioManager.playSound('sfx_voice_terriblesing')
        this.animWin.play();
        this.enemySkeleton.setAnimation(0, this.winAnim, true);
        const _delay = this.animWin.defaultClip.duration + this.extraDelay;

        this.scheduleOnce( () => this.NextLevel(), _delay );
    }
    //update(deltaTime: number) {
    //    this.checkKnightLose();
    //}

    /** Chạy SAU physics step → ép velocity */
    lateUpdate() {
        // Game over → ép knight đứng yên mỗi frame
        if (this._gameOver) {
            if (this._knightRb) {
                this._knightRb.linearVelocity = Vec2.ZERO;
                this._knightRb.angularVelocity = 0;
            }
            return;
        }

        if (this._brickMoving) {
            // Ép brick đúng tốc độ
            if (this._brickRb) {
                this._brickRb.linearVelocity = new Vec2(this.brickVelocityX, this.brickVelocityY);
            }
            // Ép knight không trôi nhanh hơn brick
            if (this._knightRb) {
                const kv = this._knightRb.linearVelocity;
                const clampX = Math.abs(this.brickVelocityX) > 0
                    ? Math.max(Math.min(kv.x, Math.abs(this.brickVelocityX)), -Math.abs(this.brickVelocityX))
                    : 0;
                const clampY = Math.abs(this.brickVelocityY) > 0
                    ? Math.max(Math.min(kv.y, 0), this.brickVelocityY)
                    : 0;
                this._knightRb.linearVelocity = new Vec2(clampX, clampY);
            }
        }
    }

    /**
     * Check khoảng cách knight → enemy, đủ gần thì thua
     */
    private checkKnightLose() {
        if (!this.knightController || !this.enemyNode || !this._brickMoving) return;
        if (this.knightController.isDead() || this.knightController.isSaved()) return;

        const knightPos = this.knightController.node.worldPosition;
        const enemyPos = this.enemyNode.worldPosition;
        const dx = knightPos.x - enemyPos.x;
        const dy = knightPos.y - enemyPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this.loseDistance) {
            this._gameOver = true;
            this.stopBrick();
            // Play attack animation của enemy (cyclo)
            if (this.enemySkeleton && this.enemyAttackAnim) {
                this.enemySkeleton.setAnimation(0, this.enemyAttackAnim, false);
            }
            this.knightController.onReachedMonster();
        }
    }

    /**
     * Được gọi khi clear đủ stone - WIN
     */
    private onWinByStoneClearing() {
        this._gameOver = true;
        this.stopBrick();

        if (this.knightController) {
            this.knightController.onSavedByStoneClearing();
        }

        // Princess celebrate
        if (this.princess) {
            this.princess.setAnimation(0, 'celebrate', true);
        }
    }

    /**
     * Được gọi khi Knight được cứu
     */
    private onKnightSaved() {
        GameManager.instance.audioManager.playSound(Constant.AUDIO_NAME.WIN);

        if (this.confettiManager) {
            this.confettiManager.playWin();
        }

        this.scheduleOnce(() => {
            this.NextLevel();
        }, 3);
    }

    /**
     * Được gọi khi Knight chết
     */
    private onKnightDead() {
        this.stopBrick();
    }

    /**
     * Được gọi khi animation dead của Knight hoàn thành
     */
    private onKnightDeadAnimComplete() {
        this.playFailBadgeStamp(() => {
            this.butJump.active = true;
            this.scheduleOnce(() => {
                this.resetGameAfterDead();
            }, 1.5);
        });
    }

    /**
     * Hiệu ứng đóng dấu fail badge
     */
    private playFailBadgeStamp(onComplete?: () => void) {
        if (!this.Fail_Button) {
            onComplete?.();
            return;
        }

        this.Fail_Button.active = true;

        let uiOpacity = this.Fail_Button.getComponent(UIOpacity);
        if (!uiOpacity) {
            uiOpacity = this.Fail_Button.addComponent(UIOpacity);
        }

        this.Fail_Button.setScale(new Vec3(3, 3, 1));
        uiOpacity.opacity = 0;

        tween(this.Fail_Button)
            .to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'bounceOut' })
            .start();

        tween(uiOpacity)
            .to(0.15, { opacity: 255 })
            .start();

        this.scheduleOnce(() => {
            onComplete?.();
        }, 1.0);
    }

    /**
     * Reset game sau khi Knight chết
     */
    private resetGameAfterDead() {
        this._gameOver = false;
        this.checkCanTouch = false;

        if (this.Fail_Button) {
            tween(this.Fail_Button).stop();
            this.Fail_Button.active = false;
        }

        this.checkFirstTap = false;

        // Block touch sau reset theo cấu hình, hoặc khi stones spawn xong
        this.scheduleOnce(() => {
            this.checkCanTouch = true;
        }, Math.max(0, this.resetInputDelay));

        if (this.textTryAgain) {
            this.textTryAgain.active = true;
        }
        if (this.textTut) {
            this.textTut.active = false;
        }
        if (this.textTutFull) {
            this.textTutFull.active = false;
        }

        if (this.handTut) {
            this.handTut.active = false;
        }

        // Reset arrows
        if (this.arrowController) {
            this.arrowController.resetGame();
        }

        // Reset Knight — vị trí, scale, velocity
        if (this.knightController) {
            this.knightController.reset();
            this.knightController.node.setScale(this._knightStartScale);
            if (this._knightRb) {
                this._knightRb.linearVelocity = Vec2.ZERO;
                this._knightRb.angularVelocity = 0;
            }
        }

        // Reset enemy về idle
        if (this.enemySkeleton && this.enemyIdleAnim) {
            this.enemySkeleton.setAnimation(0, this.enemyIdleAnim, true);
        }

        // Reset brick về vị trí ban đầu
        this.resetBrick();

        // Reset stones
        if (this.stoneManager && this.arrowController?.genGrid) {
            const genGrid = this.arrowController.genGrid;
            const grid2D = genGrid.getGrid2D();
            const gridRows = genGrid.getRows();
            const gridCols = genGrid.getColumns();
            const gridSize = genGrid.gridSize;
            this.stoneManager.resetStones(grid2D, gridRows, gridCols, gridSize);
        } else {
            this.setupFirstArrowTutorial();
        }

        // Show tutorial lại
        this.setupFirstArrowTutorial();

        this.arrowPassCount = 0;
    }

    onJumpStore(){
        GameManager.instance.audioManager.playSound(Constant.AUDIO_NAME.CLICK);
        gameEndHandler.StoreGameChangingNoCondition();
        console.log("TO STORE")
    }

    public getFirstArrowId(): string {
        return this.firstArrowId;
    }
}

