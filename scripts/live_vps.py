#!/usr/bin/env python3
"""Read-only JUDRIVE VPS audit and separate, opt-in LIVE deployment."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler
import zipfile

SOURCE = "https://github.com/judogaaa/JUDRIVE.git"
BASE = "dfd55c3216df5d98e8e3c52caac59e63661dbfa2"
ROOT = Path("/opt/judrive-live-acceptance")
PROD = Path("/opt/judrive")
SCOPES = {"GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"}
AUDIO_SUFFIXES = {".wav", ".webm", ".mp4", ".m4a", ".ogg", ".opus", ".mp3"}


class Blocked(Exception):
    pass


def command(*args, cwd=None, env=None, capture=False, data=None):
    return subprocess.run(args, cwd=cwd, env=env, input=data, text=True,
                          stdout=subprocess.PIPE if capture else None, check=True).stdout


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def matches(path, entry):
    return path.is_file() and not path.is_symlink() and path.stat().st_size == entry["bytes"] and sha256(path) == entry["sha256"]


def read_settings():
    settings = {}
    names = {"GIGACHAT_CREDENTIALS", "GIGACHAT_SCOPE", "JUDRIVE_MANUALS_URL",
             "JUDRIVE_MANUALS_DIR", "JUDRIVE_FLEET_DIR", "PDF_DIR", "FLEET_DATA_PATH", "GIGACHAT_CA_BUNDLE"}
    names |= {"GIGACHAT_CHAT_MICRORUB_PER_TOKEN", "GIGACHAT_VOICE_MICRORUB_PER_TOKEN",
              "GIGACHAT_REQUEST_BUDGET_MICRORUB", "GIGACHAT_DAILY_BUDGET_MICRORUB",
              "GIGACHAT_MONTHLY_BUDGET_MICRORUB"}
    for name in (PROD / ".env", PROD / "repo/.env"):
        if not name.is_file():
            continue
        for line in name.read_text(encoding="utf-8").splitlines():
            key, sep, raw = line.partition("=")
            if sep and key.strip() in names:
                try:
                    values = shlex.split(raw, comments=True)
                except ValueError:
                    continue
                if values:
                    settings[key.strip()] = " ".join(values)
    legacy = PROD / "gigachat.key"
    if not settings.get("GIGACHAT_CREDENTIALS") and legacy.is_file():
        settings["GIGACHAT_CREDENTIALS"] = legacy.read_text().strip()
    for key in names:
        if os.environ.get(key):
            settings[key] = os.environ[key]
    return settings


def source_roots(settings):
    roots = [PROD]
    for key in ("JUDRIVE_MANUALS_DIR", "PDF_DIR", "JUDRIVE_FLEET_DIR", "FLEET_DATA_PATH"):
        if raw := settings.get(key):
            base = Path(raw)
            base = base if base.is_absolute() else PROD / "repo" / base
            if base.is_file():
                base = base.parent
            if base.is_dir() and base.resolve() != Path("/"):
                roots.append(base.resolve())
    return list(dict.fromkeys(roots))


def materials(manifest):
    result = {item["filename"]: item for item in manifest["source_files"] if item["filename"].lower().endswith(".pdf")}
    result.update({Path(item["repository_path"]).name: item for item in manifest["included_mock_files"]
                   if Path(item["repository_path"]).name in {"vehicles.json", "fault_types.json"}})
    if len(result) != 8:
        raise Blocked("Источник не содержит манифест шести PDF и двух файлов Mock")
    return result


def locate(roots, entries):
    found = {}
    for root in roots:
        for directory, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = [name for name in dirs if name not in {".git", "node_modules", ".venv"}]
            for name in set(files) & entries.keys() - found.keys():
                candidate = Path(directory) / name
                if matches(candidate, entries[name]):
                    found[name] = candidate
    return found


def audit(settings, manifest):
    for args in (
        ("uname", "-srmo"), ("nproc",), ("free", "-h"), ("df", "-h", "/opt"),
        ("docker", "version", "--format", "{{.Server.Version}}"),
        ("docker", "compose", "version"), ("docker", "ps", "--format", "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"),
        ("docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}"),
        ("ss", "-ltnp", "( sport = :80 or sport = :443 )"),
    ):
        try:
            command(*args)
        except (OSError, subprocess.CalledProcessError):
            print(f"BLOCKED: {args[0]}", flush=True)
    print("Nginx config present:", Path("/etc/nginx/nginx.conf").is_file(), flush=True)
    if (PROD / "repo/.git").exists():
        command("git", "-C", str(PROD / "repo"), "rev-parse", "HEAD")
        command("git", "-C", str(PROD / "repo"), "status", "--short")
    roots = source_roots(settings)
    for directory, dirs, files in os.walk(PROD, followlinks=False):
        dirs[:] = [name for name in dirs if name not in {".git", "node_modules", ".venv"}]
        for name in files:
            path = Path(directory) / name
            if path.is_symlink():
                continue
            if path.suffix in {".sqlite", ".sqlite3", ".db", ".bak"} or "backup" in path.parent.name.lower():
                print("state:", path, path.stat().st_size, "bytes", flush=True)
    entries = materials(manifest)
    found = locate(roots, entries)
    archive = manifest["archive"]
    archive_available = bool(locate(roots, {archive["filename"]: archive})) if len(entries) != len(found) else False
    for name, item in entries.items():
        print("MATCH" if name in found else "BLOCKED", name, item["bytes"], item["sha256"], flush=True)
    print("configured credentials:", bool(settings.get("GIGACHAT_CREDENTIALS")), flush=True)
    print("configured scope:", settings.get("GIGACHAT_SCOPE") if settings.get("GIGACHAT_SCOPE") in SCOPES else "unconfirmed", flush=True)
    print("configured archive URL:", bool(settings.get("JUDRIVE_MANUALS_URL")), flush=True)
    print("JUDRIVE_AUDIT_JSON " + json.dumps({
        "missing_materials": len(entries) != len(found),
        "configured_url": bool(settings.get("JUDRIVE_MANUALS_URL")),
        "approved_archive": archive_available,
        "configured_key": bool(settings.get("GIGACHAT_CREDENTIALS")),
        "confirmed_scope": settings.get("GIGACHAT_SCOPE") in SCOPES,
    }), flush=True)


def read_archive_member(archive, member_path, entry):
    with zipfile.ZipFile(archive) as zipped:
        try:
            info = zipped.getinfo(member_path)
        except KeyError as exc:
            raise Blocked("В архиве нет пути из манифеста") from exc
        if info.file_size != entry["bytes"]:
            raise Blocked("Размер элемента архива отличается от манифеста")
        with zipped.open(info) as stream:
            data = stream.read(entry["bytes"] + 1)
    if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise Blocked("Элемент архива не совпадает с манифестом")
    return data


class HTTPSRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if target.scheme != "https" or not target.hostname or target.username or target.password:
            raise Blocked("Перенаправление архива требует HTTPS без userinfo")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fill_materials(root, staging, settings, config, manifest):
    entries = materials(manifest)
    found = locate(source_roots(settings), entries)
    archive = staging / "organizer.zip"
    if len(found) != len(entries) and not archive.exists():
        original = manifest["archive"]
        archive = locate(source_roots(settings), {original["filename"]: original}).get(original["filename"], archive)
    if len(found) != len(entries) and not archive.exists():
        url = config.get("archive_url") or settings.get("JUDRIVE_MANUALS_URL")
        if not url:
            raise Blocked("Нужен разрешённый архив организаторов или прямая HTTPS-ссылка")
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise Blocked("Для архива требуется прямая HTTPS-ссылка")
        try:
            with build_opener(HTTPSRedirects()).open(url, timeout=60) as response, archive.open("xb") as out:
                remaining = manifest["archive"]["bytes"] + 1
                while remaining and (chunk := response.read(min(remaining, 1024 * 1024))):
                    out.write(chunk)
                    remaining -= len(chunk)
        except OSError as exc:
            raise Blocked("Скачать архив по настроенной ссылке не удалось") from exc
    if len(found) != len(entries) and not matches(archive, manifest["archive"]):
        raise Blocked("Архив отличается по размеру или SHA-256")
    nested = None
    for name, item in entries.items():
        target = root / ("pdf" if name.endswith(".pdf") else "fleet") / name
        if name in found:
            shutil.copyfile(found[name], target)
        elif item.get("archive_path"):
            target.write_bytes(read_archive_member(archive, item["archive_path"], item))
        else:
            if nested is None:
                mock = next(value for value in manifest["source_files"] if value["filename"].startswith("neurodvs_"))
                nested = read_archive_member(archive, mock["archive_path"], mock)
            target.write_bytes(read_archive_member(io.BytesIO(nested), item["original_archive_path"], item))
        if not matches(target, item):
            raise Blocked("Контрольная сумма скопированного файла изменилась")
        print(f"PASS: {name} bytes={item['bytes']} sha256={item['sha256']}", flush=True)


def compose_env(root, port, project, ca):
    return {key: val for key, val in os.environ.items() if not key.startswith(("COMPOSE_", "DOCKER_", "JUDRIVE_"))} | {
        "COMPOSE_PARALLEL_LIMIT": "1",
        "JUDRIVE_RUNTIME_IMAGE": f"{project}-runtime:local",
        "JUDRIVE_ACCEPT_WEB_IMAGE": f"{project}-web:local",
        "JUDRIVE_DOMAIN": "http://:80",
        "JUDRIVE_FLEET_DIR": str(root / "fleet"),
        "JUDRIVE_MANUALS_DIR": str(root / "pdf"),
        "JUDRIVE_STATE_DIR": str(root / "state"),
        "JUDRIVE_CA_DIR": str(root / "ca"),
        "JUDRIVE_ACCEPT_INPUT": str(root / "input"),
        "JUDRIVE_ACCEPT_ENV": str(root / ".env"),
        "JUDRIVE_ACCEPT_PORT": str(port),
        "JUDRIVE_ACCEPT_CA": "/run/judrive-ca/roots.pem" if ca else "",
    }


def verify_isolation(config, root, port, project):
    services = config["services"]
    if set(services) != {"ml", "toir", "backend", "web"} or config["name"] != project:
        raise Blocked("Имя или состав Compose-проекта отличается от ожидаемого")
    networks = config.get("networks") or {}
    default = networks.get("default") or {}
    if set(networks) != {"default"} or default.get("name") != project + "_default" or default.get("external"):
        raise Blocked("Сеть должна принадлежать только проекту приёмки")
    for name, service in services.items():
        if (service.get("extra_hosts") or service.get("privileged") or service.get("container_name")
                or set(service.get("networks") or {}) != {"default"} or service.get("network_mode")):
            raise Blocked("Сервис может обращаться только к сети проекта")
        if not service.get("image", "").startswith(project + "-"):
            raise Blocked("Сервис использует внешнюю сеть или общий образ")
        ports = service.get("ports") or []
        if name != "web" and ports:
            raise Blocked("Внутренний сервис публикует порт")
        if name == "web" and (len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1"
                              or str(ports[0].get("published")) != str(port) or ports[0].get("target") != 80):
            raise Blocked("Web должен публиковать единственный loopback-порт")
        for item in service.get("volumes", []):
            if item["type"] == "bind":
                source = Path(item["source"]).resolve()
                if not source.is_relative_to(root):
                    raise Blocked("Bind mount выходит за пределы изолированного каталога")
                if item["target"] != "/app/local-data" and not item.get("read_only"):
                    raise Blocked("Материалы и инструменты должны подключаться read-only")
    backend = {item["target"]: Path(item["source"]).resolve() for item in services["backend"]["volumes"]}
    if backend.get("/app/local-data") != root / "state" or backend.get("/app/materials/manuals") != root / "pdf":
        raise Blocked("Выбран неверный том SQLite или PDF")
    environment = services["backend"]["environment"]
    if (environment.get("MOCK_TOIR_URL") != "http://toir:8002" or environment.get("MOCK_ML_URL") != "http://ml:8001"
            or environment.get("DB_PATH") != "/app/local-data/judrive.sqlite"):
        raise Blocked("Mock API и SQLite должны использовать локальный проект")


def compose_runner(repo, environment, project):
    compose = ["docker", "compose", "--env-file", "/dev/null", "-p", project,
               "-f", "compose.yaml", "-f", "deploy/compose.live.yaml"]

    def invoke(*params, **kwargs):
        return command(*compose, *params, cwd=repo, env=environment, **kwargs)

    return invoke


def stop(run_id):
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise Blocked("Неверный идентификатор прогона")
    project = "judrive-live-" + run_id
    root = ROOT / project
    if root.is_symlink() or root.resolve() != root or not root.is_dir() or root.stat().st_mode & 0o077:
        raise Blocked("Изолированный каталог приёмки не найден")
    metadata = json.loads((root / "run.json").read_text(encoding="utf-8"))
    if metadata["run_id"] != run_id:
        raise Blocked("Метаданные прогона не совпадают")
    ca = (root / "ca/roots.pem").is_file()
    environment = compose_env(root, metadata["port"], project, ca)
    invoke = compose_runner(root / "repo", environment, project)
    verify_isolation(json.loads(invoke("config", "--format", "json", capture=True)), root, metadata["port"], project)
    invoke("stop")
    print(f"PASS: {project} stopped; state retained", flush=True)


def check_disk_capacity():
    docker_directory = command("docker", "info", "--format", "{{.DockerRootDir}}", capture=True).strip()
    if not docker_directory or not Path(docker_directory).is_absolute():
        raise Blocked("Не удалось определить хранилище Docker на VPS")
    # Leave operating headroom for the existing containers and SQLite.
    for path in {Path("/opt"), Path(docker_directory)}:
        if shutil.disk_usage(path).free < 2 * 1024 ** 3:
            raise Blocked(f"Недостаточно свободного места для изолированной сборки и действующих сервисов: {path}")


def setup(args, config, settings, manifest):
    if os.geteuid() != 0:
        raise Blocked("Требуется доступ root к VPS")
    if not re.fullmatch(r"[a-f0-9]{40}", args.sha):
        raise Blocked("Требуется полный SHA кандидата")
    if not 1024 <= args.port <= 65535:
        raise Blocked("Недопустимый порт")
    with socket.socket() as test:
        test.bind(("127.0.0.1", args.port))
    credential = config.get("key") or settings.get("GIGACHAT_CREDENTIALS") or ""
    if credential and not re.fullmatch(r"(?:Basic )?[A-Za-z0-9+/_=-]+", credential, re.I):
        raise Blocked("Некорректный формат Authorization Key")
    scope = settings.get("GIGACHAT_SCOPE")
    if scope not in SCOPES:
        scope = config.get("scope")
    if credential and scope not in SCOPES:
        raise Blocked("Нужен подтверждённый scope из кабинета GigaChat")
    if args.run_id is None or not re.fullmatch(r"[a-f0-9]{32}", args.run_id):
        raise Blocked("Неверный идентификатор прогона")
    check_disk_capacity()
    run_id = args.run_id
    project = f"judrive-live-{run_id}"
    if ROOT.is_symlink():
        raise Blocked("Каталог приёмки не должен быть символической ссылкой")
    ROOT.mkdir(mode=0o700, exist_ok=True)
    if ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o077:
        raise Blocked("Каталог приёмки должен быть приватным")
    root = ROOT / project
    root.mkdir(mode=0o700)
    for name in ("state", "pdf", "fleet", "ca", "input"):
        (root / name).mkdir(mode=0o700)
    staging = Path("/tmp") / f"judrive-input-{run_id}"
    repo = root / "repo"
    command("git", "init", "-q", str(repo))
    command("git", "fetch", "--quiet", "--no-tags", SOURCE, args.sha, cwd=repo)
    command("git", "merge-base", "--is-ancestor", BASE, "FETCH_HEAD", cwd=repo)
    command("git", "-c", "advice.detachedHead=false", "checkout", "-q", "--detach", "FETCH_HEAD", cwd=repo)
    if command("git", "rev-parse", "HEAD", capture=True, cwd=repo).strip() != args.sha:
        raise Blocked("SHA checkout не совпадает с указанным")
    print(f"candidate={args.sha} project={project} run_dir={root}", flush=True)
    fill_materials(root, staging, settings, config, manifest)
    audio = None
    if suffix := config.get("audio_type"):
        if suffix not in AUDIO_SUFFIXES:
            raise Blocked("Недопустимый формат аудио")
        audio = root / "input" / f"speech{suffix}"
        source = staging / "speech"
        if not 0 < source.stat().st_size <= 8 * 1024 * 1024:
            raise Blocked("Размер аудио должен быть до 8 МиБ")
        shutil.copyfile(source, audio)
    ca = None
    ca_source = staging / "ca.pem" if config.get("ca_uploaded") else None
    if ca_source is None and settings.get("GIGACHAT_CA_BUNDLE"):
        configured = Path(settings["GIGACHAT_CA_BUNDLE"])
        if configured.is_absolute() and configured.is_file():
            ca_source = configured
    if ca_source:
        ca = root / "ca/roots.pem"
        shutil.copyfile(ca_source, ca)
    environment = compose_env(root, args.port, project, ca)
    invoke = compose_runner(repo, environment, project)
    metadata = {"port": args.port, "sha": args.sha, "run_id": run_id}
    (root / "run.json").write_text(json.dumps(metadata), encoding="utf-8")

    password = secrets.token_urlsafe(24)
    username = f"chief-{run_id[:10]}"
    salt = secrets.token_hex(16)
    signed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    def write_env(model):
        data = {"CHIEF_USERNAME": username, "CHIEF_PASSWORD_HASH": f"{salt}${signed}",
                "SESSION_SECRET": secrets.token_urlsafe(32), "GIGACHAT_CREDENTIALS": credential,
                "GIGACHAT_SCOPE": scope or "GIGACHAT_API_PERS", "GIGACHAT_MODEL": model,
                "GIGACHAT_STT_MODEL": "GigaChat-2-Max",
                "GIGACHAT_MAX_TOKENS": "800", "GIGACHAT_REQUEST_TOKENS": "160000",
                "DEMO_FLEET_SHA256": sha256(root / "fleet/vehicles.json") if args.allow_demo_fleet else ""}
        for key, value in settings.items():
            if key.endswith(("_MICRORUB_PER_TOKEN", "_BUDGET_MICRORUB")) and re.fullmatch(r"[0-9]+", value):
                data[key] = value
        with tempfile.NamedTemporaryFile(mode="w", dir=root, prefix=".env-", delete=False) as temp:
            temp_path = Path(temp.name)
            try:
                for key, value in data.items():
                    temp.write(f"{key}='{value}'\n")
                temp.flush()
                os.replace(temp_path, root / ".env")
            finally:
                temp_path.unlink(missing_ok=True)

    write_env("GigaChat-3-Ultra")
    verify_isolation(json.loads(invoke("config", "--format", "json", capture=True)), root, args.port, project)
    invoke("build", "backend")
    invoke("build", "web")
    invoke("up", "--no-build", "-d", "--wait", "--wait-timeout", "420")
    invoke("ps")
    invoke("exec", "-T", "backend", "python", "/acceptance/scripts/verify_original_manuals.py",
           "--pdf-dir", "/app/materials/manuals")
    print(f"JUDRIVE_LOGIN {username} {password}", flush=True)
    if not credential:
        raise Blocked("GIGACHAT_CREDENTIALS отсутствует")
    probes = ("exec", "-T", "-e", "JUDRIVE_LIVE_GIGACHAT=1", "backend", "python")
    model = invoke(*probes, "/acceptance/scripts/verify_live_vps.py", "--model", capture=True).strip()
    if model not in {"GigaChat-3-Ultra", "GigaChat-2-Max"}:
        raise Blocked("У аккаунта нет Ultra или Max в каталоге моделей")
    print(f"PASS: OAuth, forced refresh and model catalog; selected model={model}", flush=True)
    if model != "GigaChat-3-Ultra":
        write_env(model)
        invoke("up", "--no-build", "-d", "--wait", "--wait-timeout", "420", "backend")
    checks_failed = False
    for flags in ((), ("--validate-functions",)):
        try:
            invoke(*probes, "/acceptance/scripts/gigachat_smoke.py", *flags)
        except subprocess.CalledProcessError:
            checks_failed = True
            if not flags:
                raise
    options = ["--confirm"] if args.confirm_mock else []
    if audio:
        options += ["--audio", "/acceptance/input/" + audio.name]
    try:
        invoke(*probes, "/acceptance/scripts/verify_live_vps.py", *options,
               data=json.dumps({"username": username, "password": password}))
    except subprocess.CalledProcessError as exc:
        if exc.returncode == 2 and not checks_failed:
            raise Blocked("Живая приёмка завершена с непроверенным STT или подтверждением Mock ТОиР") from exc
        raise
    finally:
        if audio:
            audio.unlink(missing_ok=True)
        invoke("ps")
    if checks_failed:
        raise RuntimeError("Валидатор схем инструмента не прошёл")


def main(encoded_manifest, config=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true")
    parser.add_argument("--stop-run-id")
    parser.add_argument("--sha")
    parser.add_argument("--run-id")
    parser.add_argument("--port", type=int, default=18185)
    parser.add_argument("--confirm-mock", action="store_true")
    parser.add_argument("--allow-demo-fleet", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    settings = read_settings()
    manifest = json.loads(base64.b64decode(encoded_manifest))
    try:
        if sys.version_info < (3, 10):
            raise Blocked("На VPS нужен Python 3.10+")
        if args.audit:
            audit(settings, manifest)
        elif args.stop_run_id:
            stop(args.stop_run_id)
        else:
            setup(args, config or {}, settings, manifest)
    except Blocked as exc:
        print(f"BLOCKED: {exc}", flush=True)
        return 2
    except subprocess.CalledProcessError as exc:
        print(f"FAIL: команда {exc.cmd[0]} завершилась с кодом {exc.returncode}", flush=True)
        return 1
    except RuntimeError as exc:
        print(f"FAIL: {exc}", flush=True)
        return 1
    except (OSError, ValueError) as exc:
        print(f"FAIL: {type(exc).__name__}; проверьте входные данные и состояние VPS", flush=True)
        return 1
    return 0
