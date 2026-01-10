#!/bin/bash

# Interactive commit message rewriter
# This uses git rebase --interactive to rewrite all commit messages

set -e

MAPPINGS_FILE="commit-mappings.txt"

if [ ! -f "$MAPPINGS_FILE" ]; then
  echo "❌ Error: $MAPPINGS_FILE not found!"
  exit 1
fi

echo "🔍 Preparing to rewrite 125+ commits..."
echo ""

# Load mappings into associative array
declare -A MSG_MAP
while IFS='|' read -r sha new_message; do
  [[ "$sha" =~ ^#.*$ ]] && continue
  [[ -z "$sha" ]] && continue
  MSG_MAP["$sha"]="$new_message"
done < "$MAPPINGS_FILE"

echo "✅ Loaded ${#MSG_MAP[@]} commit mappings"
echo ""

# Get the first commit SHA
FIRST_COMMIT=$(git rev-list --max-parents=0 HEAD)
echo "📍 First commit: $FIRST_COMMIT"
echo ""

# Create a temporary script for git-rebase-todo
REBASE_SCRIPT=$(mktemp)

# Generate rebase plan with all commits marked for reword
git log --reverse --format="%H" $FIRST_COMMIT..HEAD > /tmp/commits-to-rewrite.txt

echo "#!/bin/bash" > "$REBASE_SCRIPT"
echo "# Automatic commit message rewriter" >> "$REBASE_SCRIPT"
echo "" >> "$REBASE_SCRIPT"

# Add function to rewrite messages
cat >> "$REBASE_SCRIPT" <<'SCRIPT_EOF'
# Get the current commit SHA before rewriting
OLD_SHA=$(git log --format=%H -n 1 HEAD 2>/dev/null || echo "")

# Look up new message
NEW_MSG=""
SCRIPT_EOF

# Add the mappings directly into the script
for sha in "${!MSG_MAP[@]}"; do
  escaped_msg=$(echo "${MSG_MAP[$sha]}" | sed 's/"/\\"/g')
  echo "[ \"\$OLD_SHA\" = \"$sha\" ] && NEW_MSG=\"$escaped_msg\"" >> "$REBASE_SCRIPT"
done

cat >> "$REBASE_SCRIPT" <<'SCRIPT_EOF'

if [ -n "$NEW_MSG" ]; then
  GIT_EDITOR="cat" git commit --amend -m "$NEW_MSG" > /dev/null 2>&1
  echo "✓ Rewrote: $NEW_MSG"
else
  echo "⚠ Skipped: $OLD_SHA (no mapping)"
fi
SCRIPT_EOF

chmod +x "$REBASE_SCRIPT"

echo "🚀 Starting rebase from root..."
echo "   This will take several minutes..."
echo ""

# Use rebase with exec to run our script on each commit
GIT_SEQUENCE_EDITOR="sed -i 's/^pick/exec bash $REBASE_SCRIPT \&\& pick/'" \
  git rebase -i --root --autosquash --keep-empty

# Clean up
rm -f "$REBASE_SCRIPT"

echo ""
echo "✅ Rewrite complete!"
echo ""
echo "📊 Verification (first 10 commits):"
git log --oneline --format="%s" | head -10
