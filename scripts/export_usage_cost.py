#!/usr/bin/env python3
"""Export measured provider usage; never invent prices or exchange rates."""
from __future__ import annotations

import argparse
import csv
import sqlite3
from contextlib import closing
from decimal import Decimal
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.config import get_settings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=get_settings().db_path)
    parser.add_argument("--output", type=Path, default=ROOT / "output" / "usage_cost.csv")
    parser.add_argument("--provider", choices=("gigachat", "groq"), default="gigachat")
    parser.add_argument("--input-rub-per-million", type=Decimal)
    parser.add_argument("--output-rub-per-million", type=Decimal)
    args = parser.parse_args()
    if not args.db.is_file():
        parser.error("Нет БД с реальными замерами")
    for value in (args.input_rub_per_million, args.output_rub_per_million):
        if value is not None and (not value.is_finite() or value < 0):
            parser.error("Тарифы должны быть неотрицательными конечными числами")

    with closing(sqlite3.connect(f"{args.db.resolve().as_uri()}?mode=ro", uri=True)) as conn:
        stages = conn.execute(
            """
            SELECT stage, COUNT(*), COALESCE(SUM(prompt_tokens), 0),
                   COALESCE(SUM(completion_tokens), 0), COALESCE(SUM(total_tokens), 0),
                   COALESCE(AVG(latency_ms), 0)
            FROM llm_usage
            WHERE provider = ? AND total_tokens > 0
            GROUP BY stage ORDER BY stage
            """,
            (args.provider,),
        ).fetchall()
    if not stages:
        parser.error(f"Нет завершённых замеров для provider={args.provider}")

    count = sum(int(row[1]) for row in stages)
    tokens_in = sum(int(row[2]) for row in stages)
    tokens_out = sum(int(row[3]) for row in stages)
    total = sum(int(row[4]) for row in stages)
    weighted_latency = sum(Decimal(int(row[1])) * Decimal(str(row[5])) for row in stages) / count
    billed_input = max(0, total - tokens_out) if args.provider == "gigachat" else tokens_in
    cost = None
    if args.input_rub_per_million is not None and args.output_rub_per_million is not None:
        cost = (
            Decimal(billed_input) * args.input_rub_per_million
            + Decimal(tokens_out) * args.output_rub_per_million
        ) / Decimal(1_000_000)

    rows = [
        ("Провайдер", args.provider),
        ("Завершённые запросы", count),
        ("Входные токены", tokens_in),
        ("Оплачиваемые входные токены", billed_input),
        ("Выходные токены", tokens_out),
        ("Всего токенов", total),
        ("Средняя задержка, мс", round(float(weighted_latency), 1)),
        ("Тариф вход, RUB/1 млн", args.input_rub_per_million if args.input_rub_per_million is not None else ""),
        ("Тариф выход, RUB/1 млн", args.output_rub_per_million if args.output_rub_per_million is not None else ""),
        ("Оценочная стоимость, RUB", str(cost) if cost is not None else ""),
        ("Ограничение", "Только ответы с usage; сверяйте тарифы и биллинг GigaChat в личном кабинете."),
    ]
    rows.extend([(f"Этап: {row[0]} — запросов", row[1]) for row in stages])
    rows.extend([(f"Этап: {row[0]} — входные токены", row[2]) for row in stages])
    rows.extend([(f"Этап: {row[0]} — выходные токены", row[3]) for row in stages])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(("Показатель", "Значение"))
        writer.writerows(rows)
    print(f"Saved {args.output}; provider={args.provider}; requests={count}; tokens={total}")


if __name__ == "__main__":
    main()
