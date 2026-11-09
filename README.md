
# OpenJob RESTful API V2 — Dicoding Submission

Project is intentionally split into **two independent Node.js projects** as required by the reviewer:
- `api/`: REST API, migrations, PDF upload, Redis caching, RabbitMQ publisher.
- `consumer/`: asynchronous RabbitMQ consumer and Nodemailer notification.

Each folder has its own `package.json`, dependencies, and `.env` file. Run commands from the relevant folder.

## Requirements
- Node.js 22+
- Docker Desktop (or PostgreSQL, Redis, RabbitMQ installed separately)
- Postman

## 1. Start infrastructure
From this project root:
```bash
docker compose up -d
```
Docker Compose starts PostgreSQL (`openjob` database), Redis, and RabbitMQ.

## 2. Configure environment
Copy `api/.env.example` to `api/.env` and `consumer/.env.example` to `consumer/.env`.
Update credentials as needed. For email testing, configure real SMTP values for `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, and optionally `MAIL_FROM` in `consumer/.env`. Use the same PostgreSQL/RabbitMQ values in both files.

## 3. Install and run API
```bash
cd api
npm install
npm run migrate:up
npm start
```
The API listens on port 5000 by default (or `PORT` if set).

### Creating future migrations
Do not create migration files manually. Use node-pg-migrate so the migration receives the expected timestamped filename:
```bash
npm run migrate:create -- add_descriptive_migration_name
```
Then edit the generated file's `up` and `down` functions. Apply it using `npm run migrate:up`. Do not rename a migration that has already been applied; create a new migration for later schema changes.

## 4. Run consumer in a second terminal
From the project root:
```bash
cd consumer
npm install
npm start
```
Keep the consumer running while testing application creation.

## 5. Postman
Import the collection and environment from `postman/`. Set the environment's `port` to `5000`. For valid PDF upload, select a local PDF file in the `document` form-data field; Postman file paths from another computer do not transfer with the collection.

## Implemented assessment features
### PDF upload
- `POST /documents`, authenticated, multipart form-data key `document`.
- Only PDF MIME type and PDF file signature accepted; maximum file size 5 MB.
- Stores file in `api/uploads/` and metadata in PostgreSQL.
- `GET /documents/:id` downloads the PDF; `DELETE /documents/:id` removes the file and metadata.
### Redis caching
- TTL is 3600 seconds.
- `REDIS_HOST` is supported, with `REDIS_PORT` and optional `REDIS_PASSWORD`.
- Cache hit responses include `X-Data-Source: cache`; database responses include `X-Data-Source: database`.
- Mutations invalidate cached responses.
### RabbitMQ + email
- API publishes a message containing only `application_id` after a successful application insert.
- Consumer queries PostgreSQL for applicant email/name, application date, job and job-owner email.
- Consumer sends notification to the job owner using Nodemailer; recipient and application information are read from the database, not hardcoded.
- Configure `companies.owner_user_id` to connect the company to the user who owns the job. Company creation through the API automatically records the authenticated user as owner.

## Fixes based on the latest reviewer feedback
- `GET /documents` returns `{ status: 'success', data: { documents: [...] } }`. `GET /documents/:id` is a public PDF download with `Content-Disposition`; an unknown ID returns 404 with `status: 'failed'`. Upload and delete remain authenticated.
- Missing/non-PDF uploads return a 400 message containing `File is required`.
- Company list responses expose the six public company fields and do not leak `owner_user_id`; categories return the four expected keys including `updated_at`. Unfiltered job list/detail keep the 13-field job shape, while filtered job searches also include `company_name` for validating company matches. Profile application results use the same joined application fields as the application listing.
- `POST /applications` returns `data.id`, `data.user_id`, `data.job_id`, and `data.status`, and asynchronously publishes only `{ application_id }` to RabbitMQ.
- A follow-up migration adds the response fields safely to databases where the earlier feature migration was already recorded.

## Validation notes
Syntax checks are included in the delivery process. End-to-end Postman tests require running PostgreSQL, Redis, RabbitMQ and valid SMTP credentials. Do not submit until mandatory and optional requests have been run and all assertions pass.


## Reviewer follow-up fixes (October 2026)

### Invalid resource IDs
Malformed IDs such as `xxx` now return HTTP `404 Not Found` for resource lookups and resource-specific routes (users, companies, categories, jobs, applications, and documents). This matches the mandatory Postman assertions that expect 404 rather than 400 for invalid resource IDs. Request-body validation errors remain HTTP 400.

### PDF documents
- `POST /documents` requires a Bearer access token and a multipart form-data field named `document`.
- Only PDF uploads are accepted, with a 5 MB limit and a `%PDF-` signature check.
- `GET /documents/:id` downloads the stored PDF.
- `DELETE /documents/:id` requires authentication and only permits the document owner or an admin.
- Document metadata is stored in PostgreSQL and the file is stored under `api/uploads/`.

### Caching and message queue
Redis is used for cached GET responses and cache invalidation after mutations. RabbitMQ receives a persistent message after a successful application creation; duplicate/failed application requests do not publish a successful application event. The consumer in `consumer/consumer.js` processes application events and sends an email when SMTP settings are configured.

### Setup
1. Install Node.js 22 or newer and Docker Desktop.
2. From the project root, run `docker compose up -d`.
3. In `api/`, copy `.env.example` to `.env`, review the PostgreSQL, Redis, RabbitMQ and JWT settings, then run `npm install`.
4. Run `npm run migrate:up` from `api/` to create/update the database schema.
5. Run `npm start` from `api/`; the API listens on port 5000 by default.
6. To run the queue consumer, install dependencies in `consumer/` and configure its environment variables, then run `node consumer.js`.
7. Import the provided V2 Postman collection and environment, set `port` to `5000`, and run the collection against the local services.

### Migration naming
For any new migration, generate its filename through the project script rather than naming it manually:
`npm run migrate:create -- create-description`
Run this command from `api/`. Do not rename migrations that have already been applied to a database; create a new generated migration for subsequent schema changes.

# Submission-Belajar-Fundamental-Back-end-JavaScript
Tugas Akhir atau Submission Belajar Fundamental Back-end JavaScript Program Asah led Dicoding Supported By GoTo

