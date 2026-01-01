/**
 * ビューポート管理クラス
 * ズーム・パン操作とポップアップ位置更新を担当
 */
export class ViewportManager {
    /**
     * コンストラクタ
     * @param {Object} canvasRenderer - CanvasRendererインスタンス
     * @param {Object} inputManager - InputManagerインスタンス
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} spotManager - SpotManagerインスタンス
     */
    constructor(canvasRenderer, inputManager, pointManager, areaManager) {
        this.canvasRenderer = canvasRenderer;
        this.inputManager = inputManager;
        this.pointManager = pointManager;
        this.areaManager = areaManager;
    }

    /**
     * ズーム処理
     * @param {string} direction - ズーム方向 ('in' | 'out')
     * @param {Function} onUpdate - 更新時のコールバック（ボタン状態更新など）
     */
    handleZoom(direction, onUpdate) {
        const panMethods = {
            'in': () => this.canvasRenderer.zoomIn(),
            'out': () => this.canvasRenderer.zoomOut()
        };

        if (panMethods[direction]) {
            panMethods[direction]();
            this.updatePopupPositions();

            if (onUpdate) {
                onUpdate();
            }
        }
    }

    /**
     * パン処理
     * @param {string} direction - パン方向 ('up' | 'down' | 'left' | 'right')
     * @param {Function} onUpdate - 更新時のコールバック（再描画など）
     */
    handlePan(direction, onUpdate) {
        const panMethods = {
            'up': () => this.canvasRenderer.panUp(),
            'down': () => this.canvasRenderer.panDown(),
            'left': () => this.canvasRenderer.panLeft(),
            'right': () => this.canvasRenderer.panRight()
        };

        if (panMethods[direction]) {
            panMethods[direction]();
            this.updatePopupPositions();

            if (onUpdate) {
                onUpdate();
            }
        }
    }

    /**
     * 表示リセット処理
     * @param {Function} onUpdate - 更新時のコールバック（ボタン状態更新、再描画など）
     */
    handleResetView(onUpdate) {
        this.canvasRenderer.resetTransform();
        this.updatePopupPositions();

        if (onUpdate) {
            onUpdate();
        }
    }

    /**
     * ポップアップ位置を更新
     */
    updatePopupPositions() {
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const points = this.pointManager.getPoints();

        this.inputManager.updateTransform(scale, offset.x, offset.y, points);

        // チェックボックスの状態を反映（ポイントID）
        const checkbox = document.getElementById('showPointIdsCheckbox');
        if (checkbox && !checkbox.checked) {
            this.inputManager.setPointIdVisibility(false);
        }
    }

    /**
     * ズームボタンの状態を更新
     */
    updateZoomButtonStates() {
        const scale = this.canvasRenderer.getScale();
        const minScale = this.canvasRenderer.minScale;
        const maxScale = this.canvasRenderer.maxScale;

        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');

        if (zoomInBtn) {
            zoomInBtn.disabled = (scale >= maxScale);
        }

        if (zoomOutBtn) {
            zoomOutBtn.disabled = (scale <= minScale);
        }
    }
}
