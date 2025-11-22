class InfiniteCanvas {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.previewCanvas = document.getElementById('previewCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.previewCtx = this.previewCanvas.getContext('2d');
        
        this.backingScale = 1;
        
        // Canvas state
        this.viewport = { x: 0, y: 0, scale: 1 };
        this.strokes = [];
        this.redoStack = [];
        this.currentStroke = null;
        this.isDrawing = false;
        this.isPanning = false;
        
        // Tools and settings
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.brushSize = 5;
        this.brushOpacity = 1;
        
        // Auto-save
        this.autoSaveEnabled = false;
        this.autoSaveInterval = null;
        this.hasUnsavedChanges = false;
        
        // Board ID
        this.boardId = new URLSearchParams(window.location.search).get('board') || 'default';
        
        // WebSocket
        this.ws = null;
        this.userId = Math.random().toString(36).substr(2, 9);
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupWebSocket();
        this.loadBoard();
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Set display size
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.previewCanvas.style.width = width + 'px';
        this.previewCanvas.style.height = height + 'px';
        
        this.updateResolution();
    }

    updateResolution() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        
        const superSample = this.viewport && this.viewport.scale <= 1 ? 2 : 1;
        const renderScale = dpr * superSample;
        
        const targetW = Math.floor(width * renderScale);
        const targetH = Math.floor(height * renderScale);
        if (this.backingScale !== renderScale || this.canvas.width !== targetW || this.canvas.height !== targetH) {
            this.backingScale = renderScale;
            this.canvas.width = targetW;
            this.canvas.height = targetH;
            this.previewCanvas.width = targetW;
            this.previewCanvas.height = targetH;
        }
        
        this.ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        this.previewCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        
        this.redraw();
    }
    
    setupEventListeners() {
        // Drawing events with pen pressure support
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        
        // Prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Touch events for better tablet support
        this.canvas.addEventListener('touchstart', (e) => e.preventDefault());
        
        // Wheel for zooming
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectTool(btn.dataset.tool);
            });
        });
        
        // Color picker and presets
        document.getElementById('colorPicker').addEventListener('change', (e) => {
            this.currentColor = e.target.value;
        });
        
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentColor = btn.dataset.color;
                document.getElementById('colorPicker').value = btn.dataset.color;
            });
        });
        
        // Brush settings
        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('sizeValue').textContent = this.brushSize;
        });
        
        document.getElementById('brushOpacity').addEventListener('input', (e) => {
            this.brushOpacity = parseInt(e.target.value) / 100;
            document.getElementById('opacityValue').textContent = e.target.value;
        });
        
        // Control buttons
        document.getElementById('saveBtn').addEventListener('click', () => this.saveToServer());
        document.getElementById('loadBtn').addEventListener('click', () => this.loadBoard());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearCanvas());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        
        // Auto-save toggle
        document.getElementById('autoSaveToggle').addEventListener('change', (e) => {
            this.toggleAutoSave(e.target.checked);
        });
        
        const zoomInput = document.getElementById('zoomInput');
        if (zoomInput) {
            const applyZoomInput = () => {
                const val = parseFloat(zoomInput.value);
                if (!isNaN(val)) {
                    const clamped = Math.max(10, Math.min(1000, val));
                    this.setZoom(clamped / 100);
                }
            };
            zoomInput.addEventListener('change', applyZoomInput);
            zoomInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') applyZoomInput();
            });
        }
        document.querySelectorAll('.zoom-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const z = parseFloat(btn.dataset.zoom);
                if (!isNaN(z)) {
                    this.setZoom(z / 100);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.redo();
                        } else {
                            this.undo();
                        }
                        break;
                    case 's':
                        e.preventDefault();
                        this.saveToServer();
                        break;
                }
            }
        });
    }
    
    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?board=${this.boardId}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            document.getElementById('connectionStatus').textContent = 'Connected';
            document.getElementById('connectionStatus').className = 'connected';
        };
        
        this.ws.onclose = () => {
            document.getElementById('connectionStatus').textContent = 'Disconnected';
            document.getElementById('connectionStatus').className = 'disconnected';
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'init':
                    // Initial board state from server
                    if (data.board && data.board.strokes) {
                        this.strokes = data.board.strokes;
                        this.viewport = data.board.viewport || this.viewport;
                        this.redraw();
                    }
                    break;
                    
                case 'board-updated':
                    // Board was updated by another user
                    if (data.board) {
                        this.strokes = data.board.strokes;
                        this.redraw();
                    }
                    break;
                    
                case 'stroke-preview':
                    // Live stroke preview from another user
                    if (data.userId !== this.userId && data.stroke) {
                        this.drawStrokePreview(data.stroke);
                    }
                    break;
            }
        };
    }
    
    handlePointerDown(e) {
        const point = this.getPointFromEvent(e);
        
        if (this.currentTool === 'pan') {
            this.isPanning = true;
            this.lastPanPoint = point;
            document.body.classList.add('panning');
            return;
        }
        
        this.isDrawing = true;
        this.currentStroke = {
            tool: this.currentTool,
            color: this.currentColor,
            size: this.brushSize,
            opacity: this.brushOpacity,
            points: [point]
        };
        
        // Start drawing immediately for responsive feel
        this.drawPoint(point);
    }
    
    handlePointerMove(e) {
        // Update coordinates display
        const point = this.getPointFromEvent(e);
        document.getElementById('coordinates').textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
        
        if (this.isPanning && this.lastPanPoint) {
            // Use raw coordinates for panning (not scaled)
            const dx = point.rawX - this.lastPanPoint.rawX;
            const dy = point.rawY - this.lastPanPoint.rawY;
            
            this.viewport.x += dx;
            this.viewport.y += dy;
            this.lastPanPoint = point;
            
            this.redraw();
            return;
        }
        
        if (!this.isDrawing || !this.currentStroke) return;

        // Add new point to the stroke
        this.currentStroke.points.push(point);

        if (this.currentTool === 'eraser') {
            // For eraser, draw directly on the main canvas so erasing is live
            const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 2];
            if (lastPoint) {
                this.drawLine(lastPoint, point);
            }
        } else {
            // For pen/brush, clear preview and redraw the full stroke with pressure
            this.clearPreview();
            this.drawStroke(this.currentStroke, this.previewCtx);
        }
        
        // Broadcast stroke preview for real-time collaboration
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'stroke-preview',
                userId: this.userId,
                stroke: this.currentStroke
            }));
        }
        
        this.hasUnsavedChanges = true;
    }
    
    handlePointerUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            document.body.classList.remove('panning');
            return;
        }
        
        if (!this.isDrawing || !this.currentStroke) return;
        
        // Finalize stroke
        this.isDrawing = false;
        
        // Add to strokes array
        this.strokes.push(this.currentStroke);
        this.redoStack = []; // Clear redo stack on new action
        
        // Clear preview and redraw main canvas
        this.clearPreview();
        this.redraw();
        
        this.currentStroke = null;
        this.hasUnsavedChanges = true;
    }
    
    handleWheel(e) {
        e.preventDefault();
        const scaleDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(10, this.viewport.scale * scaleDelta));
        const rect = this.canvas.getBoundingClientRect();
        this.setZoom(newScale, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    setZoom(newScale, screenPoint) {
        const rect = this.canvas.getBoundingClientRect();
        const Sx = screenPoint && typeof screenPoint.x === 'number' ? screenPoint.x : rect.width / 2;
        const Sy = screenPoint && typeof screenPoint.y === 'number' ? screenPoint.y : rect.height / 2;
        
        newScale = Math.max(0.1, Math.min(10, newScale));
        const currentScale = this.viewport.scale || 1;
        const scaleDelta = newScale / currentScale;
        
        
        this.viewport.x = this.viewport.x + (1 - scaleDelta) * (Sx - this.viewport.x);
        this.viewport.y = this.viewport.y + (1 - scaleDelta) * (Sy - this.viewport.y);
        this.viewport.scale = newScale;
        
        const zl = document.getElementById('zoomLevel');
        if (zl) zl.textContent = Math.round(newScale * 100) + '%';
        const zi = document.getElementById('zoomInput');
        if (zi) zi.value = Math.round(newScale * 100);
        
        
        this.updateResolution();
    }
    
    getPointFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();

        // Use raw hardware pressure when available (0.0 - 1.0 float)
        let rawPressure = 0;
        if (typeof e.pressure === 'number') {
            rawPressure = e.pressure;
        }

        // Effective pressure for stroke width (keep tiny minimum so strokes are visible)
        let pressure = rawPressure;
        if (pressure === 0 && e.buttons) {
            pressure = 0.05;
        }
        
        return {
            x: (e.clientX - rect.left - this.viewport.x) / this.viewport.scale,
            y: (e.clientY - rect.top - this.viewport.y) / this.viewport.scale,
            pressure: pressure,
            rawPressure: rawPressure,
            rawX: e.clientX - rect.left,  // For panning (unscaled)
            rawY: e.clientY - rect.top    // For panning (unscaled)
        };
    }
    
    drawPoint(point) {
        // For pen/brush, draw on preview canvas while stroking.
        // For eraser, draw directly on the main canvas so erasing is visible live.
        let ctx;
        if (this.isDrawing && this.currentTool === 'eraser') {
            ctx = this.ctx;
        } else if (this.isDrawing) {
            ctx = this.previewCtx;
        } else {
            ctx = this.ctx;
        }

        ctx.save();
        ctx.translate(this.viewport.x, this.viewport.y);
        ctx.scale(this.viewport.scale, this.viewport.scale);
        
        ctx.globalAlpha = this.brushOpacity;

        if (this.isDrawing && this.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = '#000000';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = this.currentColor;
        }

        // Map pressure 0..1 to a width range [minWidth, brushSize]
        const minWidth = 1;
        const maxWidth = Math.max(minWidth, this.brushSize);
        const width = minWidth + (maxWidth - minWidth) * point.pressure;
        const radius = width / 2;

        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawLine(from, to) {
        // For pen/brush, draw on preview canvas while stroking.
        // For eraser, draw directly on the main canvas so erasing is visible live.
        let ctx;
        if (this.isDrawing && this.currentTool === 'eraser') {
            ctx = this.ctx;
        } else if (this.isDrawing) {
            ctx = this.previewCtx;
        } else {
            ctx = this.ctx;
        }

        ctx.save();
        ctx.translate(this.viewport.x, this.viewport.y);
        ctx.scale(this.viewport.scale, this.viewport.scale);
        
        ctx.globalAlpha = this.brushOpacity;

        const avgPressure = (from.pressure + to.pressure) / 2;

        // Map pressure 0..1 to a width range [minWidth, brushSize]
        const minWidth = 1;
        const maxWidth = Math.max(minWidth, this.brushSize);
        const width = minWidth + (maxWidth - minWidth) * avgPressure;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.isDrawing && this.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = '#000000';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = this.currentColor;
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawStroke(stroke, context = this.ctx) {
        if (stroke.points.length === 0) return;
        
        context.save();
        context.translate(this.viewport.x, this.viewport.y);
        context.scale(this.viewport.scale, this.viewport.scale);
        context.globalAlpha = stroke.opacity;
        
        if (stroke.tool === 'eraser') {
            context.globalCompositeOperation = 'destination-out';
        }
        
        // Draw each segment with its own pressure to preserve pressure variation
        for (let i = 0; i < stroke.points.length; i++) {
            if (i === 0) {
                // Draw first point as a circle
                const point = stroke.points[i];
                context.fillStyle = stroke.tool === 'eraser' ? '#FFFFFF' : stroke.color;

                const minWidth = 1;
                const maxWidth = Math.max(minWidth, stroke.size);
                const width = minWidth + (maxWidth - minWidth) * point.pressure;
                const radius = width / 2;

                context.beginPath();
                context.arc(point.x, point.y, radius, 0, Math.PI * 2);
                context.fill();
            } else {
                // Draw line segment with pressure-sensitive width
                const prevPoint = stroke.points[i - 1];
                const point = stroke.points[i];
                
                // Use average pressure for this segment
                const avgPressure = (prevPoint.pressure + point.pressure) / 2;

                const minWidth = 1;
                const maxWidth = Math.max(minWidth, stroke.size);
                const width = minWidth + (maxWidth - minWidth) * avgPressure;
                
                context.strokeStyle = stroke.tool === 'eraser' ? '#FFFFFF' : stroke.color;
                context.lineWidth = width;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                
                context.beginPath();
                context.moveTo(prevPoint.x, prevPoint.y);
                
                // For smoother curves, use quadratic curve through midpoint
                if (i < stroke.points.length - 1) {
                    const nextPoint = stroke.points[i + 1];
                    const midX = (point.x + nextPoint.x) / 2;
                    const midY = (point.y + nextPoint.y) / 2;
                    context.quadraticCurveTo(point.x, point.y, midX, midY);
                } else {
                    // Last segment - just draw to the point
                    context.lineTo(point.x, point.y);
                }
                
                context.stroke();
            }
        }
        
        context.restore();
    }
    
    drawStrokePreview(stroke) {
        this.clearPreview();
        this.drawStroke(stroke, this.previewCtx);
    }
    
    redraw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw white background
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw all strokes
        this.strokes.forEach(stroke => {
            this.drawStroke(stroke);
        });
    }
    
    clearPreview() {
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }
    
    selectTool(tool) {
        this.currentTool = tool;
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        
        // Update cursor
        document.body.className = `tool-${tool}`;
    }
    
    clearCanvas() {
        if (confirm('Clear the entire canvas? This cannot be undone.')) {
            this.strokes = [];
            this.redoStack = [];
            this.redraw();
            this.hasUnsavedChanges = true;
        }
    }
    
    undo() {
        if (this.strokes.length > 0) {
            const stroke = this.strokes.pop();
            this.redoStack.push(stroke);
            this.redraw();
            this.hasUnsavedChanges = true;
        }
    }
    
    redo() {
        if (this.redoStack.length > 0) {
            const stroke = this.redoStack.pop();
            this.strokes.push(stroke);
            this.redraw();
            this.hasUnsavedChanges = true;
        }
    }
    
    async saveToServer() {
        try {
            document.getElementById('saveStatus').textContent = 'Saving...';
            
            const response = await fetch(`/api/board/${this.boardId}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    strokes: this.strokes,
                    viewport: this.viewport
                })
            });
            
            if (response.ok) {
                document.getElementById('saveStatus').textContent = 'Saved!';
                this.hasUnsavedChanges = false;
                setTimeout(() => {
                    document.getElementById('saveStatus').textContent = '';
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to save:', error);
            document.getElementById('saveStatus').textContent = 'Save failed';
        }
    }
    
    async loadBoard() {
        try {
            const response = await fetch(`/api/board/${this.boardId}`);
            const board = await response.json();
            
            if (board) {
                this.strokes = board.strokes || [];
                this.viewport = board.viewport || { x: 0, y: 0, scale: 1 };
                this.redraw();
                document.getElementById('zoomLevel').textContent = Math.round(this.viewport.scale * 100) + '%';
                const zi = document.getElementById('zoomInput');
                if (zi) zi.value = Math.round(this.viewport.scale * 100);
                
                this.updateResolution();
            }
        } catch (error) {
            console.error('Failed to load board:', error);
        }
    }
    
    toggleAutoSave(enabled) {
        this.autoSaveEnabled = enabled;
        
        if (enabled) {
            // Ensure we don't create duplicate intervals
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
            }
            // Auto-save every 30 seconds
            this.autoSaveInterval = setInterval(() => {
                if (this.hasUnsavedChanges) {
                    this.saveToServer();
                }
            }, 30000);
        } else {
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }
        }
    }
}

function setupBoardManager(canvas) {
    const overlay = document.getElementById('boardManagerOverlay');
    const boardsBtn = document.getElementById('boardsBtn');
    const closeBtn = document.getElementById('boardManagerClose');
    const folderListEl = document.getElementById('folderList');
    const boardListEl = document.getElementById('boardList');
    const newFolderInput = document.getElementById('newFolderName');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const newBoardInput = document.getElementById('newBoardName');
    const createBoardBtn = document.getElementById('createBoardBtn');

    if (!overlay || !boardsBtn || !closeBtn || !folderListEl || !boardListEl || !newFolderInput || !createFolderBtn || !newBoardInput || !createBoardBtn) {
        return;
    }

    let foldersData = [];
    let selectedFolderId = null;

    function formatDate(ts) {
        if (!ts) {
            return '';
        }
        const d = new Date(ts);
        return d.toLocaleString();
    }

    function renderFolders() {
        folderListEl.innerHTML = '';
        foldersData.forEach(folder => {
            const li = document.createElement('li');
            li.className = 'board-manager-list-item' + (folder.id === selectedFolderId ? ' active' : '');
            const nameSpan = document.createElement('span');
            nameSpan.className = 'board-manager-list-item-name';
            nameSpan.textContent = folder.name;
            li.appendChild(nameSpan);
            li.addEventListener('click', () => {
                selectedFolderId = folder.id;
                renderFolders();
                renderBoards();
            });
            folderListEl.appendChild(li);
        });
    }

    function renderBoards() {
        boardListEl.innerHTML = '';
        const folder = foldersData.find(f => f.id === selectedFolderId);
        if (!folder) {
            return;
        }
        const currentParams = new URLSearchParams(window.location.search);
        const currentBoardId = currentParams.get('board') || 'default';
        folder.boards.forEach(board => {
            const li = document.createElement('li');
            li.className = 'board-manager-list-item' + (board.id === currentBoardId ? ' active' : '');
            const nameSpan = document.createElement('span');
            nameSpan.className = 'board-manager-list-item-name';
            nameSpan.textContent = board.name;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'board-manager-list-item-meta';
            metaSpan.textContent = formatDate(board.lastModified);
            li.appendChild(nameSpan);
            li.appendChild(metaSpan);
            li.addEventListener('click', () => {
                const url = new URL(window.location.href);
                url.searchParams.set('board', board.id);
                window.location.href = url.toString();
            });
            boardListEl.appendChild(li);
        });
    }

    function setOverlayOpen(open) {
        if (open) {
            overlay.classList.add('open');
        } else {
            overlay.classList.remove('open');
        }
    }

    async function loadFolders() {
        try {
            const res = await fetch('/api/folders');
            const data = await res.json();
            if (!Array.isArray(data)) {
                return;
            }
            foldersData = data;
            const currentParams = new URLSearchParams(window.location.search);
            const currentBoardId = currentParams.get('board') || 'default';

            // Prefer the folder that contains the currently active board
            if (currentBoardId) {
                const containingFolder = foldersData.find(f => Array.isArray(f.boards) && f.boards.some(b => b.id === currentBoardId));
                if (containingFolder) {
                    selectedFolderId = containingFolder.id;
                }
            }

            // Fallback: first folder
            if (!selectedFolderId && foldersData.length > 0) {
                selectedFolderId = foldersData[0].id;
            }
            renderFolders();
            renderBoards();
        } catch (err) {
        }
    }

    async function handleCreateFolder() {
        const name = newFolderInput.value.trim();
        if (!name) {
            return;
        }
        try {
            await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            newFolderInput.value = '';
            await loadFolders();
        } catch (err) {
        }
    }

    async function handleCreateBoard() {
        if (!selectedFolderId) {
            return;
        }
        const name = newBoardInput.value.trim();
        if (!name) {
            return;
        }
        try {
            await fetch('/api/folders/' + encodeURIComponent(selectedFolderId) + '/boards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            newBoardInput.value = '';
            await loadFolders();
        } catch (err) {
        }
    }

    boardsBtn.addEventListener('click', () => {
        setOverlayOpen(true);
        loadFolders();
    });

    closeBtn.addEventListener('click', () => {
        setOverlayOpen(false);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            setOverlayOpen(false);
        }
    });

    createFolderBtn.addEventListener('click', () => {
        handleCreateFolder();
    });

    createBoardBtn.addEventListener('click', () => {
        handleCreateBoard();
    });

    newFolderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleCreateFolder();
        }
    });

    newBoardInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleCreateBoard();
        }
    });
}

// Initialize the canvas when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = new InfiniteCanvas();
    
    // Set default tool
    canvas.selectTool('pen');

    setupBoardManager(canvas);
    
    // Warn before leaving if there are unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (canvas.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
