"""Build the operator ZIP only; never contact production or execute the probe."""
from pathlib import Path
import base64, hashlib, re, shutil, zipfile
root = Path(__file__).resolve().parent
output = root.parent / 'work' / 'queue-inventory'
windows = output / 'Windows'
windows.mkdir(parents=True, exist_ok=True)
script = (root / 'probes' / 'windows' / 'Run-Probe.ps1').read_text(encoding='utf-8-sig')
payload = base64.b64encode((root / 'probes' / 'queue-inventory.cjs').read_bytes()).decode('ascii')
script, count = re.subn(r"\$Payload = '[A-Za-z0-9+/=]+'", "$Payload = '" + payload + "'", script)
assert count == 1
(windows / 'Run-Probe.ps1').write_bytes(b'\xef\xbb\xbf' + script.replace('\n', '\r\n').encode())
for name in ['Run-Probe.cmd', 'START-HERE.txt']:
    shutil.copyfile(root / 'probes' / 'windows' / name, windows / name)
shutil.copyfile(root / 'probes' / 'queue-inventory.cjs', windows / 'queue-inventory.cjs')
archive = output / 'WhachatCRM-Queue-Inventory-Windows.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(windows.iterdir()):
        bundle.write(path, path.name)
print(f'{archive}\nSHA256 {hashlib.sha256(archive.read_bytes()).hexdigest()}')
