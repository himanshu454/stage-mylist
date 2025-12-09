# Stage MyList Service

A high-performance REST API service for managing user watchlists (MyList) with support for movies and TV shows. Built with TypeScript, Express, MongoDB, and Redis.

## Features

- ✅ Add/remove items from user watchlists
- ✅ Cursor-based pagination for efficient list retrieval
- ✅ Redis caching with version-based invalidation
- ✅ Support for both movies and TV shows (with episode tracking)
- ✅ Content snapshot denormalization for historical accuracy
- ✅ Comprehensive error handling and validation
- ✅ Docker containerization with docker-compose
- ✅ Integration tests with in-memory MongoDB

## Prerequisites

- **Node.js** 20+ (or 22+ for building)
- **pnpm** package manager
- **MongoDB** 7.0+ (or use Docker)
- **Redis** 7+ (or use Docker)
- **Docker & Docker Compose** (optional, for containerized setup)

## Quick Start

### Option 1: Docker Compose (Recommended)

The easiest way to run the entire stack:

```bash
# Clone the repository
git clone <repository-url>
cd stage-mylist

# Start all services (app, MongoDB, Redis)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down
```

The API will be available at `http://localhost:4000`

### Option 2: Local Development

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   Create a `.env` file (optional, defaults are provided):

   ```env
   PORT=4000
   MONGO_URI=mongodb://localhost:27017/ott_stage
   REDIS_URL=redis://127.0.0.1:6379
   MYLIST_CACHE_TTL_SECONDS=60
   MYLIST_MAX_LIMIT=100
   MYLIST_DEFAULT_LIMIT=20
   ```

3. **Start MongoDB and Redis:**

   ```bash
   # MongoDB (if not using Docker)
   mongod

   # Redis (if not using Docker)
   redis-server
   ```

4. **Run the application:**

   ```bash
   # Development mode (with hot reload)
   pnpm dev

   # Production mode
   pnpm build
   pnpm start
   ```

## API Endpoints

### Base URL

- Local: `http://localhost:4000`
- Docker: `http://localhost:4000`

### Authentication

All endpoints require the `X-User-Id` header for user identification.

### Endpoints

#### Add Item to List

```http
POST /api/mylist
Headers:
  X-User-Id: <user-id>
Content-Type: application/json

Body:
{
  "contentId": "507f1f77bcf86cd799439011",
  "contentType": "movie",  // or "tvshow"
  "episodeId": "507f1f77bcf86cd799439012",  // optional, for TV shows
  "snapshot": {  // optional, auto-generated if not provided
    "title": "Movie Title",
    "posterUrl": "https://example.com/poster.jpg",
    "genres": ["Action", "Drama"],
    "shortDescription": "Movie description"
  }
}
```

#### List Items

```http
GET /api/mylist?limit=20&cursor=<base64-cursor>&contentType=movie&includeTotal=true
Headers:
  X-User-Id: <user-id>
```

**Query Parameters:**

- `limit` (optional): Number of items per page (default: 20, max: 100)
- `cursor` (optional): Base64-encoded cursor for pagination
- `contentType` (optional): Filter by "movie" or "tvshow"
- `includeTotal` (optional): Include total count in response

**Response:**

```json
{
  "items": [...],
  "nextCursor": "base64-encoded-cursor-or-null",
  "total": 150  // only if includeTotal=true
}
```

#### Remove Item from List

```http
DELETE /api/mylist/:contentId
Headers:
  X-User-Id: <user-id>
```

#### Health Check

```http
GET /health
```

## Running Tests

### Integration Tests

The project uses Jest with `mongodb-memory-server` for isolated testing:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

**Test Setup:**

- Uses in-memory MongoDB (no external DB required)
- Automatically cleans up between tests
- Tests cover:
  - Adding items to list
  - Duplicate handling
  - Validation errors
  - User/content existence checks

**Test Files:**

- `tests/integration/addItem.test.ts` - Integration tests for add item endpoint

## Design Choices & Performance Optimizations

### 1. Redis Caching with Version-Based Invalidation

**Problem:** Frequent list reads can overwhelm the database.

**Solution:** Implemented a two-tier caching strategy:

- **Page Cache**: Caches paginated results with keys: `mylist:{userId}:v{version}:limit{limit}:cursor{cursor}`
- **Version Tracking**: Each user has a version counter (`mylist:{userId}:version`) that increments on mutations
- **Cache Invalidation**: When items are added/removed, the version increments, automatically invalidating all cached pages for that user

**Benefits:**

- cache invalidation (single version increment)
- No need to manually delete cache keys
- Graceful degradation: If Redis fails, requests fall back to database
- Configurable TTL (default: 60 seconds) for stale data protection

### 2. Cursor-Based Pagination

**Problem:** Offset-based pagination becomes slow with large datasets and can skip/duplicate items.

**Solution:** Implemented cursor-based pagination using composite keys:

- Cursor format: Base64-encoded `{addedAt}|{_id}`
- Query uses: `$or: [{ addedAt: { $lt: cursorDate } }, { addedAt: cursorDate, _id: { $lt: cursorId } }]`
- Sorted by `{ addedAt: -1, _id: -1 }` for consistent ordering

**Benefits:**

- O(1) pagination performance regardless of list size
- No duplicate or skipped items during concurrent modifications
- Efficient database queries using compound indexes

### 3. Denormalized Content Snapshots

**Problem:** Content metadata can change over time, and joins are expensive.

**Solution:** Store a snapshot of content metadata when items are added:

```typescript
snapshot: {
  title: string;
  posterUrl?: string;
  genres?: string[];
  shortDescription?: string;
}
```

**Benefits:**

- Historical accuracy: Users see what they added, even if content changes
- No joins required: Single query retrieves all needed data
- Faster reads: All data in one document
- Auto-generation: If snapshot not provided, automatically fetched from content

### 4. Database Indexing Strategy

**Indexes:**

1. `{ userId: 1, contentId: 1 }` (unique) - Prevents duplicates, fast lookups
2. `{ userId: 1, addedAt: -1, _id: -1 }` - Optimizes pagination queries
3. `userId` (single field) - Fast user filtering
4. `addedAt` (single field) - Fast date sorting

**Benefits:**

- Prevents duplicate entries at database level
- Optimizes pagination queries
- Fast user-specific queries

### 5. Lean Queries for Performance

**Implementation:** All read queries use `.lean()` to return plain JavaScript objects instead of Mongoose documents.

**Benefits:**

- ~2-3x faster query execution
- Lower memory usage
- No Mongoose overhead for read-only operations

### 6. Request Optimization Middleware

- **Compression**: Gzip compression for responses (reduces bandwidth)
- **Helmet**: Security headers
- **CORS**: Configurable cross-origin support
- **Morgan**: Request logging with Winston integration

### 7. Error Handling & Validation

- **Zod Schema Validation**: Type-safe request validation
- **Custom HttpError Class**: Consistent error responses
- **Graceful Degradation**: Redis failures don't break the service
- **Comprehensive Error Logging**: Winston logger for debugging

### 8. Scalability Considerations

- **Configurable Limits**: `MYLIST_MAX_LIMIT` prevents abuse (default: 100)
- **Connection Pooling**: MongoDB connection pooling via Mongoose
- **Non-blocking Operations**: Async/await throughout
- **Health Checks**: Docker health checks for orchestration
- **Stateless Design**: Can scale horizontally behind load balancer

## Assumptions Made During Implementation

1. **Authentication**: Simple header-based authentication (`X-User-Id`) is used as a stub. In production, this should be replaced with JWT or OAuth tokens.

2. **User Existence**: The service validates that users exist before allowing list operations. Assumes users are managed in a separate service/database.

3. **Content Management**: Movies and TV shows are assumed to exist in separate collections. The service validates content existence before adding to lists.

4. **Episode Tracking**: For TV shows, episodes can optionally be tracked. Assumes episodes belong to shows (`showId` relationship).

5. **Content Visibility**: A `contentVisibility` field exists for soft-deletion scenarios (e.g., content removed from platform). Currently defaults to "available".

6. **Redis Availability**: The service gracefully degrades if Redis is unavailable, but optimal performance requires Redis.

7. **MongoDB Schema**: Assumes MongoDB 7.0+ with Mongoose ODM. Uses ObjectId references for relationships.

8. **Concurrent Modifications**: Duplicate adds are handled idempotently (returns existing item). Cursor pagination handles concurrent modifications gracefully.

9. **Environment Variables**: Sensible defaults are provided, but production should explicitly set all environment variables.

10. **Docker Networking**: In docker-compose, services communicate via internal network names (`mongodb`, `redis`).

## Project Structure

```
stage-mylist/
├── src/
│   ├── app.ts                 # Express app setup
│   ├── server.ts              # Server entry point
│   ├── config/
│   │   └── db.ts             # MongoDB connection
│   ├── controllers/
│   │   └── myList.controller.ts
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   └── requireUser.ts
│   ├── models/
│   │   ├── myListItem.ts
│   │   ├── movie.ts
│   │   ├── tvShow.ts
│   │   ├── episode.ts
│   │   └── user.ts
│   ├── routes/
│   │   └── myList.route.ts
│   ├── services/
│   │   ├── myList.service.ts  # Core business logic
│   │   └── myList.cache.ts    # Redis cache utilities
│   └── utils/
│       ├── httpError.ts
│       ├── logger.ts
│       └── pagination.ts
├── tests/
│   └── integration/
│       └── addItem.test.ts
├── Dockerfile
├── docker-compose.yml
├── jest.config.ts
├── package.json
└── tsconfig.json
```

## Environment Variables

| Variable                   | Default                               | Description               |
| -------------------------- | ------------------------------------- | ------------------------- |
| `PORT`                     | `4000`                                | Server port               |
| `MONGO_URI`                | `mongodb://localhost:27017/ott_stage` | MongoDB connection string |
| `REDIS_URL`                | `redis://127.0.0.1:6379`              | Redis connection string   |
| `MYLIST_CACHE_TTL_SECONDS` | `60`                                  | Cache TTL in seconds      |
| `MYLIST_MAX_LIMIT`         | `100`                                 | Maximum items per page    |
| `MYLIST_DEFAULT_LIMIT`     | `20`                                  | Default items per page    |

## Docker Commands

```bash
# Build the image
docker build -t stage-mylist .

# Run container (requires external MongoDB/Redis)
docker run -p 4000:4000 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/ott_stage \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  stage-mylist

# Docker Compose commands
docker-compose up -d              # Start all services
docker-compose down               # Stop all services
docker-compose down -v            # Stop and remove volumes
docker-compose logs -f app        # View app logs
docker-compose up -d --build app  # Rebuild and restart app
```

## Development

### Code Quality

```bash

# Format code
pnpm format
```

### Seeding Data

```bash
# Seed users, movies, and TV shows
pnpm seed

# Seed MyList items (1000 items)
pnpm seed:mylist
```