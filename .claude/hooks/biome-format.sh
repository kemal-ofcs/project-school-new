#!/usr/bin/env bash
# PostToolUse hook: format the file Claude just wrote using the owning
# workspace's biome (web-desktop/ and mobile/ each have their own biome.json).
# No jq on this machine, so the stdin payload is parsed with bun.
set -u

file=$(bun -e '
const bs = String.fromCharCode(92);
const s = await Bun.stdin.text();
let p = "";
try {
  const j = JSON.parse(s);
  p = j.tool_response?.filePath ?? j.tool_input?.file_path ?? "";
} catch {}
process.stdout.write(p.split(bs).join("/"));
')

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

# Walk up to the nearest biome.json to find the owning workspace.
dir=$(dirname "$file")
while :; do
  [ -f "$dir/biome.json" ] && break
  parent=$(dirname "$dir")
  [ "$parent" = "$dir" ] && exit 0
  dir="$parent"
done

[ -x "$dir/node_modules/.bin/biome" ] || exit 0
cd "$dir" && ./node_modules/.bin/biome format --write "$file"
