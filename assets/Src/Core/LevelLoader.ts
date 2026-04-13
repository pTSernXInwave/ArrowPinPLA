import { _decorator, Component, Node, JsonAsset, resources, Color } from 'cc';
import { GenGridInput } from './GenGridInput';
import { GenMultiPathArrow } from './GenMultiPathArrow';
import { LevelData, LevelDataHelper, ArrowPathData } from './LevelData';
const { ccclass, property } = _decorator;

/**
 * LevelLoader - Load và generate arrows từ LevelData JSON
 */
@ccclass('LevelLoader')
export class LevelLoader extends Component {
    @property({ type: GenGridInput, tooltip: 'Reference đến GenGridInput' })
    genGrid: GenGridInput = null;

    @property({ type: GenMultiPathArrow, tooltip: 'Reference đến GenMultiPathArrow' })
    arrowController: GenMultiPathArrow = null;

    @property({ tooltip: 'Auto load level khi start' })
    autoLoadOnStart: boolean = false;

    @property({ tooltip: 'Level ID để auto load' })
    autoLoadLevelId: string = 'level-1';

    @property({ tooltip: 'Folder chứa level JSON files trong resources' })
    levelFolder: string = 'Levels';

    // Cache loaded levels
    private loadedLevels: Map<string, LevelData> = new Map();
    private currentLevelId: string = null;

    start() {
        if (this.autoLoadOnStart && this.autoLoadLevelId) {
            this.loadLevel(this.autoLoadLevelId);
        }
    }

    /**
     * Load level từ resources folder
     * @param levelId ID của level (tên file JSON không có extension)
     */
    public loadLevel(levelId: string, callback?: (success: boolean) => void) {
        // Check cache first
        if (this.loadedLevels.has(levelId)) {
            const levelData = this.loadedLevels.get(levelId);
            this.applyLevelData(levelData);
            callback?.(true);
            return;
        }

        // Load from resources
        const path = `${this.levelFolder}/${levelId}`;
        resources.load(path, JsonAsset, (err, jsonAsset) => {
            if (err) {
                console.error(`[LevelLoader] Failed to load level: ${levelId}`, err);
                callback?.(false);
                return;
            }

            const levelData = jsonAsset.json as LevelData;

            // Validate
            if (!LevelDataHelper.validate(levelData)) {
                console.error(`[LevelLoader] Invalid level data: ${levelId}`);
                callback?.(false);
                return;
            }

            // Cache it
            this.loadedLevels.set(levelId, levelData);

            // Apply
            this.applyLevelData(levelData);
            callback?.(true);
        });
    }

    /**
     * Load level từ JSON string trực tiếp
     */
    public loadLevelFromJSON(jsonString: string, callback?: (success: boolean) => void) {
        const levelData = LevelDataHelper.fromJSON(jsonString);
        if (!levelData) {
            console.error('[LevelLoader] Failed to parse JSON');
            callback?.(false);
            return;
        }

        // Cache it
        this.loadedLevels.set(levelData.levelId, levelData);

        // Apply
        this.applyLevelData(levelData);
        callback?.(true);
    }

    /**
     * Load level từ LevelData object trực tiếp
     */
    public loadLevelFromData(levelData: LevelData) {
        if (!LevelDataHelper.validate(levelData)) {
            console.error('[LevelLoader] Invalid level data');
            return;
        }

        this.loadedLevels.set(levelData.levelId, levelData);
        this.applyLevelData(levelData);
    }

    /**
     * Apply LevelData vào GenGridInput và GenMultiPathArrow
     */
    private applyLevelData(levelData: LevelData) {
        if (!this.genGrid) {
            console.error('[LevelLoader] GenGridInput not set');
            return;
        }

        console.log(`[LevelLoader] Applying level: ${levelData.levelId} (${levelData.levelName})`);

        this.currentLevelId = levelData.levelId;

        // Clear existing paths
        this.genGrid.clearAllPaths();

        // Add paths từ level data
        for (const pathData of levelData.paths) {
            const color = LevelDataHelper.objectToColor(pathData.color);

            this.genGrid.addPath(
                pathData.id,
                pathData.coords,
                color,
                pathData.lineWidth,
                true  // drawArrow
            );
        }

        // Draw all paths
        this.genGrid.drawAllPaths();

        // Notify arrow controller to sync
        if (this.arrowController) {
            // Use scheduleOnce to ensure grid is ready
            this.scheduleOnce(() => {
                this.arrowController.resetGame();
            }, 0.1);
        }

        console.log(`[LevelLoader] Level loaded with ${levelData.paths.length} paths`);
    }

    /**
     * Get current level ID
     */
    public getCurrentLevelId(): string {
        return this.currentLevelId;
    }

    /**
     * Get cached level data
     */
    public getLevelData(levelId: string): LevelData | null {
        return this.loadedLevels.get(levelId) || null;
    }

    /**
     * Clear cache
     */
    public clearCache() {
        this.loadedLevels.clear();
    }

    /**
     * Preload multiple levels
     */
    public preloadLevels(levelIds: string[], callback?: (loaded: number, total: number) => void) {
        let loadedCount = 0;
        const total = levelIds.length;

        for (const levelId of levelIds) {
            this.loadLevelToCache(levelId, () => {
                loadedCount++;
                callback?.(loadedCount, total);
            });
        }
    }

    /**
     * Load level vào cache (không apply)
     */
    private loadLevelToCache(levelId: string, callback?: () => void) {
        if (this.loadedLevels.has(levelId)) {
            callback?.();
            return;
        }

        const path = `${this.levelFolder}/${levelId}`;
        resources.load(path, JsonAsset, (err, jsonAsset) => {
            if (!err && jsonAsset) {
                const levelData = jsonAsset.json as LevelData;
                if (LevelDataHelper.validate(levelData)) {
                    this.loadedLevels.set(levelId, levelData);
                }
            }
            callback?.();
        });
    }

    /**
     * Reload current level
     */
    public reloadCurrentLevel() {
        if (this.currentLevelId) {
            const levelData = this.loadedLevels.get(this.currentLevelId);
            if (levelData) {
                this.applyLevelData(levelData);
            }
        }
    }
}
