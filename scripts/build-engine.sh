#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p build
c++ -std=c++17 -O2 -Wall -Wextra engine/main.cpp -o build/aurex-engine
c++ -std=c++17 -O2 -Wall -Wextra tests/engine_test.cpp -o build/engine-test
./build/engine-test
