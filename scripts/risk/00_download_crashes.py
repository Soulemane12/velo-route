"""Download NYC Motor Vehicle Collisions dataset."""
import os
import requests

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "nyc_crashes.csv")
URL = "https://data.cityofnewyork.us/api/views/h9gi-nx95/rows.csv?accessType=DOWNLOAD"


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    if os.path.exists(OUT):
        size_mb = os.path.getsize(OUT) / 1e6
        print(f"Already exists: {OUT} ({size_mb:.1f} MB). Delete to re-download.")
        return

    print(f"Downloading NYC crash data from Open Data API...")
    print("(This file is ~400 MB, may take a few minutes)")
    resp = requests.get(URL, stream=True)
    resp.raise_for_status()

    written = 0
    with open(OUT, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            f.write(chunk)
            written += len(chunk)
            if written % (50 << 20) < (1 << 20):
                print(f"  {written / 1e6:.0f} MB downloaded...")

    size_mb = os.path.getsize(OUT) / 1e6
    print(f"Done: {OUT} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
