#!/usr/bin/env python3
"""Report source files that are approaching or exceeding line-count limits."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SOURCE_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".cxx",
    ".go",
    ".h",
    ".hpp",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".lua",
    ".m",
    ".mm",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scala",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".ts",
    ".tsx",
    ".vue",
    ".zsh",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report source files that are approaching or exceeding line-count limits.",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories to check. If omitted, inspect changed and untracked files in the current git repo.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Recursively scan the provided paths. If no path is provided, scan the current working directory.",
    )
    parser.add_argument(
        "--warn-lines",
        type=int,
        default=250,
        help="Line count that should be reported as a warning. Defaults to 250.",
    )
    parser.add_argument(
        "--max-lines",
        type=int,
        default=500,
        help="Maximum allowed total lines per source file. Defaults to 500.",
    )
    return parser.parse_args()


def is_source_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS


def git_root() -> Path | None:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip()).resolve()


def git_changed_source_files(root: Path) -> list[Path]:
    diff_result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    untracked_result = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )

    candidates = set()
    for result in (diff_result, untracked_result):
        if result.returncode != 0:
            continue
        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            candidates.add((root / line.strip()).resolve())

    return sorted(path for path in candidates if is_source_file(path))


def iter_source_files(paths: list[str], recursive: bool) -> list[Path]:
    collected: set[Path] = set()

    for raw_path in paths:
        path = Path(raw_path).resolve()
        if not path.exists():
            print(f"[WARN] Skipping missing path: {raw_path}", file=sys.stderr)
            continue

        if path.is_file():
            if is_source_file(path):
                collected.add(path)
            continue

        if not path.is_dir():
            continue

        iterator = path.rglob("*") if recursive else path.glob("*")
        for candidate in iterator:
            resolved = candidate.resolve()
            if is_source_file(resolved):
                collected.add(resolved)

    return sorted(collected)


def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for _ in handle)


def main() -> int:
    args = parse_args()

    if args.warn_lines < 0 or args.max_lines < 0:
        print("[ERROR] --warn-lines and --max-lines must be non-negative.", file=sys.stderr)
        return 2

    if args.warn_lines > args.max_lines:
        print("[ERROR] --warn-lines must be less than or equal to --max-lines.", file=sys.stderr)
        return 2

    if args.paths:
        source_files = iter_source_files(args.paths, recursive=args.all)
    elif args.all:
        source_files = iter_source_files([str(Path.cwd())], recursive=True)
    else:
        root = git_root()
        if root is None:
            print("[ERROR] No git repository found. Provide explicit paths or use --all.", file=sys.stderr)
            return 2
        source_files = git_changed_source_files(root)

    if not source_files:
        print(
            f"Checked 0 source files against the {args.warn_lines}-line warning "
            f"threshold and {args.max_lines}-line hard limit."
        )
        print("No matching source files were found.")
        return 0

    warnings = []
    violations = []
    for path in source_files:
        line_count = count_lines(path)
        if line_count > args.max_lines:
            violations.append((path, line_count))
        elif line_count > args.warn_lines:
            warnings.append((path, line_count))

    print(
        f"Checked {len(source_files)} source file(s) against the {args.warn_lines}-line "
        f"warning threshold and {args.max_lines}-line hard limit."
    )

    if warnings:
        print("Warnings:")
        for path, line_count in warnings:
            print(f"- {path}: {line_count} lines")

    if not violations:
        if not warnings:
            print("All checked source files are within the warning threshold.")
        print("No files exceeded the hard limit.")
        return 0

    print("Violations:")
    for path, line_count in violations:
        print(f"- {path}: {line_count} lines")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
