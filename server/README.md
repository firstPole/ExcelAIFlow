# ExcelFlow AI Backend

Complete backend server for ExcelFlow AI application with SQLite database.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Install dependencies**
```bash
cd server
npm install
```

2. **Environment setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start development server**
```bash
npm run dev
```

The server will run on `http://localhost:8000`

## 🗄️ Database

- **Development**: SQLite database at `./data/development.db`
- **Production**: SQLite database at `./data/production.db`
- **Auto-migration**: Database tables are created automatically on startup

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files` - Get user files
- `GET /api/files/:id` - Get file details
- `DELETE /api/files/:id` - Delete file

### Workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows` - Get user workflows
- `GET /api/workflows/:id` - Get workflow details
- `POST /api/workflows/:id/execute` - Execute workflow
- `GET /api/workflows/:id/results` - Get workflow results
- `DELETE /api/workflows/:id` - Delete workflow

### Analytics
- `POST /api/analytics/track` - Track event
- `GET /api/analytics/user/:id/behavior` - Get user behavior (owner only)
- `GET /api/analytics/conversion-metrics` - Get conversion metrics (owner only)

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/upgrade` - Upgrade subscription

## 🔒 Security Features

- JWT authentication
- Rate limiting
- File type validation
- SQL injection protection
- CORS configuration
- Helmet security headers

## 📊 Database Schema

### Users
- User accounts with roles and subscriptions
- Usage tracking (files, workflows, storage)

### Files
- File metadata and processed data
- User ownership and access control

### Workflows
- Workflow definitions and execution status
- Task results and metrics

### Analytics
- Event tracking for user behavior
- Conversion funnel analysis

## 🚀 Production Deployment

1. **Build and deploy**
```bash
npm start
```

2. **Environment variables**
```bash
NODE_ENV=production
JWT_SECRET=your-production-secret
PORT=8000
```

3. **Database**
- Production SQLite database is automatically created
- Consider PostgreSQL for high-scale production

## 📈 Monitoring

- Request logging with Morgan
- Error tracking and handling
- Performance metrics
- User analytics dashboard

## 🔧 Development

```bash
# Development with auto-reload
npm run dev

# Database migration (if needed)
npm run migrate

# Seed database with test data
npm run seed
```