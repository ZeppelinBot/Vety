#!/usr/bin/env bash
set -eou pipefail

docker compose -f ./docker/devenv/compose.yml run \
    --quiet \
    --rm \
    -w /workspace/vety \
    untrusted /bin/bash
