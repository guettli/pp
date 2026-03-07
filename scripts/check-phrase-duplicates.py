#!/usr/bin/env python3
"""
Check that no phrases-*.yaml file contains duplicate phrase entries.
Exit 1 if duplicates are found.

Called by lint.sh as part of the format and lint step.

Usage:
    python scripts/check-phrase-duplicates.py
"""
import argparse
import re
import sys
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Check all phrases-*.yaml files for duplicate phrase entries (called by lint.sh)."
    )
    parser.parse_args()

    repo_root = Path(__file__).parent.parent
    failed = False

    for path in sorted(repo_root.glob('phrases-*.yaml')):
        with open(path) as f:
            text = f.read()
        phrases = re.findall(r'^- phrase: (.+)$', text, re.MULTILINE)
        counts = Counter(p.strip() for p in phrases)
        dups = [(p, c) for p, c in counts.items() if c > 1]
        if dups:
            print(f'ERROR: {path} has duplicate phrases:')
            for phrase, count in sorted(dups):
                print(f'  [{count}x] {phrase}')
            failed = True

    if failed:
        sys.exit(1)
    else:
        print('No duplicate phrases found.')


if __name__ == "__main__":
    main()
