import re

_WS_RE = re.compile(r"\s+")
_NON_WORD_KEEP_RE = re.compile(r"[^0-9a-zа-яёA-ZА-ЯЁ\s\-]", re.UNICODE)


def non_whitespace_length(text: str) -> int:
    return len(re.sub(r"\s", "", text))


def normalize_for_fts(text: str) -> str:
    lowered = text.lower().replace("ё", "е")
    cleaned = _NON_WORD_KEEP_RE.sub(" ", lowered)
    return _WS_RE.sub(" ", cleaned).strip()


def fts_query_from_user(query: str) -> str:
    """Собирает безопасный FTS MATCH из пользовательского запроса."""
    normalized = normalize_for_fts(query)
    if not normalized:
        return ""
    tokens = [t for t in normalized.split() if len(t) >= 2]
    if not tokens:
        return ""
    parts: list[str] = []
    for token in tokens[:12]:
        safe = token.replace('"', "")
        if not safe:
            continue
        parts.append(f'"{safe}"*')
    return " OR ".join(parts)