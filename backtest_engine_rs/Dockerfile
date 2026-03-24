# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:latest AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/

# Build the HTTP server binary in release mode
RUN cargo build --release --bin backtest_server

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/backtest_server /usr/local/bin/backtest_server

ENV PORT=8080
EXPOSE 8080

CMD ["backtest_server"]
