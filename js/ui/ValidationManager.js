import { Validators } from '../utils/Validators.js';

/**
 * バリデーション機能を統合管理するクラス
 */
export class ValidationManager {
    /**
     * ポイントIDの重複チェック
     * @param {Array} points - ポイント配列
     * @returns {Object} 検証結果 {isValid: boolean, message: string}
     */
    static checkDuplicatePointIds(points) {
        const idCounts = {};
        const duplicates = [];

        for (const point of points) {
            if (point.id && point.id.trim()) {
                const id = point.id.trim();
                idCounts[id] = (idCounts[id] || 0) + 1;
                if (idCounts[id] === 2) {
                    duplicates.push(id);
                }
            }
        }

        if (duplicates.length > 0) {
            return {
                isValid: false,
                message: `重複するポイントIDがあります: ${duplicates.join(', ')}`
            };
        }

        return { isValid: true, message: '' };
    }

    /**
     * 入力要素のスタイルをクリア
     */
    static clearInputElementStyles(inputElement) {
        if (!inputElement) return;
        inputElement.style.borderColor = '';
        inputElement.style.borderWidth = '';
        inputElement.style.backgroundColor = '';
        inputElement.title = '';
    }

    /**
     * 入力要素にエラー表示を設定
     */
    static setInputElementError(inputElement, message, redBorder = false) {
        if (!inputElement) return;
        if (redBorder) {
            inputElement.style.borderColor = '#f44336';
            inputElement.style.borderWidth = '2px';
        } else {
            inputElement.style.backgroundColor = '#ffebee';
        }
        inputElement.title = message;
    }
}