// Runs before every test file. Test files that import a repository directly,
// without pulling in server.ts, would otherwise have no DATABASE_URL and fail
// inside the connection pool rather than in an assertion.
import 'dotenv/config';
