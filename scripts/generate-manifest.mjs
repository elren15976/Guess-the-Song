// Scans public/songs and writes public/songs.json (runs automatically before dev/build).
// Name files "Artist - Title.mp3". Without " - ", the whole name is used as the title.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const dir = join(process.cwd(), 'public', 'songs');
const exts = new Set(['.mp3', '.m4a', '.ogg', '.wav']);

// Optional hand-edited file: { "Artist - Title.mp3": 45 } = where the reveal playback starts (seconds).
const revealsPath = join(process.cwd(), 'reveals.json');
const reveals = existsSync(revealsPath) ? JSON.parse(readFileSync(revealsPath, 'utf8')) : {};

const songs = readdirSync(dir)
  .filter((f) => exts.has(extname(f).toLowerCase()))
  .sort()
  .map((file) => {
    const name = basename(file, extname(file)).replace(/_/g, ' ').trim();
    const i = name.indexOf(' - ');
    return {
      reveal: Number(reveals[file]) || 0,
      url: `/songs/${encodeURIComponent(file)}`,
      artist: i > -1 ? name.slice(0, i).trim() : '',
      title: i > -1 ? name.slice(i + 3).trim() : name,
    };
  });

const files = new Set(readdirSync(dir));
for (const key of Object.keys(reveals)) {
  if (!files.has(key)) console.warn(`reveals.json: no file named "${key}" in public/songs`);
}

writeFileSync(join(process.cwd(), 'public', 'songs.json'), JSON.stringify(songs, null, 2));
console.log(`songs.json: ${songs.length} song(s)`);
