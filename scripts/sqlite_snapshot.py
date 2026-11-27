"""Copy a consistent SQLite snapshot to a new file, including committed WAL data."""

import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3


def snapshot(source: Path, target: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    with closing(sqlite3.connect(f"{source.resolve().as_uri()}?mode=ro", uri=True)) as origin:
        descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(descriptor)
        try:
            with closing(sqlite3.connect(target)) as copy:
                origin.backup(copy)
                if copy.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise RuntimeError("SQLite snapshot failed integrity_check")
        except BaseException:
            target.unlink()
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    snapshot(args.source, args.target)
    print("SQLite snapshot passed integrity_check")
