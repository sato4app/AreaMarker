import { CoordinateUtils } from './Coordinates.js';

/**
 * ドラッグ&ドロップ機能を管理するクラス
 */
export class DragDropHandler {
    constructor() {
        this.isDragging = false;
        this.draggedObjectType = null;  // 'point' | 'vertex'
        this.draggedObjectIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // ドラッグ移動判定用
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMoved = false;
        this.DRAG_THRESHOLD = 3; // 3px以上移動したらドラッグ扱い
    }

    /**
     * ドラッグ開始処理
     * @param {string} objectType - ドラッグするオブジェクトの種類（'point' | 'vertex'）
     * @param {number} objectIndex - オブジェクトのインデックス
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @param {Object} object - ドラッグするオブジェクト
     */
    startDrag(objectType, objectIndex, mouseX, mouseY, object) {
        this.isDragging = true;
        this.draggedObjectType = objectType;
        this.draggedObjectIndex = objectIndex;
        this.dragOffsetX = mouseX - object.x;
        this.dragOffsetY = mouseY - object.y;

        // ドラッグ開始座標を保存
        this.dragStartX = mouseX;
        this.dragStartY = mouseY;
        this.hasMoved = false;
    }

    /**
     * ドラッグ中の更新処理
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} areaManager - AreaManagerインスタンス
     * @returns {boolean} 位置が更新されたかどうか
     */
    updateDrag(mouseX, mouseY, pointManager, areaManager) {
        if (!this.isDragging) return false;

        // 移動距離を計算
        if (!this.hasMoved) {
            const dx = mouseX - this.dragStartX;
            const dy = mouseY - this.dragStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.DRAG_THRESHOLD) {
                this.hasMoved = true;
            }
        }

        const newX = mouseX - this.dragOffsetX;
        const newY = mouseY - this.dragOffsetY;

        if (this.draggedObjectType === 'point') {
            const points = pointManager.getPoints();
            if (this.draggedObjectIndex < points.length) {
                points[this.draggedObjectIndex].x = Math.round(newX);
                points[this.draggedObjectIndex].y = Math.round(newY);
                return true;
            }
        } else if (this.draggedObjectType === 'vertex') {
            areaManager.updateVertex(this.draggedObjectIndex, newX, newY);
            return true;
        }

        return false;
    }

    /**
     * ドラッグ終了処理
     * @param {Object} inputManager - InputManagerインスタンス
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Function} onPointDragEndCallback - ポイントドラッグ終了時のコールバック
     * @param {Function} onVertexDragEndCallback - 頂点ドラッグ終了時のコールバック
     * @returns {{wasDragging: boolean, hasMoved: boolean}} ドラッグ情報
     */
    endDrag(inputManager, pointManager, onPointDragEndCallback, onVertexDragEndCallback) {
        if (!this.isDragging) return { wasDragging: false, hasMoved: false };

        const wasDragging = true;
        const draggedIndex = this.draggedObjectIndex;
        const draggedType = this.draggedObjectType;
        const hasMoved = this.hasMoved;

        if (this.draggedObjectType === 'point') {
            inputManager.redrawInputBoxes(pointManager.getPoints());
            pointManager.notify('onChange', pointManager.getPoints());
            if (onPointDragEndCallback) onPointDragEndCallback(draggedIndex);
        } else if (this.draggedObjectType === 'vertex') {
            if (onVertexDragEndCallback) onVertexDragEndCallback(draggedIndex);
        }

        this.reset();
        return { wasDragging, hasMoved };
    }

    reset() {
        this.isDragging = false;
        this.draggedObjectType = null;
        this.draggedObjectIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMoved = false;
    }

    isDraggingObject() {
        return this.isDragging;
    }

    getDraggedObjectInfo() {
        if (!this.isDragging) return null;
        return {
            type: this.draggedObjectType,
            index: this.draggedObjectIndex
        };
    }

    hasDragged() {
        return this.hasMoved;
    }
}