import { _decorator, Component, Node, EventTouch } from 'cc';
import {GameManager} from "db://assets/PLAGameFoundation/gameControl/core/manager/gameManager";
import {Constant} from "db://assets/constant/constant";
import {GameControl} from "db://assets/Src/Core/GameControl";
import gameEndHandler from "db://assets/PLAGameFoundation/gameControl/utilities/handler/gameEndHandler";
const { ccclass, property } = _decorator;

/**
 * Cell occupancy data
 */
interface CellOccupancy {
    arrowId: string | null;
    segmentType: 'head' | 'body' | 'tail' | null;
    segmentIndex: number;  // Position in arrow (0 = head, n = tail)
}

/**
 * NodeInput - Marks grid cells and tracks arrow occupancy
 * Attached to each grid cell node to track which arrow occupies it
 */
@ccclass('NodeInput')
export class NodeInput extends Component {
    // Grid coordinates (set by GenGridInput during generation)
    @property
    public row: number = -1;
    @property
    public col: number = -1;

    // Occupancy tracking
    private occupancy: CellOccupancy = {
        arrowId: null,
        segmentType: null,
        segmentIndex: -1
    };

    // Reference to controller (set after grid generation)
    private arrowController: any = null;  // Type: ArrowChainController

    /**
     * Initialize touch handling
     */
    onLoad() {
        // Register touch event
        this.node.on(Node.EventType.TOUCH_END, this.onTap, this);
    }

    /**
     * Cleanup
     */
    onDestroy() {
        this.node.off(Node.EventType.TOUCH_END, this.onTap, this);
    }

    /**
     * Handle tap on this cell
     */
    private onTap(event: EventTouch): void {
        console.log("TAPPP", event)
        if (GameControl.instance && !GameControl.instance.checkCanTouch) return;
        // // Gọi onFirstTap nếu là lần tap đầu tiên (kích hoạt Boss di chuyển)
        // if (!GameControl.instance.checkFirstTap) {
        //     // GameControl.instance.onFirstTap();
        // }

        // GameManager.instance.audioManager.playSound(Constant.AUDIO_NAME.CLICK);
        if (this.occupancy.arrowId && this.arrowController) {
            // Start the arrow moving
            this.arrowController.startMoving(this.occupancy.arrowId);
        } else if (!this.occupancy.arrowId) {
            // console.log(`[NodeInput] ✗ Tapped cell (${this.row},${this.col}) - Empty cell, no arrow here`);
        } else if (!this.arrowController) {
            console.error(`[NodeInput] ✗ Tapped cell (${this.row},${this.col}) - ArrowController NOT SET!`);
        }
    }

    /**
     * Set reference to arrow controller
     */
    public setArrowController(controller: any): void {
        this.arrowController = controller;
    }

    /**
     * Check if cell is occupied by any arrow
     */
    public isOccupied(): boolean {
        return this.occupancy.arrowId !== null;
    }

    /**
     * Get arrow ID occupying this cell
     */
    public getOccupyingArrow(): string | null {
        return this.occupancy.arrowId;
    }

    /**
     * Get segment type at this cell
     */
    public getSegmentType(): 'head' | 'body' | 'tail' | null {
        return this.occupancy.segmentType;
    }

    /**
     * Get segment index
     */
    public getSegmentIndex(): number {
        return this.occupancy.segmentIndex;
    }

    /**
     * Mark cell as occupied by an arrow segment
     */
    public occupy(arrowId: string, segmentType: 'head' | 'body' | 'tail', segmentIndex: number): void {
        this.occupancy.arrowId = arrowId;
        this.occupancy.segmentType = segmentType;
        this.occupancy.segmentIndex = segmentIndex;
    }

    /**
     * Release cell (mark as empty)
     */
    public release(): void {
        this.occupancy.arrowId = null;
        this.occupancy.segmentType = null;
        this.occupancy.segmentIndex = -1;
    }

    /**
     * Check if a specific arrow can move to this cell
     * Returns true if:
     * - Cell is empty, OR
     * - Cell is occupied by same arrow's tail (which will move away)
     */
    public canMoveTo(arrowId: string): boolean {
        // Cell is empty - can move
        if (!this.isOccupied()) {
            return true;
        }

        // Cell occupied by same arrow's tail - can move (tail will shift away)
        if (this.occupancy.arrowId === arrowId && this.occupancy.segmentType === 'tail') {
            return true;
        }

        // Cell occupied by different arrow or same arrow's head/body - cannot move
        return false;
    }

    /**
     * Get full occupancy data (for debugging)
     */
    public getOccupancyData(): CellOccupancy {
        return { ...this.occupancy };
    }

    /**
     * Debug info
     */
    public debugInfo(): string {
        if (!this.isOccupied()) {
            return `Cell (${this.row},${this.col}): Empty`;
        }
        return `Cell (${this.row},${this.col}): ${this.occupancy.arrowId} - ${this.occupancy.segmentType} [${this.occupancy.segmentIndex}]`;
    }
}
