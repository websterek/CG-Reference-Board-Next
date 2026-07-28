## ADDED Requirements

### Requirement: Docker Compose configuration
The system SHALL provide a Docker Compose configuration that starts all services with a single command.

#### Scenario: docker compose up starts all services
- **WHEN** user runs "docker compose up --build" from the project root
- **THEN** PostgreSQL starts and is healthy
- **THEN** MinIO starts and is healthy
- **THEN** the app server (Fastify + Hocuspocus) starts and is healthy
- **THEN** the client (nginx serving the built SPA) starts and is healthy
- **THEN** all services are accessible on their configured ports

#### Scenario: Services are on the same network
- **WHEN** all services are running
- **THEN** the app server can connect to PostgreSQL via the hostname "postgres"
- **THEN** the app server can connect to MinIO via the hostname "minio"
- **THEN** the client can reach the app server via the hostname "server"

### Requirement: Persistent volumes
The system SHALL use Docker volumes for data persistence across container restarts.

#### Scenario: PostgreSQL data persists
- **WHEN** Docker containers are stopped and restarted
- **THEN** board metadata, Yjs documents, and asset records are preserved

#### Scenario: MinIO data persists
- **WHEN** Docker containers are stopped and restarted
- **THEN** uploaded images stored in MinIO are preserved

### Requirement: Multi-stage Dockerfiles
The system SHALL use multi-stage Docker builds for efficient images.

#### Scenario: Server Dockerfile
- **WHEN** the server Docker image is built
- **THEN** it uses a multi-stage build (dependencies → build → production)
- **THEN** the production image contains only runtime dependencies
- **THEN** the server runs as a non-root user

#### Scenario: Client Dockerfile
- **WHEN** the client Docker image is built
- **THEN** it uses a multi-stage build (dependencies → build → nginx)
- **THEN** the production image serves the built SPA via nginx
- **THEN** the client runs as a non-root user

### Requirement: Health checks
The system SHALL define health checks for all services in Docker Compose.

#### Scenario: PostgreSQL health check
- **WHEN** Docker Compose is running
- **THEN** PostgreSQL has a health check using pg_isready
- **THEN** dependent services wait for PostgreSQL to be healthy before starting

#### Scenario: App server health check
- **WHEN** Docker Compose is running
- **THEN** the app server exposes a /health endpoint
- **THEN** the /health endpoint returns HTTP 200 when the server is ready

### Requirement: Development workflow
The system SHALL support development without Docker for faster iteration.

#### Scenario: pnpm dev starts all packages
- **WHEN** user runs "pnpm dev" from the project root
- **THEN** the domain package watches for changes
- **THEN** the server starts on port 3000 with hot reload
- **THEN** the client starts on port 5173 with Vite dev server and HMR

#### Scenario: Development without MinIO
- **WHEN** running in development mode without Docker
- **THEN** the server uses a local filesystem StorageProvider instead of MinIO
- **THEN** uploaded images are stored in a local ./uploads directory

### Requirement: Environment configuration
The system SHALL use environment variables for all configurable settings.

#### Scenario: Required environment variables
- **WHEN** the server starts
- **THEN** it reads DATABASE_URL for PostgreSQL connection
- **THEN** it reads JWT_SECRET for token signing
- **THEN** it reads S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET for MinIO (when configured)

#### Scenario: Default values for development
- **WHEN** running in development mode
- **THEN** sensible defaults are provided for all environment variables
- **THEN** the server starts without requiring explicit configuration

### Requirement: .dockerignore
The system SHALL include a .dockerignore file to exclude unnecessary files from Docker builds.

#### Scenario: .dockerignore excludes node_modules and build artifacts
- **WHEN** a Docker image is built
- **THEN** node_modules directories are excluded
- **THEN** build output directories are excluded
- **THEN** git history and local configuration files are excluded
