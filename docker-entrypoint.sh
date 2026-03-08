#!/bin/sh
# Fix volume ownership then drop to non-root user
chown -R yapflows:yapflows /data
exec gosu yapflows "$@"
