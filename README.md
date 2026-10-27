# Name That Tune

A host-led group music guessing game. Clips play at 0.5s, 1s, 2s, 5s, then 10s; you keep score manually with +1 / +5 / -1 buttons.

## Use it
1. Drop mp3s into `public/songs/`, named `Artist - Title.mp3`.
2. `npm install && npm run dev`, then open http://localhost:3000
3. Deploy: push to GitHub and import the repo in Vercel (no config needed).

`public/songs.json` is regenerated automatically before `dev` and `build`.

## Keep the deploy small
If clips always start at the beginning, you only need the first ~12 seconds of each song:

    for f in full/*.mp3; do ffmpeg -i "$f" -t 12 -c:a libmp3lame -b:a 128k "public/songs/$(basename "$f")"; done

Skip this if you use "random start", which needs the full song.

## Reveal start points
Edit `reveals.json` in the project root (not `public/songs.json`, which is regenerated on every dev/build):

    { "Artist - Title.mp3": 45, "Other Artist - Other Song.mp3": 62.5 }

Keys are exact file names and values are seconds. When you reveal a song, "Play from reveal point" starts there.
Songs not listed play from the beginning. The question clips are not affected.
Note: if you trimmed files to ~12s, don't trim past your reveal points.