import { Color } from 'cc';
import { Graphics } from 'cc';
import { Vec3, Vec2 } from 'cc';
import { _decorator, Component, Node, JsonAsset, SpriteFrame, Sprite, UITransform, instantiate, Layers, Label } from 'cc';
import {GenGridInput} from "db://assets/Src/Core/GenGridInput";
import {NodeInput} from "db://assets/Src/Element/NodeInput";
import { LevelData, LevelDataHelper, ArrowPathData } from './LevelData';
import {GameManager} from "db://assets/PLAGameFoundation/gameControl/core/manager/gameManager";
import {Constant} from "db://assets/constant/constant";
const { ccclass, property } = _decorator;

enum Direction {
    UP = 0,
    DOWN = 1,
    LEFT = 2,
    RIGHT = 3
}

interface PathPoint {
    row: number;
    col: number;
    worldPos: { x: number, y: number };
    distanceFromStart: number;
}

/** Trạng thái movement của arrow */
export enum MovementPhase {
    ON_GRID = 0,           // Đang di chuyển trên grid
    EXITING_GRID = 1,      // Đang exit ra khỏi grid (đi thẳng theo direction)
    MOVING_TO_TOP = 2,     // Đang men theo viền đi lên cạnh TOP (có thể qua góc)
    ON_TOP_LANE = 3,       // Đang đi ngang trên cạnh TOP đến target.x
    MOVING_TO_TARGET = 4,  // Đang di chuyển lên (UP) đến target
    EXITED = 5             // Đã đến target
}

interface MovingArrow {
    pathId: string;
    segments: { row: number, col: number }[];
    direction: Direction;
    isMoving: boolean;
    moveSpeed: number;
    moveTimer: number;
    color: Color;
    originalColor: Color;  // Màu gốc để restore sau khi reverse
    lineWidth: number;  // Lưu lineWidth để vẽ đúng kích thước

    // Smooth movement data
    pathPoints: PathPoint[];
    totalLength: number;
    arrowLength: number;
    headDistance: number;  // Khoảng cách từ tail path đến head

    // Collision & reverse movement data
    isReversing: boolean;  // Đang move ngược về?
    reversePoint: number | null;  // Điểm cần đảo chiều (headDistance), null nếu không có collision
    collidingArrowId: string | null;  // ID của arrow đang block (để kiểm tra động)
    originalStartDistance: number;  // Vị trí ban đầu để quay về

    // Outer lane movement data
    targetPosition: { x: number, y: number } | null;  // Target world position
    movementPhase: MovementPhase;  // Trạng thái hiện tại

    // Full path: grid path + outer lane path (liên tục)
    fullPathPoints: { x: number, y: number, dist: number }[];  // Toàn bộ path với distance
    fullPathLength: number;  // Tổng chiều dài full path

    // Distance tracking
    headTravelDistance: number;  // Khoảng cách head đã đi trên full path
    headReachedTarget: boolean;  // Head đã đến target chưa

    // Start position markers - tất cả vị trí node mà arrow chiếm giữ
    startMarkerPositions: { x: number, y: number }[];  // Danh sách vị trí để vẽ marker

    // Dynamic cell release tracking
    lastReleasedSegmentIndex: number;  // Track pathIndex đã release (0 = tail, tăng dần về head, -1 = chưa release)
}
@ccclass('GenMultiPathArrow')
export class GenMultiPathArrow extends Component {
    public static readonly EVENT_LEVEL_INITIALIZED = 'gen-multi-path-arrow:level-initialized';

    @property({ type: GenGridInput })
    genGrid: GenGridInput = null;

    @property({ tooltip: 'Tốc độ di chuyển (pixels/giây)' })
    moveSpeed: number = 2000;

    @property({ tooltip: 'Khoảng cách thêm sau khi arrow rời grid (pixels)' })
    exitDistance: number = 1500;

    @property({ tooltip: 'Sử dụng smooth movement (true) hoặc cell-based (false)' })
    useSmoothMovement: boolean = true;

    @property({ tooltip: 'Vẽ smooth bằng Graphics (true) hoặc dùng GenGridInput (false)' })
    useGraphicsRendering: boolean = true;

    @property({ type: Graphics, tooltip: 'Graphics component để vẽ smooth (nếu useGraphicsRendering = true)' })
    graphics: Graphics = null;

    @property({ tooltip: 'Hệ số nhân chiều cao arrow head (height = lineWidth × multiplier)' })
    arrowHeadMultiplier: number = 3;

    @property({ tooltip: 'Tỷ lệ chiều rộng đáy so với chiều cao (1.0 = tam giác cân, 1.15 = tam giác đều, <1 = nhọn)' })
    arrowHeadBaseWidthRatio: number = 1.0;

    @property({ tooltip: 'Độ chùng của đường tại góc cua (0 = vuông góc, 0.1-0.5 = chùng nhẹ như dây)', range: [0, 0.8, 0.01] })
    cornerSagAmount: number = 0.3;

    @property({ tooltip: 'Chùng theo trọng lực (xuống dưới) thay vì ra ngoài góc' })
    sagByGravity: boolean = true;

    // ========== Filled Polygon Body ==========
    @property({ tooltip: 'Vẽ arrow body dạng filled polygon thay vì stroke' })
    useFilledBody: boolean = true;

    @property({ tooltip: 'Hệ số bè rộng tại góc cua (1.0 = không bè, 1.5 = rộng 50%)', range: [1.0, 2.5, 0.05] })
    cornerFlareAmount: number = 1.4;

    @property({ tooltip: 'Số điểm sample trên mỗi bezier curve tại góc', range: [3, 12, 1] })
    filledCurveSegments: number = 6;

    @property({ tooltip: 'Vẽ đầu tròn ở tail end' })
    drawRoundedTailCap: boolean = true;

    @property({ tooltip: 'Bật hiệu ứng sóng nhẹ trên đoạn thẳng' })
    enableWaveEffect: boolean = true;

    @property({ tooltip: 'Biên độ sóng (pixels)', range: [1, 20, 0.5] })
    waveAmplitude: number = 4;

    @property({ tooltip: 'Số sóng trên mỗi 100 pixels', range: [0.5, 5, 0.1] })
    waveFrequency: number = 1.5;

    // ========== Sprite-based Rendering ==========
    @property({ tooltip: 'Sử dụng Sprite rendering thay vì Graphics (cho texture arrows)' })
    useSpriteRendering: boolean = false;

    @property({ type: SpriteFrame, tooltip: 'SpriteFrame cho arrow body' })
    arrowBodySpriteFrame: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: 'SpriteFrame cho arrow head' })
    arrowHeadSpriteFrame: SpriteFrame = null;

    @property({ type: Node, tooltip: 'Container node cho sprite arrows (sẽ tự tạo nếu không set)' })
    spriteContainer: Node = null;

    @property({ tooltip: 'Chiều cao (thickness) của arrow body sprite', range: [5, 100, 1] })
    spriteBodyHeight: number = 35;

    @property({ tooltip: 'Kích thước head sprite', range: [10, 100, 1] })
    spriteHeadSize: number = 40;

    @property({ tooltip: 'Độ chùng của dây tại góc cua (sprite rendering)', range: [0, 1, 0.05] })
    spriteSagAmount: number = 0.25;

    @property({ tooltip: 'Số điểm để vẽ đường cong tại góc', range: [3, 10, 1] })
    spriteCurveSegments: number = 5;

    @property({ tooltip: 'Chế độ texture body: true = TILED (lặp lại), false = STRETCHED (kéo giãn)' })
    useBodyTiledMode: boolean = false;

    // ========== Fixed Color & LineWidth ==========
    @property({ tooltip: 'Sử dụng màu cố định cho tất cả arrows (bỏ qua màu trong data)' })
    useFixedColor: boolean = false;

    @property({ type: Color, tooltip: 'Màu cố định cho tất cả arrows' })
    fixedColor: Color = new Color(0, 0, 0, 255);  // Đen

    @property({ tooltip: 'Sử dụng lineWidth cố định cho tất cả arrows (bỏ qua lineWidth trong data)' })
    useFixedLineWidth: boolean = false;

    @property({ tooltip: 'LineWidth cố định cho tất cả arrows', range: [1, 50, 1] })
    fixedLineWidth: number = 10;

    @property({ tooltip: 'Bật kiểm tra win khi tất cả arrow đã ra khỏi grid' })
    enableWinCheck: boolean = true;

    @property({ tooltip: 'Bật tutorial - highlight arrow có thể tap được' })
    enableTutorial: boolean = true;

    @property({ tooltip: 'Màu glow cho tutorial (R, G, B, A)' })
    tutorialGlowColor: Color = new Color(255, 255, 0, 100);  // Vàng, semi-transparent

    @property({ tooltip: 'Độ lớn glow so với arrow (1.0 = bằng, 1.5 = to hơn 50%)' })
    tutorialGlowScale: number = 1.3;

    @property({ type: Node, tooltip: 'Hand Tap node để hiển thị tutorial' })
    handTapNode: Node = null;

    @property({ tooltip: 'Tốc độ nhấp nháy glow (càng lớn càng nhanh)' })
    glowPulseSpeed: number = 10;

    @property({ tooltip: 'Alpha min khi nhấp nháy (0-255)' })
    glowAlphaMin: number = 80;

    @property({ tooltip: 'Alpha max khi nhấp nháy (0-255)' })
    glowAlphaMax: number = 180;

    @property({ tooltip: 'Thời gian chờ (giây) trước khi tự động hiện tutorial hint' })
    autoTutorialDelay: number = 4;

    // ========== Level Loading ==========
    @property({ type: JsonAsset, tooltip: 'Level config JSON (required)' })
    levelConfig: JsonAsset = null;

    @property({ tooltip: 'Delay khởi tạo level ở start (giây)' })
    startLoadDelay: number = 0.2;

    // ========== Outer Lane Settings ==========
    @property({ tooltip: 'Khoảng cách từ grid edge đến outer lane (pixels)' })
    outerLaneOffset: number = 60;

    @property({ tooltip: 'Bật outer lane movement (arrow đi vòng ngoài đến target)' })
    enableOuterLane: boolean = true;

    @property({ tooltip: 'Bật debug log cho outer lane movement' })
    debugOuterLane: boolean = false;

    @property({ tooltip: 'Debug: hiển thị ID path trên mỗi arrow' })
    isDebug: boolean = false;

    @property({ tooltip: 'Debug: độ lệch Y của label ID so với đầu arrow (pixels)' })
    debugLabelYOffset: number = 28;

    @property({ min: 0 })
    delayEnableTouch: number = 0;

    // Arrow tracking
    private arrows: Map<string, MovingArrow> = new Map();
    private totalArrows: number = 0;        // Tổng số arrow ban đầu
    private exitedArrows: number = 0;       // Số arrow đã ra khỏi grid thành công
    private tappableArrowId: string | null = null;  // Arrow có thể tap được (tutorial)
    private glowPulseTimer: number = 0;     // Timer cho hiệu ứng pulse
    private _canShowTutorial: boolean = false;  // Flag để kiểm soát việc hiển thị tutorial
    private _hasFirstTap: boolean = false;  // Đã có tap đầu tiên chưa
    private _timeSinceLastTap: number = 0;  // Thời gian từ lần tap cuối (giây)
    private _autoTutorialShown: boolean = false;  // Đã show auto tutorial chưa
    private _skipAutoTutorialOnSync: boolean = false;  // Bỏ qua auto tutorial khi sync

    // Filled polygon body buffers (reused per frame to avoid GC)
    private _centerPts: Vec2[] = [];
    private _leftPts: Vec2[] = [];
    private _rightPts: Vec2[] = [];
    private _cornerProximity: number[] = [];
    private _halfWidths: number[] = [];

    // Sprite rendering tracking
    private arrowSpriteNodes: Map<string, { container: Node, segments: Node[], corners: Node[], head: Node | null }> = new Map();
    private debugArrowLabelContainer: Node | null = null;
    private debugArrowLabelNodes: Map<string, Node> = new Map();

    // Callbacks
    private _onArrowEnteredTarget: ((arrowId: string) => void) | null = null;
    private _onArrowCollision: ((arrowId: string) => void) | null = null;
    private _onArrowPassedNoCollision: ((arrowId: string) => void) | null = null;
    private _onArrowTapped: ((arrowId: string) => void) | null = null;
    private _onCellReleased: ((row: number, col: number) => void) | null = null;

    // Current level data (for stone system)
    private _currentLevelData: LevelData | null = null;
    
    start() {
        // Tìm GenGridInput từ nhiều nguồn
        if (!this.genGrid) {
            // Thử lấy từ cùng node
            this.genGrid = this.node.getComponent(GenGridInput);
        }

        if (!this.genGrid) {
            console.error('[GenMultiPathArrow] Không tìm thấy GenGridInput! Hãy kéo reference vào Inspector.');
            return;
        }

        // Nếu không set Graphics, lấy từ GenGridInput
        if (!this.graphics && this.genGrid) {
            this.graphics = this.genGrid['graphics'];
        }

        // Tạo sprite container nếu dùng sprite rendering
        if (this.useSpriteRendering && !this.spriteContainer) {
            this.spriteContainer = new Node('ArrowSpriteContainer');
            this.spriteContainer.parent = this.node;
            this.spriteContainer.layer = this.node.layer;  // Kế thừa layer từ parent
            this.spriteContainer.addComponent(UITransform);
        }


        // Set controller cho tất cả NodeInput cells
        this.scheduleOnce(() => {
            if (this.levelConfig) {
                this.loadLevelFromAsset(this.levelConfig);
            } else {
                console.error('[GenMultiPathArrow] Missing required levelConfig JsonAsset in Inspector.');
                this.registerAsController();
                this.syncArrowsFromPaths();
                this.redrawAllSmooth();
            }
        }, Math.max(0, this.startLoadDelay));
    }

    /**
     * Load level từ JsonAsset đã được assign qua Inspector
     */
    public loadLevelFromAsset(levelAsset: JsonAsset, callback?: (success: boolean) => void) {
        if (!levelAsset) {
            console.error('[GenMultiPathArrow] loadLevelFromAsset failed: levelAsset is null');
            callback?.(false);
            return;
        }

        const levelData = levelAsset.json as LevelData;
        if (!LevelDataHelper.validate(levelData)) {
            console.error('[GenMultiPathArrow] Invalid level data from assigned JsonAsset');
            callback?.(false);
            return;
        }

        this.levelConfig = levelAsset;
        this.applyLevelData(levelData);
        callback?.(true);
    }

    /**
     * Apply LevelData vào game
     */
    private applyLevelData(levelData: LevelData) {
        if (!this.genGrid) {
            console.error('[GenMultiPathArrow] GenGridInput not set');
            return;
        }

        // Store level data for stone system
        this._currentLevelData = levelData;
        this.genGrid.setGridSizeFromLevelConfig(levelData.gridRows, levelData.gridCols);

        // Đảm bảo grid đã được generate
        const grid2D = this.genGrid.getGrid2D();
        if (!grid2D || grid2D.length === 0) {
            console.warn('[GenMultiPathArrow] Grid chưa được generate, đang generate...');
            this.genGrid.generateGrid();
        }

        // Lấy graphics từ genGrid nếu chưa có
        if (!this.graphics) {
            this.graphics = this.genGrid['graphics'];
        }

        // Clear existing paths
        this.genGrid.clearAllPaths();
        this.arrows.clear();
        this.exitedArrows = 0;


        // Add paths từ level data
        for (const pathData of levelData.paths) {
            // Sử dụng fixedColor nếu bật, ngược lại dùng màu từ data
            const color = this.useFixedColor ? this.fixedColor.clone() : LevelDataHelper.objectToColor(pathData.color);
            // Sử dụng fixedLineWidth nếu bật
            const lineWidth = this.useFixedLineWidth ? this.fixedLineWidth : pathData.lineWidth;

            this.genGrid.addPath(
                pathData.id,
                pathData.coords,
                color,
                lineWidth,
                true  // drawArrow
            );
        }

        // Register controller cho tất cả cells
        this.registerAsController();

        // Sync arrows từ paths
        this.syncArrowsFromPaths();

        // Vẽ arrows
        if (this.useGraphicsRendering && this.graphics) {
            this.redrawAllSmooth();
        } else {
            // Fallback: draw by GenGridInput
            this.genGrid.drawAllPaths();
        }

        this.node.emit(GenMultiPathArrow.EVENT_LEVEL_INITIALIZED, {
            levelData: this._currentLevelData,
            activeArrowCount: this.arrows.size
        });

    }
    /**
     * Đăng ký MultiPathExample làm controller cho tất cả NodeInput
     */
    private registerAsController() {
        const grid2D = this.genGrid.getGrid2D();
        for (let row = 0; row < grid2D.length; row++) {
            for (let col = 0; col < grid2D[row].length; col++) {
                const cell = grid2D[row][col];
                const nodeInput = cell.getComponent(NodeInput);
                if (nodeInput) {
                    nodeInput.setArrowController(this);
                }
            }
        }
    }
    /**
     * Sync arrows từ paths trong GenGridInput
     * @param skipAutoTutorial Bỏ qua tự động tìm tutorial arrow
     */
    private syncArrowsFromPaths(skipAutoTutorial: boolean = false) {
        this._skipAutoTutorialOnSync = skipAutoTutorial;
        this.arrows.clear();
        this.exitedArrows = 0;  // Reset counter
        const paths = this.genGrid.getAllPaths();
        const grid2D = this.genGrid.getGrid2D();

        for (const path of paths) {
            if (path.coords.length < 2) continue;

            // Đảo ngược coords vì mũi tên (head) được vẽ ở cuối path
            // coords[0] ban đầu là tail, coords[length-1] là head
            const reversedCoords = [...path.coords].reverse();

            // Direction từ 2 coords cuối (head direction)
            const lastIdx = path.coords.length - 1;
            const direction = this.getDirectionFromCoords(path.coords[lastIdx - 1], path.coords[lastIdx]);
            if (direction === null) continue;

            // QUAN TRỌNG: Re-sync occupancy với thứ tự đúng (reversed)
            // Clear occupancy cũ
            for (const coord of path.coords) {
                const cell = grid2D[coord.row]?.[coord.col];
                const nodeInput = cell?.getComponent(NodeInput);
                if (nodeInput) nodeInput.release();
            }

            // Set lại occupancy với thứ tự reversed (head ở [0])
            for (let i = 0; i < reversedCoords.length; i++) {
                const coord = reversedCoords[i];
                const cell = grid2D[coord.row]?.[coord.col];
                const nodeInput = cell?.getComponent(NodeInput);

                let segType: 'head' | 'body' | 'tail';
                if (i === 0) segType = 'head';
                else if (i === reversedCoords.length - 1) segType = 'tail';
                else segType = 'body';

                if (nodeInput) {
                    nodeInput.occupy(path.id, segType, i);
                }
            }

            // Tính smooth movement data
            const pathPoints = this.calculatePathPoints(path.coords);
            const totalLength = pathPoints[pathPoints.length - 1].distanceFromStart;



            // Xác định màu và lineWidth sử dụng
            const arrowColor = this.useFixedColor ? this.fixedColor.clone() : path.color.clone();
            const arrowLineWidth = this.useFixedLineWidth ? this.fixedLineWidth : path.lineWidth;

            this.arrows.set(path.id, {
                pathId: path.id,
                segments: reversedCoords,  // Head ở [0], tail ở [length-1]
                direction: direction,
                isMoving: false,
                moveSpeed: this.moveSpeed,
                moveTimer: 0,
                color: arrowColor,  // Clone để có thể thay đổi
                originalColor: arrowColor.clone(),  // Lưu màu gốc
                lineWidth: arrowLineWidth,  // Lưu lineWidth
                // Smooth movement data
                pathPoints: pathPoints,
                totalLength: totalLength,
                arrowLength: totalLength,
                headDistance: totalLength,  // Head bắt đầu ở cuối path
                // Collision & reverse movement data
                isReversing: false,
                reversePoint: null,
                collidingArrowId: null,
                originalStartDistance: totalLength,
                // Outer lane movement data
                targetPosition: null,
                movementPhase: MovementPhase.ON_GRID,
                fullPathPoints: [],
                fullPathLength: 0,
                headTravelDistance: 0,
                headReachedTarget: false,
                startMarkerPositions: [],
                lastReleasedSegmentIndex: -1
            });
        }

        // Lưu tổng số arrow ban đầu
        this.totalArrows = this.arrows.size;
        // console.log(`[Init] Total arrows: ${this.totalArrows}`);

        // Tìm arrow có thể tap được cho tutorial (nếu không bị skip)
        if (this.enableTutorial && !this._skipAutoTutorialOnSync) {
            this.findTappableArrow();
        }
        this._skipAutoTutorialOnSync = false;  // Reset flag
    }
    
    private getDirectionFromCoords(from: {row: number, col: number}, to: {row: number, col: number}): Direction | null {
        const rowDiff = to.row - from.row;
        const colDiff = to.col - from.col;

        if (rowDiff === -1 && colDiff === 0) return Direction.UP;
        if (rowDiff === 1 && colDiff === 0) return Direction.DOWN;
        if (rowDiff === 0 && colDiff === -1) return Direction.LEFT;
        if (rowDiff === 0 && colDiff === 1) return Direction.RIGHT;

        return null;
    }

    private calculatePathPoints(coords: { row: number, col: number }[]): PathPoint[] {
        const grid2D = this.genGrid.getGrid2D();
        const pathPoints: PathPoint[] = [];
        let totalDistance = 0;

        for (let i = 0; i < coords.length; i++) {
            const coord = coords[i];
            const cell = grid2D[coord.row]?.[coord.col];
            if (!cell) continue;

            const pos = cell.position;

            // Tính distance từ điểm trước
            if (i > 0) {
                const prevPoint = pathPoints[pathPoints.length - 1];
                const dx = pos.x - prevPoint.worldPos.x;
                const dy = pos.y - prevPoint.worldPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                totalDistance += dist;
            }

            pathPoints.push({
                row: coord.row,
                col: coord.col,
                worldPos: { x: pos.x, y: pos.y },
                distanceFromStart: totalDistance
            });
        }

        return pathPoints;
    }
    private findTappableArrow() {
        this.tappableArrowId = null;

        // Duyệt qua tất cả arrows để tìm arrow không bị collision
        for (const [arrowId, arrow] of this.arrows) {
            // Check collision trên đường đi
            const collisionPoint = this.checkCollisionOnPath(arrow);

            if (collisionPoint === null) {
                // Arrow này không có collision - có thể tap được!
                this.tappableArrowId = arrowId;

                // Hiển thị hand tap tại vị trí center của arrow
                this.showHandTapAtArrow(arrow);
                break;
            }
        }

        if (!this.tappableArrowId) {
            console.warn('[Tutorial] Không tìm thấy arrow có thể tap được!');
            this.hideHandTap();
        }
    }
    /**
     * Check collision trên đường đi ra ngoài grid
     * Return object với distance và collidingArrowId, hoặc null nếu không có collision
     */
    private checkCollisionOnPath(arrow: MovingArrow): { distance: number, collidingArrowId: string } | null {
        const grid2D = this.genGrid.getGrid2D();
        const offset = this.getOffsetForDirection(arrow.direction, 1);

        // Bắt đầu từ head hiện tại (segments[0])
        let currentRow = arrow.segments[0].row;
        let currentCol = arrow.segments[0].col;

        // Tính approximate cell size từ pathPoints
        let cellSize = 50; // Default value
        if (arrow.pathPoints.length >= 2) {
            cellSize = arrow.pathPoints[1].distanceFromStart - arrow.pathPoints[0].distanceFromStart;
        }

        // Di chuyển theo direction và check collision
        const maxSteps = Math.ceil((this.exitDistance + 500) / cellSize); // Check thêm buffer

        for (let step = 1; step <= maxSteps; step++) {
            currentRow += offset.row;
            currentCol += offset.col;

            // Nếu ra ngoài grid, vẫn tiếp tục check (có thể có arrow trong grid)
            if (!this.isInBounds(currentRow, currentCol, grid2D)) {
                continue;
            }

            // Check xem cell này có arrow khác không
            const cell = grid2D[currentRow][currentCol];
            const nodeInput = cell?.getComponent(NodeInput);

            if (nodeInput) {
                const occupyingArrowId = nodeInput.getOccupyingArrow();
                if (occupyingArrowId && occupyingArrowId !== arrow.pathId) {
                    // Tìm thấy collision với arrow khác!
                    const cellWorldPos = cell.position;

                    // Tính distance từ HEAD GỐC (cuối pathPoints) đến cell collision
                    const headPoint = arrow.pathPoints[arrow.pathPoints.length - 1];
                    const dx = cellWorldPos.x - headPoint.worldPos.x;
                    const dy = cellWorldPos.y - headPoint.worldPos.y;
                    const distanceToCollision = Math.sqrt(dx * dx + dy * dy);

                    // Return distance tuyệt đối từ tail gốc (dùng totalLength thay vì headDistance)
                    // totalLength = distance từ tail đến head gốc, không đổi khi arrow di chuyển
                    return {
                        distance: arrow.totalLength + distanceToCollision - cellSize * 0.5,
                        collidingArrowId: occupyingArrowId
                    };
                }
            }
        }

        return null; // Không có collision
    }
    /**
     * Check if position is within grid bounds
     */
    private isInBounds(row: number, col: number, grid2D: Node[][]): boolean {
        return row >= 0 && row < grid2D.length &&
            col >= 0 && col < grid2D[0]?.length;
    }
    /**
     * Get offset cho direction
     */
    private getOffsetForDirection(direction: Direction, distance: number): { row: number, col: number } {
        switch (direction) {
            case Direction.UP: return { row: -distance, col: 0 };
            case Direction.DOWN: return { row: distance, col: 0 };
            case Direction.LEFT: return { row: 0, col: -distance };
            case Direction.RIGHT: return { row: 0, col: distance };
        }
    }

    /**
     * Được gọi từ NodeInput khi tap
     */
    public startMoving(arrowId: string) {
        const arrow = this.arrows.get(arrowId);
        if (!arrow) {
            console.warn(`[GenMultiPathArrow] Arrow ${arrowId} not found`);
            return;
        }

        // Callback khi arrow được tap
        if (this._onArrowTapped) {
            this._onArrowTapped(arrowId);
        }

        // Track tap cho auto tutorial
        this._hasFirstTap = true;
        this._timeSinceLastTap = 0;
        this._autoTutorialShown = false;

        GameManager.instance.audioManager.playSound(Constant.AUDIO_NAME.ARROW_MOVE);
        // Tắt tutorial và restore màu gốc khi arrow được tap
        if (this.tappableArrowId === arrowId) {
            // Restore màu gốc cho arrow
            arrow.color = arrow.originalColor.clone();
            this.tappableArrowId = null;
            this.hideHandTap();
        }

        // KHÔNG release cells ngay - sẽ release động khi tail di chuyển qua
        const grid2D = this.genGrid.getGrid2D();

        // Reset trạng thái
        arrow.isReversing = false;
        arrow.reversePoint = null;
        arrow.collidingArrowId = null;
        arrow.originalStartDistance = arrow.headDistance;
        arrow.lastReleasedSegmentIndex = -1;  // Reset để track cell release mới

        // Lưu tất cả vị trí node mà arrow chiếm giữ để vẽ marker
        for (const segment of arrow.segments) {
            if (this.isInBounds(segment.row, segment.col, grid2D)) {
                const cell = grid2D[segment.row][segment.col];
                if (cell) {
                    arrow.startMarkerPositions.push({
                        x: cell.position.x,
                        y: cell.position.y
                    });
                }
            }
        }

        // Check collision trên đường đi
        const collisionResult = this.checkCollisionOnPath(arrow);
        if (collisionResult !== null) {
            // Có collision - set reversePoint và lưu ID arrow đang block
            arrow.reversePoint = collisionResult.distance;
            arrow.collidingArrowId = collisionResult.collidingArrowId;
        } else {
            arrow.collidingArrowId = null;
            // Không có collision - arrow sẽ đi qua được

            if (this._onArrowPassedNoCollision) {
                this._onArrowPassedNoCollision(arrowId);
            }
        }

        // Luôn set isMoving = true
        arrow.isMoving = true;
    }

    /**
     * Update loop - di chuyển arrows
     */
    update(deltaTime: number) {
        let needsTutorialRedraw = false;

        // Update pulse timer và màu nhấp nháy cho tutorial arrow
        if (this.enableTutorial && this.tappableArrowId && this._canShowTutorial) {
            this.glowPulseTimer += deltaTime * this.glowPulseSpeed;
            needsTutorialRedraw = this.updateTutorialArrowColor();
        }

        // Auto tutorial: sau lần tap đầu tiên, nếu không tap trong autoTutorialDelay giây thì show hint
        if (this._hasFirstTap && !this._autoTutorialShown && this.enableTutorial) {
            this._timeSinceLastTap += deltaTime;

            if (this._timeSinceLastTap >= this.autoTutorialDelay) {
                this._autoTutorialShown = true;
                this.showAutoTutorialHint();
            }
        }

        if (this.useSmoothMovement) {
            this.updateSmoothMovement(deltaTime, needsTutorialRedraw);
        } else if (needsTutorialRedraw) {
            // Nếu không dùng smooth movement nhưng cần redraw tutorial
            this.redrawAllSmooth();
        }
    }

    /**
     * Cập nhật màu nhấp nháy cho tutorial arrow
     * @returns true nếu cần redraw
     */
    private updateTutorialArrowColor(): boolean {
        if (!this.tappableArrowId) return false;

        const arrow = this.arrows.get(this.tappableArrowId);
        if (!arrow || arrow.isMoving) return false;

        // Tính alpha nhấp nháy (0.5 -> 1.0)
        const pulseValue = Math.sin(this.glowPulseTimer) * 0.5 + 0.5;

        // Màu xanh đậm nhấp nháy: từ đậm (0, 150, 50) đến sáng hơn (0, 220, 100)
        const r = 0;
        const g = Math.round(150 + 70 * pulseValue);
        const b = Math.round(50 + 50 * pulseValue);

        arrow.color = new Color(r, g, b, 255);

        return true;  // Cần redraw
    }

    /**
     * Hiển thị tutorial hint tự động sau khi không tap trong một khoảng thời gian
     */
    private showAutoTutorialHint() {
        // Tìm arrow có thể tap được (không bị block)
        for (const [arrowId, arrow] of this.arrows) {
            if (arrow.isMoving) continue;  // Bỏ qua arrow đang di chuyển

            const collisionPoint = this.checkCollisionOnPath(arrow);
            if (collisionPoint === null) {
                // Arrow này có thể tap được
                this.tappableArrowId = arrowId;
                this._canShowTutorial = true;
                this.showHandTapAtArrow(arrow);
                return;
            }
        }

        // Không tìm thấy arrow nào có thể tap → ẩn hand tap
        this.hideHandTap();
    }


    /**
     * Smooth movement update
     * @param deltaTime Thời gian frame
     * @param forceRedraw Bắt buộc redraw (cho tutorial nhấp nháy)
     */
    private updateSmoothMovement(deltaTime: number, forceRedraw: boolean = false) {
        let needsRedraw = forceRedraw;
        const arrowsToRemove: string[] = [];

        this.arrows.forEach(arrow => {
            if (!arrow.isMoving) return;

            const moveDistance = this.moveSpeed * deltaTime;

            // Xử lý theo phase hiện tại
            switch (arrow.movementPhase) {
                case MovementPhase.ON_GRID:
                    this.updateOnGridMovement(arrow, moveDistance, arrowsToRemove);
                    break;

                case MovementPhase.EXITING_GRID:
                case MovementPhase.MOVING_TO_TOP:
                case MovementPhase.ON_TOP_LANE:
                case MovementPhase.MOVING_TO_TARGET:
                    // Tất cả phases ngoài grid đều dùng full path tracking
                    this.updateOuterLaneFullPath(arrow, moveDistance, arrowsToRemove);
                    break;
            }

            needsRedraw = true;
        });

        // Remove arrows
        for (const pathId of arrowsToRemove) {
            this.arrows.delete(pathId);
            this.genGrid.removePath(pathId);
        }

        // Check win condition và tìm tappable arrow mới sau khi remove arrows
        if (arrowsToRemove.length > 0) {
            this.checkWinCondition();

            // Tìm lại tappable arrow cho tutorial
            if (this.enableTutorial) {
                this.findTappableArrow();
            }
        }

        // Redraw khi có arrow di chuyển hoặc cần update tutorial
        if (needsRedraw) {
            this.redrawAllSmooth();
        }
    }

    /**
     * Update movement khi arrow còn trên grid
     */
    private updateOnGridMovement(arrow: MovingArrow, moveDistance: number, arrowsToRemove: string[]) {
        // Di chuyển head (có thể forward hoặc backward tùy theo isReversing)
        const actualMoveDistance = arrow.isReversing ? -moveDistance : moveDistance;
        arrow.headDistance += actualMoveDistance;

        // Release cells động khi tail di chuyển qua (chỉ khi đang đi forward, không phải reversing)
        if (!arrow.isReversing) {
            this.releaseCellsDynamically(arrow);
        }

        // CHECK 0: Recheck collision mỗi frame khi đang di chuyển (chưa reversing)
        if (!arrow.isReversing) {
            const currentCollision = this.checkCollisionOnPath(arrow);

            if (currentCollision === null) {
                // Không còn collision nào
                if (arrow.reversePoint !== null) {
                    // Trước đó có collision, giờ đã clear
                    arrow.reversePoint = null;
                    arrow.collidingArrowId = null;

                    if (this._onArrowPassedNoCollision) {
                        this._onArrowPassedNoCollision(arrow.pathId);
                    }
                }
            } else {
                // Có collision - cập nhật reversePoint mới nhất
                arrow.reversePoint = currentCollision.distance;
                arrow.collidingArrowId = currentCollision.collidingArrowId;
            }
        }

        // CHECK 1: Nếu đạt reversePoint và chưa reversing → đảo chiều
        if (arrow.reversePoint !== null && !arrow.isReversing && arrow.headDistance >= arrow.reversePoint) {
            arrow.isReversing = true;
            arrow.color = new Color(255, 0, 0, 255);

            // Trigger collision callback
            if (this._onArrowCollision) {
                this._onArrowCollision(arrow.pathId);
            }
        }

        // CHECK 2: Nếu đang reversing và đã về originalStartDistance → dừng lại
        if (arrow.isReversing && arrow.headDistance <= arrow.originalStartDistance) {
            arrow.isMoving = false;
            arrow.isReversing = false;
            arrow.headDistance = arrow.originalStartDistance;
            // Restore màu gốc sau khi reverse về
            arrow.color = arrow.originalColor.clone();
            // Clear collision data để tính lại khi tap lần sau
            arrow.reversePoint = null;
            arrow.collidingArrowId = null;
            this.reOccupyCells(arrow);

            // Tìm lại tappable arrow cho tutorial
            if (this.enableTutorial) {
                this.findTappableArrow();
            }
            return;
        }
    }

    /**
     * Build full path từ grid path + outer lane + target
     */
    private buildFullPath(arrow: MovingArrow) {
        const points: { x: number, y: number, dist: number }[] = [];
        let totalDist = 0;

        // 1. Thêm grid path points
        for (const pp of arrow.pathPoints) {
            if (points.length > 0) {
                const last = points[points.length - 1];
                const dx = pp.worldPos.x - last.x;
                const dy = pp.worldPos.y - last.y;
                totalDist += Math.sqrt(dx * dx + dy * dy);
            }
            points.push({ x: pp.worldPos.x, y: pp.worldPos.y, dist: totalDist });
        }

        // 2. Tính outer lane path dựa vào direction
        const bounds = this.getGridBounds();
        const offset = this.outerLaneOffset;
        const lastGridPoint = arrow.pathPoints[arrow.pathPoints.length - 1];
        const target = arrow.targetPosition!;

        // Exit point (trên outer lane)
        let exitX = lastGridPoint.worldPos.x;
        let exitY = lastGridPoint.worldPos.y;

        // Outer lane corners cần đi qua
        const outerPoints: { x: number, y: number }[] = [];

        switch (arrow.direction) {
            case Direction.UP:
                // Exit ở TOP → đi ngang đến target.x → đi lên target
                exitY = bounds.maxY + offset;
                outerPoints.push({ x: exitX, y: exitY });
                outerPoints.push({ x: target.x, y: exitY });
                break;

            case Direction.DOWN:
                // Exit ở BOTTOM → đi sang góc → lên → đi ngang trên TOP → lên target
                exitY = bounds.minY - offset;
                outerPoints.push({ x: exitX, y: exitY });

                // Chọn góc dựa vào: vị trí exit và target
                const leftCornerX = bounds.minX - offset;
                const rightCornerX = bounds.maxX + offset;

                // Tính khoảng cách đi qua góc trái vs phải
                const leftPathDist = Math.abs(exitX - leftCornerX) + Math.abs(target.x - leftCornerX);
                const rightPathDist = Math.abs(exitX - rightCornerX) + Math.abs(target.x - rightCornerX);
                const goLeft = leftPathDist < rightPathDist;

                if (goLeft) {
                    outerPoints.push({ x: leftCornerX, y: exitY });  // BOTTOM-LEFT
                    outerPoints.push({ x: leftCornerX, y: bounds.maxY + offset });  // TOP-LEFT
                } else {
                    outerPoints.push({ x: rightCornerX, y: exitY });  // BOTTOM-RIGHT
                    outerPoints.push({ x: rightCornerX, y: bounds.maxY + offset });  // TOP-RIGHT
                }
                outerPoints.push({ x: target.x, y: bounds.maxY + offset });  // Điểm trên TOP
                break;

            case Direction.LEFT:
                // Exit ở LEFT → đi lên góc TOP-LEFT → đi ngang → lên target
                exitX = bounds.minX - offset;
                outerPoints.push({ x: exitX, y: exitY });
                outerPoints.push({ x: exitX, y: bounds.maxY + offset });  // TOP-LEFT
                outerPoints.push({ x: target.x, y: bounds.maxY + offset });
                break;

            case Direction.RIGHT:
                // Exit ở RIGHT → đi lên góc TOP-RIGHT → đi ngang → lên target
                exitX = bounds.maxX + offset;
                outerPoints.push({ x: exitX, y: exitY });
                outerPoints.push({ x: exitX, y: bounds.maxY + offset });  // TOP-RIGHT
                outerPoints.push({ x: target.x, y: bounds.maxY + offset });
                break;
        }

        // 3. Thêm target
        outerPoints.push({ x: target.x, y: target.y });

        // 4. Thêm outer points vào full path
        for (const op of outerPoints) {
            const last = points[points.length - 1];
            const dx = op.x - last.x;
            const dy = op.y - last.y;
            const segDist = Math.sqrt(dx * dx + dy * dy);
            if (segDist > 0.1) {  // Bỏ qua điểm trùng
                totalDist += segDist;
                points.push({ x: op.x, y: op.y, dist: totalDist });
            }
        }

        arrow.fullPathPoints = points;
        arrow.fullPathLength = totalDist;

    }

    /**
     * Update movement khi arrow đang trên outer lane (dùng full path)
     */
    private updateOuterLaneFullPath(arrow: MovingArrow, moveDistance: number, arrowsToRemove: string[]) {
        // KHÔNG clamp headTravelDistance - để nó tiếp tục tăng
        // Khi render sẽ clamp position tại target
        arrow.headTravelDistance += moveDistance;

        // Head đã đến target?
        if (arrow.headTravelDistance >= arrow.fullPathLength && !arrow.headReachedTarget) {
            arrow.headReachedTarget = true;
            arrow.movementPhase = MovementPhase.MOVING_TO_TARGET;

        }

        // Update phase nếu head chưa đến target
        if (!arrow.headReachedTarget) {
            this.updateMovementPhase(arrow);
        }

        // Tính tail distance (có thể âm nếu arrow chưa ra hết khỏi grid)
        const tailDistance = arrow.headTravelDistance - arrow.arrowLength;

        // Nếu tail cũng đến target → remove arrow (arrow đã "chui vào" target hoàn toàn)
        if (tailDistance >= arrow.fullPathLength) {
            arrowsToRemove.push(arrow.pathId);
            this.exitedArrows++;
            arrow.movementPhase = MovementPhase.EXITED;

            // Trigger callback
            if (this._onArrowEnteredTarget) {
                this._onArrowEnteredTarget(arrow.pathId);
            }
        }
    }

    /**
     * Update movement phase dựa vào vị trí head trên full path
     */
    private updateMovementPhase(arrow: MovingArrow) {
        if (arrow.fullPathPoints.length < 2) return;

        const headDist = arrow.headTravelDistance;
        const gridEndDist = arrow.totalLength;
        const bounds = this.getGridBounds();
        const topLaneY = bounds.maxY + this.outerLaneOffset;

        // Lấy vị trí head hiện tại
        const headPos = this.getPositionOnFullPathAt(arrow.fullPathPoints, headDist);
        if (!headPos) return;

        // Nếu head còn trong khoảng grid path
        if (headDist <= gridEndDist) {
            arrow.movementPhase = MovementPhase.EXITING_GRID;
            return;
        }

        // Kiểm tra head đã lên TOP lane chưa
        const isOnTopLane = Math.abs(headPos.y - topLaneY) < 5;  // tolerance 5 pixels

        if (isOnTopLane) {
            // Đang trên TOP lane - check đã đến target.x chưa
            if (arrow.targetPosition && Math.abs(headPos.x - arrow.targetPosition.x) < 5) {
                arrow.movementPhase = MovementPhase.MOVING_TO_TARGET;
            } else {
                arrow.movementPhase = MovementPhase.ON_TOP_LANE;
            }
        } else if (headPos.y < topLaneY) {
            // Chưa lên đến TOP lane
            arrow.movementPhase = MovementPhase.MOVING_TO_TOP;
        } else {
            // Đã qua TOP lane (đang đi lên target)
            arrow.movementPhase = MovementPhase.MOVING_TO_TARGET;
        }
    }

    /**
     * Release tất cả cells của arrow (khi arrow exit khỏi grid hoàn toàn)
     */
    private releaseAllCells(arrow: MovingArrow) {
        const grid2D = this.genGrid.getGrid2D();
        for (const segment of arrow.segments) {
            if (this.isInBounds(segment.row, segment.col, grid2D)) {
                const cell = grid2D[segment.row][segment.col];
                const nodeInput = cell?.getComponent(NodeInput);
                if (nodeInput && nodeInput.getOccupyingArrow() === arrow.pathId) {
                    nodeInput.release();
                }
            }
        }
        // lastReleasedSegmentIndex track pathIndex (0 đến pathPoints.length-1)
        arrow.lastReleasedSegmentIndex = arrow.pathPoints.length - 1;  // Đánh dấu đã release hết
    }

    /**
     * Release cells động khi tail của arrow di chuyển qua
     * Chỉ release cells mà tail đã hoàn toàn đi qua
     */
    private releaseCellsDynamically(arrow: MovingArrow) {
        const grid2D = this.genGrid.getGrid2D();
        const tailDistance = arrow.headDistance - arrow.arrowLength;

        // pathPoints[0] = tail position (distance 0)
        // pathPoints[length-1] = head position (distance = totalLength)
        // segments[0] = head, segments[length-1] = tail (reversed)

        // Duyệt từ tail (pathPoints[0]) đến head và release cells mà tail đã đi qua
        for (let i = 0; i < arrow.pathPoints.length; i++) {
            const pathPoint = arrow.pathPoints[i];

            // Nếu tail đã đi qua điểm này (dùng > để chắc chắn tail đã qua hoàn toàn)
            if (tailDistance > pathPoint.distanceFromStart) {
                // pathIndex i tương ứng với segmentIndex (segments.length - 1 - i)
                // Vì segments reversed: segments[length-1] = pathPoints[0] (tail)
                const segmentIndex = arrow.segments.length - 1 - i;

                // Chỉ release nếu pathIndex i chưa được release (i > lastReleasedSegmentIndex)
                // lastReleasedSegmentIndex ở đây track pathIndex, không phải segmentIndex
                if (i > arrow.lastReleasedSegmentIndex) {
                    if (segmentIndex >= 0 && segmentIndex < arrow.segments.length) {
                        const segment = arrow.segments[segmentIndex];
                        if (this.isInBounds(segment.row, segment.col, grid2D)) {
                            const cell = grid2D[segment.row][segment.col];
                            const nodeInput = cell?.getComponent(NodeInput);
                            if (nodeInput && nodeInput.getOccupyingArrow() === arrow.pathId) {
                                nodeInput.release();
                                // Notify stone system
                                if (this._onCellReleased) {
                                    this._onCellReleased(segment.row, segment.col);
                                }
                            }
                        }
                    }
                    // Cập nhật lastReleasedSegmentIndex (track pathIndex)
                    arrow.lastReleasedSegmentIndex = i;
                }
            }
        }
    }

    /**
     * Re-occupy lại các cells cho arrow (sau khi reverse về vị trí ban đầu)
     */
    private reOccupyCells(arrow: MovingArrow) {
        const grid2D = this.genGrid.getGrid2D();

        // Reset tracking
        arrow.lastReleasedSegmentIndex = -1;

        for (let i = 0; i < arrow.segments.length; i++) {
            const segment = arrow.segments[i];
            if (this.isInBounds(segment.row, segment.col, grid2D)) {
                const cell = grid2D[segment.row][segment.col];
                const nodeInput = cell?.getComponent(NodeInput);

                let segType: 'head' | 'body' | 'tail';
                if (i === 0) segType = 'head';
                else if (i === arrow.segments.length - 1) segType = 'tail';
                else segType = 'body';

                if (nodeInput) {
                    nodeInput.occupy(arrow.pathId, segType, i);
                }
            }
        }
    }

    /**
     * Vẽ lại tất cả arrows với smooth movement
     */
    private redrawAllSmooth() {
        if (this.useSpriteRendering) {
            this.redrawWithSprites();
        } else if (this.useGraphicsRendering && this.graphics) {
            this.redrawWithGraphics();
        }

        this.updateArrowDebugLabels();
    }

    private updateArrowDebugLabels() {
        if (!this.isDebug) {
            this.clearArrowDebugLabels();
            return;
        }

        const rootNode = this.getArrowDebugRootNode();
        if (!rootNode) return;

        if (!this.debugArrowLabelContainer || !this.debugArrowLabelContainer.isValid || this.debugArrowLabelContainer.parent !== rootNode) {
            this.clearArrowDebugLabels();
            this.debugArrowLabelContainer = new Node('ArrowDebugLabelContainer');
            this.debugArrowLabelContainer.parent = rootNode;
            this.debugArrowLabelContainer.layer = this.node.layer;
            this.debugArrowLabelContainer.addComponent(UITransform);
        }

        const activeArrowIds = new Set<string>();
        this.arrows.forEach((arrow, arrowId) => {
            const headPos = this.getArrowHeadLocalPosition(arrow);
            if (!headPos) return;

            const labelNode = this.getOrCreateArrowDebugLabel(arrowId);
            labelNode.active = true;
            labelNode.setPosition(headPos.x, headPos.y + this.debugLabelYOffset, 0);
            activeArrowIds.add(arrowId);
        });

        const staleArrowIds: string[] = [];
        this.debugArrowLabelNodes.forEach((_node, arrowId) => {
            if (!activeArrowIds.has(arrowId)) {
                staleArrowIds.push(arrowId);
            }
        });

        for (const arrowId of staleArrowIds) {
            const node = this.debugArrowLabelNodes.get(arrowId);
            if (node && node.isValid) node.destroy();
            this.debugArrowLabelNodes.delete(arrowId);
        }
    }

    private getArrowDebugRootNode(): Node | null {
        if (this.useSpriteRendering && this.spriteContainer) {
            return this.spriteContainer;
        }
        if (this.graphics && this.graphics.node) {
            return this.graphics.node;
        }
        return this.node;
    }

    private getArrowHeadLocalPosition(arrow: MovingArrow): Vec2 | null {
        if (arrow.movementPhase !== MovementPhase.ON_GRID && arrow.fullPathPoints.length > 0) {
            const headDist = Math.min(arrow.headTravelDistance, arrow.fullPathLength);
            return this.getPositionOnFullPathAt(arrow.fullPathPoints, headDist);
        }
        return this.getPositionAtDistance(arrow.pathPoints, arrow.headDistance);
    }

    private getOrCreateArrowDebugLabel(arrowId: string): Node {
        let parentNode: Node | null = this.debugArrowLabelContainer;
        if (this.useSpriteRendering) {
            const spriteData = this.arrowSpriteNodes.get(arrowId);
            if (spriteData?.container) {
                parentNode = spriteData.container;
            }
        }
        if (!parentNode) {
            parentNode = this.node;
        }

        let labelNode = this.debugArrowLabelNodes.get(arrowId);
        if (labelNode && labelNode.isValid) {
            if (labelNode.parent !== parentNode) {
                labelNode.parent = parentNode;
            }
            return labelNode;
        }

        labelNode = new Node(`ArrowDebug_${arrowId}`);
        labelNode.parent = parentNode;
        labelNode.layer = this.node.layer;

        const label = labelNode.addComponent(Label);
        label.string = arrowId;
        label.fontSize = 18;
        label.lineHeight = 18;
        label.enableWrapText = false;

        const uiTransform = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
        uiTransform.setContentSize(120, 24);

        this.debugArrowLabelNodes.set(arrowId, labelNode);
        return labelNode;
    }

    private clearArrowDebugLabels() {
        this.debugArrowLabelNodes.forEach((node) => {
            if (node && node.isValid) node.destroy();
        });
        this.debugArrowLabelNodes.clear();

        if (this.debugArrowLabelContainer && this.debugArrowLabelContainer.isValid) {
            this.debugArrowLabelContainer.destroy();
        }
        this.debugArrowLabelContainer = null;
    }

    /**
     * Vẽ smooth bằng Graphics
     */
    private redrawWithGraphics() {
        if (!this.graphics) return;

        this.graphics.clear();

        // Tutorial arrow giờ đã được đổi màu trực tiếp, không cần vẽ glow nữa

        this.arrows.forEach(arrow => {
            // Xử lý theo phase
            if (arrow.movementPhase === MovementPhase.EXITING_GRID ||
                arrow.movementPhase === MovementPhase.MOVING_TO_TOP ||
                arrow.movementPhase === MovementPhase.ON_TOP_LANE ||
                arrow.movementPhase === MovementPhase.MOVING_TO_TARGET) {
                this.drawArrowOnOuterLane(arrow);
            } else {
                this.drawArrowOnGrid(arrow);
            }
        });

        // Đã tắt vẽ marker
        // this.arrows.forEach(arrow => {
        //     if (arrow.startMarkerPositions.length > 0) {
        //         this.drawStartMarkers(arrow);
        //     }
        // });
    }

    /**
     * Vẽ hình tròn marker tại tất cả vị trí node mà arrow chiếm giữ
     */
    private drawStartMarkers(arrow: MovingArrow) {
        if (!this.graphics || arrow.startMarkerPositions.length === 0) return;

        const markerRadius = arrow.lineWidth * 0.4;  // Bán kính nhỏ hơn (2/3 của 0.6)

        this.graphics.fillColor = arrow.originalColor;  // Dùng màu gốc
        for (const pos of arrow.startMarkerPositions) {
            this.graphics.circle(pos.x, pos.y, markerRadius);
            this.graphics.fill();
        }
    }

    /**
     * Vẽ đường với góc cong nhẹ (như dây chùng) thay vì góc vuông 90°
     * Sử dụng quadratic bezier curve tại các điểm góc
     */
    private drawPathWithSag(positions: Vec2[]) {
        if (positions.length < 2) return;

        if (positions.length === 2 || this.cornerSagAmount <= 0) {
            // Chỉ có 2 điểm hoặc không cần sag → vẽ với wave effect
            this.graphics.moveTo(positions[0].x, positions[0].y);
            for (let i = 1; i < positions.length; i++) {
                this.drawWavyLine(positions[i - 1], positions[i]);
            }
            return;
        }

        // Vẽ với góc cong tại các điểm giữa
        this.graphics.moveTo(positions[0].x, positions[0].y);

        // Track vị trí cuối cùng đã vẽ
        let lastDrawnPos = new Vec2(positions[0].x, positions[0].y);

        for (let i = 1; i < positions.length - 1; i++) {
            const prev = positions[i - 1];
            const current = positions[i];
            const next = positions[i + 1];

            // Tính vector từ prev đến current và từ current đến next
            const v1x = current.x - prev.x;
            const v1y = current.y - prev.y;
            const v2x = next.x - current.x;
            const v2y = next.y - current.y;

            // Độ dài của các đoạn
            const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
            const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

            if (len1 < 0.1 || len2 < 0.1) {
                // Đoạn quá ngắn, vẽ thẳng
                this.graphics.lineTo(current.x, current.y);
                continue;
            }

            // Tính khoảng cách để bắt đầu/kết thúc curve (dựa trên cornerSagAmount)
            const curveOffset = Math.min(len1, len2) * this.cornerSagAmount;

            // Điểm bắt đầu curve (trước góc)
            const startX = current.x - (v1x / len1) * curveOffset;
            const startY = current.y - (v1y / len1) * curveOffset;

            // Điểm kết thúc curve (sau góc)
            const endX = current.x + (v2x / len2) * curveOffset;
            const endY = current.y + (v2y / len2) * curveOffset;

            let controlX = current.x;
            let controlY = current.y;

            if (this.sagByGravity) {
                // Chùng theo trọng lực - luôn chùng xuống dưới
                const sagOffset = curveOffset * 0.8;
                controlX = current.x;
                controlY = current.y - sagOffset;  // Chùng xuống (Y giảm trong Cocos)
            } else {
                // Chùng ra ngoài góc (cách cũ)
                const bisectorX = (v1x / len1 + v2x / len2);
                const bisectorY = (v1y / len1 + v2y / len2);
                const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);

                if (bisectorLen > 0.01) {
                    const sagOffset = curveOffset * 0.3;
                    controlX = current.x + (bisectorX / bisectorLen) * sagOffset;
                    controlY = current.y + (bisectorY / bisectorLen) * sagOffset;
                }
            }

            // Vẽ đường sóng từ vị trí cuối đến điểm bắt đầu curve
            this.drawWavyLine(lastDrawnPos, new Vec2(startX, startY));

            // Vẽ quadratic bezier curve qua góc
            this.graphics.quadraticCurveTo(controlX, controlY, endX, endY);

            // Cập nhật vị trí cuối
            lastDrawnPos = new Vec2(endX, endY);
        }

        // Vẽ đến điểm cuối với sóng
        const lastPos = positions[positions.length - 1];
        this.drawWavyLine(lastDrawnPos, new Vec2(lastPos.x, lastPos.y));
    }

    /**
     * Vẽ đường sóng nhẹ từ điểm hiện tại đến điểm đích
     */
    private drawWavyLineTo(toX: number, toY: number) {
        if (!this.enableWaveEffect || this.waveAmplitude <= 0) {
            this.graphics.lineTo(toX, toY);
            return;
        }

        // Lấy vị trí hiện tại từ graphics (ước tính từ điểm cuối)
        // Vì Graphics không có getter cho current position, ta dùng workaround
        this.graphics.lineTo(toX, toY);
    }

    /**
     * Vẽ đường sóng nhẹ giữa 2 điểm
     */
    private drawWavyLine(from: Vec2, to: Vec2) {
        if (!this.enableWaveEffect || this.waveAmplitude <= 0) {
            this.graphics.lineTo(to.x, to.y);
            return;
        }

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length < 10) {
            this.graphics.lineTo(to.x, to.y);
            return;
        }

        // Hướng đường thẳng và hướng vuông góc
        const dirX = dx / length;
        const dirY = dy / length;
        const perpX = -dirY;  // Vuông góc
        const perpY = dirX;

        // Số segments để vẽ sóng
        const waveLength = 100 / this.waveFrequency;
        const segments = Math.max(Math.ceil(length / 10), 4);

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const dist = length * t;

            // Vị trí trên đường thẳng
            const baseX = from.x + dirX * dist;
            const baseY = from.y + dirY * dist;

            // Offset sóng sine - chùng xuống nhẹ
            const wavePhase = (dist / waveLength) * Math.PI * 2;
            const waveOffset = Math.sin(wavePhase) * this.waveAmplitude;

            // Thêm chút chùng xuống theo trọng lực (parabola nhẹ)
            const sagT = t * (1 - t) * 4;  // 0 ở đầu/cuối, max ở giữa
            const sagOffset = sagT * this.waveAmplitude * 0.5;

            // Tổng hợp: sóng theo hướng vuông góc + chùng xuống
            const finalX = baseX + perpX * waveOffset;
            const finalY = baseY + perpY * waveOffset - sagOffset;

            this.graphics.lineTo(finalX, finalY);
        }
    }

    // ========== Filled Polygon Arrow Body ==========

    /**
     * Ensure buffer array has enough Vec2 elements, reuse existing objects
     */
    private ensureVec2Buffer(buf: Vec2[], size: number): void {
        while (buf.length < size) buf.push(new Vec2());
    }

    /**
     * Add sampled points along a straight segment with rope-like sag.
     * Sag is applied PERPENDICULAR to the segment direction (visible for all orientations)
     * plus a subtle gravity droop. Does NOT add 'from' point, DOES add 'to' point.
     */
    private addSagSegment(
        fromX: number, fromY: number,
        toX: number, toY: number,
        countRef: { v: number }
    ): void {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const segLen = Math.sqrt(dx * dx + dy * dy);

        // Short segment: just add end point
        if (segLen < 10) {
            this.ensureVec2Buffer(this._centerPts, countRef.v + 1);
            if (this._cornerProximity.length <= countRef.v) this._cornerProximity.length = countRef.v + 1;
            this._centerPts[countRef.v].set(toX, toY);
            this._cornerProximity[countRef.v] = 0;
            countRef.v++;
            return;
        }

        // More sample points for smoother curve
        const numSubs = Math.max(3, Math.ceil(segLen / 25));

        // Direction normalized
        const dirX = dx / segLen;
        const dirY = dy / segLen;

        // Perpendicular direction (always visible regardless of segment orientation)
        const perpX = -dirY;
        const perpY = dirX;

        // Perpendicular wave: gentle bulge, proportional to length, capped
        const waveAmp = Math.min(segLen * 0.035, 6);
        // Gravity sag: subtle downward pull
        const gravSag = Math.min(segLen * 0.02, 4);

        for (let s = 1; s <= numSubs; s++) {
            const t = s / numSubs;

            // Base position on straight line
            let px = fromX + dx * t;
            let py = fromY + dy * t;

            // Smooth bump shape: sin(PI*t) → 0 at ends, 1 at middle
            const bump = Math.sin(t * Math.PI);

            // Perpendicular displacement (creates visible curve for ALL directions)
            px += perpX * bump * waveAmp;
            py += perpY * bump * waveAmp;

            // Gravity bonus: slight downward pull (adds natural feel)
            py -= bump * gravSag;

            this.ensureVec2Buffer(this._centerPts, countRef.v + 1);
            if (this._cornerProximity.length <= countRef.v) this._cornerProximity.length = countRef.v + 1;
            this._centerPts[countRef.v].set(px, py);
            this._cornerProximity[countRef.v] = 0;
            countRef.v++;
        }
    }

    /**
     * Check if position[i] is a real corner (direction actually changes).
     * Uses cross product to detect angle between incoming and outgoing vectors.
     * Returns true only if the turn angle is significant (> ~15°).
     */
    private isRealCorner(v1x: number, v1y: number, len1: number, v2x: number, v2y: number, len2: number): boolean {
        // Cross product = |v1| * |v2| * sin(angle)
        const cross = (v1x / len1) * (v2y / len2) - (v1y / len1) * (v2x / len2);
        // |cross| > sin(15°) ≈ 0.26 means significant direction change
        return Math.abs(cross) > 0.2;
    }

    /**
     * Sample center path (with bezier at corners + rope sag on straights) into polyline.
     * Only applies bezier curve + flare at REAL corners (direction changes),
     * NOT at every grid cell on straight segments.
     * Populates _centerPts and _cornerProximity. Returns point count.
     */
    private sampleCenterPolyline(positions: Vec2[]): number {
        const countRef = { v: 0 };

        if (positions.length < 2) return 0;

        // Simple 2-point path (straight line with sag)
        if (positions.length === 2 || this.cornerSagAmount <= 0) {
            this.ensureVec2Buffer(this._centerPts, 1);
            if (this._cornerProximity.length < 1) this._cornerProximity.length = 1;
            this._centerPts[0].set(positions[0].x, positions[0].y);
            this._cornerProximity[0] = 0;
            countRef.v = 1;
            this.addSagSegment(
                positions[0].x, positions[0].y,
                positions[positions.length - 1].x, positions[positions.length - 1].y,
                countRef
            );
            return countRef.v;
        }

        // Multi-point path with corners
        const maxPts = positions.length * 20;
        this.ensureVec2Buffer(this._centerPts, maxPts);
        if (this._cornerProximity.length < maxPts) this._cornerProximity.length = maxPts;

        // Start point
        this._centerPts[0].set(positions[0].x, positions[0].y);
        this._cornerProximity[0] = 0;
        countRef.v = 1;

        let lastX = positions[0].x;
        let lastY = positions[0].y;

        for (let i = 1; i < positions.length - 1; i++) {
            const prev = positions[i - 1];
            const current = positions[i];
            const next = positions[i + 1];

            const v1x = current.x - prev.x;
            const v1y = current.y - prev.y;
            const v2x = next.x - current.x;
            const v2y = next.y - current.y;

            const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
            const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

            if (len1 < 0.1 || len2 < 0.1) {
                // Skip degenerate points - just continue the sag segment
                continue;
            }

            // Check if this is a REAL corner (significant direction change)
            if (!this.isRealCorner(v1x, v1y, len1, v2x, v2y, len2)) {
                // NOT a corner - just a waypoint on a straight run.
                // Don't add it individually; the sag segment from lastX,lastY
                // to the next real corner (or end) will cover it naturally.
                continue;
            }

            // === This IS a real corner ===
            const curveOffset = Math.min(len1, len2) * this.cornerSagAmount;

            // Curve start (before corner)
            const startX = current.x - (v1x / len1) * curveOffset;
            const startY = current.y - (v1y / len1) * curveOffset;

            // Curve end (after corner)
            const endX = current.x + (v2x / len2) * curveOffset;
            const endY = current.y + (v2y / len2) * curveOffset;

            // Straight segment with sag: from last point to curve start
            this.addSagSegment(lastX, lastY, startX, startY, countRef);

            // Control point (same logic as drawPathWithSag)
            let controlX = current.x;
            let controlY = current.y;

            if (this.sagByGravity) {
                const sagOffset = curveOffset * 0.8;
                controlX = current.x;
                controlY = current.y - sagOffset;
            } else {
                const bisectorX = (v1x / len1 + v2x / len2);
                const bisectorY = (v1y / len1 + v2y / len2);
                const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);
                if (bisectorLen > 0.01) {
                    const sagOffset = curveOffset * 0.3;
                    controlX = current.x + (bisectorX / bisectorLen) * sagOffset;
                    controlY = current.y + (bisectorY / bisectorLen) * sagOffset;
                }
            }

            // Sample bezier curve points at the real corner
            const p0x = startX, p0y = startY;
            const p2x = endX, p2y = endY;
            for (let t = 1; t <= this.filledCurveSegments; t++) {
                const ratio = t / this.filledCurveSegments;
                const oneMinusT = 1 - ratio;
                const bx = oneMinusT * oneMinusT * p0x + 2 * oneMinusT * ratio * controlX + ratio * ratio * p2x;
                const by = oneMinusT * oneMinusT * p0y + 2 * oneMinusT * ratio * controlY + ratio * ratio * p2y;

                this.ensureVec2Buffer(this._centerPts, countRef.v + 1);
                if (this._cornerProximity.length <= countRef.v) this._cornerProximity.length = countRef.v + 1;
                this._centerPts[countRef.v].set(bx, by);
                const distFromCenter = Math.abs(ratio - 0.5) * 2;
                this._cornerProximity[countRef.v] = 1.0 - distFromCenter * distFromCenter;
                countRef.v++;
            }

            lastX = endX; lastY = endY;
        }

        // Last straight segment with sag: from last curve end to final position
        const lastPos = positions[positions.length - 1];
        this.addSagSegment(lastX, lastY, lastPos.x, lastPos.y, countRef);

        return countRef.v;
    }

    /**
     * Compute left and right offset curves from center polyline.
     * Applies variable width (wider at corners via cornerFlareAmount).
     */
    private computeOffsetCurves(count: number, baseHalfWidth: number): void {
        this.ensureVec2Buffer(this._leftPts, count);
        this.ensureVec2Buffer(this._rightPts, count);
        if (this._halfWidths.length < count) this._halfWidths.length = count;

        // Compute half-widths with flare at corners
        for (let i = 0; i < count; i++) {
            const prox = this._cornerProximity[i] || 0;
            this._halfWidths[i] = baseHalfWidth * (1.0 + (this.cornerFlareAmount - 1.0) * prox);
        }

        // Smooth pass to avoid abrupt width transitions (2 iterations)
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 1; i < count - 1; i++) {
                const avg = (this._halfWidths[i - 1] + this._halfWidths[i + 1]) * 0.5;
                this._halfWidths[i] = Math.max(this._halfWidths[i], avg * 0.95);
            }
        }

        // Compute normals and offset points
        for (let i = 0; i < count; i++) {
            // Tangent direction (from neighbors)
            let tx: number, ty: number;
            if (i === 0) {
                tx = this._centerPts[1].x - this._centerPts[0].x;
                ty = this._centerPts[1].y - this._centerPts[0].y;
            } else if (i === count - 1) {
                tx = this._centerPts[count - 1].x - this._centerPts[count - 2].x;
                ty = this._centerPts[count - 1].y - this._centerPts[count - 2].y;
            } else {
                tx = this._centerPts[i + 1].x - this._centerPts[i - 1].x;
                ty = this._centerPts[i + 1].y - this._centerPts[i - 1].y;
            }

            // Normalize
            const len = Math.sqrt(tx * tx + ty * ty);
            if (len > 0.001) {
                tx /= len;
                ty /= len;
            } else {
                tx = 1; ty = 0;
            }

            // Normal (perpendicular to tangent)
            const nx = -ty;
            const ny = tx;

            const hw = this._halfWidths[i];
            const cx = this._centerPts[i].x;
            const cy = this._centerPts[i].y;

            this._leftPts[i].set(cx + nx * hw, cy + ny * hw);
            this._rightPts[i].set(cx - nx * hw, cy - ny * hw);
        }
    }

    /**
     * Draw the filled polygon from left/right offset curves.
     */
    private drawFilledPolygon(count: number, color: Color): void {
        if (!this.graphics || count < 2) return;

        this.graphics.fillColor = color;

        // Start from left[0]
        this.graphics.moveTo(this._leftPts[0].x, this._leftPts[0].y);

        // Trace left side forward (tail to head)
        for (let i = 1; i < count; i++) {
            this.graphics.lineTo(this._leftPts[i].x, this._leftPts[i].y);
        }

        // Connect to right side at head end
        this.graphics.lineTo(this._rightPts[count - 1].x, this._rightPts[count - 1].y);

        // Trace right side backward (head to tail)
        for (let i = count - 2; i >= 0; i--) {
            this.graphics.lineTo(this._rightPts[i].x, this._rightPts[i].y);
        }

        // Rounded tail cap (semicircle from right[0] to left[0], bulging outward)
        if (this.drawRoundedTailCap && count >= 2) {
            const cx = (this._leftPts[0].x + this._rightPts[0].x) * 0.5;
            const cy = (this._leftPts[0].y + this._rightPts[0].y) * 0.5;
            const radius = this._halfWidths[0];

            // Tail backward direction (away from arrow body)
            const tdx = this._centerPts[0].x - this._centerPts[1].x;
            const tdy = this._centerPts[0].y - this._centerPts[1].y;

            // Determine correct sweep direction using cross product
            // Cross of (right[0] - center) × (tailDir) determines CW or CCW
            const rx = this._rightPts[0].x - cx;
            const ry = this._rightPts[0].y - cy;
            const cross = rx * tdy - ry * tdx;
            const sweepDir = cross >= 0 ? 1 : -1;

            const startAngle = Math.atan2(ry, rx);
            const tailCapSegs = 8;
            for (let s = 1; s <= tailCapSegs; s++) {
                const t = s / tailCapSegs;
                const angle = startAngle + Math.PI * t * sweepDir;
                this.graphics.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            }
        }

        this.graphics.close();
        this.graphics.fill();
    }

    /**
     * High-level: draw arrow body as filled polygon.
     * Replaces drawPathWithSag() + stroke() pipeline.
     */
    private drawArrowBodyFilled(positions: Vec2[], halfWidth: number, color: Color): void {
        const count = this.sampleCenterPolyline(positions);
        if (count < 2) return;
        this.computeOffsetCurves(count, halfWidth);
        this.drawFilledPolygon(count, color);
    }

    // ========== End Filled Polygon ==========

    /**
     * Vẽ arrow khi đang trên grid
     */
    private drawArrowOnGrid(arrow: MovingArrow) {
        const tailDistance = arrow.headDistance - arrow.arrowLength;

        // Lấy positions trên path
        const positions = this.getPositionsInRange(arrow.pathPoints, tailDistance, arrow.headDistance);

        if (positions.length < 2) return;

        const lineWidth = arrow.lineWidth;

        // Vẽ đường
        this.graphics.lineWidth = lineWidth;
        this.graphics.lineJoin = 1; // ROUND
        this.graphics.strokeColor = arrow.color;
        this.graphics.fillColor = arrow.color;

        // Tính khoảng cách rút ngắn để line không lòi ra arrow head
        const arrowHeight = lineWidth * this.arrowHeadMultiplier;
        const shortenDistance = arrowHeight * (1/3);

        // Rút ngắn line
        const shortenedPositions = this.shortenLine(positions, shortenDistance);

        if (shortenedPositions.length < 2) return;

        // Vẽ đường với góc cong nhẹ (như dây chùng)
        if (this.useFilledBody) {
            this.drawArrowBodyFilled(shortenedPositions, lineWidth / 2, arrow.color);
        } else {
            this.drawPathWithSag(shortenedPositions);
            this.graphics.stroke();
        }

        // Vẽ mũi tên ở head
        if (positions.length >= 2) {
            const last = positions[positions.length - 1];
            const secondLast = positions[positions.length - 2];
            this.drawArrowHead(secondLast, last, lineWidth);
        }
    }

    /**
     * Vẽ arrow khi đang ở ngoài grid (dùng full path)
     */
    private drawArrowOnOuterLane(arrow: MovingArrow) {
        if (arrow.fullPathPoints.length < 2) return;

        // Tính tail và head distance trên full path
        // Clamp cả hai tại fullPathLength (target position)
        const headDist = Math.min(arrow.headTravelDistance, arrow.fullPathLength);
        const tailDist = Math.max(0, arrow.headTravelDistance - arrow.arrowLength);

        // Nếu tail đã đến target, không cần vẽ (arrow sắp bị remove)
        if (tailDist >= arrow.fullPathLength) return;

        // Lấy positions từ tail đến head trên full path
        // Các điểm có distance >= fullPathLength sẽ được clamp tại target
        const positions = this.getPositionsOnFullPath(arrow.fullPathPoints, tailDist, headDist);

        if (positions.length < 2) {
            // Trường hợp đặc biệt: arrow đang "chui vào" target, chỉ còn 1 đoạn ngắn
            // Vẽ từ tail đến target
            if (arrow.headReachedTarget && tailDist < arrow.fullPathLength) {
                const tailPos = this.getPositionOnFullPathAt(arrow.fullPathPoints, tailDist);
                const targetPos = this.getPositionOnFullPathAt(arrow.fullPathPoints, arrow.fullPathLength);
                if (tailPos && targetPos) {
                    const lineWidth = arrow.lineWidth;
                    this.graphics.lineWidth = lineWidth;
                    this.graphics.lineJoin = 1;
                    this.graphics.strokeColor = arrow.color;
                    this.graphics.fillColor = arrow.color;
                    if (this.useFilledBody) {
                        this.drawArrowBodyFilled([tailPos, targetPos], lineWidth / 2, arrow.color);
                    } else {
                        this.graphics.moveTo(tailPos.x, tailPos.y);
                        this.graphics.lineTo(targetPos.x, targetPos.y);
                        this.graphics.stroke();
                    }
                    // Không vẽ arrow head khi đang "chui vào" target
                }
            }
            return;
        }

        const lineWidth = arrow.lineWidth;

        // Vẽ đường
        this.graphics.lineWidth = lineWidth;
        this.graphics.lineJoin = 1; // ROUND
        this.graphics.strokeColor = arrow.color;
        this.graphics.fillColor = arrow.color;

        // Chỉ rút ngắn line và vẽ arrow head nếu head chưa đến target
        if (!arrow.headReachedTarget) {
            const arrowHeight = lineWidth * this.arrowHeadMultiplier;
            const shortenDistance = arrowHeight * (1/3);
            const shortenedPositions = this.shortenLine(positions, shortenDistance);

            if (shortenedPositions.length >= 2) {
                // Vẽ đường với góc cong nhẹ
                if (this.useFilledBody) {
                    this.drawArrowBodyFilled(shortenedPositions, lineWidth / 2, arrow.color);
                } else {
                    this.drawPathWithSag(shortenedPositions);
                    this.graphics.stroke();
                }

                // Vẽ mũi tên ở head
                const last = positions[positions.length - 1];
                const secondLast = positions[positions.length - 2];
                this.drawArrowHead(secondLast, last, lineWidth);
            }
        } else {
            // Head đã đến target - chỉ vẽ đường từ tail đến target, không vẽ arrow head
            if (this.useFilledBody) {
                this.drawArrowBodyFilled(positions, lineWidth / 2, arrow.color);
            } else {
                this.drawPathWithSag(positions);
                this.graphics.stroke();
            }
        }
    }

    /**
     * Lấy positions trên full path từ startDist đến endDist
     */
    private getPositionsOnFullPath(
        pathPoints: { x: number, y: number, dist: number }[],
        startDist: number,
        endDist: number
    ): Vec2[] {
        const result: Vec2[] = [];

        // Tìm vị trí tail (startDist)
        const tailPos = this.getPositionOnFullPathAt(pathPoints, startDist);
        if (tailPos) result.push(tailPos);

        // Thêm các điểm trung gian (corners) nằm giữa startDist và endDist
        for (const pp of pathPoints) {
            if (pp.dist > startDist && pp.dist < endDist) {
                result.push(new Vec2(pp.x, pp.y));
            }
        }

        // Tìm vị trí head (endDist)
        const headPos = this.getPositionOnFullPathAt(pathPoints, endDist);
        if (headPos) result.push(headPos);

        return result;
    }

    /**
     * Lấy vị trí trên full path tại một distance cụ thể
     */
    private getPositionOnFullPathAt(
        pathPoints: { x: number, y: number, dist: number }[],
        distance: number
    ): Vec2 | null {
        if (pathPoints.length === 0) return null;

        // Nếu distance <= 0, trả về điểm đầu
        if (distance <= 0) {
            return new Vec2(pathPoints[0].x, pathPoints[0].y);
        }

        // Nếu distance >= tổng chiều dài, trả về điểm cuối
        const lastPoint = pathPoints[pathPoints.length - 1];
        if (distance >= lastPoint.dist) {
            return new Vec2(lastPoint.x, lastPoint.y);
        }

        // Tìm segment chứa distance
        for (let i = 1; i < pathPoints.length; i++) {
            const p0 = pathPoints[i - 1];
            const p1 = pathPoints[i];

            if (distance >= p0.dist && distance <= p1.dist) {
                // Interpolate giữa p0 và p1
                const segmentLength = p1.dist - p0.dist;
                const t = segmentLength > 0 ? (distance - p0.dist) / segmentLength : 0;

                return new Vec2(
                    p0.x + (p1.x - p0.x) * t,
                    p0.y + (p1.y - p0.y) * t
                );
            }
        }

        return new Vec2(pathPoints[0].x, pathPoints[0].y);
    }

    /**
     * Vẽ arrow với glow effect (cho tutorial)
     */
    private drawArrowWithGlow(arrow: MovingArrow) {
        if (!this.graphics) return;

        const tailDistance = arrow.headDistance - arrow.arrowLength;
        const positions = this.getPositionsInRange(arrow.pathPoints, tailDistance, arrow.headDistance);

        if (positions.length < 2) return;

        const glowLineWidth = arrow.lineWidth * this.tutorialGlowScale;

        // Tính alpha nhấp nháy
        const pulseValue = Math.sin(this.glowPulseTimer) * 0.5 + 0.5;
        const animatedAlpha = this.glowAlphaMin + (this.glowAlphaMax - this.glowAlphaMin) * pulseValue;

        const glowColor = new Color(
            this.tutorialGlowColor.r,
            this.tutorialGlowColor.g,
            this.tutorialGlowColor.b,
            animatedAlpha
        );

        this.graphics.lineWidth = glowLineWidth;
        this.graphics.lineJoin = 1;
        this.graphics.strokeColor = glowColor;
        this.graphics.fillColor = glowColor;

        const arrowHeight = glowLineWidth * this.arrowHeadMultiplier;
        const shortenDistance = arrowHeight * (1/3);
        const shortenedPositions = this.shortenLine(positions, shortenDistance);

        if (shortenedPositions.length >= 2) {
            // Vẽ đường với góc cong nhẹ
            if (this.useFilledBody) {
                this.drawArrowBodyFilled(shortenedPositions, glowLineWidth / 2, glowColor);
            } else {
                this.drawPathWithSag(shortenedPositions);
                this.graphics.stroke();
            }

            if (positions.length >= 2) {
                const last = positions[positions.length - 1];
                const secondLast = positions[positions.length - 2];
                this.drawArrowHeadGlow(secondLast, last, glowLineWidth);
            }
        }
    }

    /**
     * Vẽ arrow head cho glow effect
     */
    private drawArrowHeadGlow(from: Vec2, to: Vec2, lineWidth: number) {
        if (!this.graphics) return;

        const height = lineWidth * this.arrowHeadMultiplier;
        const baseWidth = lineWidth * this.arrowHeadMultiplier * this.arrowHeadBaseWidthRatio;

        const direction = new Vec2(to.x - from.x, to.y - from.y);
        direction.normalize();

        const perpX = -direction.y;
        const perpY = direction.x;

        const centerX = to.x;
        const centerY = to.y;

        const tipX = centerX + direction.x * height * (2/3);
        const tipY = centerY + direction.y * height * (2/3);

        const baseCenterX = centerX - direction.x * height * (1/3);
        const baseCenterY = centerY - direction.y * height * (1/3);

        const base1X = baseCenterX + perpX * baseWidth / 2;
        const base1Y = baseCenterY + perpY * baseWidth / 2;

        const base2X = baseCenterX - perpX * baseWidth / 2;
        const base2Y = baseCenterY - perpY * baseWidth / 2;

        this.graphics.moveTo(tipX, tipY);
        this.graphics.lineTo(base1X, base1Y);
        this.graphics.lineTo(base2X, base2Y);
        this.graphics.close();
        this.graphics.fill();
    }

    /**
     * Vẽ mũi tên (arrow head)
     */
    private drawArrowHead(from: Vec2, to: Vec2, lineWidth: number) {
        if (!this.graphics) return;

        const height = lineWidth * this.arrowHeadMultiplier;
        const baseWidth = lineWidth * this.arrowHeadMultiplier * this.arrowHeadBaseWidthRatio;

        const direction = new Vec2(to.x - from.x, to.y - from.y);
        direction.normalize();

        const perpX = -direction.y;
        const perpY = direction.x;

        const centerX = to.x;
        const centerY = to.y;

        const tipX = centerX + direction.x * height * (2/3);
        const tipY = centerY + direction.y * height * (2/3);

        const baseCenterX = centerX - direction.x * height * (1/3);
        const baseCenterY = centerY - direction.y * height * (1/3);

        const base1X = baseCenterX + perpX * baseWidth / 2;
        const base1Y = baseCenterY + perpY * baseWidth / 2;

        const base2X = baseCenterX - perpX * baseWidth / 2;
        const base2Y = baseCenterY - perpY * baseWidth / 2;

        this.graphics.moveTo(tipX, tipY);
        this.graphics.lineTo(base1X, base1Y);
        this.graphics.lineTo(base2X, base2Y);
        this.graphics.close();
        this.graphics.fill();
    }

    /**
     * Rút ngắn line từ cuối
     */
    private shortenLine(positions: Vec2[], shortenDistance: number): Vec2[] {
        if (positions.length < 2 || shortenDistance <= 0) {
            return positions;
        }

        const result = [...positions];
        let remainingDistance = shortenDistance;

        for (let i = result.length - 1; i > 0; i--) {
            const current = result[i];
            const previous = result[i - 1];

            const segmentLength = Vec2.distance(previous, current);

            if (segmentLength >= remainingDistance) {
                const direction = new Vec2(current.x - previous.x, current.y - previous.y);
                direction.normalize();

                result[i] = new Vec2(
                    current.x - direction.x * remainingDistance,
                    current.y - direction.y * remainingDistance
                );

                result.length = i + 1;
                break;
            } else {
                remainingDistance -= segmentLength;
                result.pop();
            }
        }

        return result;
    }

    /**
     * Lấy world positions trong khoảng distance
     */
    private getPositionsInRange(pathPoints: PathPoint[], startDist: number, endDist: number): Vec2[] {
        const result: Vec2[] = [];

        // Tìm segment chứa startDist (tail position)
        let tailSegmentIndex = -1;
        for (let i = 0; i < pathPoints.length - 1; i++) {
            if (startDist >= pathPoints[i].distanceFromStart &&
                startDist <= pathPoints[i + 1].distanceFromStart) {
                tailSegmentIndex = i;
                break;
            }
        }

        // Nếu tail đã qua hết path
        if (startDist > pathPoints[pathPoints.length - 1].distanceFromStart) {
            const tailPos = this.getPositionAtDistance(pathPoints, startDist);
            const headPos = this.getPositionAtDistance(pathPoints, endDist);
            if (tailPos && headPos) {
                result.push(tailPos);
                result.push(headPos);
            }
            return result;
        }

        // Add tail position
        const tailPos = this.getPositionAtDistance(pathPoints, startDist);
        if (tailPos) result.push(tailPos);

        // Bắt đầu từ path point NGAY SAU tail position
        if (tailSegmentIndex >= 0) {
            for (let i = tailSegmentIndex + 1; i < pathPoints.length; i++) {
                const point = pathPoints[i];
                if (point.distanceFromStart > startDist && point.distanceFromStart < endDist) {
                    result.push(new Vec2(point.worldPos.x, point.worldPos.y));
                }
            }
        }

        // Add head position
        const headPos = this.getPositionAtDistance(pathPoints, endDist);
        if (headPos && result.length > 0) {
            result.push(headPos);
        }

        return result;
    }

    /**
     * Lấy position tại một khoảng cách trên path
     */
    private getPositionAtDistance(pathPoints: PathPoint[], distance: number): Vec2 | null {
        if (pathPoints.length === 0) return null;

        if (distance < 0) return null;

        const lastPoint = pathPoints[pathPoints.length - 1];

        // Nếu distance > totalLength, extrapolate
        if (distance > lastPoint.distanceFromStart) {
            if (pathPoints.length < 2) return null;

            const secondLastPoint = pathPoints[pathPoints.length - 2];

            const dir = new Vec2(
                lastPoint.worldPos.x - secondLastPoint.worldPos.x,
                lastPoint.worldPos.y - secondLastPoint.worldPos.y
            );
            dir.normalize();

            const extraDistance = distance - lastPoint.distanceFromStart;
            return new Vec2(
                lastPoint.worldPos.x + dir.x * extraDistance,
                lastPoint.worldPos.y + dir.y * extraDistance
            );
        }

        // Tìm segment chứa distance
        for (let i = 1; i < pathPoints.length; i++) {
            const p0 = pathPoints[i - 1];
            const p1 = pathPoints[i];

            if (distance >= p0.distanceFromStart && distance <= p1.distanceFromStart) {
                const segmentLength = p1.distanceFromStart - p0.distanceFromStart;
                const t = segmentLength > 0 ? (distance - p0.distanceFromStart) / segmentLength : 0;

                return new Vec2(
                    p0.worldPos.x + (p1.worldPos.x - p0.worldPos.x) * t,
                    p0.worldPos.y + (p1.worldPos.y - p0.worldPos.y) * t
                );
            }
        }

        return new Vec2(pathPoints[0].worldPos.x, pathPoints[0].worldPos.y);
    }

    /**
     * Bật tutorial - gọi từ bên ngoài khi muốn hiển thị hand tap
     */
    public startTutorial() {
        this._canShowTutorial = true;
        if (this.enableTutorial) {
            this.findTappableArrow();
        }
    }

    /**
     * Set tutorial cho một arrow cụ thể (theo ID)
     * @param arrowId ID của arrow cần highlight
     * @param highlightColor Màu highlight (optional, mặc định dùng tutorialGlowColor)
     */
    public setTutorialArrow(arrowId: string, highlightColor?: Color) {
        const arrow = this.arrows.get(arrowId);
        if (!arrow) {
            console.warn(`[Tutorial] Arrow ${arrowId} not found`);
            return;
        }

        this._canShowTutorial = true;
        this.tappableArrowId = arrowId;
        this.glowPulseTimer = 0;  // Reset timer để bắt đầu nhấp nháy từ đầu

        // Set màu highlight nếu có (dùng cho reference)
        if (highlightColor) {
            this.tutorialGlowColor = highlightColor;
        }

        // Màu sẽ được cập nhật trong updateTutorialArrowColor()
        // Đặt màu ban đầu là xanh đậm
        arrow.color = new Color(0, 150, 50, 255);

        // Redraw để cập nhật màu
        this.redrawAllSmooth();

        // Hiển thị hand tap tại arrow
        this.showHandTapAtArrow(arrow);
    }

    /**
     * Set màu highlight cho tutorial arrow
     */
    public setTutorialHighlightColor(color: Color) {
        this.tutorialGlowColor = color;
    }

    /**
     * Tắt tutorial hoàn toàn - không hiện lại nữa
     */
    public stopTutorial() {
        // Restore màu gốc cho tutorial arrow trước khi tắt
        if (this.tappableArrowId) {
            const arrow = this.arrows.get(this.tappableArrowId);
            if (arrow) {
                arrow.color = arrow.originalColor.clone();
            }
        }
        this._canShowTutorial = false;
        this.tappableArrowId = null;
        this.hideHandTap();
        this.redrawAllSmooth();
    }

    /**
     * Hiển thị hand tap tại vị trí head của arrow
     */
    private showHandTapAtArrow(arrow: MovingArrow) {
        if (!this.handTapNode || !this._canShowTutorial) return;

        // Head ở segments[0]
        const headSegment = arrow.segments[0];

        const grid2D = this.genGrid.getGrid2D();
        const headCell = grid2D[headSegment.row]?.[headSegment.col];
        if (!headCell) return;

        this.handTapNode.setPosition(headCell.position);
        this.handTapNode.active = true;
    }

    /**
     * Ẩn hand tap
     */
    private hideHandTap() {
        if (this.handTapNode) {
            this.handTapNode.active = false;
        }
    }

    /**
     * Kiểm tra win condition
     */
    private checkWinCondition() {
        if (!this.enableWinCheck) return;

        if (this.exitedArrows >= this.totalArrows && this.totalArrows > 0) {
            this.onWin();
        }
    }

    // ========== OUTER LANE MOVEMENT ==========

    /**
     * Lấy bounds của grid (world coordinates)
     */
    private getGridBounds(): { minX: number, maxX: number, minY: number, maxY: number } {
        const grid2D = this.genGrid.getGrid2D();
        if (!grid2D || grid2D.length === 0) {
            return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        }

        const rows = grid2D.length;
        const cols = grid2D[0].length;
        const cellSize = this.genGrid.gridSize;

        // Lấy position của cell góc trên-trái và góc dưới-phải
        const topLeft = grid2D[0][0].position;
        const bottomRight = grid2D[rows - 1][cols - 1].position;

        return {
            minX: topLeft.x - cellSize / 2,
            maxX: bottomRight.x + cellSize / 2,
            minY: bottomRight.y - cellSize / 2,
            maxY: topLeft.y + cellSize / 2
        };
    }

    /**
     * Được gọi khi win
     */
    protected onWin() {
        console.log('[WIN] Level completed!');
        // Override để thêm logic win
    }

    /**
     * Reset game
     * @param skipAutoTutorial Bỏ qua tự động tìm tutorial arrow (để GameControl tự set)
     */
    public resetGame(skipAutoTutorial: boolean = true) {
        this.exitedArrows = 0;
        this.glowPulseTimer = 0;
        // Reset tutorial state
        this.tappableArrowId = null;
        this._canShowTutorial = false;
        // Reset auto tutorial tracking
        this._hasFirstTap = false;
        this._timeSinceLastTap = 0;
        this._autoTutorialShown = false;
        // Clear sprite nodes nếu dùng sprite rendering
        if (this.useSpriteRendering) {
            this.clearAllSpriteNodes();
        }
        this.syncArrowsFromPaths(skipAutoTutorial);
        this.redrawAllSmooth();
    }

    /**
     * Lấy progress hiện tại (0-1)
     */
    public getProgress(): number {
        if (this.totalArrows === 0) return 0;
        return this.exitedArrows / this.totalArrows;
    }

    /**
     * Load level từ LevelData object
     */
    public loadFromLevelData(levelData: LevelData) {
        if (!this.genGrid) {
            console.error('[GenMultiPathArrow] GenGridInput not set');
            return;
        }

        if (!LevelDataHelper.validate(levelData)) {
            console.error('[GenMultiPathArrow] Invalid level data');
            return;
        }

        // Store level data for stone system
        this._currentLevelData = levelData;

        // Clear existing paths
        this.genGrid.clearAllPaths();

        // Add paths từ level data
        for (const pathData of levelData.paths) {
            // Sử dụng fixedColor nếu bật, ngược lại dùng màu từ data
            const color = this.useFixedColor ? this.fixedColor.clone() : LevelDataHelper.objectToColor(pathData.color);
            // Sử dụng fixedLineWidth nếu bật
            const lineWidth = this.useFixedLineWidth ? this.fixedLineWidth : pathData.lineWidth;

            this.genGrid.addPath(
                pathData.id,
                pathData.coords,
                color,
                lineWidth,
                true  // drawArrow
            );
        }

        // Draw all paths
        this.genGrid.drawAllPaths();

        // Re-sync arrows và redraw
        this.scheduleOnce(() => {
            this.registerAsController();
            this.syncArrowsFromPaths();
            this.redrawAllSmooth();
        }, 0.1);

    }

    /**
     * Load level từ JSON string
     */
    public loadFromJSON(jsonString: string) {
        const levelData = LevelDataHelper.fromJSON(jsonString);
        if (levelData) {
            this.loadFromLevelData(levelData);
        }
    }

    // ========== EVENT CALLBACKS ==========

    /**
     * Set callback khi arrow đi vào target
     * @param callback Function được gọi với arrowId khi arrow fully enter target
     */
    public setOnArrowEnteredTarget(callback: (arrowId: string) => void) {

        this._onArrowEnteredTarget = callback;
    }

    /**
     * Set callback khi arrow bị collision
     * @param callback Function được gọi với arrowId khi arrow va chạm
     */
    public setOnArrowCollision(callback: (arrowId: string) => void) {
        this._onArrowCollision = callback;
    }

    /**
     * Set callback khi arrow đi qua KHÔNG bị collision
     * @param callback Function được gọi với arrowId khi arrow pass thành công
     */
    public setOnArrowPassedNoCollision(callback: (arrowId: string) => void) {
        this._onArrowPassedNoCollision = callback;
    }

    /**
     * Set callback khi arrow được tap (mỗi lần tap)
     * @param callback Function được gọi với arrowId khi arrow được tap
     */
    public setOnArrowTapped(callback: (arrowId: string) => void) {
        this._onArrowTapped = callback;
    }

    /**
     * Set callback khi arrow tail rời khỏi 1 cell (dùng cho stone system)
     */
    public setOnCellReleased(callback: (row: number, col: number) => void) {
        this._onCellReleased = callback;
    }

    /**
     * Lấy level data hiện tại (dùng cho stone system)
     */
    public getCurrentLevelData(): LevelData | null {
        return this._currentLevelData;
    }

    // ========== DEBUG & INFO ==========

    /**
     * Lấy thông tin debug về arrow
     */
    public getArrowDebugInfo(arrowId: string): string | null {
        const arrow = this.arrows.get(arrowId);
        if (!arrow) return null;

        const phaseNames = ['ON_GRID', 'EXITING_GRID', 'MOVING_TO_TOP', 'ON_TOP_LANE', 'MOVING_TO_TARGET', 'EXITED'];

        return `Arrow ${arrowId}:
  - Phase: ${phaseNames[arrow.movementPhase]}
  - isMoving: ${arrow.isMoving}
  - isReversing: ${arrow.isReversing}
  - headDistance: ${arrow.headDistance.toFixed(1)}
  - totalLength: ${arrow.totalLength.toFixed(1)}
  - headTravelDistance: ${arrow.headTravelDistance.toFixed(1)}
  - fullPathLength: ${arrow.fullPathLength.toFixed(1)}
  - headReachedTarget: ${arrow.headReachedTarget}`;
    }

    /**
     * Lấy tất cả arrows đang active
     */
    public getActiveArrows(): string[] {
        return Array.from(this.arrows.keys());
    }

    /**
     * Lấy số lượng arrows còn lại
     */
    public getRemainingArrows(): number {
        return this.arrows.size;
    }

    /**
     * Lấy movement phase của arrow
     */
    public getArrowPhase(arrowId: string): MovementPhase | null {
        const arrow = this.arrows.get(arrowId);
        return arrow ? arrow.movementPhase : null;
    }

    /**
     * Kiểm tra arrow có đang moving không
     */
    public isArrowMoving(arrowId: string): boolean {
        const arrow = this.arrows.get(arrowId);
        return arrow ? arrow.isMoving : false;
    }

    /**
     * Kiểm tra arrow có bị block (có collision trên đường đi) không
     * Dùng để check trước khi fox follow arrow
     */
    public isArrowBlocked(arrowId: string): boolean {
        const arrow = this.arrows.get(arrowId);
        if (!arrow) return true;  // Không tìm thấy arrow = coi như bị block

        const collisionResult = this.checkCollisionOnPath(arrow);
        return collisionResult !== null;
    }

    // ========== SPRITE-BASED RENDERING ==========

    /**
     * Vẽ tất cả arrows bằng Sprites
     */
    private redrawWithSprites() {
        if (!this.spriteContainer) return;

        this.arrows.forEach((arrow, arrowId) => {
            // Xử lý theo phase
            if (arrow.movementPhase === MovementPhase.EXITING_GRID ||
                arrow.movementPhase === MovementPhase.MOVING_TO_TOP ||
                arrow.movementPhase === MovementPhase.ON_TOP_LANE ||
                arrow.movementPhase === MovementPhase.MOVING_TO_TARGET) {
                this.drawArrowSpritesOnOuterLane(arrow, arrowId);
            } else {
                this.drawArrowSpritesOnGrid(arrow, arrowId);
            }
        });

        // Cleanup sprites của arrows đã bị remove
        this.cleanupRemovedArrowSprites();
    }

    /**
     * Vẽ arrow bằng sprites khi đang trên grid
     */
    private drawArrowSpritesOnGrid(arrow: MovingArrow, arrowId: string) {
        const tailDistance = arrow.headDistance - arrow.arrowLength;
        const positions = this.getPositionsInRange(arrow.pathPoints, tailDistance, arrow.headDistance);

        if (positions.length < 2) return;

        this.updateArrowSprites(arrowId, positions, arrow);
    }

    /**
     * Vẽ arrow bằng sprites khi đang trên outer lane
     */
    private drawArrowSpritesOnOuterLane(arrow: MovingArrow, arrowId: string) {
        if (arrow.fullPathPoints.length < 2) return;

        const headDist = Math.min(arrow.headTravelDistance, arrow.fullPathLength);
        const tailDist = Math.max(0, arrow.headTravelDistance - arrow.arrowLength);

        if (tailDist >= arrow.fullPathLength) return;

        const positions = this.getPositionsOnFullPath(arrow.fullPathPoints, tailDist, headDist);

        if (positions.length < 2) return;

        this.updateArrowSprites(arrowId, positions, arrow);
    }

    /**
     * Cập nhật sprite nodes cho arrow
     */
    private updateArrowSprites(arrowId: string, positions: Vec2[], arrow: MovingArrow) {
        let spriteData = this.arrowSpriteNodes.get(arrowId);

        // Tạo container nếu chưa có
        if (!spriteData) {
            const container = new Node(`Arrow_${arrowId}`);
            container.parent = this.spriteContainer;
            container.layer = this.node.layer;  // Kế thừa layer từ parent (UI_2D)
            container.addComponent(UITransform);
            spriteData = { container, segments: [], corners: [], head: null };
            this.arrowSpriteNodes.set(arrowId, spriteData);
        }

        // Chuyển đổi positions thành đường cong tại các góc (như dây chùng)
        const curvedPositions = this.createCurvedPath(positions);

        // Tính số segments cần thiết
        const neededSegments = curvedPositions.length - 1;

        // Tạo thêm segments nếu thiếu
        while (spriteData.segments.length < neededSegments) {
            const segmentNode = this.createBodySegmentNode();
            segmentNode.parent = spriteData.container;
            spriteData.segments.push(segmentNode);
        }

        // Ẩn segments thừa
        for (let i = neededSegments; i < spriteData.segments.length; i++) {
            spriteData.segments[i].active = false;
        }

        // Ẩn tất cả corners (không cần nữa vì đã có curved path)
        for (let i = 0; i < spriteData.corners.length; i++) {
            spriteData.corners[i].active = false;
        }

        // Cập nhật từng segment theo curved path
        for (let i = 0; i < neededSegments; i++) {
            const segmentNode = spriteData.segments[i];
            segmentNode.active = true;

            const startPos = curvedPositions[i];
            const endPos = curvedPositions[i + 1];

            this.updateBodySegmentSimple(segmentNode, startPos, endPos, arrow);
        }

        // Cập nhật head sprite
        if (!arrow.headReachedTarget && curvedPositions.length >= 2) {
            if (!spriteData.head) {
                spriteData.head = this.createHeadNode();
                spriteData.head.parent = spriteData.container;
            }
            spriteData.head.active = true;

            const lastPos = curvedPositions[curvedPositions.length - 1];
            const secondLastPos = curvedPositions[curvedPositions.length - 2];
            this.updateHeadSprite(spriteData.head, secondLastPos, lastPos, arrow);
        } else if (spriteData.head) {
            spriteData.head.active = false;
        }
    }

    /**
     * Tạo đường cong tại các góc gấp (như dây chùng)
     */
    private createCurvedPath(positions: Vec2[]): Vec2[] {
        if (positions.length <= 2 || this.spriteSagAmount <= 0) {
            return positions;
        }

        const result: Vec2[] = [];
        result.push(positions[0].clone());

        for (let i = 1; i < positions.length - 1; i++) {
            const prev = positions[i - 1];
            const current = positions[i];
            const next = positions[i + 1];

            // Vectors
            const v1x = current.x - prev.x;
            const v1y = current.y - prev.y;
            const v2x = next.x - current.x;
            const v2y = next.y - current.y;

            const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
            const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

            if (len1 < 0.1 || len2 < 0.1) {
                result.push(current.clone());
                continue;
            }

            // Khoảng cách để tạo curve
            const curveOffset = Math.min(len1, len2) * this.spriteSagAmount;

            // Điểm bắt đầu curve (trước góc)
            const startX = current.x - (v1x / len1) * curveOffset;
            const startY = current.y - (v1y / len1) * curveOffset;

            // Điểm kết thúc curve (sau góc)
            const endX = current.x + (v2x / len2) * curveOffset;
            const endY = current.y + (v2y / len2) * curveOffset;

            // Control point - chùng xuống theo hướng bisector (ra ngoài góc)
            const bisectorX = (v1x / len1 + v2x / len2);
            const bisectorY = (v1y / len1 + v2y / len2);
            const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);

            let controlX = current.x;
            let controlY = current.y;

            if (bisectorLen > 0.01) {
                // Đẩy control point ra ngoài góc để tạo hiệu ứng chùng
                const sagOffset = curveOffset * 0.5;
                controlX = current.x + (bisectorX / bisectorLen) * sagOffset;
                controlY = current.y + (bisectorY / bisectorLen) * sagOffset;
            }

            // Thêm điểm bắt đầu curve
            result.push(new Vec2(startX, startY));

            // Thêm các điểm trung gian theo quadratic bezier
            for (let t = 1; t <= this.spriteCurveSegments; t++) {
                const ratio = t / this.spriteCurveSegments;
                const point = this.quadraticBezier(
                    new Vec2(startX, startY),
                    new Vec2(controlX, controlY),
                    new Vec2(endX, endY),
                    ratio
                );
                result.push(point);
            }
        }

        // Thêm điểm cuối
        result.push(positions[positions.length - 1].clone());

        return result;
    }

    /**
     * Tính điểm trên đường cong quadratic bezier
     */
    private quadraticBezier(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
        const oneMinusT = 1 - t;
        return new Vec2(
            oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
            oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y
        );
    }

    /**
     * Cập nhật body segment sprite (phiên bản đơn giản, không extend)
     */
    private updateBodySegmentSimple(node: Node, startPos: Vec2, endPos: Vec2, arrow: MovingArrow) {
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Position tại startPos
        node.setPosition(startPos.x, startPos.y, 0);

        // Rotation
        node.setRotationFromEuler(0, 0, angle);

        const uiTransform = node.getComponent(UITransform);
        const sprite = node.getComponent(Sprite);

        if (uiTransform && sprite && sprite.spriteFrame) {
            const originalHeight = sprite.spriteFrame.originalSize.height;

            if (this.useBodyTiledMode) {
                // TILED mode: texture lặp lại theo chiều ngang
                uiTransform.setContentSize(length + 2, originalHeight);
                const scaleY = this.spriteBodyHeight / originalHeight;
                node.setScale(1, scaleY, 1);
            } else {
                // STRETCHED mode: kéo giãn texture, giữ tỷ lệ chiều cao
                uiTransform.setContentSize(length + 2, this.spriteBodyHeight);
                node.setScale(1, 1, 1);
            }
        }

        // Color
        if (sprite) {
            sprite.color = arrow.color;
        }
    }

    /**
     * Tạo node cho body segment
     */
    private createBodySegmentNode(): Node {
        const node = new Node('BodySegment');
        node.layer = this.node.layer;  // Kế thừa layer từ parent (UI_2D)

        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = this.arrowBodySpriteFrame;
        sprite.type = this.useBodyTiledMode ? Sprite.Type.TILED : Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const uiTransform = node.getComponent(UITransform) || node.addComponent(UITransform);
        uiTransform.anchorX = 0;  // Anchor ở đầu trái để dễ xoay
        uiTransform.anchorY = 0.5;

        return node;
    }

    /**
     * Tạo node cho head
     */
    private createHeadNode(): Node {
        const node = new Node('Head');
        node.layer = this.node.layer;  // Kế thừa layer từ parent (UI_2D)

        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = this.arrowHeadSpriteFrame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const uiTransform = node.getComponent(UITransform) || node.addComponent(UITransform);
        uiTransform.anchorX = 0.5;
        uiTransform.anchorY = 0.5;

        return node;
    }

    /**
     * Tạo node cho corner (góc gấp khúc)
     */
    private createCornerNode(): Node {
        const node = new Node('Corner');
        node.layer = this.node.layer;

        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = this.arrowBodySpriteFrame;  // Dùng body sprite
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const uiTransform = node.getComponent(UITransform) || node.addComponent(UITransform);
        uiTransform.anchorX = 0.5;
        uiTransform.anchorY = 0.5;

        return node;
    }

    /**
     * Cập nhật corner sprite - tạo đường cong nhẹ ra ngoài tại góc gấp
     */
    private updateCornerSprite(node: Node, prevPos: Vec2, currentPos: Vec2, nextPos: Vec2, arrow: MovingArrow) {
        // Vector từ prev đến current và từ current đến next
        const v1 = new Vec2(currentPos.x - prevPos.x, currentPos.y - prevPos.y);
        const v2 = new Vec2(nextPos.x - currentPos.x, nextPos.y - currentPos.y);

        v1.normalize();
        v2.normalize();

        // Tính góc giữa 2 vectors
        const angle1 = Math.atan2(v1.y, v1.x);
        const angle2 = Math.atan2(v2.y, v2.x);

        // Góc trung bình (bisector) - hướng ra ngoài góc
        let bisectorAngle = (angle1 + angle2) / 2;

        // Kiểm tra hướng cong (cross product để xác định bên trái/phải)
        const cross = v1.x * v2.y - v1.y * v2.x;
        if (cross > 0) {
            // Góc quay trái - offset ra ngoài (ngược hướng bisector)
            bisectorAngle += Math.PI;
        }

        // Độ cong ra ngoài (có thể điều chỉnh)
        const curveOutward = this.spriteBodyHeight * 0.3;

        // Position: tại currentPos + offset ra ngoài theo bisector
        const offsetX = Math.cos(bisectorAngle) * curveOutward;
        const offsetY = Math.sin(bisectorAngle) * curveOutward;
        node.setPosition(currentPos.x + offsetX, currentPos.y + offsetY, 0);

        // Rotation: theo hướng bisector để sprite cong theo góc
        const displayAngle = (angle1 + angle2) / 2 * 180 / Math.PI;
        node.setRotationFromEuler(0, 0, displayAngle);

        // Size: hình oval để tạo hiệu ứng cong
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            // Chiều dài dựa trên góc gấp
            const angleDiff = Math.abs(angle2 - angle1);
            const cornerLength = this.spriteBodyHeight * (1.2 + Math.sin(angleDiff) * 0.8);
            uiTransform.setContentSize(cornerLength, this.spriteBodyHeight);
        }

        // Color
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.color = arrow.color;
        }
    }

    /**
     * Cập nhật body segment sprite
     */
    private updateBodySegment(node: Node, startPos: Vec2, endPos: Vec2, arrow: MovingArrow) {
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Extend segment một chút để overlap tại góc
        const extendAmount = this.spriteBodyHeight * 0.3;
        const dirX = dx / length;
        const dirY = dy / length;

        // Position lùi lại một chút từ startPos
        const adjustedStartX = startPos.x - dirX * extendAmount;
        const adjustedStartY = startPos.y - dirY * extendAmount;
        node.setPosition(adjustedStartX, adjustedStartY, 0);

        // Rotation
        node.setRotationFromEuler(0, 0, angle);

        // Scale width theo length + extend, height theo spriteBodyHeight
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(length + extendAmount * 2, this.spriteBodyHeight);
        }

        // Color
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.color = arrow.color;
        }
    }

    /**
     * Cập nhật head sprite
     */
    private updateHeadSprite(node: Node, fromPos: Vec2, toPos: Vec2, arrow: MovingArrow) {
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Position tại toPos (head position)
        node.setPosition(toPos.x, toPos.y, 0);

        // Rotation - texture head hướng lên (UP), cần xoay -90 độ để hướng theo direction
        node.setRotationFromEuler(0, 0, angle - 90);

        // Size dùng spriteHeadSize
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(this.spriteHeadSize, this.spriteHeadSize);
        }

        // Color
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.color = arrow.color;
        }
    }

    /**
     * Cleanup sprites của arrows đã bị remove
     */
    private cleanupRemovedArrowSprites() {
        const activeArrowIds = new Set(this.arrows.keys());

        this.arrowSpriteNodes.forEach((spriteData, arrowId) => {
            if (!activeArrowIds.has(arrowId)) {
                // Destroy tất cả nodes
                spriteData.segments.forEach(node => node.destroy());
                spriteData.corners.forEach(node => node.destroy());
                if (spriteData.head) spriteData.head.destroy();
                spriteData.container.destroy();
                this.arrowSpriteNodes.delete(arrowId);
            }
        });
    }

    /**
     * Clear tất cả sprite nodes (gọi khi reset game)
     */
    private clearAllSpriteNodes() {
        this.arrowSpriteNodes.forEach((spriteData) => {
            spriteData.segments.forEach(node => node.destroy());
            spriteData.corners.forEach(node => node.destroy());
            if (spriteData.head) spriteData.head.destroy();
            spriteData.container.destroy();
        });
        this.arrowSpriteNodes.clear();
    }

    /**
     * Enable/disable outer lane movement at runtime
     */
    public setOuterLaneEnabled(enabled: boolean) {
        this.enableOuterLane = enabled;
    }

    /**
     * Set outer lane offset at runtime
     */
    public setOuterLaneOffset(offset: number) {
        this.outerLaneOffset = offset;
    }

    /**
     * Lấy vị trí head của arrow (world position)
     * Dùng để fox follow theo arrow
     */
    public getArrowHeadPosition(arrowId: string): Vec3 | null {
        const arrow = this.arrows.get(arrowId);
        if (!arrow) return null;

        // Nếu arrow đang trên outer lane (có fullPathPoints)
        if (arrow.fullPathPoints.length > 0 && arrow.movementPhase !== MovementPhase.ON_GRID) {
            const headDist = Math.min(arrow.headTravelDistance, arrow.fullPathLength);
            const pos = this.getPositionOnFullPathAt(arrow.fullPathPoints, headDist);
            if (pos) {
                return new Vec3(pos.x, pos.y, 0);
            }
        }

        // Nếu arrow còn trên grid
        const headPos = this.getPositionAtDistance(arrow.pathPoints, arrow.headDistance);
        if (headPos) {
            return new Vec3(headPos.x, headPos.y, 0);
        }

        return null;
    }

    /**
     * Lấy vị trí giữa (center) của arrow theo world position
     */
    public getArrowCenterWorldPosition(arrowId: string): Vec3 | null {
        const arrow = this.arrows.get(arrowId);
        if (!arrow || arrow.segments.length === 0) return null;

        const midIndex = Math.floor(arrow.segments.length / 2);
        const midSegment = arrow.segments[midIndex];

        const grid2D = this.genGrid.getGrid2D();
        const cell = grid2D[midSegment.row]?.[midSegment.col];
        if (!cell) return null;

        return cell.worldPosition.clone();
    }

}
