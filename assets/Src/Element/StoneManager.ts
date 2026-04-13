import { _decorator, Component, Node, Prefab, instantiate, Vec3, Vec2, RigidBody2D, ERigidBody2DType, CircleCollider2D, Collider2D } from 'cc';
import { NodeInput } from './NodeInput';
import { GameManager } from '../../PLAGameFoundation/gameControl/core/manager/gameManager';
import { GameControl } from '../Core/GameControl';
const { ccclass, property } = _decorator;

interface StoneInstance {
    node: Node;
    rigidBody: RigidBody2D;
    isFrozen: boolean;
    /** Cell nào đang chặn stone này */
    frozenByCell: { row: number, col: number } | null;
    /** Stone đã bị cleared (unfrozen và rơi qua grid) */
    isCleared: boolean;
}

@ccclass('StoneManager')
export class StoneManager extends Component {
    // ========== References ==========
    @property({ type: Prefab, tooltip: 'Stone prefab (cần có RigidBody2D + Collider2D)' })
    stonePrefab: Prefab = null;

    @property({ type: Node, tooltip: 'Điểm spawn stones' })
    spawnPoint: Node = null;

    @property({ type: Node, tooltip: 'Container cho stones (cùng space với grid)' })
    stoneContainer: Node = null;

    @property({ type: Node, tooltip: 'GridContainer node (để convert position)' })
    gridContainer: Node = null;

    // ========== Spawn Settings ==========
    @property({ tooltip: 'Tổng số stone spawn' })
    spawnCount: number = 20;

    @property({ tooltip: 'Delay giữa mỗi stone spawn (giây)' })
    spawnInterval: number = 0.15;

    @property({ tooltip: 'Random scatter X khi spawn (pixels)' })
    spawnScatterX: number = 30;

    @property({ tooltip: 'Gravity scale cho stone khi rơi' })
    stoneGravityScale: number = 5;

    // ========== Game Settings ==========
    @property({ tooltip: 'Số stone cần clear để thắng' })
    requiredClearCount: number = 10;

    @property({ tooltip: 'Ngưỡng khoảng cách để coi stone nằm trong cell (pixels)' })
    cellCheckRadius: number = 0;

    // ========== State ==========
    private _stones: StoneInstance[] = [];
    private _spawnedCount: number = 0;
    private _spawnTimer: number = 0;
    private _isSpawning: boolean = false;
    private _clearedCount: number = 0;

    // Grid cache
    private _grid2D: Node[][] = [];
    private _gridRows: number = 0;
    private _gridCols: number = 0;
    private _gridSize: number = 70;
    private _gridOffsetX: number = 0;
    private _gridOffsetY: number = 0;

    // Track frozen cells: chỉ cho phép 1 stone freeze per cell
    private _frozenCells: Map<string, StoneInstance> = new Map();

    // Callbacks
    private _onStoneClear: ((row: number, col: number) => void) | null = null;
    private _onAllRequiredCleared: (() => void) | null = null;
    private _onAllSpawned: (() => void) | null = null;

    @property({ min: 0})
    delay: number = 0.5;

    protected onEnable(): void {

        this.scheduleOnce( () => {
            const _GM = GameControl.instance;
            console.log(">>> GM", GameControl.instance)
            if(!_GM) return;
            const genGrid = _GM.arrowController.genGrid;
            const grid2D = genGrid.getGrid2D();
            const gridRows = genGrid.getRows();
            const gridCols = genGrid.getColumns();
            const gridSize = genGrid.gridSize;
            this.startSpawning(grid2D, gridRows, gridCols, gridSize);
        }, this.delay )
    }

    // ========== PUBLIC API ==========

    /**
     * Cache grid info và bắt đầu spawn stones
     */
    public startSpawning(grid2D: Node[][], gridRows: number, gridCols: number, gridSize: number) {
        this.clearAllStones();

        this._grid2D = grid2D;
        this._gridRows = gridRows;
        this._gridCols = gridCols;
        this._gridSize = gridSize;

        // Nếu chưa set cellCheckRadius thì dùng gridSize / 2
        if (this.cellCheckRadius <= 0) {
            this.cellCheckRadius = gridSize / 2;
        }

        // Tính grid offset (giống GenGridInput.generateGrid)
        const totalWidth = gridCols * gridSize;
        const totalHeight = gridRows * gridSize;
        this._gridOffsetX = -totalWidth / 2 + gridSize / 2;
        this._gridOffsetY = totalHeight / 2 - gridSize / 2;

        // Bắt đầu spawn
        this._spawnedCount = 0;
        this._spawnTimer = 0;
        this._isSpawning = true;
    }

    /**
     * Được gọi khi arrow tail rời 1 cell → unfreeze stones bị chặn bởi cell đó
     */
    public onCellReleased(row: number, col: number) {
        for (const stone of this._stones) {
            if (stone.isFrozen && stone.frozenByCell &&
                stone.frozenByCell.row === row && stone.frozenByCell.col === col) {
                this.unfreezeStone(stone);
            }
        }
    }

    public getClearedCount(): number { return this._clearedCount; }
    public getRequiredCount(): number { return this.requiredClearCount; }
    public getTotalStones(): number { return this._stones.length; }
    public isSpawning(): boolean { return this._isSpawning; }

    /**
     * Reset toàn bộ (cho retry)
     */
    public resetStones(grid2D: Node[][], gridRows: number, gridCols: number, gridSize: number) {
        this.clearAllStones();
        this.startSpawning(grid2D, gridRows, gridCols, gridSize);
    }

    public setOnStoneClear(cb: (row: number, col: number) => void) {
        this._onStoneClear = cb;
    }

    public setOnAllRequiredCleared(cb: () => void) {
        this._onAllRequiredCleared = cb;
    }

    public setOnAllSpawned(cb: () => void) {
        this._onAllSpawned = cb;
    }

    // ========== UPDATE LOOP ==========

    update(dt: number) {
        // Spawn stones lần lượt
        if (this._isSpawning && this._spawnedCount < this.spawnCount) {
            this._spawnTimer += dt;
            if (this._spawnTimer >= this.spawnInterval) {
                this._spawnTimer -= this.spawnInterval;
                this.spawnOneStone();

                if (this._spawnedCount >= this.spawnCount) {
                    this._isSpawning = false;
                    if (this._onAllSpawned) {
                        this._onAllSpawned();
                    }
                }
            }
        }

        // Check mỗi stone đang rơi
        for (const stone of this._stones) {
            if (stone.isFrozen || stone.isCleared || !stone.node.active) continue;

            // Check stone rơi ra khỏi grid → đánh dấu cleared
            this.checkStoneFellOut(stone);
            if (stone.isCleared) continue;

            // Stone vẫn trong vùng grid → check có chạm arrow không
            // Stone đã từng bị bắt rồi unfreeze vẫn có thể bị bắt lại bởi arrow khác
            this.checkArrowOverlap(stone);
        }
    }

    // ========== PRIVATE: SPAWN ==========

    private spawnOneStone() {
        if (!this.stonePrefab || !this.spawnPoint) return;

        const stoneNode = instantiate(this.stonePrefab);
        const container = this.stoneContainer || this.node;
        stoneNode.setParent(container);

        // Position tại spawn point + random scatter
        const spawnPos = this.spawnPoint.position.clone();
        spawnPos.x += (Math.random() - 0.5) * this.spawnScatterX * 2;
        stoneNode.setPosition(spawnPos);

        // Random rotation nhẹ
        stoneNode.setRotationFromEuler(0, 0, (Math.random() - 0.5) * 40);

        // Random scale nhẹ
        const s = 1.5 + Math.random() * 1;
        stoneNode.setScale(s, s, 1);

        // Setup RigidBody2D → dynamic để rơi
        const rb = stoneNode.getComponent(RigidBody2D);
        if (rb) {
            rb.enabledInHierarchy;
            rb.gravityScale = this.stoneGravityScale;
            rb.fixedRotation = false;
            // Đợi 1 frame để physics engine nhận node mới
            this.scheduleOnce(() => {
                if (rb && rb.isValid) {
                    rb.wakeUp();
                }
            }, 0);
        }

        const stone: StoneInstance = {
            node: stoneNode,
            rigidBody: rb,
            isFrozen: false,
            frozenByCell: null,
            isCleared: false
        };
        this._stones.push(stone);
        this._spawnedCount++;
    }

    // ========== PRIVATE: ARROW OVERLAP CHECK ==========

    /**
     * Check xem stone có nằm trong cell mà arrow đang chiếm không
     * Chỉ freeze 1 stone per cell - các stone sau sẽ va chạm physics tự nhiên
     */
    private checkArrowOverlap(stone: StoneInstance) {
        if (!this.gridContainer || this._grid2D.length === 0) return;

        // Convert stone world position → grid container local position
        const stoneWorldPos = stone.node.worldPosition;
        const localPos = new Vec3();
        this.gridContainer.inverseTransformPoint(localPos, stoneWorldPos);

        // Tính row, col từ local position
        const col = Math.round((localPos.x - this._gridOffsetX) / this._gridSize);
        const row = Math.round((this._gridOffsetY - localPos.y) / this._gridSize);

        // Check bounds
        if (row < 0 || row >= this._gridRows || col < 0 || col >= this._gridCols) return;

        // Cell đã có stone frozen → skip, để physics tự pile up
        const cellKey = `${row},${col}`;
        if (this._frozenCells.has(cellKey)) return;

        // Check cell có arrow không
        const cell = this._grid2D[row]?.[col];
        if (!cell) return;

        const nodeInput = cell.getComponent(NodeInput);
        if (!nodeInput || !nodeInput.isOccupied()) return;

        // Kiểm tra khoảng cách chính xác (stone gần tâm cell)
        const cellWorldPos = cell.worldPosition;
        const dx = stoneWorldPos.x - cellWorldPos.x;
        const dy = stoneWorldPos.y - cellWorldPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this.cellCheckRadius) {
            this.freezeStone(stone, row, col);
        }
    }

    // ========== PRIVATE: FELL OUT CHECK ==========

    /** Kiểm tra stone đã rơi ra khỏi vùng grid → đánh dấu cleared */
    private checkStoneFellOut(stone: StoneInstance) {
        if (!this.gridContainer) return;

        const stoneWorldPos = stone.node.worldPosition;
        const localPos = new Vec3();
        this.gridContainer.inverseTransformPoint(localPos, stoneWorldPos);

        // Tính biên dưới của grid (thêm buffer 1 cell)
        const bottomY = this._gridOffsetY - (this._gridRows) * this._gridSize;

        if (localPos.y < bottomY) {
            stone.isCleared = true;
            this._clearedCount++;

            if (this._clearedCount >= this.requiredClearCount) {
                if (this._onAllRequiredCleared) {
                    this._onAllRequiredCleared();
                }
            }
        }
    }

    // ========== PRIVATE: FREEZE / UNFREEZE ==========

    private freezeStone(stone: StoneInstance, row: number, col: number) {
        stone.isFrozen = true;
        stone.frozenByCell = { row, col };
        stone.isCleared = false; // Reset cleared flag → cho phép re-catch

        // Đăng ký cell này đã có stone
        const cellKey = `${row},${col}`;
        this._frozenCells.set(cellKey, stone);

        // Snap stone lên viền trên của cell (không snap vào tâm)
        // Giữ X tại tâm cell, Y = viền trên cell + radius collider stone
        const cell = this._grid2D[row]?.[col];
        if (cell && this.gridContainer) {
            const cellWorldPos = cell.worldPosition;
            const container = stone.node.parent;
            if (container) {
                const localPos = new Vec3();
                container.inverseTransformPoint(localPos, cellWorldPos);

                // Offset Y lên trên: nửa gridSize + radius stone collider
                let stoneRadius = 20; // fallback
                const circleCol = stone.node.getComponent(CircleCollider2D);
                if (circleCol) {
                    stoneRadius = circleCol.radius * stone.node.scale.y;
                }
                localPos.y += stoneRadius;

                stone.node.setPosition(localPos);
            }
        }

        if (stone.rigidBody) {
            // Chuyển sang Static → trở thành vật cản cứng cho stones khác pile up tự nhiên
            stone.rigidBody.linearVelocity = Vec2.ZERO;
            stone.rigidBody.angularVelocity = 0;
            stone.rigidBody.type = ERigidBody2DType.Static;
        }
    }

    private unfreezeStone(stone: StoneInstance) {
        if (!stone.isFrozen) return;

        const cell = stone.frozenByCell;

        // Xóa khỏi frozen cells map
        if (cell) {
            const cellKey = `${cell.row},${cell.col}`;
            this._frozenCells.delete(cellKey);
        }

        stone.isFrozen = false;
        stone.frozenByCell = null;
        // KHÔNG set isCleared = true ở đây → stone có thể bị bắt lại bởi arrow khác

        // Chuyển lại Dynamic + bật gravity → stone tiếp tục rơi
        if (stone.rigidBody) {
            stone.rigidBody.type = ERigidBody2DType.Dynamic;
            stone.rigidBody.gravityScale = this.stoneGravityScale;
            stone.rigidBody.wakeUp();
        }

        // Callbacks
        if (cell && this._onStoneClear) {
            this._onStoneClear(cell.row, cell.col);
        }
    }

    // ========== PRIVATE: CLEANUP ==========

    private clearAllStones() {
        for (const stone of this._stones) {
            if (stone.node && stone.node.isValid) {
                stone.node.destroy();
            }
        }
        this._stones = [];
        this._frozenCells.clear();
        this._spawnedCount = 0;
        this._spawnTimer = 0;
        this._isSpawning = false;
        this._clearedCount = 0;
    }
}
