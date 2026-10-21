# Postgres rather than SQLite

Jeeves stores a single household's data, which SQLite would comfortably handle, but we use Postgres (accessed through Drizzle ORM) because the deployment environment already runs a backed-up Postgres instance. Reusing existing infrastructure beats introducing a second storage technology.
