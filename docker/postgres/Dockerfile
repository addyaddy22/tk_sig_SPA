# PostgreSQL for TK Signature Spa.
#
# Official PostgreSQL 16 image plus the btree_gist extension that powers the
# booking exclusion constraints (no therapist / client can be double-booked).
#
# Build & run on its own:
#   docker build -t tk-sig-spa-postgres ./docker/postgres
#   docker run -d --name tk_sig_spa_db -p 5432:5432 \
#     -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -v tk_sig_spa_pgdata:/var/lib/postgresql/data \
#     tk-sig-spa-postgres
#
# Or simply: docker compose up -d db   (from the project root)

FROM postgres:16-alpine

LABEL org.opencontainers.image.title="tk-sig-spa-postgres" \
      org.opencontainers.image.description="PostgreSQL 16 for the TK Signature Spa booking system"

# Defaults - override at runtime. The password is deliberately NOT baked into the
# image: pass POSTGRES_PASSWORD when running (the container refuses to start without it).
ENV POSTGRES_USER=spa \
    POSTGRES_DB=tk_sig_spa \
    TZ=UTC \
    PGTZ=UTC

# Scripts here run once, when the data volume is first initialised.
COPY initdb/ /docker-entrypoint-initdb.d/

EXPOSE 5432

HEALTHCHECK --interval=5s --timeout=5s --start-period=15s --retries=10 \
  CMD pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1
