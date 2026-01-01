/**
 * FirestoreDataManager.js
 * Firestoreデータ操作を管理するクラス
 */

export class FirestoreDataManager {
    constructor(firestore, userId) {
        this.db = firestore;
        this.userId = userId;
        this.currentProjectId = null;
        this.listeners = new Map();
    }

    setCurrentProject(projectId) {
        this.currentProjectId = projectId;
    }

    getCurrentProjectId() {
        return this.currentProjectId;
    }

    // ========================================
    // プロジェクト管理
    // ========================================

    async createProjectMetadata(projectId, metadata) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .set({
                    projectName: metadata.projectName || 'Untitled Project',
                    imageName: metadata.imageName || '',
                    imageWidth: metadata.imageWidth || 0,
                    imageHeight: metadata.imageHeight || 0,
                    createdBy: this.userId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastAccessedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: this.userId,
                    pointCount: 0,
                    areaCount: 0
                });
        } catch (error) {
            console.error('プロジェクトメタデータ作成失敗:', error);
            throw error;
        }
    }

    async updateProjectMetadata(projectId, updates) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: this.userId
                });
        } catch (error) {
            console.error('プロジェクトメタデータ更新失敗:', error);
            throw error;
        }
    }

    async getProjectMetadata(projectId) {
        try {
            const doc = await this.db
                .collection('projects')
                .doc(projectId)
                .get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('プロジェクトメタデータ取得失敗:', error);
            throw error;
        }
    }

    // ========================================
    // ポイント管理
    // ========================================

    async addPoint(projectId, point) {
        try {
            if (point.id && point.id.trim() !== '') {
                const existingPoint = await this.findPointById(projectId, point.id);
                if (existingPoint) {
                    return { status: 'duplicate', type: 'point', existing: existingPoint, attempted: point };
                }
            }

            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .add({
                    id: point.id || '',
                    x: point.x,
                    y: point.y,
                    index: point.index || 0,
                    isMarker: point.isMarker || false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            await this.incrementCounter(projectId, 'pointCount', 1);
            return { status: 'success', firestoreId: docRef.id };
        } catch (error) {
            console.error('ポイント追加失敗:', error);
            throw error;
        }
    }

    async findPointById(projectId, pointId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .where('id', '==', pointId)
                .limit(1)
                .get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { firestoreId: doc.id, ...doc.data() };
        } catch (error) {
            console.error('ポイント検索失敗:', error);
            throw error;
        }
    }

    async updatePoint(projectId, firestoreId, updates) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .doc(firestoreId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('ポイント更新失敗:', error);
            throw error;
        }
    }

    async deletePoint(projectId, firestoreId) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .doc(firestoreId)
                .delete();
            await this.incrementCounter(projectId, 'pointCount', -1);
        } catch (error) {
            console.error('ポイント削除失敗:', error);
            throw error;
        }
    }

    async getPoints(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .orderBy('index', 'asc')
                .get();
            return snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('ポイント取得失敗:', error);
            throw error;
        }
    }

    // ========================================
    // エリア管理
    // ========================================

    async addArea(projectId, area) {
        try {
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('areas')
                .add({
                    areaName: area.areaName || 'Unnamed Area',
                    vertices: area.vertices || [],
                    vertexCount: (area.vertices || []).length,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            await this.incrementCounter(projectId, 'areaCount', 1);
            return { status: 'success', firestoreId: docRef.id };
        } catch (error) {
            console.error('エリア追加失敗:', error);
            throw error;
        }
    }

    async updateArea(projectId, firestoreId, updates) {
        try {
            if (updates.vertices) {
                updates.vertexCount = updates.vertices.length;
            }
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('areas')
                .doc(firestoreId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('エリア更新失敗:', error);
            throw error;
        }
    }

    async deleteArea(projectId, firestoreId) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('areas')
                .doc(firestoreId)
                .delete();
            await this.incrementCounter(projectId, 'areaCount', -1);
        } catch (error) {
            console.error('エリア削除失敗:', error);
            throw error;
        }
    }

    async getAreas(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('areas')
                .get();
            return snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('エリア取得失敗:', error);
            throw error;
        }
    }

    // ========================================
    // ユーティリティ
    // ========================================

    async incrementCounter(projectId, field, increment) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .update({
                    [field]: firebase.firestore.FieldValue.increment(increment),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.warn('カウンター更新失敗 (メタデータ未作成の可能性):', error.message);
        }
    }
}
