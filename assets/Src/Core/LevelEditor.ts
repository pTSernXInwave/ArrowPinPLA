import { _decorator, Component, Node, Prefab, instantiate, UITransform, Graphics, Color, Label, Sprite } from 'cc';
import { NodeInput } from '../Element/NodeInput';
import { LevelData, ArrowPathData, LevelDataHelper } from './LevelData';
const { ccclass, property } = _decorator;

/**
 * Trạng thái của một cell trong editor
 */
interface EditorCell {
    node: Node;
    row: number;
    col: number;
    pathId: string | null;  // Thuộc path nào
    orderInPath: number;    // Thứ tự trong path (-1 nếu không thuộc path nào)
    label: Label | null;    // Label hiển thị số thứ tự
    sprite: Sprite | null;  // Sprite để đổi màu background
}

/**
 * Một path đang edit
 */
interface EditingPath {
    id: string;
    coords: { row: number, col: number }[];
    color: Color;
    lineWidth: number;
}

/**
 * Level Editor Component
 * Dùng để thiết kế level trong editor scene
 */
@ccclass('LevelEditor')
export class LevelEditor extends Component {
    // ========== Grid Setup ==========
    @property({ type: Prefab, tooltip: 'Prefab của grid cell' })
    gridCellPrefab: Prefab = null;

    @property({ tooltip: 'Kích thước mỗi ô grid (pixel)' })
    gridSize: number = 50;

    @property({ tooltip: 'Số cột' })
    columns: number = 9;

    @property({ tooltip: 'Số hàng' })
    rows: number = 9;

    @property({ type: Node, tooltip: 'Container node để chứa grid' })
    gridContainer: Node = null;

    @property({ type: Graphics, tooltip: 'Graphics để vẽ arrows' })
    graphics: Graphics = null;

    @property({ type: Graphics, tooltip: 'Graphics để vẽ grid lines (tạo riêng, đặt dưới arrow graphics)' })
    gridGraphics: Graphics = null;

    // ========== Grid Visual Settings ==========
    @property({ tooltip: 'Hiển thị grid lines' })
    showGridLines: boolean = true;

    @property({ type: Color, tooltip: 'Màu grid lines' })
    gridLineColor: Color = new Color(200, 200, 200, 255);

    @property({ tooltip: 'Độ dày grid lines' })
    gridLineWidth: number = 2;

    @property({ type: Color, tooltip: 'Màu cell bình thường' })
    cellNormalColor: Color = new Color(240, 240, 240, 255);

    @property({ type: Color, tooltip: 'Màu cell khi thuộc path' })
    cellOccupiedColor: Color = new Color(180, 220, 255, 255);

    @property({ type: Color, tooltip: 'Màu cell của path hiện tại' })
    cellCurrentPathColor: Color = new Color(150, 255, 150, 255);

    @property({ tooltip: 'Hiển thị số thứ tự cell trong path' })
    showCellNumbers: boolean = true;

    @property({ tooltip: 'Hiển thị viền cho mỗi cell' })
    showCellBorder: boolean = true;

    @property({ type: Color, tooltip: 'Màu viền cell' })
    cellBorderColor: Color = new Color(150, 150, 150, 255);

    @property({ tooltip: 'Độ dày viền cell' })
    cellBorderWidth: number = 2;

    @property({ tooltip: 'Padding bên trong cell (khoảng cách từ viền đến nội dung)' })
    cellPadding: number = 3;

    // ========== UI Elements ==========
    @property({ tooltip: 'Level ID' })
    levelId: string = 'level-1';

    @property({ tooltip: 'Level Name' })
    levelName: string = 'Level 1';

    @property({ type: Label, tooltip: 'Label hiển thị path hiện tại' })
    currentPathLabel: Label = null;

    @property({ type: Label, tooltip: 'Label hiển thị tổng số paths' })
    totalPathsLabel: Label = null;

    @property({ type: Label, tooltip: 'Label hiển thị output JSON (copy từ console)' })
    jsonOutputLabel: Label = null;

    // ========== Arrow Settings ==========
    @property({ tooltip: 'Độ dày đường vẽ mặc định' })
    defaultLineWidth: number = 8;

    @property({ type: Color, tooltip: 'Màu mặc định cho path mới' })
    defaultPathColor: Color = new Color(0, 0, 0, 255);

    @property({ tooltip: 'Hệ số nhân kích thước arrow head' })
    arrowHeadMultiplier: number = 5;

    // ========== Internal State ==========
    private grid2D: EditorCell[][] = [];
    private paths: Map<string, EditingPath> = new Map();
    private currentPathId: string | null = null;
    private pathCounter: number = 0;

    // Predefined colors for paths
    @property([Color])
    private pathColors: Color[] = [
        new Color(0, 0, 0, 255),       // Đen
        new Color(255, 0, 0, 255),     // Đỏ
        new Color(0, 128, 0, 255),     // Xanh lá
        new Color(0, 0, 255, 255),     // Xanh dương
        new Color(255, 165, 0, 255),   // Cam
        new Color(128, 0, 128, 255),   // Tím
        new Color(0, 128, 128, 255),   // Teal
        new Color(128, 128, 0, 255),   // Olive
    ];

    start() {
        this.generateEditorGrid();
        this.drawGridLines();
        this.createNewPath();
        this.updateUI();
        this.updateAllCellVisuals();
    }

    /**
     * Generate grid cho editor
     */
    private generateEditorGrid() {
        if (!this.gridCellPrefab) {
            console.warn('[LevelEditor] Chưa set gridCellPrefab!');
            return;
        }

        const container = this.gridContainer || this.node;

        // Tính offset để center grid
        const totalWidth = this.columns * this.gridSize;
        const totalHeight = this.rows * this.gridSize;
        const offsetX = -totalWidth / 2 + this.gridSize / 2;
        const offsetY = totalHeight / 2 - this.gridSize / 2;

        this.grid2D = [];

        for (let row = 0; row < this.rows; row++) {
            const rowArray: EditorCell[] = [];

            for (let col = 0; col < this.columns; col++) {
                const cell = instantiate(this.gridCellPrefab);
                cell.setParent(container);

                const x = offsetX + col * this.gridSize;
                const y = offsetY - row * this.gridSize;
                cell.setPosition(x, y, 0);
                cell.name = `EditorCell_${row}_${col}`;

                const cellTransform = cell.getComponent(UITransform);
                if (cellTransform) {
                    cellTransform.setContentSize(this.gridSize, this.gridSize);
                }

                // Lấy hoặc tạo Sprite cho cell
                let sprite = cell.getComponent(Sprite);
                if (!sprite) {
                    sprite = cell.addComponent(Sprite);
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                }

                // Tạo Label để hiển thị số thứ tự
                let labelNode = cell.getChildByName('CellLabel');
                let label: Label = null;
                if (!labelNode) {
                    labelNode = new Node('CellLabel');
                    labelNode.setParent(cell);
                    labelNode.setPosition(0, 0, 0);

                    const labelTransform = labelNode.addComponent(UITransform);
                    labelTransform.setContentSize(this.gridSize, this.gridSize);

                    label = labelNode.addComponent(Label);
                    label.string = '';
                    label.fontSize = 16;
                    label.color = new Color(50, 50, 50, 255);
                    label.horizontalAlign = Label.HorizontalAlign.CENTER;
                    label.verticalAlign = Label.VerticalAlign.CENTER;
                } else {
                    label = labelNode.getComponent(Label);
                }

                // Register touch event
                cell.on(Node.EventType.TOUCH_END, () => this.onCellTap(row, col), this);

                const editorCell: EditorCell = {
                    node: cell,
                    row: row,
                    col: col,
                    pathId: null,
                    orderInPath: -1,
                    label: label,
                    sprite: sprite
                };

                rowArray.push(editorCell);
            }

            this.grid2D.push(rowArray);
        }

        console.log(`[LevelEditor] Generated ${this.rows}x${this.columns} grid`);
    }

    /**
     * Vẽ grid lines và cell borders
     */
    private drawGridLines() {
        if (!this.gridGraphics) return;

        this.gridGraphics.clear();

        const totalWidth = this.columns * this.gridSize;
        const totalHeight = this.rows * this.gridSize;
        const startX = -totalWidth / 2;
        const startY = totalHeight / 2;

        // Vẽ cell borders (viền cho từng ô)
        if (this.showCellBorder) {
            this.gridGraphics.lineWidth = this.cellBorderWidth;
            this.gridGraphics.strokeColor = this.cellBorderColor;

            const padding = this.cellPadding;
            const cellInnerSize = this.gridSize - padding * 2;

            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.columns; col++) {
                    const cellCenterX = startX + col * this.gridSize + this.gridSize / 2;
                    const cellCenterY = startY - row * this.gridSize - this.gridSize / 2;

                    // Vẽ hình chữ nhật viền cho cell
                    const rectX = cellCenterX - cellInnerSize / 2;
                    const rectY = cellCenterY - cellInnerSize / 2;

                    this.gridGraphics.rect(rectX, rectY, cellInnerSize, cellInnerSize);
                }
            }
            this.gridGraphics.stroke();
        }

        // Vẽ grid lines (đường kẻ lớn)
        if (this.showGridLines) {
            this.gridGraphics.lineWidth = this.gridLineWidth;
            this.gridGraphics.strokeColor = this.gridLineColor;

            // Vẽ horizontal lines
            for (let row = 0; row <= this.rows; row++) {
                const y = startY - row * this.gridSize;
                this.gridGraphics.moveTo(startX, y);
                this.gridGraphics.lineTo(startX + totalWidth, y);
            }

            // Vẽ vertical lines
            for (let col = 0; col <= this.columns; col++) {
                const x = startX + col * this.gridSize;
                this.gridGraphics.moveTo(x, startY);
                this.gridGraphics.lineTo(x, startY - totalHeight);
            }

            this.gridGraphics.stroke();
        }
    }

    /**
     * Update visual cho tất cả cells
     */
    private updateAllCellVisuals() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.columns; col++) {
                this.updateCellVisual(row, col);
            }
        }
    }

    /**
     * Update visual cho một cell
     */
    private updateCellVisual(row: number, col: number) {
        const cell = this.grid2D[row]?.[col];
        if (!cell) return;

        // Xác định màu cell
        let cellColor: Color;
        if (cell.pathId === null) {
            // Cell trống
            cellColor = this.cellNormalColor;
        } else if (cell.pathId === this.currentPathId) {
            // Cell thuộc path hiện tại
            cellColor = this.cellCurrentPathColor;
        } else {
            // Cell thuộc path khác
            cellColor = this.cellOccupiedColor;
        }

        // Apply màu cho sprite
        if (cell.sprite) {
            cell.sprite.color = cellColor;
        }

        // Update label
        if (cell.label && this.showCellNumbers) {
            if (cell.pathId !== null && cell.orderInPath >= 0) {
                cell.label.string = `${cell.orderInPath + 1}`;
                cell.label.node.active = true;
            } else {
                cell.label.string = '';
                cell.label.node.active = false;
            }
        }
    }

    /**
     * Xử lý khi tap vào cell
     */
    private onCellTap(row: number, col: number) {
        if (!this.currentPathId) {
            console.warn('[LevelEditor] Chưa có path nào được chọn');
            return;
        }

        const cell = this.grid2D[row][col];
        const currentPath = this.paths.get(this.currentPathId);
        if (!currentPath) return;

        // Nếu cell đã thuộc path hiện tại
        if (cell.pathId === this.currentPathId) {
            // Nếu là cell cuối cùng trong path, xóa nó
            const lastCoord = currentPath.coords[currentPath.coords.length - 1];
            if (lastCoord && lastCoord.row === row && lastCoord.col === col) {
                this.removeLastCellFromPath();
            } else {
                console.log(`[LevelEditor] Cell (${row},${col}) đang ở giữa path, không thể xóa`);
            }
        }
        // Nếu cell thuộc path khác
        else if (cell.pathId !== null) {
            console.log(`[LevelEditor] Cell (${row},${col}) đã thuộc path khác: ${cell.pathId}`);
        }
        // Cell trống - thêm vào path
        else {
            this.addCellToCurrentPath(row, col);
        }

        this.redrawAllPaths();
        this.updateAllCellVisuals();
        this.updateUI();
    }

    /**
     * Thêm cell vào path hiện tại
     */
    private addCellToCurrentPath(row: number, col: number) {
        if (!this.currentPathId) return;

        const currentPath = this.paths.get(this.currentPathId);
        if (!currentPath) return;

        // Check nếu cell có adjacent với cell cuối của path (hoặc path rỗng)
        if (currentPath.coords.length > 0) {
            const lastCoord = currentPath.coords[currentPath.coords.length - 1];
            if (!this.isAdjacent(lastCoord.row, lastCoord.col, row, col)) {
                console.log(`[LevelEditor] Cell (${row},${col}) không adjacent với cell cuối (${lastCoord.row},${lastCoord.col})`);
                return;
            }
        }

        // Thêm vào path
        currentPath.coords.push({ row, col });

        // Update cell state
        const cell = this.grid2D[row][col];
        cell.pathId = this.currentPathId;
        cell.orderInPath = currentPath.coords.length - 1;

        console.log(`[LevelEditor] Added cell (${row},${col}) to path ${this.currentPathId}, total: ${currentPath.coords.length}`);
    }

    /**
     * Xóa cell cuối khỏi path hiện tại
     */
    private removeLastCellFromPath() {
        if (!this.currentPathId) return;

        const currentPath = this.paths.get(this.currentPathId);
        if (!currentPath || currentPath.coords.length === 0) return;

        const removedCoord = currentPath.coords.pop();
        if (removedCoord) {
            const cell = this.grid2D[removedCoord.row][removedCoord.col];
            cell.pathId = null;
            cell.orderInPath = -1;
            console.log(`[LevelEditor] Removed cell (${removedCoord.row},${removedCoord.col}) from path`);
        }
    }

    /**
     * Check nếu 2 cells adjacent (lên/xuống/trái/phải)
     */
    private isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
        const rowDiff = Math.abs(r1 - r2);
        const colDiff = Math.abs(c1 - c2);
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }

    /**
     * Tạo path mới
     */
    public createNewPath() {
        this.pathCounter++;
        const newPathId = `path-${this.pathCounter}`;
        const colorIndex = (this.pathCounter - 1) % this.pathColors.length;

        const newPath: EditingPath = {
            id: newPathId,
            coords: [],
            color: this.pathColors[colorIndex].clone(),
            lineWidth: this.defaultLineWidth
        };

        this.paths.set(newPathId, newPath);
        this.currentPathId = newPathId;

        console.log(`[LevelEditor] Created new path: ${newPathId}`);
        this.updateUI();
    }

    /**
     * Chuyển sang path tiếp theo
     */
    public nextPath() {
        const pathIds = Array.from(this.paths.keys());
        if (pathIds.length === 0) return;

        const currentIndex = pathIds.indexOf(this.currentPathId);
        const nextIndex = (currentIndex + 1) % pathIds.length;
        this.currentPathId = pathIds[nextIndex];

        this.updateUI();
        this.updateAllCellVisuals();
        this.redrawAllPaths();
    }

    /**
     * Chuyển sang path trước đó
     */
    public prevPath() {
        const pathIds = Array.from(this.paths.keys());
        if (pathIds.length === 0) return;

        const currentIndex = pathIds.indexOf(this.currentPathId);
        const prevIndex = currentIndex <= 0 ? pathIds.length - 1 : currentIndex - 1;
        this.currentPathId = pathIds[prevIndex];

        this.updateUI();
        this.updateAllCellVisuals();
        this.redrawAllPaths();
    }

    /**
     * Xóa path hiện tại
     */
    public deleteCurrentPath() {
        if (!this.currentPathId) return;

        const currentPath = this.paths.get(this.currentPathId);
        if (currentPath) {
            // Clear cells
            for (const coord of currentPath.coords) {
                const cell = this.grid2D[coord.row][coord.col];
                cell.pathId = null;
                cell.orderInPath = -1;
            }
        }

        this.paths.delete(this.currentPathId);

        // Chọn path khác
        const pathIds = Array.from(this.paths.keys());
        if (pathIds.length > 0) {
            this.currentPathId = pathIds[0];
        } else {
            this.currentPathId = null;
            this.createNewPath();
        }

        this.redrawAllPaths();
        this.updateAllCellVisuals();
        this.updateUI();
    }

    /**
     * Clear tất cả paths
     */
    public clearAllPaths() {
        // Clear all cells
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.columns; col++) {
                this.grid2D[row][col].pathId = null;
                this.grid2D[row][col].orderInPath = -1;
            }
        }

        this.paths.clear();
        this.pathCounter = 0;
        this.currentPathId = null;

        this.createNewPath();
        this.redrawAllPaths();
        this.updateAllCellVisuals();
        this.updateUI();
    }

    /**
     * Vẽ lại tất cả paths
     */
    private redrawAllPaths() {
        if (!this.graphics) return;

        this.graphics.clear();

        this.paths.forEach((path, pathId) => {
            if (path.coords.length < 2) return;

            // Highlight path hiện tại
            const isCurrentPath = pathId === this.currentPathId;
            const drawColor = isCurrentPath
                ? path.color.clone()
                : new Color(path.color.r, path.color.g, path.color.b, 150);

            this.graphics.lineWidth = path.lineWidth;
            this.graphics.strokeColor = drawColor;
            this.graphics.fillColor = drawColor;
            this.graphics.lineJoin = 1; // ROUND

            // Vẽ đường
            const firstCell = this.grid2D[path.coords[0].row][path.coords[0].col];
            this.graphics.moveTo(firstCell.node.position.x, firstCell.node.position.y);

            for (let i = 1; i < path.coords.length; i++) {
                const cell = this.grid2D[path.coords[i].row][path.coords[i].col];
                this.graphics.lineTo(cell.node.position.x, cell.node.position.y);
            }
            this.graphics.stroke();

            // Vẽ arrow head
            if (path.coords.length >= 2) {
                const lastIdx = path.coords.length - 1;
                const lastCell = this.grid2D[path.coords[lastIdx].row][path.coords[lastIdx].col];
                const secondLastCell = this.grid2D[path.coords[lastIdx - 1].row][path.coords[lastIdx - 1].col];

                this.drawArrowHead(
                    secondLastCell.node.position.x, secondLastCell.node.position.y,
                    lastCell.node.position.x, lastCell.node.position.y,
                    path.lineWidth
                );
            }
        });
    }

    /**
     * Vẽ arrow head
     */
    private drawArrowHead(fromX: number, fromY: number, toX: number, toY: number, lineWidth: number) {
        if (!this.graphics) return;

        const height = lineWidth * this.arrowHeadMultiplier * 0.36;
        const baseWidth = height * 0.8;

        // Direction
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const dirX = dx / len;
        const dirY = dy / len;

        const perpX = -dirY;
        const perpY = dirX;

        const tipX = toX + dirX * height * (2 / 3);
        const tipY = toY + dirY * height * (2 / 3);

        const baseCenterX = toX - dirX * height * (1 / 3);
        const baseCenterY = toY - dirY * height * (1 / 3);

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
     * Update UI labels
     */
    private updateUI() {
        if (this.currentPathLabel) {
            const currentPath = this.currentPathId ? this.paths.get(this.currentPathId) : null;
            const coordCount = currentPath ? currentPath.coords.length : 0;

            // Tính index của path hiện tại
            const pathIds = Array.from(this.paths.keys());
            const currentIndex = pathIds.indexOf(this.currentPathId) + 1;

            this.currentPathLabel.string = `Path ${currentIndex}/${this.paths.size} (${coordCount} cells)`;
        }

        if (this.totalPathsLabel) {
            // Đếm số paths hợp lệ (có >= 2 cells)
            let validPaths = 0;
            this.paths.forEach(path => {
                if (path.coords.length >= 2) validPaths++;
            });
            this.totalPathsLabel.string = `Valid Paths: ${validPaths} / Total: ${this.paths.size}`;
        }
    }

    /**
     * Export level data sang JSON
     */
    public exportToJSON(): string {
        const levelData: LevelData = {
            levelId: this.levelId,
            levelName: this.levelName,
            gridRows: this.rows,
            gridCols: this.columns,
            gridSize: this.gridSize,
            paths: []
        };

        // Convert paths
        this.paths.forEach((path, pathId) => {
            if (path.coords.length >= 2) {
                levelData.paths.push({
                    id: pathId,
                    coords: [...path.coords],
                    color: LevelDataHelper.colorToObject(path.color),
                    lineWidth: path.lineWidth
                });
            }
        });

        const json = LevelDataHelper.toJSON(levelData);

        // Show in label if available
        if (this.jsonOutputLabel) {
            this.jsonOutputLabel.string = json;
        }

        // Copy to clipboard (if supported)
        console.log('[LevelEditor] Exported JSON:');
        console.log(json);

        return json;
    }

    /**
     * Import level data từ JSON string
     */
    public importFromJSON(jsonString: string) {
        const levelData = LevelDataHelper.fromJSON(jsonString);
        if (!levelData) {
            console.error('[LevelEditor] Failed to import JSON');
            return;
        }

        // Clear current data
        this.clearAllPaths();

        // Update grid size if different
        if (levelData.gridRows !== this.rows || levelData.gridCols !== this.columns) {
            console.warn(`[LevelEditor] Grid size mismatch. Expected ${this.rows}x${this.columns}, got ${levelData.gridRows}x${levelData.gridCols}`);
        }

        // Update level info
        this.levelId = levelData.levelId;
        this.levelName = levelData.levelName;

        // Import paths
        for (const pathData of levelData.paths) {
            const path: EditingPath = {
                id: pathData.id,
                coords: [...pathData.coords],
                color: LevelDataHelper.objectToColor(pathData.color),
                lineWidth: pathData.lineWidth
            };

            this.paths.set(pathData.id, path);

            // Update cell states
            for (let i = 0; i < pathData.coords.length; i++) {
                const coord = pathData.coords[i];
                if (coord.row < this.rows && coord.col < this.columns) {
                    const cell = this.grid2D[coord.row][coord.col];
                    cell.pathId = pathData.id;
                    cell.orderInPath = i;
                }
            }

            // Update path counter
            const match = pathData.id.match(/path-(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > this.pathCounter) this.pathCounter = num;
            }
        }

        // Select first path
        const pathIds = Array.from(this.paths.keys());
        if (pathIds.length > 0) {
            this.currentPathId = pathIds[0];
        }

        this.redrawAllPaths();
        this.updateAllCellVisuals();
        this.updateUI();

        console.log(`[LevelEditor] Imported level: ${levelData.levelId} with ${levelData.paths.length} paths`);
    }

    /**
     * Button callback: Export JSON
     */
    public onExportButtonClick() {
        this.exportToJSON();
    }

    /**
     * Button callback: New Path - Tạo path mới và tách riêng khỏi path hiện tại
     */
    public onNewPathButtonClick() {
        // Kiểm tra path hiện tại có ít nhất 2 cells không (để là path hợp lệ)
        if (this.currentPathId) {
            const currentPath = this.paths.get(this.currentPathId);
            if (currentPath && currentPath.coords.length < 2) {
                console.log(`[LevelEditor] Path hiện tại chưa đủ 2 cells, xóa path rỗng`);
                // Xóa path rỗng
                this.deleteCurrentPath();
            }
        }

        // Tạo path mới
        this.createNewPath();
        this.redrawAllPaths();
        this.updateAllCellVisuals();

        console.log(`[LevelEditor] Đã tạo path mới: ${this.currentPathId}, tổng: ${this.paths.size} paths`);
    }

    /**
     * Button callback: Delete Current Path
     */
    public onDeletePathButtonClick() {
        this.deleteCurrentPath();
    }

    /**
     * Button callback: Clear All
     */
    public onClearAllButtonClick() {
        this.clearAllPaths();
    }

    /**
     * Button callback: Next Path
     */
    public onNextPathButtonClick() {
        this.nextPath();
    }

    /**
     * Button callback: Prev Path
     */
    public onPrevPathButtonClick() {
        this.prevPath();
    }

    /**
     * Button callback: Import JSON từ clipboard/console
     * Gọi method này và truyền JSON string vào
     */
    public onImportButtonClick() {
        // Hướng dẫn user paste JSON vào console
        console.log('='.repeat(50));
        console.log('[LevelEditor] Để import JSON, gọi trong console:');
        console.log('cc.find("Canvas/LevelEditor").getComponent("LevelEditor").importFromJSON(\'YOUR_JSON_HERE\')');
        console.log('='.repeat(50));
    }

    /**
     * Test import với sample data
     */
    public onTestImportClick() {
        const sampleJson = `{
            "levelId": "test-level",
            "levelName": "Test Level",
            "gridRows": ${this.rows},
            "gridCols": ${this.columns},
            "gridSize": ${this.gridSize},
            "paths": [
                {
                    "id": "path-1",
                    "coords": [
                        {"row": 1, "col": 1},
                        {"row": 1, "col": 2},
                        {"row": 1, "col": 3},
                        {"row": 2, "col": 3},
                        {"row": 3, "col": 3}
                    ],
                    "color": {"r": 0, "g": 0, "b": 0, "a": 255},
                    "lineWidth": 8
                }
            ]
        }`;
        this.importFromJSON(sampleJson);
    }
}
