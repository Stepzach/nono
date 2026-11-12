"""Import local albums without changing the originals. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageOps
import argparse, hashlib, json, re

parser = argparse.ArgumentParser()
parser.add_argument('source', nargs='?', default=str(Path.home() / 'Downloads/Nono'))
args = parser.parse_args()
root = Path(args.source).expanduser()
out = Path(__file__).resolve().parents[1] / 'dist'
(out / 'assets').mkdir(parents=True, exist_ok=True)
existing = {}
if (out / 'albums.json').exists():
    existing = {a['name']:a['subtitle'] for a in json.loads((out / 'albums.json').read_text())}
albums = []
for album in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith('.')):
    photos = []
    for folder in sorted(p for p in album.iterdir() if p.is_dir()):
        size = folder.name.strip().lower().replace('mediulm', 'medium')
        if size not in ('large', 'medium', 'small'):
            print(f'Skipping unrecognized folder: {folder}'); continue
        for file in sorted(folder.rglob('*')):
            if file.suffix.lower() not in ('.jpg','.jpeg','.png','.webp','.heic'): continue
            rel = str(file.relative_to(root))
            key = hashlib.sha256(rel.encode()).hexdigest()[:16]
            with Image.open(file) as original:
                img = ImageOps.exif_transpose(original).convert('RGB')
                width,height = img.size
                for suffix, maximum in [('thumb',640),('full',1600)]:
                    copy = img.copy(); copy.thumbnail((maximum,maximum))
                    copy.save(out / 'assets' / f'{key}-{suffix}.webp', 'WEBP', quality=83, method=6)
            stem = file.stem
            if re.fullmatch(r'[a-fA-F0-9-]{32,36}(?: \(\d+\))?', stem): caption = f'Memory {len(photos)+1:02d}'
            else:
                caption = re.sub(r'^(IMG|DSC|PXL)[_ -]*', 'Moment ', stem, flags=re.I)
                caption = re.sub(r'[_-]+', ' ', caption).strip()
            photos.append({'id':key,'size':size,'caption':caption,'width':width,'height':height,
                           'src':f'assets/{key}-thumb.webp','full':f'assets/{key}-full.webp','source':rel})
    if photos:
        albums.append({'name':album.name,'subtitle':existing.get(album.name,'A little space for the story of these moments. Words to come.'),'photos':photos})
(out / 'albums.json').write_text(json.dumps(albums,ensure_ascii=False,indent=2)+'\n')
print(f'Imported {sum(len(a["photos"]) for a in albums)} images across {len(albums)} albums.')
