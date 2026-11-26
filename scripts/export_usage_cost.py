#!/usr/bin/env python3
"""Aggregate measured LLM usage into a CSV for the organizer's original Excel.
No network calls. Does not invent costs for missing measurements.
"""
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=get_settings().db_path)
    parser.add_argument("--output", type=Path, default=ROOT / "output" / "usage_cost.csv")
    parser.add_argument("--input-usd-per-million", type=Decimal)
    parser.add_argument("--output-usd-per-million", type=Decimal)
    parser.add_argument("--usd-rub", type=Decimal)
    args = parser.parse_args()
    if not args.db.is_file():
        parser.error("Нет БД с реальными замерами")
    for val in (args.input_usd_per_million, args.output_usd_per_million, args.usd_rub):
        if val is not None and (not val.is_finite() or val < 0):
            parser.error("Тарифы/курс должны быть неотрицательными конечными числами")
    with closing(sqlite3.connect(f"{args.db.resolve().as_uri()}?mode=ro", uri=True)) as conn:
        n, tokens_in, tokens_out, total, latency = conn.execute("""
            SELECT COUNT(*), COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0),
                   COALESCE(SUM(total_tokens),0), COALESCE(AVG(latency_ms),0)
            FROM groq_usage WHERE total_tokens > 0
        """).fetchone()
    if not n:
        parser.error("Нет завершённых LLM-запросов с реальными токенами")
    avg_in, avg_out = Decimal(tokens_in) / n, Decimal(tokens_out) / n
    cost = None
    if args.input_usd_per_million is not None and args.output_usd_per_million is not None:
        cost = (avg_in * args.input_usd_per_million + avg_out * args.output_usd_per_million) / Decimal(1_000_000)
    rows = [
        ("Завершённые запросы LLM", n),
        ("Входные токены, сумма", tokens_in), ("Выходные токены, сумма", tokens_out),
        ("Всего токенов, сумма", total), ("Средние входные токены", str(avg_in)),
        ("Средние выходные токены", str(avg_out)), ("Средняя задержка, мс", round(latency, 1)),
        ("Тариф вход, USD/1 млн", args.input_usd_per_million), ("Тариф выход, USD/1 млн", args.output_usd_per_million),
        ("Средняя оценочная стоимость LLM USD", str(cost) if cost is not None else ""),
        ("Курс USD/RUB", args.usd_rub),
        ("Средняя оценочная стоимость LLM RUB", str(cost * args.usd_rub) if cost is not None and args.usd_rub is not None else ""),
        ("Ограничение", "Только завершённые сообщения агента, суммарные токены всех tool-call шагов; STT, ошибки, сервер и фиксированные расходы отдельно."),
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(("Показатель", "Значение"))
        writer.writerows(rows)
    print(f"Saved {args.output}; measured responses: {n}")


if __name__ == "__main__":
    main()
