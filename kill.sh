#!/usr/bin/env bash
set -e

TASK_DIR="/root/task"

echo "Stopping and removing containers, volumes, and orphans..."
docker compose -f "$TASK_DIR/docker-compose.yml" down --volumes --remove-orphans || true

echo "Removing task-related Docker images..."
docker rmi -f $(docker images -q | grep -E 'task|typescript|postgres' || true) || true

echo "Pruning dangling Docker resources..."
docker system prune -a --volumes -f || true

echo "Removing Node.js and build artifacts..."
rm -rf "$TASK_DIR/node_modules" "$TASK_DIR/dist" "$TASK_DIR/coverage" "$TASK_DIR/.npm" "$TASK_DIR"/*.log || true

echo "Deleting task folder..."
rm -rf "$TASK_DIR" || true

echo "Cleanup completed successfully! Droplet is now clean."
