from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old!r}")
    file.write_text(text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old!r}")
    file.write_text(text.replace(old, new))

replace_once(
    "src/lib/database.ts",
    '  "workout-tracker:v1.6:hybrid-history",\n',
    '  "workout-tracker:v1.6:hybrid-history",\n  "workout-tracker:v1.8:coach-feedback",\n',
)
replace_all("src/lib/database.ts", 'appVersion: "1.7.2"', 'appVersion: "1.8.0"')
replace_all("package.json", '"version": "1.7.2"', '"version": "1.8.0"')
replace_all("package-lock.json", '"version": "1.7.2"', '"version": "1.8.0"')
replace_once("public/sw.js", 'const CACHE = "workout-tracker-v1.7.2-calibrated-coach";', 'const CACHE = "workout-tracker-v1.8-advanced-intelligence";')
replace_once("src/components/AdaptiveCoach.tsx", '  COACH_FEEDBACK_KEY,\n', '')

print("v1.8 release metadata applied")
