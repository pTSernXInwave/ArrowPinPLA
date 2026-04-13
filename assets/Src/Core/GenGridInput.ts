import { _decorator, Component, Node, Prefab, instantiate, UITransform, Vec3, Graphics, Color, Vec2 } from 'cc';
import { NodeInput } from '../Element/NodeInput';
const { ccclass, property } = _decorator;

/**
 * Data structure cho một path
 */
export interface PathData {
    id: string;
    coords: { row: number, col: number }[];
    color: Color;
    lineWidth: number;
    drawArrow: boolean;
}

/**
 * Component để generate grid các node UI phủ lên một mặt của cube
 * Mỗi ô grid có kích thước 50x50
 */
@ccclass('GenGridInput')
export class GenGridInput extends Component {
    @property({ type: Prefab, tooltip: 'Prefab của grid cell (node empty 50x50)' })
    gridCellPrefab: Prefab = null;

    @property({ tooltip: 'Kích thước mỗi ô grid (pixel)' })
    gridSize: number = 50;

    @property({ tooltip: 'Số cột (để tính tự động nếu = 0)' })
    columns: number = 0;

    @property({ tooltip: 'Số hàng (để tính tự động nếu = 0)' })
    rows: number = 0;

    @property({ tooltip: 'Auto generate khi start' })
    autoGenerate: boolean = true;

    @property({ tooltip: 'Container node để chứa grid (nếu null sẽ dùng node hiện tại)' })
    containerNode: Node = null;

    @property({ type: Graphics, tooltip: 'Graphics component để vẽ đường (lấy từ node hiện tại)' })
    graphics: Graphics = null;

    @property({ tooltip: 'Độ dày đường vẽ' })
    lineWidth: number = 3;

    @property({ type: Color, tooltip: 'Màu đường vẽ' })
    lineColor: Color = new Color(255, 255, 255, 255);

    @property({ tooltip: 'Kích thước mũi tên (tam giác cuối đường)' })
    arrowSize: number = 15;

    @property({ tooltip: 'Mũi tên tự động scale theo lineWidth (nếu tắt thì dùng arrowSize cố định)' })
    arrowScaleWithLine: boolean = true;

    @property({ tooltip: 'Hệ số nhân: ArrowSize = lineWidth × hệ số này (khi bật arrowScaleWithLine)' })
    arrowScaleMultiplier: number = 3.0;

    @property({ tooltip: 'Tỷ lệ độ rộng đáy tam giác (0.5 = hẹp, 1.0 = rộng)', range: [0.3, 1.5, 0.1] })
    arrowBaseWidthRatio: number = 0.8;

    @property({ tooltip: 'Debug: In ra size mũi tên (để kiểm tra)' })
    debugArrowSize: boolean = false;

    // Danh sách các grid cell
    private listGrid: Node[] = [];
    private listGrid2Side: Node[][] = [];

    // Lưu trữ nhiều paths
    private pathList: PathData[] = [];

    onLoad() {
        if (this.autoGenerate) {
            this.generateGrid();
        }
    }

    /**
     * Generate grid tự động
     */
    public generateGrid() {
        if (!this.gridCellPrefab) {
            console.warn('GenGridInput: Chưa set gridCellPrefab!');
            return;
        }

        // Clear grid cũ nếu có
        this.clearGrid();

        // Lấy container (nếu không set thì dùng node hiện tại)
        const container = this.containerNode || this.node;

        // Lấy kích thước của container (face)
        const containerTransform = container.getComponent(UITransform);
        if (!containerTransform) {
            console.warn('GenGridInput: Container không có UITransform!');
            return;
        }

        const containerWidth = containerTransform.width;
        const containerHeight = containerTransform.height;

        // Tính số hàng và cột (nếu chưa set thì tính tự động)
        const cols = this.columns > 0 ? this.columns : Math.floor(containerWidth / this.gridSize);
        const rows = this.rows > 0 ? this.rows : Math.floor(containerHeight / this.gridSize);


        // Tính offset để center grid
        const totalWidth = cols * this.gridSize;
        const totalHeight = rows * this.gridSize;
        const offsetX = -totalWidth / 2 + this.gridSize / 2;
        const offsetY = totalHeight / 2 - this.gridSize / 2;

        // Generate grid
        this.listGrid2Side = [];

        for (let row = 0; row < rows; row++) {
            const rowArray: Node[] = [];

            for (let col = 0; col < cols; col++) {
                // Instantiate prefab
                const cell = instantiate(this.gridCellPrefab);

                // Set parent
                cell.setParent(container);

                // Set position
                const x = offsetX + col * this.gridSize;
                const y = offsetY - row * this.gridSize;
                cell.setPosition(x, y, 0);

                // Set name để dễ debug
                cell.name = `GridCell_${row}_${col}`;

                // Đảm bảo UITransform có kích thước đúng
                const cellTransform = cell.getComponent(UITransform);
                if (cellTransform) {
                    cellTransform.setContentSize(this.gridSize, this.gridSize);
                }

                // Setup NodeInput component
                let nodeInput = cell.getComponent(NodeInput);
                if (!nodeInput) {
                    nodeInput = cell.addComponent(NodeInput);
                }
                // Set grid coordinates
                nodeInput.row = row;
                nodeInput.col = col;

                // Lưu vào mảng
                this.listGrid.push(cell);
                rowArray.push(cell);
            }

            this.listGrid2Side.push(rowArray);
        }

    }

    /**
     * Clear toàn bộ grid
     */
    /**
     * Sync rows/columns from level config then regenerate grid
     */
    public setGridSizeFromLevelConfig(levelRows: number, levelCols: number, forceRegenerate: boolean = false) {
        const nextRows = Math.max(0, Math.floor(levelRows));
        const nextCols = Math.max(0, Math.floor(levelCols));

        const currentRows = this.listGrid2Side.length;
        const currentCols = currentRows > 0 ? this.listGrid2Side[0].length : 0;
        const hasExistingGrid = this.listGrid.length > 0;
        const sameDimension = currentRows === nextRows && currentCols === nextCols;

        this.rows = nextRows;
        this.columns = nextCols;

        if (forceRegenerate || !hasExistingGrid || !sameDimension) {
            this.generateGrid();
        }
    }
    public clearGrid() {
        // Destroy tất cả các node
        for (const cell of this.listGrid) {
            if (cell && cell.isValid) {
                cell.destroy();
            }
        }

        // Clear arrays
        this.listGrid = [];
        this.listGrid2Side = [];
    }

    /**
     * Lấy grid cell tại vị trí (row, col)
     */
    public getCell(row: number, col: number): Node | null {
        if (row >= 0 && row < this.listGrid2Side.length) {
            if (col >= 0 && col < this.listGrid2Side[row].length) {
                return this.listGrid2Side[row][col];
            }
        }
        return null;
    }

    /**
     * Lấy tất cả grid cells dưới dạng mảng 1D
     */
    public getAllCells(): Node[] {
        return this.listGrid;
    }

    /**
     * Lấy tất cả grid cells dưới dạng mảng 2D
     */
    public getGrid2D(): Node[][] {
        return this.listGrid2Side;
    }

    /**
     * Lấy số hàng
     */
    public getRows(): number {
        return this.listGrid2Side.length;
    }

    /**
     * Lấy số cột
     */
    public getColumns(): number {
        return this.listGrid2Side.length > 0 ? this.listGrid2Side[0].length : 0;
    }

    /**
     * Vẽ mũi tên (tam giác) từ điểm from đến điểm to
     * Tâm tam giác (centroid) sẽ trùng với điểm to
     */
    private drawArrowHead(from: Vec3, to: Vec3) {
        if (!this.graphics) return;

        // Tính kích thước mũi tên
        let actualArrowSize = this.arrowSize;

        if (this.arrowScaleWithLine) {
            // Nếu bật auto scale: size = lineWidth × multiplier
            actualArrowSize = this.graphics.lineWidth * this.arrowScaleMultiplier;
        }
        // Nếu tắt auto scale: dùng arrowSize cố định

        // Debug log
        // if (this.debugArrowSize) {
        //     console.log(`Arrow Size: ${actualArrowSize} (lineWidth: ${this.graphics.lineWidth}, multiplier: ${this.arrowScaleMultiplier}, scaleEnabled: ${this.arrowScaleWithLine})`);
        // }

        // Tính hướng từ from -> to
        const direction = new Vec2(to.x - from.x, to.y - from.y);
        direction.normalize();

        // Tính góc quay
        const angle = Math.atan2(direction.y, direction.x);

        // Vector vuông góc với direction (để tính base)
        const perpX = -direction.y;
        const perpY = direction.x;

        // Tính tâm tam giác (centroid)
        // Centroid cách đỉnh 2/3 chiều cao, cách đáy 1/3 chiều cao
        const height = actualArrowSize;                              // Chiều cao tam giác
        const baseWidth = actualArrowSize * this.arrowBaseWidthRatio; // Chiều rộng đáy

        // Centroid cách tip 2/3 chiều cao
        const centerX = to.x - direction.x * height * (2/3);
        const centerY = to.y - direction.y * height * (2/3);

        // Đỉnh tam giác (tip)
        const tipX = to.x;
        const tipY = to.y;

        // 2 đỉnh đáy: cách centroid 1/3 chiều cao về phía sau
        const baseBackDist = height * (1/3);
        const baseCenterX = centerX - direction.x * baseBackDist;
        const baseCenterY = centerY - direction.y * baseBackDist;

        // 2 điểm đáy cách nhau baseWidth, vuông góc với direction
        const base1X = baseCenterX + perpX * baseWidth / 2;
        const base1Y = baseCenterY + perpY * baseWidth / 2;

        const base2X = baseCenterX - perpX * baseWidth / 2;
        const base2Y = baseCenterY - perpY * baseWidth / 2;

        // Vẽ tam giác đặc
        this.graphics.moveTo(tipX, tipY);
        this.graphics.lineTo(base1X, base1Y);
        this.graphics.lineTo(base2X, base2Y);
        this.graphics.close();
        this.graphics.fill();
    }

    /**
     * Xóa toàn bộ vẽ (cả single path và multi paths)
     */
    public clearDrawing() {
        if (this.graphics) {
            this.graphics.clear();
        }
        this.pathList = [];
    }

    // ============================================
    // MULTI-PATH SUPPORT (Vẽ nhiều đường cùng lúc)
    // ============================================

    /**
     * Thêm một path vào danh sách (chưa vẽ ngay)
     * @param id ID của path (để quản lý)
     * @param coords Tọa độ đường đi
     * @param color Màu đường (optional, dùng default nếu không có)
     * @param lineWidth Độ dày đường (optional)
     * @param drawArrow Có vẽ mũi tên không (default: true)
     */
    public addPath(
        id: string,
        coords: { row: number, col: number }[],
        color?: Color,
        lineWidth?: number,
        drawArrow: boolean = true
    ) {
        // Xóa path cũ có cùng ID (nếu có)
        this.removePath(id);

        // Thêm path mới
        this.pathList.push({
            id: id,
            coords: coords,
            color: color || this.lineColor.clone(),
            lineWidth: lineWidth || this.lineWidth,
            drawArrow: drawArrow
        });

        // Đánh dấu occupancy cho các cells trong path
        this.setPathOccupancy(id, coords);
    }

    /**
     * Đánh dấu occupancy cho các cells trong path
     */
    private setPathOccupancy(pathId: string, coords: { row: number, col: number }[]) {
        for (let i = 0; i < coords.length; i++) {
            const coord = coords[i];
            const cell = this.getCell(coord.row, coord.col);

            if (!cell) {
                console.warn(`[GenGridInput] Cell (${coord.row}, ${coord.col}) not found for path ${pathId}`);
                continue;
            }

            const nodeInput = cell.getComponent(NodeInput);
            if (!nodeInput) {
                console.warn(`[GenGridInput] NodeInput not found at (${coord.row}, ${coord.col})`);
                continue;
            }

            // Determine segment type
            let segmentType: 'head' | 'body' | 'tail';
            if (i === 0) {
                segmentType = 'head';
            } else if (i === coords.length - 1) {
                segmentType = 'tail';
            } else {
                segmentType = 'body';
            }

            // Occupy cell
            nodeInput.occupy(pathId, segmentType, i);
        }

    }

    /**
     * Xóa một path theo ID
     */
    public removePath(id: string) {
        const index = this.pathList.findIndex(p => p.id === id);
        if (index >= 0) {
            const path = this.pathList[index];
            // Release occupancy
            this.releasePathOccupancy(path.coords);
            // Remove from list
            this.pathList.splice(index, 1);
        }
    }

    /**
     * Release occupancy cho các cells trong path
     */
    private releasePathOccupancy(coords: { row: number, col: number }[]) {
        for (const coord of coords) {
            const cell = this.getCell(coord.row, coord.col);
            if (cell) {
                const nodeInput = cell.getComponent(NodeInput);
                if (nodeInput) {
                    nodeInput.release();
                }
            }
        }
    }

    /**
     * Vẽ tất cả paths đã thêm
     */
    public drawAllPaths() {
        if (!this.graphics) {
            console.warn('GenGridInput: Chưa set Graphics component!');
            return;
        }

        // Clear trước
        this.graphics.clear();

        // Vẽ từng path
        for (const pathData of this.pathList) {
            this.drawSinglePath(pathData);
        }
    }

    /**
     * Vẽ một path cụ thể (internal)
     */
    private drawSinglePath(pathData: PathData) {
        if (!this.graphics || pathData.coords.length < 2) return;

        // Convert coords to cells
        const cells: Node[] = [];
        for (const coord of pathData.coords) {
            const cell = this.getCell(coord.row, coord.col);
            if (cell) {
                cells.push(cell);
            }
        }

        if (cells.length < 2) return;

        // Lấy vị trí các điểm
        const points: Vec3[] = cells.map(cell => cell.position.clone());

        // Set style cho path này
        this.graphics.lineWidth = pathData.lineWidth;
        this.graphics.strokeColor = pathData.color;
        this.graphics.fillColor = pathData.color;

        // Vẽ đường
        this.graphics.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.graphics.lineTo(points[i].x, points[i].y);
        }
        this.graphics.stroke();

        // Vẽ mũi tên
        if (pathData.drawArrow && points.length >= 2) {
            const lastPoint = points[points.length - 1];
            const secondLastPoint = points[points.length - 2];
            this.drawArrowHead(secondLastPoint, lastPoint);
        }
    }

    /**
     * Xóa tất cả paths
     */
    public clearAllPaths() {
        // Release all occupancies
        for (const path of this.pathList) {
            this.releasePathOccupancy(path.coords);
        }

        this.pathList = [];
        this.clearDrawing();
    }

    /**
     * Lấy số lượng paths hiện có
     */
    public getPathCount(): number {
        return this.pathList.length;
    }

    /**
     * SHORTCUT: Thêm path và vẽ ngay
     * @param id ID path
     * @param coords Tọa độ
     * @param color Màu (optional)
     * @param lineWidth Độ dày (optional)
     * @param drawArrow Vẽ mũi tên (default: true)
     */
    public addAndDrawPath(
        id: string,
        coords: { row: number, col: number }[],
        color?: Color,
        lineWidth?: number,
        drawArrow: boolean = true
    ) {
        this.addPath(id, coords, color, lineWidth, drawArrow);
        this.drawAllPaths();
    }

    /**
     * SHORTCUT: Xóa path và vẽ lại
     */
    public removeAndRedraw(id: string) {
        this.removePath(id);
        this.drawAllPaths();
    }

    /**
     * Lấy tất cả paths (để controller sử dụng)
     */
    public getAllPaths(): PathData[] {
        return this.pathList;
    }

    /**
     * Lấy path theo ID
     */
    public getPath(id: string): PathData | null {
        return this.pathList.find(p => p.id === id) || null;
    }

    /**
     * Update coords của path (chỉ để vẽ lại, không động vào occupancy)
     * Dùng cho movement system
     */
    public updatePathCoords(pathId: string, newCoords: { row: number, col: number }[]) {
        const path = this.pathList.find(p => p.id === pathId);
        if (path) {
            path.coords = newCoords;
        }
    }

}



