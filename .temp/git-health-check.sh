#!/usr/bin/env bash
# WorldEngine Git 健康度检查脚本
# 用法: cd 项目根目录 && bash .temp/git-health-check.sh

set -euo pipefail

echo "═══════════════════════════════════════════════════════════════════════════════════════════════════════"
echo "  WorldEngine Git 健康度报告"
echo "═══════════════════════════════════════════════════════════════════════════════════════════════════════"
echo ""

cd "$(git rev-parse --show-toplevel)"

# 1. 基础统计
echo "┌── 基础统计"
TOTAL_COMMITS=$(git rev-list --all --count)
TOTAL_AUTHORS=$(git shortlog -sne --all | wc -l | tr -d ' ')
DATE_RANGE=$(git log --format="%ad" --date=short --all | awk 'NR==1{last=$0} {first=$0} END{print first " → " last}')
echo "│  总提交数: $TOTAL_COMMITS"
echo "│  作者身份: $TOTAL_AUTHORS 人 (含 .mailmap 映射)"
echo "│  时间跨度: $DATE_RANGE"
echo "└──"
echo ""

# 2. 作者分布
echo "┌── 作者分布 (top 5)"
git shortlog -sne --all | head -5 | while read line; do
  echo "│  $line"
done
echo "└──"
echo ""

# 3. 提交前缀统计
echo "┌── 提交前缀统计"
git log --format=%s --all | sed -n 's/^\([^:(]*\)[(:].*/\1/p' | sort | uniq -c | sort -rn | head -10 | while read line; do
  echo "│  $line"
done
echo "└──"
echo ""

# 4. 合并提交
echo "┌── 分支与合并"
MERGE_COUNT=$(git rev-list --all --merges --count)
echo "│  合并提交数: $MERGE_COUNT"
echo "│  当前分支:"
git branch -vv | sed 's/^/│    /'
echo "│  远程分支:"
git branch -r | sed 's/^/│    /'
echo "└──"
echo ""

# 5. 大文件检查
echo "┌── 大文件检查 (>500KB)"
BLOBS=$(git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '$1 == "blob" && $3 > 512000 {print $3 " " $4}')
if [ -z "$BLOBS" ]; then
  echo "│  ✅ 未发现超过 500KB 的 blob"
else
  echo "$BLOBS" | while read line; do echo "│  ⚠️  $line"; done
fi
echo "└──"
echo ""

# 6. 已跟踪的 generated 文件
echo "┌── 已跟踪的可疑文件"
SUSPECT=$(git ls-files | grep -E "^node_modules/|^dist/|^build/|^\.temp/|\.db$|\.DS_Store$" || true)
if [ -z "$SUSPECT" ]; then
  echo "│  ✅ 未发现应忽略的 generated/临时文件"
else
  echo "$SUSPECT" | while read line; do echo "│  ⚠️  $line"; done
fi
echo "└──"
echo ""

# 7. 敏感信息扫描 (轻量)
echo "┌── 敏感信息快照 (搜索 password/secret/api_key)"
# 只搜索最近 50 个 commit 以避免耗时
LEAKS=$(git log -S "password" -S "secret" -S "api_key" --all --oneline -50 2>/dev/null || true)
if [ -z "$LEAKS" ]; then
  echo "│  ✅ 最近 50 个匹配未发现异常"
else
  echo "$LEAKS" | while read line; do echo "│  ⚠️  $line"; done
fi
echo "└──"
echo ""

# 8. 未合并远程分支
echo "┌── 未合并到 main 的远程分支"
UNMERGED=$(git branch -r --no-merged main 2>/dev/null || true)
if [ -z "$UNMERGED" ]; then
  echo "│  ✅ 所有远程分支均已合并到 main"
else
  echo "$UNMERGED" | while read line; do echo "│  ℹ️  $line"; done
fi
echo "└──"
echo ""

echo "═════════════════════════════════════════════════════════════════════════════════════════════════════"
echo "  检查完毕。如有 ⚠️ 项，请手动处理。"
