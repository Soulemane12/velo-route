"""
Download NYC NYPD Complaint Data (felony-level street crimes).

Filters to felony offenses with valid coordinates from the NYPD Complaint
Data Historic dataset (NYC Open Data). Relevant for cycling safety:
robbery, assault, and grand larceny are the primary concern types.

Source: NYC Open Data - NYPD Complaint Data Historic (qgea-i56i)
"""
import os
import requests

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "nyc_crimes.csv")

# Socrata filtered endpoint — felony crimes with valid coordinates only.
# $limit=1500000 covers the full felony dataset (~1.1M records as of 2024).
URL = (
    "https://data.cityofnewyork.us/resource/qgea-i56i.csv"
    "?$where=law_cat_cd='FELONY' AND latitude IS NOT NULL AND longitude IS NOT NULL"
    "&$select=latitude,longitude,ofns_desc,law_cat_cd"
    "&$limit=1500000"
    "&$order=:id"
)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    if os.path.exists(OUT):
        size_mb = os.path.getsize(OUT) / 1e6
        print(f"Already exists: {OUT} ({size_mb:.1f} MB). Delete to re-download.")
        return

    print("Downloading NYC felony crime data from Open Data API...")
    print("(Filtered to felony-level with coordinates, ~50-100 MB)")
    resp = requests.get(URL, stream=True, timeout=300)
    resp.raise_for_status()

    written = 0
    with open(OUT, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            f.write(chunk)
            written += len(chunk)
            if written % (20 << 20) < (1 << 20):
                print(f"  {written / 1e6:.0f} MB downloaded...")

    size_mb = os.path.getsize(OUT) / 1e6
    print(f"Done: {OUT} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
