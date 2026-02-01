# Taraqqi Hub API

An independent backend API with JWT-based authentication.

## Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your database credentials
   ```

3. **Create PostgreSQL database**
   ```bash
   createdb taraqqi_hub
   ```

4. **Push database schema**
   ```bash
   pnpm run db:push
   ```

5. **Start development server**
   ```bash
   pnpm run dev
   ```

## API Endpoints

### Auth

| Method | Endpoint                        | Description          |
|--------|--------------------------------|----------------------|
| POST   | /auth/signup                   | Create new account   |
| POST   | /auth/login                    | Login to account     |
| POST   | /auth/refresh                  | Refresh access token |
| DELETE | /auth/logout                   | Logout               |
| POST   | /auth/reset-password/send-code | Send reset code      |
| GET    | /auth/reset-password/validate-code | Validate reset code |
| PATCH  | /auth/reset-password/reset     | Reset password       |

### Health

| Method | Endpoint | Description      |
|--------|----------|------------------|
| GET    | /health  | Health check     |

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/taraqqi_hub
JWT_SECRET=your-secret-key
HASHING_SALT_ROUNDS=10
PORT=3001
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:3000
```
# taraqqi-hub-api
