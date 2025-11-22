const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store canvas data in memory (in production, use a database)
const canvasBoards = new Map();

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
  
  // Broadcast update to all connected clients
  broadcast(req.params.id, {
    type: 'board-updated',
    board: board
  });
  
  res.json({ success: true, lastModified: board.lastModified });
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
