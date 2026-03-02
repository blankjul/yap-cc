.PHONY: help install dev run dev-backend dev-frontend build test clean kill venv install-backend install-frontend test-backend build-frontend

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

help: ## Show this help message
	@echo "$(GREEN)Yapflows v2 Build System$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

venv: ## Create Python virtual environment at backend/venv
	@echo "$(GREEN)Creating virtual environment...$(NC)"
	@python3 -m venv backend/$(VENV_DIR)
	@echo "$(GREEN)✓ Virtual environment created$(NC)"
	@echo "$(YELLOW)Activate with: source backend/venv/bin/activate$(NC)"

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
	@echo "$(GREEN)Starting dev servers (Ctrl+C to stop both)...$(NC)"
	@trap 'kill 0' INT TERM EXIT; \
		(cd backend && uvicorn src.server:app --reload --host 0.0.0.0 --port 8000) & \
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
	cd backend && uvicorn src.server:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Run frontend dev server
	@echo "$(GREEN)Starting frontend on http://localhost:3000...$(NC)"
	@cd $(FRONTEND_DIR) && npm run dev

test: test-backend ## Run all tests
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-backend: ## Run backend tests
	@echo "$(GREEN)Running backend tests...$(NC)"
	@cd backend && $(PYTHON) -m pytest -v
	@echo "$(GREEN)✓ Backend tests passed$(NC)"

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
