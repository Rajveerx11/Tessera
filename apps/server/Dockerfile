# ─── Build Stage ───────────────────────────────────────────────────────
FROM rust:1.83-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy cargo files
COPY Cargo.toml ./

# Create dummy source file to compile and cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy real source code and migrations
COPY src ./src
COPY migrations ./migrations

# Re-build the application
RUN cargo build --release

# ─── Execution Stage ───────────────────────────────────────────────────
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies (OpenSSL, certificates)
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

# Copy binary and migrations from build stage
COPY --from=builder /app/target/release/tessera-server ./
COPY migrations ./migrations

EXPOSE 3001

# Run the server binary
CMD ["./tessera-server"]
