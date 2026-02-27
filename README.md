# Google Docs Clone - Real-time Collaborative Editor

A full-stack collaborative document editor with real-time synchronization using Operational Transformation (OT).

## Features

- 🔐 User authentication (JWT)
- 📝 Rich text editing (Quill)
- 🔄 Real-time collaboration (Socket.IO + OT)
- 👥 User presence indicators
- 🔗 Document sharing with roles (owner, editor, viewer)
- 💾 Auto-save with debouncing
- 🎨 Google Docs-like UI
- 📱 Responsive design

## Tech Stack

### Frontend
- React + TypeScript
- Vite
- Quill (rich text editor)
- Socket.IO Client
- Axios
- React Router

### Backend
- Node.js + Express + TypeScript
- MongoDB (document storage)
- Redis (operation buffering)
- Socket.IO (WebSocket)
- JWT authentication
- Operational Transformation (OT)

## Architecture

```
Client (React)
    ↓ WebSocket
Server (Express + Socket.IO)
    ↓ OT Engine
MongoDB (Documents) + Redis (Buffer)
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or cloud)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd google-docs-clone
```

2. Install server dependencies:
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your MongoDB and Redis URLs
```

3. Install client dependencies:
```bash
cd ../client
npm install
cp .env.example .env.local
# Edit .env.local if needed
```

### Running Locally

1. Start server:
```bash
cd server
npm run dev
```

2. Start client:
```bash
cd client
npm run dev
```

3. Open http://localhost:5173

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide.

### Quick Deploy

**Server (Render):**
- See [server/README.deploy.md](./server/README.deploy.md)

**Client (Vercel):**
- See [client/README.deploy.md](./client/README.deploy.md)

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # Auth context
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # OT client
│   │   └── services/      # API service
│   └── vercel.json        # Vercel config
│
├── server/                # Node.js backend
│   ├── src/
│   │   ├── config/        # DB & Redis config
│   │   ├── modules/       # Feature modules
│   │   │   ├── auth/      # Authentication
│   │   │   ├── document/  # Document CRUD
│   │   │   ├── ot/        # OT engine
│   │   │   └── user/      # User management
│   │   ├── routes/        # API routes
│   │   └── utils/         # Utilities
│   └── render.yaml        # Render config
│
└── docs/                  # Documentation
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh token

### Documents
- `GET /api/documents` - List user documents
- `POST /api/documents` - Create document
- `GET /api/documents/:id` - Get document
- `PATCH /api/documents/:id` - Update title
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/:id/share` - Share document
- `GET /api/documents/slug/:slug` - Get by slug

### WebSocket Events
- `join-document` - Join document room
- `send-operation` - Send OT operation
- `receive-operation` - Receive OT operation
- `cursor-update` - Update cursor position
- `presence-update` - User presence

## Features in Detail

### Operational Transformation (OT)
- Jupiter algorithm implementation
- Handles concurrent edits
- Maintains consistency across clients
- Conflict resolution

### Auto-Save
- 300ms debounce
- Saves on page unload
- Saves on tab switch
- Manual save (Ctrl+S)

### Document Sharing
- Shareable links with slugs
- Role-based access (owner, editor, viewer)
- Email invitations
- Collaborator management

### Real-time Collaboration
- Live cursor positions
- User presence indicators
- Instant synchronization
- Conflict-free editing

## Testing

```bash
# Server tests
cd server
npm test

# E2E tests
npm run test:e2e
```

## Performance

- Client-side debouncing (300ms)
- Redis operation buffering (30s)
- MongoDB atomic updates (CAS)
- WebSocket for real-time sync
- Optimized Delta composition

## Security

- JWT authentication
- Password hashing (bcrypt)
- CORS configuration
- Environment variables
- Role-based access control
- Input validation

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## License

MIT

## Support

For issues and questions:
- GitHub Issues
- Documentation in `/docs`

## Acknowledgments

- Quill.js for rich text editing
- Socket.IO for WebSocket
- Operational Transformation algorithm
- Google Docs for inspiration
