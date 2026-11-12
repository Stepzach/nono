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
existing_paragraphs = {}
existing_lead_photos = {}
existing_photo_layouts = {}
existing_compact_text = {}
if (out / 'albums.json').exists():
    existing_albums = json.loads((out / 'albums.json').read_text())
    existing = {a['name']:a['subtitle'] for a in existing_albums}
    existing_compact_text = {a['name']:a['compactText'] for a in existing_albums if 'compactText' in a}
    existing_photo_layouts = {p['id']:{k:p[k] for k in ('overviewPosition','displayScale') if k in p} for a in existing_albums for p in a['photos']}
    existing_lead_photos = {a['name']:a['leadPhotoId'] for a in existing_albums if 'leadPhotoId' in a}
    existing_paragraphs = {a['name']:a['paragraphs'] for a in existing_albums if 'paragraphs' in a}
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
                for suffix, maximum in [('thumb',{'large':640,'medium':480,'small':320}[size]),('full',1600)]:
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
for album in albums:
    for photo in album['photos']:
        photo.update(existing_photo_layouts.get(photo['id'], {}))
    if album['name'] in existing_compact_text:
        album['compactText'] = existing_compact_text[album['name']]
    lead = existing_lead_photos.get(album['name'])
    if any(p['id'] == lead for p in album['photos']):
        album['leadPhotoId'] = lead
    if album['name'] in existing_paragraphs and ' '.join(existing_paragraphs[album['name']]) == album['subtitle']:
        album['paragraphs'] = existing_paragraphs[album['name']]
(out / 'albums.json').write_text(json.dumps(albums,ensure_ascii=False,indent=2)+'\n')
print(f'Imported {sum(len(a["photos"]) for a in albums)} images across {len(albums)} albums.')
