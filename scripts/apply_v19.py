from pathlib import Path
import base64, io, tarfile, hashlib

parts = [Path(f"scripts/v19.part{i}").read_text().strip() for i in range(1, 5)]
DATA = "".join(parts)
expected = "9ada0342cc2bb6efb0e346dd21fb18afbde793ae7975b3586b3d019bc0db7f87"
actual = hashlib.sha256(DATA.encode()).hexdigest()
if actual != expected:
    raise SystemExit(f"v1.9 transport checksum mismatch: {actual}")
raw = base64.b64decode(DATA, validate=True)
with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
    tar.extractall(Path("."))
    print("restored", len(tar.getmembers()), "v1.9 files")
