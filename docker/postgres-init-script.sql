-- Initializes the databases listed in POSTGRES_MULTIPLE_DATABASES.
-- Runs on a fresh cluster (data dir is tmpfs), so plain CREATE statements are safe.
-- Kept as plain SQL (instead of a bash script) because executing a bind-mounted
-- script is unreliable on Docker Desktop bind mounts (macOS/Windows).

CREATE USER "pollux-application-user" WITH PASSWORD 'password';
CREATE DATABASE pollux;
\connect pollux
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "pollux-application-user";

\connect postgres
CREATE USER "connect-application-user" WITH PASSWORD 'password';
CREATE DATABASE connect;
\connect connect
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "connect-application-user";

\connect postgres
CREATE USER "agent-application-user" WITH PASSWORD 'password';
CREATE DATABASE agent;
\connect agent
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "agent-application-user";

\connect postgres
CREATE USER "node_db-application-user" WITH PASSWORD 'password';
CREATE DATABASE node_db;
\connect node_db
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "node_db-application-user";
