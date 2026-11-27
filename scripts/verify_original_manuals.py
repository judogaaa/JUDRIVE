"""Opt-in validation of permitted originals; no calls to an LLM."""
import argparse
from hashlib import file_digest
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.rag.catalog import MANUAL_SPECS
from app.rag.service import ManualRagService


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-dir", type=Path, required=True)
    args = parser.parse_args()
    if any(not (args.pdf_dir / spec.filename).is_file() for spec in MANUAL_SPECS):
        print("BLOCKED: подключите все разрешённые оригиналы руководств")
        return 2
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "docs" / "SOURCE_MANIFEST.json").read_text(encoding="utf-8"))
    hashes = {item["filename"]: item["sha256"] for item in manifest["source_files"]}
    for spec in MANUAL_SPECS:
        with (args.pdf_dir / spec.filename).open("rb") as handle:
            if file_digest(handle, "sha256").hexdigest() != hashes.get(spec.filename):
                print(f"BLOCKED: SHA-256 не соответствует разрешённому комплекту ({spec.doc_id})")
                return 2
    expected = {"y236-re:p0031", "y236-rk:p0269", "y236-rk:p0276"}
    with TemporaryDirectory(prefix="judrive-originals-") as temp:
        rag = ManualRagService(Path(temp) / "index.sqlite", args.pdf_dir)
        result = rag.search("ЯМЗ-236М2", "регулировка тепловых зазоров клапанов")
        sources = result.get("conflicting_sources", [])
        if (
            result["status"] != "conflict"
            or {source["evidence_id"] for source in sources} != expected
            or "сама по себе не подтверждает охлаждение" not in result.get("message", "")
            or "менее чем через 15 минут" not in result.get("message", "")
            or "не ранее, чем через 15 минут" not in result.get("message", "")
            or not any("ЯМЗ-238КМ2" in (source.get("applicability") or "") for source in sources)
        ):
            print("FAIL: оригиналы не подтвердили все три страницы и правило охлаждения")
            return 1
        print("PASS: РЭ 31, РК 269 и 276; 15 минут не служат доказательством охлаждения; отмечена оговорка ЯМЗ-238КМ2")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
