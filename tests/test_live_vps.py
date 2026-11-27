"""Safety checks for the operator-side VPS runner; no production connections."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

import pytest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("live_vps", ROOT / "scripts/live_vps.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def entry(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def test_approved_archive_member_is_exact_and_does_not_extract_other_paths(tmp_path):
    archive = tmp_path / "inputs.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("authorized/report.pdf", b"%PDF-example")
        zipped.writestr("../outside", b"untrusted")
    assert runner.read_archive_member(archive, "authorized/report.pdf", entry(b"%PDF-example")) == b"%PDF-example"
    with pytest.raises(runner.Blocked, match="SHA|манифест"):
        runner.read_archive_member(archive, "authorized/report.pdf", entry(b"%PDF-invalid"))
    assert not (tmp_path.parent / "outside").exists()


def test_materials_require_size_digest_and_regular_file(tmp_path):
    path = tmp_path / "report.pdf"
    path.write_bytes(b"abcd")
    assert runner.matches(path, entry(b"abcd"))
    assert not runner.matches(path, entry(b"ABCD"))
    link = tmp_path / "link.pdf"
    link.symlink_to(path)
    assert not runner.matches(link, entry(b"abcd"))
    expected = runner.materials(json.loads((ROOT / "docs/SOURCE_MANIFEST.json").read_text()))
    assert len([name for name in expected if name.lower().endswith(".pdf")]) == 6
    assert {"vehicles.json", "fault_types.json"} <= expected.keys()


def test_isolation_refuses_public_port_production_mount_and_external_toir(tmp_path):
    project = "judrive-live-test"
    services = {name: {"image": f"{project}-{name}", "networks": {"default": {}}} for name in ("backend", "web", "toir", "ml")}
    services["web"]["ports"] = [{"host_ip": "127.0.0.1", "published": "18185", "target": 80}]
    services["backend"]["environment"] = {"MOCK_TOIR_URL": "http://toir:8002", "MOCK_ML_URL": "http://ml:8001",
                                           "DB_PATH": "/app/local-data/judrive.sqlite"}
    services["backend"]["volumes"] = [
        {"type": "bind", "source": str(tmp_path / "state"), "target": "/app/local-data"},
        {"type": "bind", "source": str(tmp_path / "pdf"), "target": "/app/materials/manuals", "read_only": True},
    ]
    config = {"services": services, "name": project, "networks": {"default": {"name": project + "_default"}}}
    runner.verify_isolation(config, tmp_path, 18185, project)
    for field, value in (
        (("web", "ports", 0, "host_ip"), "0.0.0.0"),
        (("backend", "volumes", 0, "source"), "/opt/judrive/data"),
        (("backend", "environment", "MOCK_TOIR_URL"), "https://prod.example/api"),
        (("backend", "volumes", 1, "read_only"), False),
    ):
        bad = deepcopy(config)
        current = bad["services"]
        for key in field[:-1]:
            current = current[key]
        current[field[-1]] = value
        with pytest.raises(runner.Blocked):
            runner.verify_isolation(bad, tmp_path, 18185, project)


@pytest.mark.parametrize("missing_pdf", [False, True])
def test_archive_only_required_when_verified_sources_are_incomplete(tmp_path, monkeypatch, missing_pdf):
    import subprocess

    manifest = json.loads((ROOT / "docs/SOURCE_MANIFEST.json").read_text())
    fault = subprocess.check_output(["git", "show", f"{runner.FAULT_ORIGINAL}:{runner.FAULT_PATH}"], cwd=ROOT)
    assert entry(fault)["sha256"] == runner.FAULT_SHA
    pdfs = [item for item in manifest["source_files"] if item["filename"].endswith(".pdf")]
    for item in pdfs:
        item.update(entry(b"%PDF-fixture"))
    vehicles = next(item for item in manifest["included_mock_files"] if item["repository_path"].endswith("/vehicles.json"))
    vehicles.update(entry(b"{}"))
    originals = tmp_path / "originals"
    originals.mkdir()
    for item in pdfs[int(missing_pdf):]:
        (originals / item["filename"]).write_bytes(b"%PDF-fixture")
    monkeypatch.setattr(runner, "source_roots", lambda settings: [originals])
    root = tmp_path / "run"
    for name in ("pdf", "fleet", "repo"):
        (root / name).mkdir(parents=True)
    subprocess.run(["git", "clone", "-q", "--no-checkout", "--shared", str(ROOT), str(root / "repo")], check=True)
    vehicle_path = root / "repo" / vehicles["repository_path"]
    vehicle_path.parent.mkdir(parents=True, exist_ok=True)
    vehicle_path.write_bytes(b"{}")
    entries = runner.materials(manifest)
    assert runner.archive_required(entries, runner.locate([originals], entries), ["vehicles.json"]) == missing_pdf
    if missing_pdf:
        with pytest.raises(runner.Blocked, match="разрешённый архив"):
            runner.fill_materials(root, tmp_path, {}, {}, manifest)
    else:
        runner.fill_materials(root, tmp_path, {}, {}, manifest)
        assert (root / "fleet/fault_types.json").read_bytes() == fault
