# rtodo - A Modern Todo Application

A sleek, feature-rich todo application built with Tauri, React, and TypeScript. rtodo offers a modern interface with drag-and-drop functionality, data persistence, and dual-window support for enhanced productivity.

![rtodo](https://img.shields.io/badge/version-0.1.0-blue) ![Tauri](https://img.shields.io/badge/Tauri-2.0+-orange) ![React](https://img.shields.io/badge/React-19.1+-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)

## ✨ Features

- **📝 Task Management**: Create, complete, and delete todos with a clean interface
- **🎯 Drag & Drop**: Reorder tasks naturally using drag-and-drop functionality
- **📊 Statistics Dashboard**: Visual overview of total, active, and completed tasks
- **📅 Date-based Organization**: View todos by date with historical data access
- **🪟 Compact Mode**: Floating compact window for quick task access
- **🔄 Real-time Sync**: Automatic synchronization across windows
- **💾 Local Storage**: Persistent data storage with SQLite
- **🎨 Modern UI**: Beautiful dark theme with smooth animations
- **⌨️ Keyboard Shortcuts**: Full keyboard navigation support
- **📱 Responsive Design**: Adapts to different screen sizes

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm (recommended) or npm
- Rust (for Tauri development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jeffrey-dot/rtodo.git
   cd rtodo
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm tauri dev
   ```

## 🛠️ Development

### Available Scripts

- `pnpm dev` - Start the development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview the production build
- `pnpm tauri dev` - Run the Tauri app in development mode
- `pnpm tauri build` - Build the Tauri app for production
- `pnpm test:e2e` - Run Playwright end-to-end tests (headless)
- `pnpm test:e2e:ui` - Run Playwright tests with UI runner

### Project Structure

```
rtodo/
├── src/
│   ├── components/          # React components
│   │   ├── DatePicker.tsx
│   │   └── DraggableTodo.tsx
│   ├── utils/              # Utility functions
│   │   ├── database.ts     # Database operations
│   │   └── store.ts        # State management
│   ├── App.tsx             # Main application
│   └── CompactApp.tsx      # Compact window application
├── src-tauri/              # Tauri backend
├── public/                 # Static assets
└── dist/                   # Production build output
```

## 🎯 Usage

### Main Window
- Add new todos using the input field
- Click the checkbox to mark tasks as complete
- Drag tasks to reorder them
- Use filter tabs to view all, active, or completed tasks
- Click on the date to browse historical data
- Use "打开小窗" (Open Compact) button for floating window mode

### Compact Window
- Minimal interface for quick task management
- Always on top for easy access
- Positioned in top-right corner of the screen
- Synchronized with main window data

### Keyboard Shortcuts
- **Tab** - Navigate between elements
- **Space** - Toggle todo completion
- **Enter** - Add new todo
- **Arrow Keys** - Navigate todos (when focused)
- **Delete** - Remove selected todo

## 🏗️ Technical Stack

- **Frontend**: React 19.1, TypeScript 5.8, Tailwind CSS 3.4
- **Backend**: Tauri 2.0, Rust
- **Database**: SQLite with @tauri-apps/plugin-sql
- **Build Tool**: Vite 7.0
- **UI Libraries**: @dnd-kit (drag & drop), React Router DOM

## 📦 Build & Distribution

### Development Build
```bash
pnpm tauri dev
```

### Production Build
```bash
pnpm build
pnpm tauri build
```

The production build will generate:
- Web application in `dist/`
- Desktop application in `src-tauri/target/release/bundle/`

## 🧪 End-to-End (E2E) Tests

This project includes a Playwright test suite that exercises the core flows:
- Adding tasks via the keyboard-friendly input
- Completing/uncompleting tasks and verifying stats
- Drag-and-drop reordering with persistence across reloads
- Cross-window sync between the main view and the compact view (simulated for the SPA using BroadcastChannel)

Run tests locally:
```bash
pnpm install
npx playwright install --with-deps
pnpm test:e2e
```

Notes:
- Tests run against the Vite dev server at http://localhost:1420.
- The app automatically switches to a browser-friendly storage stub when not running inside Tauri, and uses a per-test namespace via the `?testId=` query parameter for isolation.
- Cross-window sync in the SPA is simulated using BroadcastChannel to mirror Tauri's event bus; the actual desktop app uses Tauri events for real multi-window sync.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing desktop app framework
- [React](https://reactjs.org/) - For the UI library
- [Tailwind CSS](https://tailwindcss.com/) - For the utility-first CSS framework
- [@dnd-kit](https://dndkit.com/) - For the drag-and-drop functionality

## 📞 Support

If you encounter any issues or have suggestions, please:
- Open an issue on [GitHub](https://github.com/jeffrey-dot/rtodo/issues)
- Contact the maintainer

---

**rtodo** - Your personal productivity companion 🚀
