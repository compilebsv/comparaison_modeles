#!/usr/bin/env python3
"""
Read risque_modele_16.csv and risque_modele_33.csv directly,
then convert the combined data to src/app/riskData.json for the React dashboard.

Usage:
  python scripts/generate_risk_data.py          # generate JSON from both CSVs
"""

import csv
import json
import os
import sys
from datetime import date, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSV_16 = os.path.join(BASE, "data", "risque_modele_16.csv")
CSV_33 = os.path.join(BASE, "data", "risque_modele_33.csv")
JSON_OUT = os.path.join(BASE, "src", "app", "riskData.json")

EXCEL_EPOCH = date(1899, 12, 30)

MODEL_MAP = {
    "rossi":  [("RISQUE_H1_ROSSI", "h1"), ("RISQUE_H2_ROSSI", "h2"), ("RISQUE_H3_ROSSI", "h3")],
    "potsys": [("RISQUE_H1_POTSYS", "h1"), ("RISQUE_H2_POTSYS", "h2"), ("RISQUE_H3_POTSYS", "h3")],
    "milstop": [("RISQUE_H1_MILSTOP", "h1"), ("RISQUE_H2_MILSTOP", "h2"), ("RISQUE_H3_MILSTOP", "h3")],
    "milvit": [("RISQUE_H1_MILVIT", "h1"), ("RISQUE_H2_MILVIT", "h2"), ("RISQUE_H3_MILVIT", "h3")],
}

PLUIE_MAP = [("PLUIE_H1", "h1"), ("PLUIE_H2", "h2"), ("PLUIE_H3", "h3")]


def parse_number(val):
    """Convert a CSV string to int (if whole) or float, or None if empty/-9999."""
    v = val.strip()
    if v == "" or v == "-9999" or v == "-9999.0":
        return None
    f = float(v)
    if f == int(f):
        return int(f)
    return f


def date_to_serial(date_str):
    """Convert YYYY-MM-DD date string to Excel serial number (matching App.tsx)."""
    d = datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
    return str((d - EXCEL_EPOCH).days)


def read_csv(filepath):
    """Read a CSV file and return rows as dicts."""
    rows = []
    with open(filepath, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            rows.append(r)
    return rows


def generate_json():
    """Read both source CSVs and generate src/app/riskData.json."""
    source_files = [CSV_16, CSV_33]
    all_rows = []
    for src in source_files:
        all_rows.extend(read_csv(src))

    communes_set = set()
    dates_set = set()
    by_commune = {}

    for r in all_rows:
        commune = r["COMMUNE"].strip()
        serial = date_to_serial(r["DATE"])
        communes_set.add(commune)
        dates_set.add(serial)

        entry = {
            "latitude": r["LATITUDE"].strip(),
            "longitude": r["LONGITUDE"].strip(),
            "region": parse_number(r["REGION"]),
        }

        for model, col_map in MODEL_MAP.items():
            model_data = {}
            for col, key in col_map:
                val = parse_number(r[col])
                if val is not None:
                    model_data[key] = val
            entry[model] = model_data

        pluie_data = {}
        for col, key in PLUIE_MAP:
            val = parse_number(r[col])
            if val is not None:
                pluie_data[key] = val
        entry["pluie"] = pluie_data

        by_commune.setdefault(commune, {})[serial] = entry

    all_dates = sorted(dates_set, key=int)
    all_communes = sorted(communes_set)

    output = {
        "communes": all_communes,
        "dates": all_dates,
        "byCommune": by_commune,
    }

    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Generated {os.path.relpath(JSON_OUT, BASE)}: {len(all_communes)} communes, {len(all_dates)} dates")


if __name__ == "__main__":
    generate_json()
