#!/usr/bin/env bash
# install.sh — Native install of Yapflows on macOS or Linux
# Usage:  bash scripts/install.sh [--no-service]
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_URL="${YAPFLOWS_REPO_URL:-https://github.com/yourusername/yapflows.git}"
INSTALL_DIR="${YAPFLOWS_INSTALL_DIR:-$HOME/.local/share/yapflows}"
DATA_DIR="${USER_DIR:-$HOME/yapflows}"
SERVICE_NAME="yapflows"
NO_SERVICE=false

for arg in "$@"; do
    case "$arg" in
        --no-service) NO_SERVICE=true ;;
    esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { printf '\033[0;32m[yapflows]\033[0m %s\n' "$*"; }
warn()    { printf '\033[0;33m[yapflows]\033[0m %s\n' "$*"; }
error()   { printf '\033[0;31m[yapflows]\033[0m %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" &>/dev/null || error "Required tool not found: $1"; }

# ── OS detection ──────────────────────────────────────────────────────────────
OS=""
case "$(uname -s)" in
    Darwin) OS=macos ;;
    Linux)
        if [ -f /etc/debian_version ]; then
            OS=debian
        elif [ -f /etc/fedora-release ] || [ -f /etc/redhat-release ]; then
            OS=fedora
        else
            OS=linux-generic
        fi
        ;;
    *) error "Unsupported OS: $(uname -s)" ;;
esac
info "Detected OS: $OS"

# ── Install system dependencies ───────────────────────────────────────────────
install_deps() {
    case "$OS" in
        macos)
            require brew
            info "Installing system deps via Homebrew..."
            brew install python@3.11 node@20 git 2>/dev/null || true
            # Ensure node@20 is on PATH
            NODE20="$(brew --prefix node@20)/bin"
            export PATH="$NODE20:$PATH"
            ;;
        debian)
            info "Installing system deps via apt..."
            sudo apt-get update -qq
            sudo apt-get install -y --no-install-recommends \
                python3.11 python3.11-venv python3-pip git curl ca-certificates gnupg
            # Node 20 via NodeSource
            if ! command -v node &>/dev/null || [[ "$(node --version)" < "v20" ]]; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
                sudo apt-get install -y nodejs
            fi
            ;;
        fedora)
            info "Installing system deps via dnf..."
            sudo dnf install -y python3.11 git curl
            if ! command -v node &>/dev/null || [[ "$(node --version)" < "v20" ]]; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo dnf install -y nodejs
            fi
            ;;
        *)
            warn "Unknown Linux variant — please ensure Python 3.11+, Node 20+, and git are installed."
            ;;
    esac
}

install_deps

require python3
require node
require git

PYTHON=$(command -v python3.11 2>/dev/null || command -v python3)
NODE_VERSION=$("$PYTHON" --version 2>&1 | awk '{print $2}')
info "Using Python: $PYTHON ($NODE_VERSION)"
info "Using Node: $(node --version)"

# ── Clone / update repo ───────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing install at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only
else
    info "Cloning repo to $INSTALL_DIR..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ── Install backend + frontend ────────────────────────────────────────────────
info "Installing backend dependencies..."
cd "$INSTALL_DIR"
"$PYTHON" -m venv backend/venv
# shellcheck disable=SC1091
source backend/venv/bin/activate
pip install --quiet -e "backend/."
deactivate

info "Installing frontend dependencies..."
cd "$INSTALL_DIR/frontend"
npm ci --quiet

info "Building frontend..."
npm run build

# ── Create run script ─────────────────────────────────────────────────────────
RUN_SCRIPT="$INSTALL_DIR/scripts/run.sh"
mkdir -p "$INSTALL_DIR/scripts"
cat > "$RUN_SCRIPT" <<'RUNSCRIPT'
#!/usr/bin/env bash
# run.sh — Start Yapflows backend + frontend
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${USER_DIR:-$HOME/yapflows}/log"
mkdir -p "$LOG_DIR"

trap 'kill 0' INT TERM EXIT

# Backend
source "$INSTALL_DIR/backend/venv/bin/activate"
cd "$INSTALL_DIR/backend"
uvicorn src.server:app --host 0.0.0.0 --port 8000 &

# Frontend
cd "$INSTALL_DIR/frontend"
node .next/standalone/server.js &

wait
RUNSCRIPT
chmod +x "$RUN_SCRIPT"

# ── Install system service ────────────────────────────────────────────────────
if [ "$NO_SERVICE" = "true" ]; then
    info "Skipping service install (--no-service)"
elif [ "$OS" = "macos" ]; then
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST="$PLIST_DIR/com.$SERVICE_NAME.plist"
    mkdir -p "$PLIST_DIR"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.$SERVICE_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$RUN_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/yapflows/log/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/yapflows/log/launchd-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
PLIST
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load -w "$PLIST"
    info "Launchd service installed: com.$SERVICE_NAME"

elif [ "$OS" = "debian" ] || [ "$OS" = "fedora" ] || [ "$OS" = "linux-generic" ]; then
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SYSTEMD_DIR"
    cat > "$SYSTEMD_DIR/$SERVICE_NAME.service" <<SYSTEMD
[Unit]
Description=Yapflows AI Assistant
After=network.target

[Service]
Type=simple
ExecStart=$RUN_SCRIPT
Restart=on-failure
Environment=HOME=$HOME
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
SYSTEMD
    systemctl --user daemon-reload
    systemctl --user enable --now "$SERVICE_NAME"
    info "Systemd user service installed: $SERVICE_NAME"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       Yapflows installed successfully    ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Frontend:  http://localhost:3000        ║"
echo "  ║  Backend:   http://localhost:8000        ║"
echo "  ╠══════════════════════════════════════════╣"
printf "  ║  Data dir:  %-28s ║\n" "$DATA_DIR"
printf "  ║  App dir:   %-28s ║\n" "$INSTALL_DIR"
echo "  ╚══════════════════════════════════════════╝"
echo ""
if ! command -v claude &>/dev/null; then
    warn "claude CLI not found. Install @anthropic-ai/claude-code and run 'claude login' before using the claude-cli provider."
fi
info "To start manually: bash $RUN_SCRIPT"
