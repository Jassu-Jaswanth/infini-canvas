# Infinite Canvas Drawing Board

A cross-platform, lag-free infinite canvas drawing application with full support for graphic tablets, pen pressure, and real-time collaboration.

## Features

- ✨ **Infinite Canvas**: Pan and zoom freely across an unlimited drawing space
- 🖊️ **Pen Pressure Support**: Full support for graphic tablets with pressure sensitivity
- 🎨 **Drawing Tools**: Pen, Brush, and Eraser with customizable size and opacity
- 🎡 **Tool Wheel**: Quick tool switching with an intuitive circular UI
- 💾 **Smart Saving**: Local drawing with manual save and auto-save options
- 🌐 **Cross-Platform**: Works on Windows, Mac, Linux, and any modern browser
- 🚀 **Real-time Collaboration**: See other users' cursors and strokes in real-time
- ↩️ **Undo/Redo**: Full undo/redo support with keyboard shortcuts
- ⌨️ **Keyboard Shortcuts**: 
  - `Ctrl/Cmd + Z`: Undo
  - `Ctrl/Cmd + Shift + Z`: Redo
  - `Ctrl/Cmd + S`: Save

## Prerequisites

Before you can run this application, you need to have Node.js installed on your system.

### Installing Node.js

#### Windows
1. Download Node.js from [https://nodejs.org/](https://nodejs.org/)
2. Run the installer and follow the setup wizard
3. Restart your terminal/command prompt after installation

#### Mac
```bash
# Using Homebrew
brew install node

# Or download from https://nodejs.org/
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm

# Fedora
sudo dnf install nodejs npm

# Arch
sudo pacman -S nodejs npm
```

## Installation

1. After installing Node.js, navigate to the project directory:
```bash
cd d:\Projects\infiniCanvas\CascadeProjects\windsurf-project
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

The server will start on port 8080 by default.

### Access the application:
Open your browser and navigate to:
```
http://localhost:8080
```

### Using different boards:
You can create separate drawing boards by using different board IDs:
```
http://localhost:8080?board=my-board-name
```

## Architecture

### Frontend
- **HTML5 Canvas**: Core drawing surface with hardware acceleration
- **Pointer Events API**: Native support for pen pressure and tablet input
- **WebSocket**: Real-time communication for collaboration features
- **Local-First**: All drawing happens locally for zero-latency experience

### Backend
- **Node.js + Express**: Lightweight server for cross-platform compatibility
- **WebSocket Server**: Handles real-time updates and collaboration
- **REST API**: Save/load endpoints for persistent storage
- **In-Memory Storage**: Fast access (can be replaced with database for production)

## How It Works

1. **Local Drawing**: All drawing operations happen instantly on your local canvas - no network delay
2. **Manual/Auto Save**: Choose when to sync with the server - manually or automatically every 30 seconds
3. **Infinite Canvas**: The canvas viewport can be panned and zoomed infinitely
4. **Pen Pressure**: Automatically detects and uses pressure data from graphic tablets
5. **Real-time Sync**: When connected, see other users' cursors and drawing previews

## Browser Compatibility

Works on all modern browsers that support:
- HTML5 Canvas
- Pointer Events API
- WebSocket
- ES6 JavaScript

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Performance Optimizations

- Uses device pixel ratio for crisp rendering on high-DPI displays
- Separate preview canvas for live strokes (no redraw lag)
- Throttled WebSocket updates
- Efficient stroke rendering with quadratic curves
- Smart viewport culling for large canvases

## Development

The project structure:
```
windsurf-project/
├── server.js           # Main server file
├── package.json        # Node dependencies
├── public/
│   ├── index.html     # Main HTML file
│   ├── styles.css     # Styling
│   └── canvas.js      # Canvas logic
└── README.md          # This file
```

## License

MIT License - feel free to use this project for any purpose.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.
