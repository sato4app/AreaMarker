import { CoordinateUtils } from '../utils/Coordinates.js';
import { UIHelper } from '../ui/UIHelper.js';

/**
 * Firebase同期処理を管理するクラス
 */
export class FirebaseSyncManager {
    constructor(pointManager, areaManager, fileHandler) {
        this.pointManager = pointManager;
        this.areaManager = areaManager;
        this.fileHandler = fileHandler;
        this.currentImage = null;
        this.canvas = null;
    }

    setImageAndCanvas(image, canvas) {
        this.currentImage = image;
        this.canvas = canvas;
    }

    async updatePointToFirebase(pointIndex) {
        if (!window.firestoreManager || !this.currentImage) return;

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        const points = this.pointManager.getPoints();
        if (pointIndex < 0 || pointIndex >= points.length) return;

        const point = points[pointIndex];
        if (!point.id || point.id.trim() === '') return;

        try {
            const imageCoords = CoordinateUtils.canvasToImage(
                point.x, point.y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                await window.firestoreManager.createProjectMetadata(projectId, {
                    projectName: projectId,
                    imageName: projectId + '.png',
                    imageWidth: this.currentImage.width,
                    imageHeight: this.currentImage.height
                });
            }

            const existingPoint = await window.firestoreManager.findPointById(projectId, point.id);
            if (existingPoint) {
                await window.firestoreManager.updatePoint(projectId, existingPoint.firestoreId, {
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0
                });
            } else {
                await window.firestoreManager.addPoint(projectId, {
                    id: point.id,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0
                });
            }
        } catch (error) {
            console.error('Point sync error:', error);
        }
    }

    async deletePointFromFirebase(x, y) {
        if (!window.firestoreManager || !this.currentImage) return;

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        try {
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            const firebasePoints = await window.firestoreManager.getPoints(projectId);
            const tolerance = 1.0;

            for (const p of firebasePoints) {
                const dx = Math.abs(p.x - imageCoords.x);
                const dy = Math.abs(p.y - imageCoords.y);
                if (dx <= tolerance && dy <= tolerance) {
                    await window.firestoreManager.deletePoint(projectId, p.firestoreId);
                    break;
                }
            }
        } catch (error) {
            console.error('Point delete sync error:', error);
        }
    }

    async updateAreaToFirebase(areaIndex) {
        if (!window.firestoreManager || !this.currentImage) return;

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        const areas = this.areaManager.getAllAreas();
        if (areaIndex < 0 || areaIndex >= areas.length) return;

        const area = areas[areaIndex];
        if (!area.areaName || area.areaName.trim() === '') return;

        try {
            const convertedVertices = (area.vertices || []).map(v => {
                const imageCoords = CoordinateUtils.canvasToImage(
                    v.x, v.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );
                return { x: imageCoords.x, y: imageCoords.y };
            });

            const areaData = {
                areaName: area.areaName,
                vertices: convertedVertices
            };

            if (area.firestoreId) {
                await window.firestoreManager.updateArea(projectId, area.firestoreId, areaData);
            } else {
                const result = await window.firestoreManager.addArea(projectId, areaData);
                if (result.status === 'success') {
                    area.firestoreId = result.firestoreId;
                }
            }
        } catch (error) {
            console.error('Area sync error:', error);
        }
    }

    async deleteAreaFromFirebase(areaIndex) {
        if (!window.firestoreManager || !this.currentImage) return;

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        const area = this.areaManager.getAllAreas()[areaIndex];
        if (!area || !area.firestoreId) return;

        try {
            await window.firestoreManager.deleteArea(projectId, area.firestoreId);
        } catch (error) {
            console.error('Area delete sync error:', error);
        }
    }

    async loadFromFirebase(onLoadComplete) {
        if (!window.firestoreManager) {
            UIHelper.showError('Firebase接続が利用できません');
            return;
        }

        if (!this.currentImage) {
            UIHelper.showError('先に画像を読み込んでください');
            return;
        }

        try {
            const projectId = this.fileHandler.getCurrentImageFileName();
            if (!projectId) return;

            const projectMetadata = await window.firestoreManager.getProjectMetadata(projectId);
            if (!projectMetadata) {
                if (onLoadComplete) onLoadComplete(0, 0);
                return;
            }

            if (this.pointManager.getPoints().length > 0 || this.areaManager.getAllAreas().length > 0) {
                if (!confirm('現在のデータを削除して読み込みますか？')) return;
            }

            this.pointManager.clearPoints();
            this.areaManager.areas = []; // Directly clear for simplicity

            const firebasePoints = await window.firestoreManager.getPoints(projectId);
            let loadedPoints = 0;
            for (const p of firebasePoints) {
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    p.x, p.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );
                this.pointManager.addPoint(canvasCoords.x, canvasCoords.y, p.id);
                loadedPoints++;
            }

            const firebaseAreas = await window.firestoreManager.getAreas(projectId);
            let loadedAreas = 0;
            for (const a of firebaseAreas) {
                const convertedVertices = (a.vertices || []).map(v => {
                    const canvasCoords = CoordinateUtils.imageToCanvas(
                        v.x, v.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    return { x: canvasCoords.x, y: canvasCoords.y };
                });

                this.areaManager.addArea({
                    firestoreId: a.firestoreId,
                    areaName: a.areaName,
                    vertices: convertedVertices
                });
                loadedAreas++;
            }

            if (onLoadComplete) onLoadComplete(loadedPoints, loadedAreas);
            UIHelper.showMessage(`読み込み完了: ポイント${loadedPoints}件、エリア${loadedAreas}件`);

        } catch (error) {
            UIHelper.showError('読み込み中にエラーが発生しました: ' + error.message);
        }
    }
}
