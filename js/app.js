import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { AreaManager } from './data/AreaManager.js';
import { FileHandler } from './data/FileHandler.js';
import { InputManager } from './ui/InputManager.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { UIHelper } from './ui/UIHelper.js';
import { ValidationManager } from './ui/ValidationManager.js';
import { ViewportManager } from './ui/ViewportManager.js';
import { MarkerSettingsManager } from './ui/MarkerSettingsManager.js';
import { CoordinateUtils } from './utils/Coordinates.js';
import { Validators } from './utils/Validators.js';
import { ObjectDetector } from './utils/ObjectDetector.js';
import { DragDropHandler } from './utils/DragDropHandler.js';
import { ResizeHandler } from './utils/ResizeHandler.js';
import { FirebaseSyncManager } from './firebase/FirebaseSyncManager.js';

/**
 * PointMarkerアプリケーションのメインクラス
 */
export class PointMarkerApp {
    constructor() {
        // DOM要素の初期化
        this.canvas = document.getElementById('mapCanvas');

        // コアコンポーネントの初期化
        this.canvasRenderer = new CanvasRenderer(this.canvas);
        this.pointManager = new PointManager();
        this.areaManager = new AreaManager();
        this.fileHandler = new FileHandler();
        this.inputManager = new InputManager(this.canvas);
        this.layoutManager = new LayoutManager();
        this.validationManager = new ValidationManager();
        this.dragDropHandler = new DragDropHandler();
        this.resizeHandler = new ResizeHandler();
        this.markerSettingsManager = new MarkerSettingsManager();

        // ビューポート管理とFirebase同期の初期化
        this.viewportManager = new ViewportManager(
            this.inputManager,
            this.pointManager,
            this.areaManager
        );
        this.firebaseSyncManager = new FirebaseSyncManager(
            this.pointManager,
            this.areaManager,
            this.fileHandler
        );

        // Firebase関連（グローバルスコープから取得）
        this.firebaseClient = window.firebaseClient || null;
        this.authManager = window.authManager || null;
        this.firestoreManager = window.firestoreManager || null;

        // プロジェクトID（画像ファイル名ベース）
        this.currentProjectId = null;

        // 現在の画像情報
        this.currentImage = null;

        // ファイルピッカーのアクティブ状態管理（重複呼び出し防止）
        this.isFilePickerActive = false;

        // スポットドラッグ開始時の座標保存（Firebase更新用）
        this.spotDragStartCoords = null;

        // ドラッグ操作完了フラグ（clickイベント抑制用）
        this.justFinishedDragging = false;

        // 右クリックドラッグ状態（中間点削除用）
        this.isRightDragging = false;
        this.rightDragStartX = 0;
        this.rightDragStartY = 0;
        this.rightDragCurrentX = 0;
        this.rightDragCurrentY = 0;

        this.initializeCallbacks();
        this.initializeEventListeners();
        this.enableBasicControls();
    }

    /**
     * コンポーネント間のコールバックを設定
     */
    initializeCallbacks() {
        // ポイント管理のコールバック
        this.pointManager.setCallback('onChange', (points, skipRedrawInput = false) => {
            this.redrawCanvas();
            if (!skipRedrawInput) {
                this.inputManager.redrawInputBoxes(points);
            }
        });

        this.pointManager.setCallback('onCountChange', (count) => {
            document.getElementById('pointCount').textContent = count;
        });

        // エリア管理のコールバック
        this.areaManager.setCallback('onChange', () => {
            this.redrawCanvas();
        });

        this.areaManager.setCallback('onCountChange', (count) => {
            const el = document.getElementById('vertexCount');
            if (el) el.textContent = count;
        });

        this.areaManager.setCallback('onAreaInfoChange', (data) => {
            const el = document.getElementById('areaNameInput');
            if (el) el.value = data.name;
            this.redrawCanvas();
        });

        this.areaManager.setCallback('onAreaListChange', (areas) => {
            this.updateAreaDropdown(areas);
        });

        this.areaManager.setCallback('onSelectionChange', (index) => {
            const dropdown = document.getElementById('areaSelectDropdown');
            if (dropdown) {
                dropdown.value = index >= 0 ? index.toString() : '';
            }
        });

        this.areaManager.setCallback('onModifiedStateChange', (data) => {
            this.updateAreaDropdown(this.areaManager.getAllAreas());
        });

        this.areaManager.setCallback('onNoAreaSelected', (message) => {
            UIHelper.showMessage(message);
        });

        // マーカー設定のコールバック
        this.markerSettingsManager.setCallback((sizes) => {
            // Canvas Rendererにマーカーサイズを設定
            this.canvasRenderer.setMarkerSizes(sizes);
            // キャンバスを再描画
            this.redrawCanvas();
            console.log('マーカーサイズが更新されました:', sizes);
        });

        // 初期設定を読み込み
        const initialSizes = this.markerSettingsManager.getSizes();
        this.canvasRenderer.setMarkerSizes(initialSizes);

        // 入力管理のコールバック
        this.inputManager.setCallback('onPointIdChange', (data) => {
            // blur時にIDが空白の場合はポイントを削除
            if (!data.skipFormatting && data.id.trim() === '') {
                // Firebaseからも削除するため、削除前に座標を取得
                const points = this.pointManager.getPoints();
                if (data.index >= 0 && data.index < points.length) {
                    const point = points[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.firebaseSyncManager.deletePointFromFirebase(point.x, point.y);
                }
                // 画面から削除
                this.pointManager.removePoint(data.index);
                return;
            }

            // まずフォーマット処理を実行（blur時もinput時も）
            this.pointManager.updatePointId(data.index, data.id, data.skipFormatting, true);

            // blur時のみ、フォーマット後のIDで重複チェックを実行
            if (!data.skipFormatting && data.id.trim() !== '') {
                // フォーマット後のIDを取得
                const point = this.pointManager.getPoints()[data.index];
                const formattedId = point ? point.id : data.id;

                const registeredIds = this.pointManager.getRegisteredIds();

                // 自分以外で同じIDが存在するかチェック
                const hasDuplicate = registeredIds.some((id, idx) => {
                    return id === formattedId && idx !== data.index;
                });

                if (hasDuplicate) {
                    // 重複エラーを表示
                    const inputElement = document.querySelector(`input[data-point-index="${data.index}"]`);
                    if (inputElement) {
                        inputElement.style.backgroundColor = '#ffebee'; // ピンク背景
                        inputElement.style.borderColor = '#f44336'; // 赤枠
                        inputElement.style.borderWidth = '2px';
                        inputElement.title = `ポイントID "${formattedId}" は既に使用されています`;
                    }
                    UIHelper.showError(`ポイントID "${formattedId}" は既に使用されています。別のIDを入力してください。`);
                } else {
                    // 重複がない場合はエラー表示をクリア
                    const inputElement = document.querySelector(`input[data-point-index="${data.index}"]`);
                    if (inputElement) {
                        inputElement.style.backgroundColor = '';
                        inputElement.style.borderColor = '';
                        inputElement.style.borderWidth = '';
                        inputElement.title = '';
                    }

                    // 【リアルタイムFirebase更新】blur時、重複がなく、空白でない場合にFirebase更新
                    this.firebaseSyncManager.updatePointToFirebase(data.index);
                }
            }

            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                // フォーマット処理後の値を取得して表示
                const point = this.pointManager.getPoints()[data.index];
                if (point) {
                    this.inputManager.updatePointIdDisplay(data.index, point.id);
                }
            }
        });

        this.inputManager.setCallback('onPointRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'point') {
                this.pointManager.removePoint(data.index);
            }
        });



        // レイアウト管理のコールバック
        this.layoutManager.setCallback('onLayoutChange', (layout) => {
            if (this.currentImage) {
                this.resizeHandler.debounceResize(() => {
                    this.handleWindowResize();
                }, 300);
            }
        });

        this.layoutManager.setCallback('onModeChange', (mode) => {
            this.inputManager.setEditMode(mode);
            const pointIdCheckbox = document.getElementById('showPointIdsCheckbox');

            if (mode === 'area') {
                // エリア編集モードに切り替えた時、ポイントID表示を維持（または必要に応じて変更）
                if (pointIdCheckbox) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }
            } else if (mode === 'point') {
                if (pointIdCheckbox && !pointIdCheckbox.checked) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }
            }

            this.redrawCanvas();
        });
    }

    /**
     * イベントリスナーを設定
     */
    initializeEventListeners() {
        // 画像選択
        const imageInputBtn = document.getElementById('imageInputBtn');
        imageInputBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleImageSelection();
        });

        // キャンバスクリック
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // キャンバス右クリック（コンテキストメニュー）
        this.canvas.addEventListener('contextmenu', (e) => this.handleCanvasContextMenu(e));

        // マウス移動（ホバー検出・ドラッグ処理）
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));



        // エリア名入力
        const areaNameInput = document.getElementById('areaNameInput');
        if (areaNameInput) {
            areaNameInput.addEventListener('input', (e) => {
                this.areaManager.updateAreaName(e.target.value);
            });

            // blur時にFirebase更新
            areaNameInput.addEventListener('blur', () => {
                const index = this.areaManager.selectedAreaIndex;
                if (index >= 0) {
                    this.firebaseSyncManager.updateAreaToFirebase(index);
                }
            });
        }

        // エリア選択ドロップダウン
        const areaDropdown = document.getElementById('areaSelectDropdown');
        if (areaDropdown) {
            areaDropdown.addEventListener('change', (e) => {
                const selectedIndex = e.target.value === '' ? -1 : parseInt(e.target.value);
                this.areaManager.selectArea(selectedIndex);

                if (selectedIndex >= 0) {
                    const areas = this.areaManager.getAllAreas();
                    const selectedArea = areas[selectedIndex];
                    if (selectedArea) {
                        UIHelper.showMessage(`エリア "${selectedArea.areaName}" を選択しました`, 'info');
                    }
                } else {
                    UIHelper.showMessage('エリア選択を解除しました', 'info');
                }
            });
        }

        // エリア操作ボタン
        const addAreaBtn = document.getElementById('addAreaBtn');
        if (addAreaBtn) {
            addAreaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleAddArea();
            });
        }

        const deleteAreaBtn = document.getElementById('deleteAreaBtn');
        if (deleteAreaBtn) {
            deleteAreaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDeleteArea();
            });
        }

        // ポイントID表示切り替えチェックボックス
        document.getElementById('showPointIdsCheckbox').addEventListener('change', (e) => {
            this.handlePointIdVisibilityChange(e.target.checked);
        });

        // ズーム・パンコントロール
        document.getElementById('zoomInBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handleZoom('in', () => {
                this.viewportManager.updateZoomButtonStates();
                this.redrawCanvas();
            });
        });

        document.getElementById('zoomOutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handleZoom('out', () => {
                this.viewportManager.updateZoomButtonStates();
                this.redrawCanvas();
            });
        });

        document.getElementById('panUpBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('up', () => this.redrawCanvas());
        });

        document.getElementById('panDownBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('down', () => this.redrawCanvas());
        });

        document.getElementById('panLeftBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('left', () => this.redrawCanvas());
        });

        document.getElementById('panRightBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('right', () => this.redrawCanvas());
        });

        document.getElementById('resetViewBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handleResetView(() => {
                this.viewportManager.updateZoomButtonStates();
                this.redrawCanvas();
            });
        });

        // 設定ボタン
        document.getElementById('settingsBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.markerSettingsManager.openDialog();
        });

        // ウィンドウリサイズ
        window.addEventListener('resize', () => {
            if (this.currentImage) {
                this.resizeHandler.debounceResize(() => {
                    this.handleWindowResize();
                }, 100);
            }
        });
    }

    /**
     * 基本コントロールを有効化
     */
    enableBasicControls() {
        // 初期状態では画像読み込み前なので無効化
    }

    /**
     * 画像読み込み後のコントロールを有効化
     */
    enableImageControls() {
        // ズーム・パンボタンを有効化
        document.getElementById('zoomInBtn').disabled = false;
        // ズームアウトは初期状態（1.0倍）では無効
        document.getElementById('zoomOutBtn').disabled = true;
        document.getElementById('panUpBtn').disabled = false;
        document.getElementById('panDownBtn').disabled = false;
        document.getElementById('panLeftBtn').disabled = false;
        document.getElementById('panRightBtn').disabled = false;
        document.getElementById('resetViewBtn').disabled = false;
    }

    /**
     * 画像選択処理
     */
    async handleImageSelection() {
        // 既にファイルピッカーが開いている場合は何もしない
        if (this.isFilePickerActive) {
            return;
        }

        try {
            this.isFilePickerActive = true;
            const result = await this.fileHandler.selectImage();
            await this.processLoadedImage(result.image, result.fileName);
        } catch (error) {
            if (error.message !== 'ファイル選択がキャンセルされました') {
                alert('画像選択中にエラーが発生しました: ' + error.message);
            }
        } finally {
            this.isFilePickerActive = false;
        }
    }

    /**
     * 読み込まれた画像を処理
     * @param {HTMLImageElement} image - 読み込まれた画像
     * @param {string} fileName - ファイル名
     */
    async processLoadedImage(image, fileName) {
        this.currentImage = image;
        this.canvasRenderer.setImage(image);
        this.canvasRenderer.setupCanvas(this.layoutManager.getCurrentLayout());
        this.canvasRenderer.drawImage();
        this.enableImageControls();
        this.layoutManager.setDefaultPointMode();
        UIHelper.showMessage(`画像「${fileName}」を読み込みました`);

        // FirebaseSyncManagerに画像とキャンバスを設定
        this.firebaseSyncManager.setImageAndCanvas(image, this.canvas);

        // Firebaseから自動的にデータを読み込み
        await this.firebaseSyncManager.loadFromFirebase((loadedPoints, loadedAreas) => {
            // UIを更新
            this.inputManager.redrawInputBoxes(this.pointManager.getPoints());
            this.viewportManager.updatePopupPositions();
            this.redrawCanvas();

            // カウントを更新
            document.getElementById('pointCount').textContent = loadedPoints;
        });
    }

    /**
     * 指定座標上のオブジェクト（ポイント/スポット）を検出
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {{type: string, index: number} | null} 検出されたオブジェクト情報
     */
    findObjectAtMouse(mouseX, mouseY) {
        const managers = {
            pointManager: this.pointManager,
            areaManager: this.areaManager
        };
        const mode = this.layoutManager.getCurrentEditingMode();
        const result = ObjectDetector.findObjectAt(mouseX, mouseY, managers, mode);
        return result ? { type: result.type, index: result.index } : null;
    }



    /**
     * キャンバスマウス移動処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseMove(event) {
        if (!this.currentImage) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);

        // 右クリックドラッグ中の処理（削除矩形の描画）
        if (this.isRightDragging) {
            this.rightDragCurrentX = coords.x;
            this.rightDragCurrentY = coords.y;

            // キャンバス再描画 + 削除矩形の描画
            this.redrawCanvas();

            // 削除範囲の長方形を描画（ドラッグ開始点と終了点を角とする）
            this.canvasRenderer.drawDeletionRectangle(
                this.rightDragStartX,
                this.rightDragStartY,
                this.rightDragCurrentX,
                this.rightDragCurrentY
            );
            return;
        }

        // ドラッグ中の処理
        if (this.dragDropHandler.updateDrag(coords.x, coords.y, this.pointManager, this.spotManager, this.routeManager)) {
            this.redrawCanvas();
            return;
        }

        // ホバー処理
        const mode = this.layoutManager.getCurrentEditingMode();
        let hasObject = this.findObjectAtMouse(coords.x, coords.y) !== null;

        // ルート編集モード時は中間点もホバー対象
        if (mode === 'route' && !hasObject) {
            hasObject = this.routeManager.findRoutePointAt(coords.x, coords.y) !== null;
        }

        this.updateCursor(hasObject);
    }

    /**
     * カーソル状態を更新
     * @param {boolean} hasObject - オブジェクト上にマウスがあるか
     */
    updateCursor(hasObject) {
        // カーソルは常にcrosshairで固定
        this.canvas.style.cursor = 'crosshair';
    }

    /**
     * キャンバスマウスダウン処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseDown(event) {
        if (!this.currentImage) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // 右クリック（button === 2）の場合、削除範囲ドラッグ開始
        if (event.button === 2 && mode === 'route') {
            this.isRightDragging = true;
            this.rightDragStartX = coords.x;
            this.rightDragStartY = coords.y;
            this.rightDragCurrentX = coords.x;
            this.rightDragCurrentY = coords.y;
            event.preventDefault();
            return;
        }

        // ルート編集モードの場合、中間点ドラッグを優先チェック
        if (mode === 'route') {
            const routePointInfo = this.routeManager.findRoutePointAt(coords.x, coords.y);
            if (routePointInfo) {
                const selectedRoute = this.routeManager.getSelectedRoute();
                // ルートが選択されていない場合
                if (!selectedRoute) {
                    UIHelper.showWarning('ルートが選択されていません。ルートを選択または追加してください');
                    event.preventDefault();
                    return;
                }
                // 開始・終了ポイントが設定済みの場合のみドラッグ可能
                if (selectedRoute.startPointId && selectedRoute.endPointId) {
                    this.dragDropHandler.startDrag(
                        'routePoint',
                        routePointInfo.index,
                        coords.x,
                        coords.y,
                        routePointInfo.point
                    );
                    event.preventDefault();
                } else {
                    UIHelper.showWarning('開始ポイントと終了ポイントを先に選択してください');
                    event.preventDefault();
                }
                return;
            }
        }

        // ポイント・スポットのドラッグ処理
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);
        if (!objectInfo) return;

        // 適切なモードでのドラッグ開始をチェック
        const canDrag = (objectInfo.type === 'point' && mode === 'point') ||
            (objectInfo.type === 'spot' && mode === 'spot');

        if (canDrag) {
            const object = objectInfo.type === 'point'
                ? this.pointManager.getPoints()[objectInfo.index]
                : this.spotManager.getSpots()[objectInfo.index];

            // スポットドラッグ開始時に元の座標を保存（Firebase更新用）
            if (objectInfo.type === 'spot') {
                this.spotDragStartCoords = {
                    x: object.x,
                    y: object.y
                };
            }

            this.dragDropHandler.startDrag(
                objectInfo.type,
                objectInfo.index,
                coords.x,
                coords.y,
                object
            );

            event.preventDefault();
        }
    }

    /**
     * キャンバスマウスアップ処理
     * @param {MouseEvent} event - マウスイベント
     */
    async handleCanvasMouseUp(event) {
        // 右クリックドラッグ終了時の処理
        if (this.isRightDragging) {
            // ドラッグ距離を計算（3px以上移動していたらドラッグ扱い）
            const dragDistance = Math.sqrt(
                Math.pow(this.rightDragCurrentX - this.rightDragStartX, 2) +
                Math.pow(this.rightDragCurrentY - this.rightDragStartY, 2)
            );

            // 右クリックドラッグ状態をリセット
            this.isRightDragging = false;
            this.redrawCanvas(); // 矩形を消す

            if (dragDistance >= 3) {
                // ドラッグ扱い：矩形内の中間点を検索
                const pointsInRect = this.routeManager.findRoutePointsInRectangle(
                    this.rightDragStartX,
                    this.rightDragStartY,
                    this.rightDragCurrentX,
                    this.rightDragCurrentY
                );

                // 中間点が見つかった場合、確認後に削除
                if (pointsInRect.length > 0) {
                    const confirmed = confirm(`${pointsInRect.length}個のルート中間点を削除しますか？`);

                    if (confirmed) {
                        // 削除実行
                        const indices = pointsInRect.map(p => p.index);
                        const deletedCount = this.routeManager.removeRoutePoints(indices);

                        // Firebase自動保存
                        await this.handleSaveRoute();

                        UIHelper.showMessage(`${deletedCount}個のルート中間点を削除しました`);
                    } else {
                        // キャンセル時はメッセージのみ表示
                        UIHelper.showMessage('削除をキャンセルしました');
                    }
                } else {
                    UIHelper.showWarning('削除対象の中間点が見つかりませんでした');
                }
            }

            event.preventDefault();
            return;
        }

        // ポイントドラッグ終了時のコールバック
        const onPointDragEnd = (pointIndex) => {
            // 【リアルタイムFirebase更新】ポイント移動完了時にFirebase更新
            this.firebaseSyncManager.updatePointToFirebase(pointIndex);
        };

        // スポットドラッグ終了時のコールバック
        const onSpotDragEnd = async (spotIndex) => {
            // 【リアルタイムFirebase更新】スポット移動完了時にFirebase更新
            // 移動前の座標のデータを削除してから、新しい座標で追加
            if (this.spotDragStartCoords) {
                const spots = this.spotManager.getSpots();
                if (spotIndex >= 0 && spotIndex < spots.length) {
                    const currentSpot = spots[spotIndex];
                    // 座標が変わった場合のみ、古いデータを削除
                    if (this.spotDragStartCoords.x !== currentSpot.x ||
                        this.spotDragStartCoords.y !== currentSpot.y) {
                        await this.firebaseSyncManager.deleteSpotFromFirebase(this.spotDragStartCoords.x, this.spotDragStartCoords.y);
                    }
                }
                this.spotDragStartCoords = null; // リセット
            }
            // 新しい座標で更新/追加
            await this.firebaseSyncManager.updateSpotToFirebase(spotIndex);
        };

        // ルート中間点ドラッグ終了時のコールバック
        const onRoutePointDragEnd = async (routePointIndex) => {
            // 中間点移動後、自動保存
            await this.handleSaveRoute();
        };

        const dragInfo = this.dragDropHandler.endDrag(this.inputManager, this.pointManager, onPointDragEnd, onSpotDragEnd, onRoutePointDragEnd);

        // ドラッグ操作だった場合、clickイベントの発火を防止
        if (dragInfo.wasDragging && dragInfo.hasMoved) {
            this.justFinishedDragging = true;
            event.preventDefault();
        }
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasClick(event) {
        // ドラッグ直後の場合はクリック処理をスキップ
        if (this.justFinishedDragging) {
            this.justFinishedDragging = false;
            return;
        }

        // ドラッグ中の場合はクリック処理をスキップ
        if (!this.currentImage || this.dragDropHandler.isDraggingObject()) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        // ルート編集モードの場合の処理
        if (mode === 'route') {
            // ポイントまたはスポットをクリックした場合
            if (objectInfo && (objectInfo.type === 'point' || objectInfo.type === 'spot')) {
                this.handleRoutePointSelection(objectInfo);
                return;
            }
            // 開始・終了ポイントが設定済みの場合のみ中間点を追加
            const selectedRoute = this.routeManager.getSelectedRoute();
            // ルートが選択されていない場合
            if (!selectedRoute) {
                UIHelper.showWarning('ルートが選択されていません。ルートを選択または追加してください');
                return;
            }
            if (selectedRoute.startPointId && selectedRoute.endPointId) {
                this.handleNewObjectCreation(coords, mode);
            } else {
                UIHelper.showWarning('開始ポイントと終了ポイントを先に選択してください');
            }
            return;
        }

        // 既存オブジェクトクリック時の処理
        if (objectInfo) {
            this.handleExistingObjectClick(objectInfo, mode);
            return;
        }

        // 新規オブジェクト作成
        this.handleNewObjectCreation(coords, mode);
    }

    /**
     * キャンバス右クリック処理（中間点削除）
     * @param {MouseEvent} event - マウスイベント
     */
    async handleCanvasContextMenu(event) {
        // デフォルトのコンテキストメニューを抑制
        event.preventDefault();

        if (!this.currentImage) return;

        const mode = this.layoutManager.getCurrentEditingMode();

        // ルート編集モードの場合のみ処理
        if (mode === 'route') {
            // ズーム・パン情報を取得
            const scale = this.canvasRenderer.getScale();
            const offset = this.canvasRenderer.getOffset();

            // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
            const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);

            // 最も近い中間点を検索（最大50px以内）
            const nearestInfo = this.routeManager.findNearestRoutePoint(coords.x, coords.y, 50);

            if (nearestInfo) {
                // 中間点を削除
                const deleted = this.routeManager.removeRoutePoint(nearestInfo.index);

                if (deleted) {
                    // Firebase自動保存
                    await this.handleSaveRoute();

                    // 削除成功メッセージ
                    UIHelper.showMessage('ルート中間点を削除しました');
                }
            } else {
                UIHelper.showWarning('近くに中間点が見つかりませんでした');
            }
        }
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    async handleCanvasClick(event) {
        if (!this.currentImage || this.justFinishedDragging) {
            this.justFinishedDragging = false;
            return;
        }

        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // 既存オブジェクトのクリック判定
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        if (objectInfo) {
            this.handleExistingObjectClick(objectInfo, mode);
            return;
        }

        // 新規作成
        await this.handleNewObjectCreation(coords, mode);
    }

    /**
     * キャンバス右クリック処理
     */
    handleCanvasContextMenu(event) {
        event.preventDefault();
        const mode = this.layoutManager.getCurrentEditingMode();
        if (mode !== 'area') return;

        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);

        const vertexInfo = this.areaManager.findVertexAt(coords.x, coords.y, 10);
        if (vertexInfo) {
            const areaIndex = this.areaManager.selectedAreaIndex;
            if (this.areaManager.removeVertex(vertexInfo.index)) {
                UIHelper.showMessage('エリア頂点を削除しました');
                // Firebase更新
                if (areaIndex >= 0) {
                    this.firebaseSyncManager.updateAreaToFirebase(areaIndex);
                }
            }
        }
    }

    /**
     * キャンバスマウスダウン処理
     */
    handleCanvasMouseDown(event) {
        if (!this.currentImage) return;

        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // ドラッグ処理
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);
        if (!objectInfo) return;

        const canDrag = (objectInfo.type === 'point' && mode === 'point') ||
            (objectInfo.type === 'vertex' && mode === 'area');

        if (canDrag) {
            const object = objectInfo.type === 'point'
                ? this.pointManager.getPoints()[objectInfo.index]
                : this.areaManager.getAreaVertex(objectInfo.index);

            this.dragDropHandler.startDrag(
                objectInfo.type,
                objectInfo.index,
                coords.x,
                coords.y,
                object
            );
            event.preventDefault();
        }
    }

    /**
     * キャンバスマウスアップ処理
     */
    handleCanvasMouseUp(event) {
        if (!this.currentImage) return;

        const result = this.dragDropHandler.endDrag(
            this.inputManager,
            this.pointManager,
            // ポイントドラッグ終了時
            (index) => this.firebaseSyncManager.updatePointToFirebase(index),
            // エリア頂点ドラッグ終了時
            () => {
                this.redrawCanvas();
                // Firebase更新
                const areaIndex = this.areaManager.selectedAreaIndex;
                if (areaIndex >= 0) {
                    this.firebaseSyncManager.updateAreaToFirebase(areaIndex);
                }
            }
        );

        if (result.wasDragging) {
            this.justFinishedDragging = result.hasMoved;
        }
    }

    /**
     * キャンバスマウス移動処理
     */
    handleCanvasMouseMove(event) {
        if (!this.currentImage) return;

        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);

        // ドラッグ中の更新
        if (this.dragDropHandler.updateDrag(coords.x, coords.y, this.pointManager, this.areaManager)) {
            this.redrawCanvas();
            return;
        }

        // ホバー処理
        const hasObject = this.findObjectAtMouse(coords.x, coords.y) !== null;
        this.canvas.style.cursor = 'crosshair';
    }

    /**
     * 既存オブジェクトクリック時の処理
     */
    handleExistingObjectClick(objectInfo, mode) {
        if (objectInfo.type === 'point' && mode === 'point') {
            UIHelper.focusInputForPoint(objectInfo.index);
        }
    }

    /**
     * 新規オブジェクト作成処理
     */
    async handleNewObjectCreation(coords, mode) {
        if (mode === 'area') {
            this.areaManager.addVertex(coords.x, coords.y);
            // Firebase更新
            const areaIndex = this.areaManager.selectedAreaIndex;
            if (areaIndex >= 0) {
                this.firebaseSyncManager.updateAreaToFirebase(areaIndex);
            }
        } else if (mode === 'point') {
            this.pointManager.removeTrailingEmptyUserPoints();
            this.pointManager.addPoint(coords.x, coords.y);
            const newIndex = this.pointManager.getPoints().length - 1;
            setTimeout(() => UIHelper.focusInputForPoint(newIndex), 30);
        }
    }

    /**
     * エリア選択ドロップダウンを更新
     */
    updateAreaDropdown(areas) {
        const dropdown = document.getElementById('areaSelectDropdown');
        if (!dropdown) return;

        const currentSelectedIndex = this.areaManager.selectedAreaIndex;
        dropdown.innerHTML = '<option value="">-- エリアを選択 --</option>';

        areas.forEach((area, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = area.areaName || `エリア ${index + 1}`;
            dropdown.appendChild(option);
        });

        dropdown.value = currentSelectedIndex >= 0 ? currentSelectedIndex.toString() : '';
    }

    /**
     * 新しいエリアを追加
     */
    handleAddArea() {
        const newArea = {
            areaName: `エリア ${this.areaManager.getAllAreas().length + 1}`,
            vertices: []
        };
        this.areaManager.addArea(newArea);
        const newIndex = this.areaManager.getAllAreas().length - 1;
        this.areaManager.selectArea(newIndex);

        UIHelper.showMessage('新しいエリアを追加しました。画像上で頂点をクリックして追加してください');
    }

    /**
     * エリアを削除
     */
    async handleDeleteArea() {
        const index = this.areaManager.selectedAreaIndex;
        if (index < 0) {
            UIHelper.showError('エリアが選択されていません');
            return;
        }

        const area = this.areaManager.getSelectedArea();
        if (confirm(`エリア「${area.areaName}」を削除しますか？`)) {
            // Firebaseから削除
            await this.firebaseSyncManager.deleteAreaFromFirebase(index);
            this.areaManager.deleteArea(index);
            UIHelper.showMessage('エリアを削除しました');
        }
    }

    /**
     * キャンバスを再描画
     */
    redrawCanvas() {
        this.canvasRenderer.redraw(
            this.pointManager.getPoints(),
            this.areaManager.getAllAreas(),
            {
                selectedAreaIndex: this.areaManager.selectedAreaIndex,
                showAreaEditMode: this.layoutManager.getCurrentEditingMode() === 'area'
            }
        );
    }

    /**
     * ポイントID表示/非表示切り替え
     */
    handlePointIdVisibilityChange(visible) {
        this.inputManager.setPointIdVisibility(visible);
    }

    /**
     * ウィンドウリサイズ処理
     */
    handleWindowResize() {
        this.resizeHandler.handleResize(
            this.currentImage,
            this.canvas,
            this.canvasRenderer,
            this.layoutManager,
            this.pointManager,
            this.areaManager,
            this.viewportManager,
            () => this.redrawCanvas()
        );
    }
}
