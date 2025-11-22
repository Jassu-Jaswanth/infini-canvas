const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Store canvas data in memory (in production, use a database)
const canvasBoards = new Map();

// In-memory folder/board metadata
const folders = new Map();

function slugifyName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function generateId(prefix, name) {
  const slug = slugifyName(name || '');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${slug}-${rand}`;
}

// Get or create a canvas board
function getBoard(boardId) {
  if (!canvasBoards.has(boardId)) {
    canvasBoards.set(boardId, {
      id: boardId,
      strokes: [],
      viewport: { x: 0, y: 0, scale: 1 },
      lastModified: Date.now()
    });
  }
  return canvasBoards.get(boardId);
}

function ensureDefaultFolderAndBoard() {
  if (!folders.has('default')) {
    folders.set('default', {
      id: 'default',
      name: 'Default',
      boards: new Map()
    });
  }

  const folder = folders.get('default');
  if (!folder.boards.size) {
    const defaultBoardId = 'default';
    const board = getBoard(defaultBoardId);
    folder.boards.set(defaultBoardId, {
      id: defaultBoardId,
      name: 'Default Board',
      lastModified: board.lastModified
    });
  }
}

ensureDefaultFolderAndBoard();

function getFoldersSnapshot() {
  ensureDefaultFolderAndBoard();
  return Array.from(folders.values()).map(folder => ({
    id: folder.id,
    name: folder.name,
    boards: Array.from(folder.boards.values()).map(boardMeta => {
      const board = canvasBoards.get(boardMeta.id);
      const lastModified = board ? board.lastModified : boardMeta.lastModified;
      return {
        id: boardMeta.id,
        name: boardMeta.name,
        lastModified
      };
    })
  }));
}

// REST API for saving/loading canvas data
app.get('/api/board/:id', (req, res) => {
  const board = getBoard(req.params.id);
  res.json(board);
});

app.post('/api/board/:id/save', (req, res) => {
  const board = getBoard(req.params.id);
  board.strokes = req.body.strokes || board.strokes;
  board.viewport = req.body.viewport || board.viewport;
  board.lastModified = Date.now();

  folders.forEach(folder => {
    const meta = folder.boards.get(req.params.id);
    if (meta) {
      meta.lastModified = board.lastModified;
    }
  });
  
  // Broadcast update to all connected clients
  broadcast(req.params.id, {
    type: 'board-updated',
    board: board
  });
  
  res.json({ success: true, lastModified: board.lastModified });
});

// Folder and board metadata APIs
app.get('/api/folders', (req, res) => {
  res.json(getFoldersSnapshot());
});

app.post('/api/folders', (req, res) => {
  const name = (req.body && typeof req.body.name === 'string' && req.body.name.trim()) || 'Untitled Folder';
  const folderName = name.trim();
  const id = generateId('folder', folderName);

  if (!folders.has(id)) {
    folders.set(id, {
      id,
      name: folderName,
      boards: new Map()
    });
  }

  res.status(201).json({
    id,
    name: folderName,
    boards: []
  });
});

app.post('/api/folders/:folderId/boards', (req, res) => {
  ensureDefaultFolderAndBoard();
  const folder = folders.get(req.params.folderId);
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  const name = (req.body && typeof req.body.name === 'string' && req.body.name.trim()) || 'Untitled Board';
  const boardName = name.trim();
  const boardId = generateId('board', boardName);
  const board = getBoard(boardId);

  const meta = {
    id: boardId,
    name: boardName,
    lastModified: board.lastModified
  };

  folder.boards.set(boardId, meta);

  res.status(201).json(meta);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connections by board
const boardConnections = new Map();

function broadcast(boardId, data) {
  const connections = boardConnections.get(boardId) || [];
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws, req) => {
  const boardId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('board') || 'default';
  
  // Add connection to board
  if (!boardConnections.has(boardId)) {
    boardConnections.set(boardId, []);
  }
  boardConnections.get(boardId).push(ws);
  
  // Send current board state
  const board = getBoard(boardId);
  ws.send(JSON.stringify({
    type: 'init',
    board: board
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle different message types
      switch(data.type) {
        case 'cursor':
          // Broadcast cursor position to other users
          broadcast(boardId, {
            type: 'cursor',
            userId: data.userId,
            x: data.x,
            y: data.y
          });
          break;
          
        case 'stroke-preview':
          // Broadcast live stroke preview to other users
          broadcast(boardId, {
            type: 'stroke-preview',
            userId: data.userId,
            stroke: data.stroke
          });
          break;
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
  
  ws.on('close', () => {
    const connections = boardConnections.get(boardId) || [];
    const index = connections.indexOf(ws);
    if (index > -1) {
      connections.splice(index, 1);
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
