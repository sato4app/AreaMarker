/**
 * マップ上のオブジェクト検出を行うユーティリティクラス
 */
export class ObjectDetector {
    /**
     * 指定座標上のオブジェクト（ポイント/エリア頂点）を検出
     * @param {number} x - X座標（キャンバス座標）
     * @param {number} y - Y座標（キャンバス座標）
     * @param {Object} managers - { pointManager, areaManager }
     * @param {string} mode - 編集モード ('point' | 'area')
     * @returns {{type: string, index: number, object: Object} | null} 検出されたオブジェクト情報
     */
    static findObjectAt(x, y, managers, mode = null) {
        const { pointManager, areaManager } = managers;

        // エリア編集モード時は頂点を優先チェック
        if (mode === 'area' && areaManager) {
            const vertexInfo = areaManager.findVertexAt(x, y, 10);
            if (vertexInfo) {
                return {
                    type: 'vertex',
                    index: vertexInfo.index,
                    object: vertexInfo.point
                };
            }
        }

        // ポイントをチェック
        if (pointManager) {
            const pointIndex = this.findPointAt(x, y, pointManager.getPoints(), 8);
            if (pointIndex !== -1) {
                const points = pointManager.getPoints();
                return {
                    type: 'point',
                    index: pointIndex,
                    object: points[pointIndex]
                };
            }
        }

        return null;
    }

    /**
     * 指定座標上のポイントを検索
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {Array} points - ポイント配列
     * @param {number} threshold - 検出閾値
     * @returns {number} ポイントのインデックス
     */
    static findPointAt(x, y, points, threshold = 8) {
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const distance = this.calculateDistance(x, y, point.x, point.y);
            if (distance <= threshold) {
                return i;
            }
        }
        return -1;
    }

    static calculateDistance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
