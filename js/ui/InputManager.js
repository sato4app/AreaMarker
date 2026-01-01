import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * 動的入力フィールドの管理を行うクラス
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.inputElements = [];
        this.isAreaEditMode = false;
        this.highlightedPointIds = new Set(); // 強調表示するポイントIDのセット

        // ズーム・パン状態
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;

        this.callbacks = {
            onPointIdChange: null,
            onPointRemove: null
        };
    }

    /**
     * コールバック関数を設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * 変更通知を発行
     * @param {string} event - イベント名
     * @param {any} data - イベントデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * 編集モードを設定
     * @param {string} mode - 編集モード ('point', 'area')
     */
    setEditMode(mode) {
        this.isAreaEditMode = (mode === 'area');

        if (mode !== 'area') {
            // エリア編集モード終了時は強調表示をクリア
            this.highlightedPointIds.clear();
        }

        this.updateInputsState();
    }

    /**
     * 指定したポイントIDを強調表示
     * @param {Array<string>} pointIds - 強調表示するポイントIDの配列
     */
    setHighlightedPoints(pointIds) {
        this.highlightedPointIds.clear();
        if (pointIds) {
            pointIds.forEach(id => {
                if (id && id.trim()) {
                    this.highlightedPointIds.add(id);
                }
            });
        }
        this.updateInputsState();
    }

    /**
     * ポイント入力状態を更新
     */
    updateInputsState() {
        this.inputElements.forEach(input => {
            const inputValue = input.value || '';
            const isHighlighted = this.highlightedPointIds.has(inputValue);
            const container = input._container;

            if (this.isAreaEditMode) {
                // エリア編集モードでは表示し、関係するポイントを強調（もしあれば）
                if (container) {
                    container.style.display = 'block';
                }
                input.disabled = true;
                if (isHighlighted) {
                    input.style.backgroundColor = 'white';
                    if (container) {
                        container.style.backgroundColor = 'white';
                        container.style.border = '2px solid #007bff';
                    }
                } else {
                    input.style.backgroundColor = '#e0e0e0';
                    if (container) {
                        container.style.backgroundColor = '#e0e0e0';
                        container.style.border = '2px solid #999';
                    }
                }
            } else {
                // ポイント編集モードでは通常表示
                if (container) {
                    container.style.display = 'block';
                }
                input.disabled = false;
                input.style.backgroundColor = '';
                if (container) {
                    container.style.backgroundColor = '';
                    container.style.border = '';
                }
            }
        });
    }

    /**
     * ポイント用の入力ボックスを作成
     * @param {Object} point - ポイントオブジェクト
     * @param {number} index - ポイントのインデックス
     * @param {boolean} shouldFocus - フォーカスするかどうか
     */
    createInputBox(point, index, shouldFocus = false) {
        const container = document.createElement('div');
        container.className = 'point-id-popup';
        container.style.position = 'absolute';
        container.style.zIndex = '1100';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 4;
        input.className = 'point-id-input';
        input.placeholder = 'ID';
        input.value = point.id || '';

        container.appendChild(input);
        this.positionInputBox(container, point);

        input.addEventListener('input', (e) => {
            const value = e.target.value;
            this.notify('onPointIdChange', { index, id: value, skipFormatting: true, skipDisplay: true });
        });

        input.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            this.notify('onPointIdChange', { index, id: value, skipFormatting: false });
            container.classList.remove('is-editing');
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.notify('onPointRemove', { index, point });
            }
        });

        input.addEventListener('focus', () => {
            container.classList.add('is-editing');
        });

        input.setAttribute('data-point-index', index);
        document.body.appendChild(container);
        this.inputElements.push(input);
        input._container = container;

        if (this.isAreaEditMode) {
            const isHighlighted = this.highlightedPointIds.has(point.id);
            input.disabled = true;
            if (isHighlighted) {
                input.style.backgroundColor = 'white';
                container.style.backgroundColor = 'white';
                container.style.border = '2px solid #007bff';
            } else {
                input.style.backgroundColor = '#e0e0e0';
                container.style.backgroundColor = '#e0e0e0';
                container.style.border = '2px solid #999';
            }
        }

        if (shouldFocus) {
            setTimeout(() => {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }, 0);
        }
    }

    /**
     * ズーム・パン状態を更新し、全ポップアップ位置を再計算
     */
    updateTransform(scale, offsetX, offsetY, points = []) {
        this.scale = scale;
        this.offsetX = offsetX;
        this.offsetY = offsetY;

        this.clearInputBoxes();

        points.forEach((point, index) => {
            this.createInputBox(point, index, false);
        });
    }

    /**
     * 入力ボックスの最適な表示位置を計算・設定
     */
    positionInputBox(container, object) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;

        const transformedX = object.x * this.scale + this.offsetX;
        const transformedY = object.y * this.scale + this.offsetY;

        const inputX = this.findOptimalInputPosition(transformedX, transformedY, scaleX, rect.left);
        const inputY = transformedY * scaleY + rect.top - 15;

        container.style.left = inputX + 'px';
        container.style.top = inputY + 'px';
    }

    findOptimalInputPosition(pointX, pointY, scaleX, canvasLeft) {
        const inputWidth = 50;
        const margin = 10;
        const scaledPointX = pointX * scaleX + canvasLeft;

        const rightPos = scaledPointX + margin;
        const leftPos = scaledPointX - inputWidth - margin;

        if (rightPos + inputWidth < window.innerWidth - 20) {
            return rightPos;
        } else {
            return Math.max(leftPos, canvasLeft + 5);
        }
    }

    updatePointIdDisplay(pointIndex, newId) {
        const input = this.inputElements.find((element) => {
            return element.getAttribute('data-point-index') == pointIndex;
        });
        if (input && input.value !== newId) {
            input.value = newId;
        }
    }

    redrawInputBoxes(points) {
        this.clearInputBoxes();
        setTimeout(() => {
            points.forEach((point, index) => {
                this.createInputBox(point, index);
                const input = this.inputElements[this.inputElements.length - 1];
                if (input) {
                    input.value = point.id || '';
                    input.setAttribute('data-point-index', index);
                }
            });
        }, 10);
    }

    clearInputBoxes() {
        this.inputElements.forEach(input => {
            const container = input && input._container;
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        });
        this.inputElements = [];
    }

    clearAllInputBoxes() {
        this.clearInputBoxes();
    }

    setPointIdVisibility(visible) {
        this.inputElements.forEach(input => {
            const container = input._container;
            if (container) {
                container.style.display = visible ? 'block' : 'none';
            }
        });
    }
}