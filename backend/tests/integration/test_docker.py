"""Integration tests for Docker container."""

import subprocess
import time

import pytest


@pytest.mark.docker
def test_docker_compose_config_valid():
    """Test that docker-compose.yml is valid."""
    result = subprocess.run(
        ["docker", "compose", "config"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=10,
    )

    assert result.returncode == 0, f"docker-compose.yml is invalid: {result.stderr}"


@pytest.mark.docker
def test_docker_backend_builds():
    """Test that backend Docker image builds successfully."""
    result = subprocess.run(
        ["docker", "compose", "build", "backend"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=300,
    )

    assert result.returncode == 0, f"Docker build failed: {result.stderr}"


@pytest.mark.docker
def test_docker_backend_starts():
    """Test that backend container starts without errors."""
    # Clean up first
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    # Start backend
    result = subprocess.run(
        ["docker", "compose", "up", "-d", "backend"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=60,
    )

    assert result.returncode == 0, f"Docker start failed: {result.stderr}"

    # Wait for startup
    time.sleep(15)

    # Check container is running
    result = subprocess.run(
        ["docker", "compose", "ps", "backend"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=10,
    )

    assert "Up" in result.stdout or "running" in result.stdout

    # Clean up
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )


@pytest.mark.docker
def test_docker_health_check_passes():
    """Test that Docker health check passes within timeout."""
    # Clean up first
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    # Start backend
    subprocess.run(
        ["docker", "compose", "up", "-d", "backend"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=60,
    )

    # Wait for health check (max 60 seconds)
    max_wait = 60
    wait_interval = 5

    healthy = False
    for _ in range(max_wait // wait_interval):
        time.sleep(wait_interval)

        result = subprocess.run(
            ["docker", "compose", "ps", "backend"],
            capture_output=True,
            text=True,
            cwd="/home/blankjul/workspace/yapflows",
            timeout=10,
        )

        if "healthy" in result.stdout.lower():
            healthy = True
            break

    # Clean up
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    assert healthy, "Health check did not pass within 60 seconds"


@pytest.mark.docker
def test_docker_venv_created():
    """Test that venv is created in Docker container."""
    # Clean up first
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    # Start backend
    subprocess.run(
        ["docker", "compose", "up", "-d", "backend"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=60,
    )

    # Wait for startup
    time.sleep(20)

    # Check venv exists
    result = subprocess.run(
        ["docker", "compose", "exec", "backend", "test", "-f", "/data/venv/bin/python"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=10,
    )

    # Clean up
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    assert result.returncode == 0, "Venv Python not found in container"


@pytest.mark.docker
def test_docker_volume_permissions():
    """Test that volume has correct permissions for yapflows user."""
    # Clean up first
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    # Start backend
    subprocess.run(
        ["docker", "compose", "up", "-d", "backend"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=60,
    )

    # Wait for startup
    time.sleep(20)

    # Check ownership
    result = subprocess.run(
        ["docker", "compose", "exec", "backend", "ls", "-la", "/data"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=10,
    )

    # Clean up
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    assert result.returncode == 0, "Could not list /data directory"
    # Check that yapflows user owns the files (uid/gid should be yapflows or 1000)
    assert "yapflows" in result.stdout or "1000" in result.stdout


@pytest.mark.docker
def test_docker_logs_show_success():
    """Test that Docker logs show successful initialization."""
    # Clean up first
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    # Start backend
    subprocess.run(
        ["docker", "compose", "up", "-d", "backend"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=60,
    )

    # Wait for startup
    time.sleep(20)

    # Get logs
    result = subprocess.run(
        ["docker", "compose", "logs", "backend"],
        capture_output=True,
        text=True,
        cwd="/home/blankjul/workspace/yapflows",
        timeout=10,
    )

    # Clean up
    subprocess.run(
        ["docker", "compose", "down"],
        cwd="/home/blankjul/workspace/yapflows",
        timeout=30,
    )

    # Check for success indicators in logs
    logs = result.stdout + result.stderr
    assert "Started" in logs or "Application startup complete" in logs
