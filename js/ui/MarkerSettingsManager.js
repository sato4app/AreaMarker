/**
 * マーカーサイズ設定マネージャー
 */
export class MarkerSettingsManager {
    constructor() {
        this.defaultSizes = {
            point: 6,
            selectedWaypoint: 6,
            unselectedWaypoint: 4
        };

        this.currentSizes = { ...this.defaultSizes };
        this.dialog = null;
        this.overlay = null;
        this.inputs = {};
        this.onSettingsChange = null;
        this.storageKey = 'areaMarkerSettings';

        this.init();
    }

    init() {
        this.dialog = document.getElementById('markerSettingsDialog');
        this.overlay = this.dialog;

        if (!this.dialog) return;

        this.inputs = {
            point: document.getElementById('pointSizeInput'),
            selectedWaypoint: document.getElementById('selectedWaypointSizeInput'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeInput')
        };

        this.sliders = {
            point: document.getElementById('pointSizeSlider'),
            selectedWaypoint: document.getElementById('selectedWaypointSizeSlider'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeSlider')
        };

        this.okBtn = document.getElementById('settingsOkBtn');
        this.cancelBtn = document.getElementById('settingsCancelBtn');
        this.resetBtn = document.getElementById('settingsResetBtn');

        if (!this.okBtn || !this.cancelBtn || !this.resetBtn) return;

        this.setupEventListeners();
        this.loadSettings();
    }

    setupEventListeners() {
        this.okBtn.addEventListener('click', () => this.applySettings());
        this.cancelBtn.addEventListener('click', () => this.closeDialog());
        this.resetBtn.addEventListener('click', () => this.resetToDefaultAndApply());

        this.setupSliderSync('point');
        this.setupSliderSync('selectedWaypoint');
        this.setupSliderSync('unselectedWaypoint');

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.closeDialog();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog.style.display !== 'none') {
                this.closeDialog();
            }
        });
    }

    setupSliderSync(key) {
        const slider = this.sliders[key];
        const input = this.inputs[key];
        if (!slider || !input) return;

        slider.addEventListener('input', () => {
            input.value = parseFloat(slider.value).toFixed(1);
        });

        input.addEventListener('input', () => {
            const value = parseFloat(input.value);
            if (!isNaN(value)) slider.value = value;
        });
    }

    openDialog() {
        if (!this.dialog) return;

        this.inputs.point.value = this.currentSizes.point.toFixed(1);
        this.sliders.point.value = this.currentSizes.point;

        this.inputs.selectedWaypoint.value = this.currentSizes.selectedWaypoint.toFixed(1);
        this.sliders.selectedWaypoint.value = this.currentSizes.selectedWaypoint;

        this.inputs.unselectedWaypoint.value = this.currentSizes.unselectedWaypoint.toFixed(1);
        this.sliders.unselectedWaypoint.value = this.currentSizes.unselectedWaypoint;

        this.dialog.style.display = 'flex';
    }

    closeDialog() {
        this.dialog.style.display = 'none';
    }

    applySettings() {
        const newSizes = {
            point: parseFloat(this.inputs.point.value),
            selectedWaypoint: parseFloat(this.inputs.selectedWaypoint.value),
            unselectedWaypoint: parseFloat(this.inputs.unselectedWaypoint.value)
        };

        if (!this.validateSizes(newSizes)) {
            alert('入力値が範囲外です。');
            return;
        }

        this.currentSizes = newSizes;
        this.saveSettings();

        if (this.onSettingsChange) {
            this.onSettingsChange(this.currentSizes);
        }

        this.closeDialog();
    }

    validateSizes(sizes) {
        if (sizes.point < 2 || sizes.point > 12) return false;
        if (sizes.selectedWaypoint < 2 || sizes.selectedWaypoint > 12) return false;
        if (sizes.unselectedWaypoint < 2 || sizes.unselectedWaypoint > 12) return false;
        return true;
    }

    saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.currentSizes));
        } catch (error) {
            console.error('localStorage Error:', error);
        }
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (this.validateSizes(parsed)) {
                    this.currentSizes = parsed;
                }
            }
        } catch (error) {
            console.error('localStorage Load Error:', error);
        }
    }

    getSizes() {
        return { ...this.currentSizes };
    }

    setCallback(callback) {
        this.onSettingsChange = callback;
    }

    resetToDefaultAndApply() {
        this.inputs.point.value = this.defaultSizes.point.toFixed(1);
        this.sliders.point.value = this.defaultSizes.point;

        this.inputs.selectedWaypoint.value = this.defaultSizes.selectedWaypoint.toFixed(1);
        this.sliders.selectedWaypoint.value = this.defaultSizes.selectedWaypoint;

        this.inputs.unselectedWaypoint.value = this.defaultSizes.unselectedWaypoint.toFixed(1);
        this.sliders.unselectedWaypoint.value = this.defaultSizes.unselectedWaypoint;
    }
}
