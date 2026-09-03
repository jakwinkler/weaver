#!/bin/sh
set -eu

swift test
swift build --configuration release
