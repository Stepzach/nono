# My Nono

A local, mobile-first world of 80 photos in eight loose albums. Photos fill a loosely clustered heart, with space reserved around the opening message and album titles. Pinching all the way out fits the whole heart on screen. The opening message is reproduced exactly. All text uses locally bundled Newsreader on a white background; font licensing is included in assets/newsreader-OFL.txt. Drag or swipe in any direction. Phones start slightly farther out and use manual pinch zoom only; desktop keeps the gentle growth when settling near an album. Zoom stays fixed during an active drag or scroll. The message and all on-screen photos stay visible, and neighboring albums never shrink or fade away. Desktop gestures gently settle near a cluster center; mobile pans freely with no snapping. There is no header, footer, toolbar, or album list.

## Open the website

In this folder, run `npm start`, then open http://127.0.0.1:4173. Python 3 is required for the local server. The website itself needs no installation, build step, remote font requests, or external services. Serve the `dist` folder with any static web server; do not open the HTML directly because the album data is loaded as JSON.

- Drag with a mouse or one finger to explore.
- Scroll with a mouse or trackpad in either direction; Shift + wheel moves horizontally.
- Pinch, or Ctrl + wheel, to adjust the zoom.
- Tap any photograph to enlarge it.
- Arrow keys pan; Home returns to the opening message. Escape closes an enlarged photo.
- Reduced-motion preferences remove the animated snap and inertia.

## Edit the words

In `dist/albums.json`, each album has a `subtitle` and each photograph has a `caption`. Albums with longer stories also have a `paragraphs` list; keep its text consistent with the full `subtitle`. The longer stories use nearby text blocks with their own photos between or beside them. A `leadPhotoId` puts a chosen photograph above the title; the first-date story starts with the yellow-jumper picture. Edit those strings and refresh. The opening message is in `dist/index.html`.

The importer changes camera filenames such as `IMG_7608` into “Moment 7608”. Files with generated UUID names use “Memory 01” style captions until you replace them.

## Refresh the images

Run `python3 scripts/import_photos.py` to import from `~/Downloads/Nono` again. This requires Pillow. A different source folder can be supplied as the first argument.

The import reads each immediate album folder, then its Large, Medium, and Small folders. It tolerates capitalization, trailing spaces, and the existing “Mediulm” spelling. The loose image directly under Nono is excluded because it is not in an album. Original files are never changed. Size-specific WebP previews (640 / 480 / 320 pixels) load ahead of the viewport with at most three decodes at once. Off-screen photos are skipped during painting, and moving browser toolbars do not repack the canvas. Optimized WebP copies have orientation applied and contain no copied EXIF metadata. The existing album subtitles and authored paragraph blocks are preserved during reimport; lead photos and small layout adjustments are preserved when their images are still present, and generated captions are rebuilt.

## Verification

Run `npm run check` and `npm test`.

The interaction tests exercise the actual controller with a deterministic clock and DOM test double: all album counts and image files, distant loading, approach growth, long-drag snapping, free movement inside a cluster, global image spacing, unchanged photo positions and persistent visibility, pinch, pointer cancellation, focus changes, reduced motion, removed controls, and reachability of every outer edge. Browser checks cover phone and desktop layouts, actual dragging, keyboard movement, and enlarged photos. Physical iPhone/Android touch behavior has not been tested on a device.

## Publishing

The GitHub Pages workflow validates the site and deploys `dist/` when `main` changes. The repository Pages setting must use GitHub Actions as its source. No build or dependency installation is required.
