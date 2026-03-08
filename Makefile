.PHONY: help install dev run dev-backend dev-frontend build test clean kill venv install-backend install-frontend test-backend build-frontend docker-build docker-up docker-down docs install-docs build-docs upload-docs yap

.DEFAULT_GOAL := help

GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    PLATFORM := macos
else ifeq ($(UNAME_S),Linux)
    PLATFORM := linux
else
    PLATFORM := windows
endif

PYTHON := $(shell scripts/detect-python.sh)
FRONTEND_DIR := frontend
VENV_DIR := venv

export YAPFLOWS_DEFAULTS_DIR := $(CURDIR)/defaults

help: ## Show this help message
	@echo "$(GREEN)Yapflows v2 Build System$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

venv: ## Create Python virtual environment at backend/venv
	@echo "$(GREEN)Creating virtual environment...$(NC)"
	@python3 -m venv backend/$(VENV_DIR)
	@echo "$(GREEN)✓ Virtual environment created$(NC)"
	@echo "$(YELLOW)Activate with: source backend/venv/bin/activate$(NC)"

sync-defaults: ## Sync defaults/ into ~/.yapflows/ (agents, environments, knowledge, skills, tools)
	@scripts/sync-defaults.sh

install: install-backend install-frontend ## Install all dependencies
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

install-backend: ## Install backend dependencies
	@echo "$(GREEN)Installing backend dependencies...$(NC)"
	@cd backend && $(PYTHON) -m pip install -e ".[dev]"
	@echo "$(GREEN)✓ Backend dependencies installed$(NC)"

install-frontend: ## Install frontend dependencies
	@echo "$(GREEN)Installing frontend dependencies...$(NC)"
	@cd $(FRONTEND_DIR) && npm install
	@echo "$(GREEN)✓ Frontend dependencies installed$(NC)"

install-playwright: ## Install Playwright browsers
	@cd backend && $(PYTHON) -m playwright install chromium
	@echo "$(GREEN)✓ Playwright installed$(NC)"

dev: ## Run backend + frontend dev servers together
	@echo "$(GREEN)Checking dependencies...$(NC)"
	@if [ ! -d "backend/$(VENV_DIR)" ]; then \
		echo "$(YELLOW)Virtual environment not found. Creating...$(NC)"; \
		$(MAKE) venv; \
	fi
	@if ! backend/$(VENV_DIR)/bin/python -c "import yapflows" 2>/dev/null; then \
		echo "$(YELLOW)Backend dependencies not installed. Installing...$(NC)"; \
		cd backend && ./$(VENV_DIR)/bin/python -m pip install -q -e ".[dev]"; \
	fi
	@if [ ! -d "$(FRONTEND_DIR)/node_modules" ]; then \
		echo "$(YELLOW)Frontend dependencies not installed. Installing...$(NC)"; \
		cd $(FRONTEND_DIR) && npm install; \
	fi
	@echo "$(GREEN)Starting dev servers (Ctrl+C to stop both)...$(NC)"
	@trap 'kill 0' INT TERM EXIT; \
		(cd backend && $(CURDIR)/backend/$(VENV_DIR)/bin/uvicorn src.server:app --reload --host 0.0.0.0 --port 8000) & \
		(cd $(FRONTEND_DIR) && npm run dev) & \
		wait

run: ## Run backend + frontend production servers together
	@echo "$(GREEN)Starting production servers (Ctrl+C to stop both)...$(NC)"
	@trap 'kill 0' INT TERM EXIT; \
		(cd backend && uvicorn src.server:app --host 0.0.0.0 --port 8000) & \
		(cd $(FRONTEND_DIR) && npm start) & \
		wait

dev-backend: ## Run backend dev server
	@echo "$(GREEN)Starting backend on http://localhost:8000...$(NC)"
	cd backend && ./$(VENV_DIR)/bin/uvicorn src.server:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Run frontend dev server
	@echo "$(GREEN)Starting frontend on http://localhost:3000...$(NC)"
	@cd $(FRONTEND_DIR) && npm run dev

preflight: ## Run pre-flight diagnostic checks
	@echo "$(GREEN)Running pre-flight checks...$(NC)"
	@$(PYTHON) -m backend.src.preflight.cli

test: test-backend ## Run all tests
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-backend: ## Run backend unit tests
	@echo "$(GREEN)Running backend unit tests...$(NC)"
	@if [ -f backend/venv/bin/python ]; then \
		cd backend && ./venv/bin/python -m pytest -v -m "not integration and not docker and not slow and not external"; \
	else \
		cd backend && python3 -m pytest -v -m "not integration and not docker and not slow and not external"; \
	fi
	@echo "$(GREEN)✓ Backend unit tests passed$(NC)"

test-integration: ## Run backend integration tests
	@echo "$(GREEN)Running backend integration tests...$(NC)"
	@if [ -f backend/venv/bin/python ]; then \
		cd backend && ./venv/bin/python -m pytest -v -m integration; \
	else \
		cd backend && python3 -m pytest -v -m integration; \
	fi
	@echo "$(GREEN)✓ Backend integration tests passed$(NC)"

test-all: test-backend test-integration ## Run all tests
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-user-dir: ## Test user directory components
	@echo "$(GREEN)Testing user directory components...$(NC)"
	@./scripts/test-user-dir.sh ~/.yapflows-test
	@echo "$(GREEN)✓ User directory tests passed$(NC)"

test-docker: ## Test Docker container startup
	@echo "$(GREEN)Testing Docker container...$(NC)"
	@docker compose up -d backend
	@sleep 15
	@echo "Checking venv creation..."
	@docker compose exec backend test -f /data/venv/bin/python || (echo "$(RED)✗ Venv not created$(NC)" && exit 1)
	@echo "Checking health endpoint..."
	@curl -f http://localhost:8000/health || (echo "$(RED)✗ Health check failed$(NC)" && exit 1)
	@docker compose down
	@echo "$(GREEN)✓ Docker tests passed$(NC)"

build: ## Build frontend for production
	@echo "$(GREEN)Building...$(NC)"
	@cd $(FRONTEND_DIR) && npm run build
	@echo "$(GREEN)✓ Build complete$(NC)"

start: ## Run production server
	@echo "$(GREEN)Starting production server...$(NC)"
	@cd backend && uvicorn src.server:app --host 0.0.0.0 --port 8000

clean: ## Clean build artifacts
	@rm -rf $(FRONTEND_DIR)/.next $(FRONTEND_DIR)/out $(FRONTEND_DIR)/node_modules/.cache
	@find backend/src -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find backend/tests -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@rm -rf backend/.pytest_cache backend/*.egg-info
	@echo "$(GREEN)✓ Cleaned$(NC)"

docker-build: ## Build Docker images
	docker compose build

docker-up: ## Start Docker containers
	docker compose up -d

docker-down: ## Stop Docker containers
	docker compose down

install-docs: ## Install documentation dependencies
	@echo "$(GREEN)Installing docs dependencies...$(NC)"
	@$(PYTHON) -m pip install -r docs/requirements.txt
	@echo "$(GREEN)✓ Docs dependencies installed$(NC)"

docs: ## Preview documentation site locally (requires: make install-docs)
	@echo "$(GREEN)Starting docs preview on http://localhost:8001...$(NC)"
	@$(PYTHON) -m mkdocs serve --config-file mkdocs.yml -a localhost:8001

build-docs: ## Build documentation static site to site/
	@echo "$(GREEN)Building docs...$(NC)"
	@$(PYTHON) -m mkdocs build --config-file mkdocs.yml
	@echo "$(GREEN)✓ Docs built to site/$(NC)"

upload-docs: build-docs ## Build and upload docs to S3 (requires docs/deploy.conf)
	@if [ ! -f docs/deploy.conf ]; then \
		echo "$(RED)Error: docs/deploy.conf not found$(NC)"; \
		echo "$(YELLOW)Create it with: echo 'S3_BUCKET=s3://your-bucket/path/' > docs/deploy.conf$(NC)"; \
		exit 1; \
	fi
	@S3_BUCKET=$$(grep S3_BUCKET docs/deploy.conf | cut -d= -f2); \
	echo "$(GREEN)Uploading docs to $$S3_BUCKET...$(NC)"; \
	aws s3 sync site/ $$S3_BUCKET --delete; \
	echo "$(GREEN)✓ Docs uploaded$(NC)"

yap: ## Run yap chat reader (ARGS="list --since 1h")
	@~/.yapflows/tools/yap.py $(ARGS)

kill: ## Kill dev servers
	@echo "$(GREEN)Killing dev servers...$(NC)"
ifeq ($(PLATFORM),macos)
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || echo "  No process on port 8000"
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "  No process on port 3000"
else ifeq ($(PLATFORM),linux)
	@fuser -k 8000/tcp 2>/dev/null || echo "  No process on port 8000"
	@fuser -k 3000/tcp 2>/dev/null || echo "  No process on port 3000"
endif
	@echo "$(GREEN)✓ Done$(NC)"
