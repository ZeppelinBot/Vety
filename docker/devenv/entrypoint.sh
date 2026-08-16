#!/usr/bin/env bash
set -eou pipefail

if [[ $(id -u) -eq 0 ]]; then
  # Update container user to match mounted project folder's UID/GID to avoid file permission issues
  # - On Linux and WSL2 this is the host user's UID/GID
  # - On Docker Desktop macOS the FS layer synthesizes ownership as the *asking* UID, so root sees 0.
  #   This is fine: we just don't do anything in that case, as the FS layer handles everything for us.
  # - On Docker Desktop Windows UID/GID is shown as 0:0 (but is still fully readable/writable). Same as macOS, we ignore it.
  target_uid=$(stat -c %u /workspace/vety)
  updated_uid=0
  if (( target_uid >= 100 )) && [[ $target_uid != $(id -u dev) ]]; then
    usermod -u "$target_uid" dev
    updated_uid=1
  fi
  target_gid=$(stat -c %g /workspace/vety)
  updated_gid=0
  if (( target_gid >= 100 )) && [[ $target_gid != $(id -g dev) ]]; then
    groupmod -g "$target_gid" dev
    updated_gid=1
  fi
  if (( updated_uid == 1 || updated_gid == 1 )); then
    chown -R "$(id -u dev):$(id -g dev)" /home/dev
  fi
  touch /run/uid-ready

  # Run container command as dev user
  export HOME=/home/dev USER=dev LOGNAME=dev SHELL=/bin/bash
  exec setpriv --reuid dev --regid dev --init-groups "$@"
fi

exec "$@"
