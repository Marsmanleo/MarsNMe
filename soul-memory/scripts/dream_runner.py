#!/usr/bin/env python3
import base64
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib import error, request

def getenv_first(names: list[str], default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None:
            return value
    return default

def env_bool_any(names: list[str], default: bool) -> bool:
    raw = getenv_first(names, "")
    if raw is None or raw == "":
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default

def env_int_any(
    names: list[str],
    default: int,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None
) -> int:
    raw = getenv_first(names, "").strip()
    value = default
    if raw:
        try:
            value = int(raw)
        except ValueError:
            value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value

def normalize_line(text: str, limit: int = 220) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"

def load_env_file(path: str):
    env_path = Path(path)
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip()

def infer_profile() -> str:
    explicit = getenv_first(
        ["DREAM_DIGEST_PROFILE", "HERMES_DIGEST_PROFILE"],
        ""
    ).strip().lower()
    if explicit in {"coco", "toto"}:
        return explicit
    script_path = str(Path(__file__)).lower()
    if "/profiles/toto/" in script_path:
        return "toto"
    if "/profiles/coco/" in script_path:
        return "coco"
    mcp_hint = getenv_first(
        ["DREAM_DIGEST_MCP_URL", "HERMES_DIGEST_MCP_URL"],
        ""
    ).strip()
    if ":18791" in mcp_hint:
        return "toto"
    return "coco"

PROFILE = infer_profile()
PROFILE_LABEL = {"coco": "CoCo", "toto": "Toto"}.get(PROFILE, "CoCo")
RUNNER_MODE = getenv_first(["DREAM_MODE"], "standard").strip().lower() or "standard"
if RUNNER_MODE not in {"lite", "standard", "pro"}:
    RUNNER_MODE = "standard"

DEFAULT_DREAM_HOME = str(Path.home() / ".dream-runner")
DREAM_HOME = getenv_first(["DREAM_HOME", "HERMES_HOME"], DEFAULT_DREAM_HOME).strip() or DEFAULT_DREAM_HOME
DREAM_PROFILE_ROOT = (
    getenv_first(["DREAM_PROFILE_ROOT", "HERMES_PROFILE_ROOT"], f"{DREAM_HOME}/profiles").strip()
    or f"{DREAM_HOME}/profiles"
)
DREAM_CANONICAL_ROOT = (
    getenv_first(["DREAM_CANONICAL_ROOT", "HERMES_CANONICAL_ROOT"], f"{DREAM_HOME}/canonical/AgentConfig").strip()
    or f"{DREAM_HOME}/canonical/AgentConfig"
)
DREAM_ENV_FILE = getenv_first(["DREAM_ENV_FILE", "HERMES_ENV_FILE"], f"{DREAM_HOME}/.env").strip() or f"{DREAM_HOME}/.env"
DREAM_PROFILE_ENV_FILE = (
    getenv_first(
        ["DREAM_PROFILE_ENV_FILE", "HERMES_PROFILE_ENV_FILE"],
        f"{DREAM_PROFILE_ROOT}/{PROFILE}/.env"
    ).strip()
    or f"{DREAM_PROFILE_ROOT}/{PROFILE}/.env"
)
load_env_file(DREAM_ENV_FILE)
load_env_file(DREAM_PROFILE_ENV_FILE)

DREAM_ENABLED = env_bool_any(["DREAM_ENABLED", "HERMES_ENABLED"], False)
DIGEST_BODY = getenv_first(["DREAM_DIGEST_BODY", "HERMES_DIGEST_BODY"], PROFILE).strip().lower()
if DIGEST_BODY not in {"coco", "toto", "system"}:
    DIGEST_BODY = PROFILE

DEFAULT_MCP_URL = "http://127.0.0.1:18791/mcp" if PROFILE == "toto" else "http://127.0.0.1:18790/mcp"
DEFAULT_SOURCE_DIR = "Dream/TotoDigest" if DIGEST_BODY == "toto" else "Dream/Digest"
MCP_URL = getenv_first(["DREAM_DIGEST_MCP_URL", "HERMES_DIGEST_MCP_URL"], DEFAULT_MCP_URL)
MCP_BEARER_TOKEN = getenv_first(
    ["DREAM_MCP_BEARER_TOKEN", "DREAM_DIGEST_MCP_BEARER_TOKEN", "HERMES_DIGEST_MCP_BEARER_TOKEN"],
    ""
).strip()
DIGEST_SOURCE_DIR = getenv_first(
    ["DREAM_DIGEST_SOURCE_DIR", "HERMES_DIGEST_SOURCE_DIR"],
    DEFAULT_SOURCE_DIR
).strip().strip("/")
if not DIGEST_SOURCE_DIR:
    DIGEST_SOURCE_DIR = DEFAULT_SOURCE_DIR

DIGEST_ORIGIN = getenv_first(
    ["DREAM_DIGEST_ORIGIN", "HERMES_DIGEST_ORIGIN"],
    f"dream-{DIGEST_BODY}-digest"
).strip() or f"dream-{DIGEST_BODY}-digest"

GITHUB_API_BASE = getenv_first(["DREAM_GITHUB_API_BASE", "HERMES_GITHUB_API_BASE"], "https://api.github.com")
GITHUB_OWNER = getenv_first(["DREAM_GITHUB_OWNER", "HERMES_GITHUB_OWNER"], "").strip()
GITHUB_REPO = getenv_first(["DREAM_GITHUB_REPO", "HERMES_GITHUB_REPO"], "").strip()
GITHUB_GIT_USERNAME = getenv_first(
    ["DREAM_GITHUB_GIT_USERNAME", "HERMES_GITHUB_GIT_USERNAME"],
    GITHUB_OWNER
).strip()
ISSUE_NUMBER = env_int_any(["DREAM_ISSUE_NUMBER", "HERMES_DIGEST_ISSUE_NUMBER"], 0, minimum=0)
ISSUE_API = getenv_first(["DREAM_ISSUE_API", "HERMES_DIGEST_ISSUE_API"], "").strip()
if not ISSUE_API and GITHUB_OWNER and GITHUB_REPO and ISSUE_NUMBER > 0:
    ISSUE_API = f"{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/issues/{ISSUE_NUMBER}"
ISSUES_LIMIT = env_int_any(["DREAM_ISSUES_LIMIT", "HERMES_DIGEST_ISSUES_LIMIT"], 6, minimum=1, maximum=20)

MARSVAULT_PATH = os.getenv("MARSVAULT_PATH", "").strip()
REPO_LOCAL_PATH = (
    getenv_first(
        ["DREAM_REPO_LOCAL_PATH", "HERMES_REPO_LOCAL_PATH"],
        MARSVAULT_PATH
        or (f"{DREAM_HOME}/repos/{GITHUB_REPO}" if GITHUB_REPO else "")
    ).strip()
)
REPO_REMOTE_URL = getenv_first(["DREAM_REPO_REMOTE_URL", "HERMES_REPO_REMOTE_URL"], "").strip()
if not REPO_REMOTE_URL and GITHUB_OWNER and GITHUB_REPO:
    REPO_REMOTE_URL = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}.git"
REPO_LABEL = f"{GITHUB_OWNER}/{GITHUB_REPO}" if GITHUB_OWNER and GITHUB_REPO else "configured-repo"

DEFAULT_REPO_SCAN_KEYWORDS = (
    f"toto,dream,memory,{(GITHUB_REPO or 'project').lower()},issue,digest,workflow"
    if DIGEST_BODY == "toto"
    else f"coco,dream,toto,memory,{(GITHUB_REPO or 'project').lower()},issue,digest,workflow"
)
REPO_KEYWORDS = [
    keyword.strip().lower()
    for keyword in getenv_first(
        ["DREAM_REPO_SCAN_KEYWORDS", "HERMES_REPO_SCAN_KEYWORDS"],
        DEFAULT_REPO_SCAN_KEYWORDS,
    ).split(",")
    if keyword.strip()
]

REPO_FULL_SCAN_TOP_FILES = env_int_any(
    ["DREAM_REPO_FULL_SCAN_TOP_FILES", "HERMES_REPO_FULL_SCAN_TOP_FILES"],
    120,
    minimum=10,
    maximum=400
)
SEMANTIC_MEMORY_LIMIT = env_int_any(
    ["DREAM_SEMANTIC_LIMIT", "HERMES_DIGEST_SEMANTIC_LIMIT"],
    6,
    minimum=1,
    maximum=20
)
MEMORY_LIMIT = env_int_any(
    ["DREAM_MEMORY_LIMIT", "HERMES_DIGEST_MEMORY_LIMIT"],
    20,
    minimum=1,
    maximum=100
)
CHUNK_CHARS = env_int_any(
    ["DREAM_MAX_CHUNK_CHARS", "HERMES_DIGEST_MAX_CHUNK_CHARS"],
    1200,
    minimum=300,
    maximum=3000
)

MODE_DEFAULTS = {
    "lite": {
        "recent_memory": True,
        "semantic_memory": True,
        "issue_signals": False,
        "repo_scan": False,
        "soul_context": False
    },
    "standard": {
        "recent_memory": True,
        "semantic_memory": True,
        "issue_signals": False,
        "repo_scan": True,
        "soul_context": True
    },
    "pro": {
        "recent_memory": True,
        "semantic_memory": True,
        "issue_signals": True,
        "repo_scan": True,
        "soul_context": True
    }
}
mode_default = MODE_DEFAULTS[RUNNER_MODE]

ENABLE_RECENT_MEMORY = env_bool_any(["DREAM_ENABLE_RECENT_MEMORY"], mode_default["recent_memory"])
ENABLE_SEMANTIC_MEMORY = env_bool_any(["DREAM_ENABLE_SEMANTIC_MEMORY"], mode_default["semantic_memory"])
ENABLE_ISSUE_SIGNALS = env_bool_any(["DREAM_ENABLE_ISSUE_SIGNALS"], mode_default["issue_signals"])
REPO_SCAN_ENABLED = env_bool_any(
    ["DREAM_ENABLE_REPO_SCAN", "DREAM_REPO_SCAN_ENABLED", "HERMES_REPO_SCAN_ENABLED"],
    mode_default["repo_scan"]
)
ENABLE_SOUL_CONTEXT = env_bool_any(["DREAM_ENABLE_SOUL_CONTEXT"], mode_default["soul_context"])

GITHUB_TOKEN = ""
canonical_profile = DIGEST_BODY if DIGEST_BODY in {"coco", "toto"} else PROFILE
DEFAULT_SOUL_PATHS = (
    [
        Path(f"{DREAM_PROFILE_ROOT}/toto/SOUL.md"),
        Path(f"{DREAM_CANONICAL_ROOT}/toto/SOUL.md"),
    ]
    if DIGEST_BODY == "toto"
    else [
        Path(f"{DREAM_CANONICAL_ROOT}/{canonical_profile}/SOUL.md"),
        Path(f"{DREAM_PROFILE_ROOT}/{PROFILE}/SOUL.md"),
    ]
)
SOUL_PATHS_RAW = getenv_first(["DREAM_SOUL_PATHS", "HERMES_DIGEST_SOUL_PATHS"], "").strip()
SOUL_PATHS = (
    [Path(item.strip()) for item in SOUL_PATHS_RAW.split(",") if item.strip()]
    if SOUL_PATHS_RAW
    else DEFAULT_SOUL_PATHS
)

def parse_memory_queries() -> list[str]:
    raw = getenv_first(
        ["DREAM_MEMORY_QUERIES", "HERMES_DIGEST_MEMORY_QUERIES"],
        ""
    ).strip()
    if raw:
        parts = [item.strip() for item in raw.split("||")]
        values = [item for item in parts if item]
        if values:
            return values[:8]
    profile_topic = "toto" if DIGEST_BODY == "toto" else "coco"
    issue_topic = (
        f"Issue {ISSUE_NUMBER} dream digest"
        if ISSUE_NUMBER > 0
        else "dream digest status"
    )
    repo_topic = GITHUB_REPO or "project"
    return [
        issue_topic,
        f"{profile_topic} memory long-term recall",
        f"{repo_topic} {profile_topic} integration",
    ]

def github_headers() -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "dream-runner",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers

def git_extraheader() -> Optional[str]:
    if not GITHUB_TOKEN:
        return None
    token = GITHUB_TOKEN.strip()
    if not token:
        return None
    encoded = base64.b64encode(f"{GITHUB_GIT_USERNAME}:{token}".encode("utf-8")).decode("ascii")
    return f"AUTHORIZATION: basic {encoded}"

def http_json(url: str, headers: Optional[dict] = None):
    final_headers = {"User-Agent": "dream-runner"}
    if headers:
        final_headers.update(headers)
    req = request.Request(url, headers=final_headers)
    with request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))

def github_json(api_path: str):
    return http_json(f"{GITHUB_API_BASE}{api_path}", headers=github_headers())

def run_git_command(args: list[str], cwd: Optional[Path] = None):
    command = ["git"]
    extraheader = git_extraheader()
    if extraheader:
        command.extend(
            [
                "-c",
                f"http.https://github.com/.extraheader={extraheader}",
            ]
        )
    command.extend(args)
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {stderr or 'unknown error'}")
    return (result.stdout or "").strip()

def sync_repo_snapshot_via_tarball(repo_path: Path):
    if not (GITHUB_OWNER and GITHUB_REPO):
        raise RuntimeError(
            "DREAM_GITHUB_OWNER/DREAM_GITHUB_REPO are required for tarball sync fallback"
        )
    repo_path.parent.mkdir(parents=True, exist_ok=True)
    api_url = f"{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/tarball"
    req = request.Request(api_url, headers=github_headers())
    with request.urlopen(req, timeout=60) as resp:
        payload = resp.read()

    with tempfile.TemporaryDirectory(prefix="dream_repo_", dir=str(repo_path.parent)) as tmp_dir:
        tmp_path = Path(tmp_dir)
        archive_path = tmp_path / "repo.tar.gz"
        archive_path.write_bytes(payload)

        with tarfile.open(archive_path, "r:gz") as archive:
            try:
                archive.extractall(path=tmp_path, filter="data")
            except TypeError:
                archive.extractall(path=tmp_path)

        extracted_dirs = [
            path for path in tmp_path.iterdir() if path.is_dir() and path.name != "."
        ]
        if not extracted_dirs:
            raise RuntimeError("tarball extraction produced no repository directory")

        extracted_root = extracted_dirs[0]
        if repo_path.exists():
            shutil.rmtree(repo_path)
        shutil.move(str(extracted_root), str(repo_path))

def ensure_local_repo_ready() -> Path:
    if not REPO_LOCAL_PATH:
        raise RuntimeError("DREAM_REPO_LOCAL_PATH is empty")
    repo_path = Path(REPO_LOCAL_PATH)

    if (repo_path / ".git").exists():
        if REPO_REMOTE_URL:
            try:
                run_git_command(["fetch", "--depth", "1", "origin"], cwd=repo_path)
                try:
                    run_git_command(["reset", "--hard", "origin/HEAD"], cwd=repo_path)
                except Exception:
                    for candidate in ("origin/main", "origin/master"):
                        try:
                            run_git_command(["reset", "--hard", candidate], cwd=repo_path)
                            break
                        except Exception:
                            continue
            except Exception:
                pass
        return repo_path

    if repo_path.exists() and repo_path.is_dir():
        return repo_path

    if not REPO_REMOTE_URL:
        raise RuntimeError("DREAM_REPO_REMOTE_URL is not configured and local repo is missing")

    try:
        repo_path.parent.mkdir(parents=True, exist_ok=True)
        if repo_path.exists():
            shutil.rmtree(repo_path)
        run_git_command(["clone", "--depth", "1", REPO_REMOTE_URL, str(repo_path)])
    except Exception:
        sync_repo_snapshot_via_tarball(repo_path)
    return repo_path

def collect_repo_full_scan_signals() -> list[str]:
    if not REPO_SCAN_ENABLED:
        return ["- repo scan disabled (DREAM_ENABLE_REPO_SCAN=false)"]
    lines: list[str] = []
    try:
        repo_path = ensure_local_repo_ready()
    except Exception as exc:
        return [f"- repo scan unavailable: {normalize_line(str(exc), 180)}"]

    total_markdown_files = 0
    scored_items: list[tuple[int, str, int, str]] = []
    keyword_hit_count = 0
    keyword_map = {key: 0 for key in REPO_KEYWORDS}

    for file_path in repo_path.rglob("*.md"):
        if ".git" in file_path.parts:
            continue
        total_markdown_files += 1
        try:
            raw = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        lowered = raw.lower()
        score = 0
        for keyword in REPO_KEYWORDS:
            hits = lowered.count(keyword)
            if hits > 0:
                keyword_map[keyword] += hits
                score += hits
        if score <= 0:
            continue
        keyword_hit_count += 1
        rel_path = str(file_path.relative_to(repo_path))
        snippet = normalize_line(raw.replace("\n", " "), 180)
        scored_items.append((score, rel_path, len(raw), snippet))

    scored_items.sort(key=lambda item: item[0], reverse=True)
    lines.append(f"- repo_path={repo_path}")
    lines.append(f"- scanned_markdown_files={total_markdown_files}")
    lines.append(f"- keyword_hit_files={keyword_hit_count}")

    hot_keywords = [
        (keyword, count) for keyword, count in keyword_map.items() if count > 0
    ]
    hot_keywords.sort(key=lambda item: item[1], reverse=True)
    if hot_keywords:
        pairs = ", ".join(f"{k}:{v}" for k, v in hot_keywords[:10])
        lines.append(f"- keyword_density={pairs}")

    limit = max(10, min(400, REPO_FULL_SCAN_TOP_FILES))
    for score, rel_path, char_count, snippet in scored_items[:limit]:
        lines.append(f"- score={score} | {rel_path} | chars={char_count} | {snippet}")

    if len(lines) <= 3:
        lines.append("(full scan completed but no keyword matches found)")
    return lines

def mcp_tool_call(name: str, arguments: dict):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": name,
            "arguments": arguments,
        },
    }
    headers = {"content-type": "application/json"}
    if MCP_BEARER_TOKEN:
        headers["authorization"] = f"Bearer {MCP_BEARER_TOKEN}"
    req = request.Request(
        MCP_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with request.urlopen(req, timeout=40) as resp:
        envelope = json.loads(resp.read().decode("utf-8"))
    if envelope.get("error"):
        raise RuntimeError(f"MCP error: {envelope['error']}")
    result = envelope.get("result") or {}
    content = result.get("content") or []
    text = content[0].get("text", "{}") if content else "{}"
    try:
        decoded = json.loads(text)
    except json.JSONDecodeError:
        decoded = {"raw": text}
    if isinstance(decoded, dict) and decoded.get("ok") is False:
        raise RuntimeError(f"Tool {name} failed: {decoded}")
    return decoded

def collect_recent_memories() -> list[str]:
    try:
        result = mcp_tool_call(
            "list_memories",
            {
                "limit": max(1, min(100, MEMORY_LIMIT)),
                "unexpired_only": True,
            },
        )
    except Exception as exc:
        return [f"(memory fetch failed: {normalize_line(str(exc), 180)})"]

    items = result.get("items") or []
    lines = []
    for item in items[: MEMORY_LIMIT]:
        source = normalize_line(str(item.get("source") or "unknown"), 32)
        body = normalize_line(str(item.get("body") or ""), 180)
        created_at = normalize_line(str(item.get("created_at") or ""), 32)
        if body:
            lines.append(f"- [{source}] {body} ({created_at})")
    return lines or ["(no recent memories)"]

def collect_semantic_memories() -> list[str]:
    lines = []
    seen_ids = set()
    for query in parse_memory_queries():
        try:
            result = mcp_tool_call(
                "search_memories",
                {
                    "query": query,
                    "limit": max(1, min(100, SEMANTIC_MEMORY_LIMIT)),
                    "unexpired_only": True,
                },
            )
        except Exception as exc:
            lines.append(f"- query={query}: failed ({normalize_line(str(exc), 160)})")
            continue

        items = result.get("items") or []
        picked = 0
        for item in items:
            memory_id = str(item.get("id") or "")
            if memory_id and memory_id in seen_ids:
                continue
            if memory_id:
                seen_ids.add(memory_id)
            body = normalize_line(str(item.get("body") or ""), 170)
            source = normalize_line(str(item.get("source") or "unknown"), 24)
            similarity = item.get("similarity")
            if body:
                lines.append(f"- q={query} | [{source}] {body} (sim={similarity})")
                picked += 1
            if picked >= 4:
                break
    return lines or ["(semantic memories unavailable)"]

def collect_issue_snapshot() -> list[str]:
    lines: list[str] = []
    if not ISSUE_API:
        return ["- issue snapshot skipped: DREAM_ISSUE_API not configured"]
    try:
        issue = http_json(ISSUE_API, headers=github_headers())
        lines.append(
            f"- #{issue.get('number')} {normalize_line(str(issue.get('title') or ''), 120)} | state={issue.get('state')} | updated={issue.get('updated_at')}"
        )
        issue_body = normalize_line(str(issue.get("body") or ""), 260)
        if issue_body:
            lines.append(f"- issue_body: {issue_body}")
    except Exception as exc:
        lines.append(f"- issue fetch failed: {normalize_line(str(exc), 180)}")
        return lines

    try:
        comments = http_json(f"{ISSUE_API}/comments?per_page=2", headers=github_headers())
        if isinstance(comments, list):
            for idx, comment in enumerate(comments[-2:], start=1):
                body = normalize_line(str(comment.get("body") or ""), 220)
                updated = normalize_line(str(comment.get("updated_at") or ""), 32)
                lines.append(f"- latest_comment_{idx}: {body} ({updated})")
    except Exception as exc:
        lines.append(f"- comments fetch failed: {normalize_line(str(exc), 180)}")

    return lines

def collect_issue_feed() -> list[str]:
    lines: list[str] = []
    if not (GITHUB_OWNER and GITHUB_REPO):
        return ["- issue feed skipped: DREAM_GITHUB_OWNER/DREAM_GITHUB_REPO not configured"]
    try:
        issues = github_json(
            f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/issues?state=open&sort=updated&direction=desc&per_page={max(1,min(20,ISSUES_LIMIT))}"
        )
        if isinstance(issues, list):
            for issue in issues:
                if "pull_request" in issue:
                    continue
                title = normalize_line(str(issue.get("title") or ""), 120)
                number = issue.get("number")
                updated = normalize_line(str(issue.get("updated_at") or ""), 32)
                lines.append(f"- #{number} {title} (updated={updated})")
                if len(lines) >= ISSUES_LIMIT:
                    break
    except Exception as exc:
        lines.append(f"- issues feed failed: {normalize_line(str(exc), 180)}")
    return lines or ["(no issue feed)"]

def collect_soul_context() -> list[str]:
    for path in SOUL_PATHS:
        try:
            if not path.exists():
                continue
            raw = path.read_text(encoding="utf-8", errors="ignore")
            picked = []
            for line in raw.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                if stripped.startswith("#"):
                    picked.append(stripped)
                elif len(picked) < 10:
                    picked.append(normalize_line(stripped, 160))
                if len(picked) >= 14:
                    break
            if picked:
                return [f"- source={path}"] + [f"- {line}" for line in picked]
        except Exception as exc:
            return [f"- soul read failed: {normalize_line(str(exc), 180)}"]
    return ["- soul source not found"]

def build_digest(now_utc: datetime) -> str:
    date_key = now_utc.strftime("%Y-%m-%d")
    timestamp = now_utc.isoformat()
    parts = [
        f"# Dream Digest {date_key}",
        f"generated_at: {timestamp}",
        f"mode: {RUNNER_MODE}",
        "",
    ]

    if ENABLE_RECENT_MEMORY:
        parts.extend([
            f"## Source: {DIGEST_BODY}-memory recent context",
            *collect_recent_memories(),
            "",
        ])
    else:
        parts.extend([
            "## Source: recent memory",
            "- disabled by DREAM_ENABLE_RECENT_MEMORY=false",
            "",
        ])

    if ENABLE_SEMANTIC_MEMORY:
        parts.extend([
            f"## Source: {DIGEST_BODY}-memory semantic context",
            *collect_semantic_memories(),
            "",
        ])
    else:
        parts.extend([
            "## Source: semantic memory",
            "- disabled by DREAM_ENABLE_SEMANTIC_MEMORY=false",
            "",
        ])

    if ENABLE_ISSUE_SIGNALS:
        parts.extend([
            f"## Source: {REPO_LABEL} key issue signals",
            *collect_issue_snapshot(),
            "",
            f"## Source: {REPO_LABEL} issue feed",
            *collect_issue_feed(),
            "",
        ])
    else:
        parts.extend([
            "## Source: issue signals",
            "- disabled by DREAM_ENABLE_ISSUE_SIGNALS=false",
            "",
        ])

    if REPO_SCAN_ENABLED:
        parts.extend([
            f"## Source: {REPO_LABEL} repo full scan signals",
            *collect_repo_full_scan_signals(),
            "",
        ])
    else:
        parts.extend([
            "## Source: repo full scan",
            "- disabled by DREAM_ENABLE_REPO_SCAN=false",
            "",
        ])

    if ENABLE_SOUL_CONTEXT:
        parts.extend([
            f"## Source: {PROFILE_LABEL} soul baseline",
            *collect_soul_context(),
            "",
        ])
    else:
        parts.extend([
            "## Source: soul baseline",
            "- disabled by DREAM_ENABLE_SOUL_CONTEXT=false",
            "",
        ])

    parts.extend([
        "## Dream synthesized notes",
        "- Keep coco/toto profile isolation strict; no cross-body write path.",
        "- Prioritize durable long-term memory chunks over transient tactical chatter.",
        f"- Preserve provenance with origin={DIGEST_ORIGIN} for audit and recall filtering.",
    ])

    return "\n".join(parts).strip() + "\n"

def main() -> int:
    global GITHUB_TOKEN
    if not DREAM_ENABLED:
        out = {
            "ok": True,
            "skipped": True,
            "reason": "DREAM_ENABLED=false (or HERMES_ENABLED=false)",
            "profile": PROFILE,
            "mode": RUNNER_MODE,
        }
        print(json.dumps(out, ensure_ascii=False))
        return 0

    GITHUB_TOKEN = getenv_first(
        ["DREAM_GITHUB_READ_TOKEN", "HERMES_GITHUB_READ_TOKEN"],
        ""
    ).strip()
    now_utc = datetime.now(timezone.utc)
    date_key = now_utc.strftime("%Y-%m-%d")
    digest_text = build_digest(now_utc)
    source_file = f"{DIGEST_SOURCE_DIR}/{date_key}.md"

    ingest_result = mcp_tool_call(
        "dream_ingest",
        {
            "content": digest_text,
            "source_file": source_file,
            "section": f"digest-{DIGEST_BODY}-{date_key}",
            "tags": ["dream", "digest", "cron", DIGEST_BODY],
            "type": "digest",
            "date": date_key,
            "body": DIGEST_BODY,
            "visibility": "private",
            "origin": DIGEST_ORIGIN,
            "max_chunk_chars": max(300, min(3000, CHUNK_CHARS)),
        },
    )

    out = {
        "ok": True,
        "generated_at": now_utc.isoformat(),
        "mode": RUNNER_MODE,
        "source_file": source_file,
        "chunk_count": ingest_result.get("chunk_count"),
        "inserted_count": ingest_result.get("inserted_count"),
        "origin": ingest_result.get("origin", DIGEST_ORIGIN),
        "providers": {
            "recent_memory": ENABLE_RECENT_MEMORY,
            "semantic_memory": ENABLE_SEMANTIC_MEMORY,
            "issue_signals": ENABLE_ISSUE_SIGNALS,
            "repo_scan": REPO_SCAN_ENABLED,
            "soul_context": ENABLE_SOUL_CONTEXT
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.HTTPError as exc:
        print(json.dumps({"ok": False, "error": f"HTTPError: {exc}"}, ensure_ascii=False))
        raise
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        raise
