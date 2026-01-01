/**
 * ウィンドウリサイズ処理を管理するクラス
 */
export class ResizeHandler {
    constructor() {
        this.resizeTimeout = null;
    }

    /**
     * ウィンドウリサイズ処理
     * @param {HTMLImageElement} currentImage - 現在の画像
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {Object} canvasRenderer - CanvasRendererインスタンス
     * @param {Object} layoutManager - LayoutManagerインスタンス
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} areaManager - AreaManagerインスタンス
     * @param {Object} viewportManager - ViewportManagerインスタンス（オプション）
     * @param {Function} redrawCallback - 再描画コールバック
     */
    handleResize(currentImage, canvas, canvasRenderer, layoutManager,
        pointManager, areaManager, viewportManager, redrawCallback) {
        if (!currentImage) return;

        const oldWidth = canvas.width;
        const oldHeight = canvas.height;

        canvasRenderer.setupCanvas(layoutManager.getCurrentLayout());

        const newWidth = canvas.width;
        const newHeight = canvas.height;

        if (oldWidth !== newWidth || oldHeight !== newHeight) {
            this.scaleCoordinates(oldWidth, oldHeight, newWidth, newHeight,
                pointManager, areaManager);
        }

        if (viewportManager) {
            viewportManager.updatePopupPositions();
        }

        redrawCallback();
    }

    /**
     * 座標をスケーリング
     * @param {number} oldWidth - 古い幅
     * @param {number} oldHeight - 古い高さ
     * @param {number} newWidth - 新しい幅
     * @param {number} newHeight - 新しい高さ
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} areaManager - AreaManagerインスタンス
     */
    scaleCoordinates(oldWidth, oldHeight, newWidth, newHeight,
        pointManager, areaManager) {
        const scaleX = newWidth / oldWidth;
        const scaleY = newHeight / oldHeight;

        // ポイント座標のスケーリング
        pointManager.getPoints().forEach(point => {
            point.x = Math.round(point.x * scaleX);
            point.y = Math.round(point.y * scaleY);
        });

        // 全エリアの頂点座標をスケーリング
        const allAreas = areaManager.getAllAreas();
        allAreas.forEach(area => {
            if (area.vertices) {
                area.vertices.forEach(point => {
                    point.x = Math.round(point.x * scaleX);
                    point.y = Math.round(point.y * scaleY);
                });
            }
        });
    }

    /**
     * 遅延付きリサイズ処理
     * @param {Function} resizeFunction - リサイズ処理関数
     * @param {number} delay - 遅延時間（ミリ秒）
     */
    debounceResize(resizeFunction, delay = 100) {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(resizeFunction, delay);
    }
}