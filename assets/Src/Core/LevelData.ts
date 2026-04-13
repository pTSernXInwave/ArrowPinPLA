import { _decorator, Color } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Data cho một arrow path
 */
export interface ArrowPathData {
    id: string;
    coords: { row: number, col: number }[];
    color: { r: number, g: number, b: number, a: number };
    lineWidth: number;
    /** Target position (world coordinates) - arrow sẽ di chuyển theo outer lane đến đây */
    targetPosition?: { x: number, y: number };
}

/**
 * Data cho một level
 */
export interface LevelData {
    levelId: string;
    levelName: string;
    gridRows: number;
    gridCols: number;
    gridSize: number;
    paths: ArrowPathData[];
    /** Vị trí các stone trên grid (bị arrow chặn) */
    stones?: { row: number, col: number }[];
    /** Số stone cần clear để win */
    requiredClearCount?: number;
}

/**
 * Helper class để convert giữa LevelData và Cocos types
 */
export class LevelDataHelper {
    /**
     * Convert Color sang plain object để serialize
     */
    static colorToObject(color: Color): { r: number, g: number, b: number, a: number } {
        return {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a
        };
    }

    /**
     * Convert plain object sang Color
     */
    static objectToColor(obj: { r: number, g: number, b: number, a: number }): Color {
        return new Color(obj.r, obj.g, obj.b, obj.a);
    }

    /**
     * Tạo LevelData mới (empty)
     */
    static createEmpty(levelId: string, rows: number = 9, cols: number = 9, gridSize: number = 50): LevelData {
        return {
            levelId: levelId,
            levelName: `Level ${levelId}`,
            gridRows: rows,
            gridCols: cols,
            gridSize: gridSize,
            paths: []
        };
    }

    /**
     * Validate LevelData
     */
    static validate(data: LevelData): boolean {
        if (!data.levelId || !data.paths) return false;
        if (data.gridRows <= 0 || data.gridCols <= 0) return false;

        for (const path of data.paths) {
            if (!path.id || !path.coords || path.coords.length < 2) {
                return false;
            }
            // Check coords trong bounds
            for (const coord of path.coords) {
                if (coord.row < 0 || coord.row >= data.gridRows ||
                    coord.col < 0 || coord.col >= data.gridCols) {
                    console.warn(`[LevelData] Coord (${coord.row}, ${coord.col}) out of bounds`);
                    return false;
                }
            }
        }
        // Validate stone positions if present
        if (data.stones) {
            for (const stone of data.stones) {
                if (stone.row < 0 || stone.row >= data.gridRows ||
                    stone.col < 0 || stone.col >= data.gridCols) {
                    console.warn(`[LevelData] Stone (${stone.row}, ${stone.col}) out of bounds`);
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Convert LevelData sang JSON string
     */
    static toJSON(data: LevelData): string {
        return JSON.stringify(data, null, 2);
    }

    /**
     * Parse JSON string sang LevelData
     */
    static fromJSON(json: string): LevelData | null {
        try {
            const data = JSON.parse(json) as LevelData;
            if (this.validate(data)) {
                return data;
            }
            console.error('[LevelData] Invalid level data');
            return null;
        } catch (e) {
            console.error('[LevelData] Failed to parse JSON:', e);
            return null;
        }
    }
}
