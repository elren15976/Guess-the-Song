'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Clip length at each level (seconds).
const LEVELS = [0.5, 1, 2, 5, 10];
// Seconds of fade-in when playing the song after the reveal.
const REVEAL_FADE_IN = 2.5;
const RING_RADII = [20, 36, 52, 68, 84];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function Game() {
  const [songs, setSongs] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const [phase, setPhase] = useState('setup'); // setup | play | end
  const [names, setNames] = useState('Team 1\nTeam 2');
  const [randomStart, setRandomStart] = useState(false);
  const [rounds, setRounds] = useState(10);

  const [players, setPlayers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [level, setLevel] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | error

  const ctxRef = useRef(null);
  const cache = useRef(new Map());
  const srcRef = useRef(null);
  const offsetRef = useRef(null);

  const song = queue[idx];

  useEffect(() => {
    fetch('/songs.json')
      .then((r) => r.json())
      .then((list) => {
        setSongs(list);
        setRounds(Math.min(10, list.length) || 1);
      })
      .catch(() => setLoadError(true));
  }, []);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  };

  // Decoded audio is cached so clips start instantly (important for the 0.5s level).
  const getBuffer = (url) => {
    if (!cache.current.has(url)) {
      const p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => getCtx().decodeAudioData(b))
        .catch((e) => {
          cache.current.delete(url);
          throw e;
        });
      cache.current.set(url, p);
    }
    return cache.current.get(url);
  };

  const stop = useCallback(() => {
    const src = srcRef.current;
    srcRef.current = null;
    if (src) {
      try { src.stop(); } catch {}
    }
    setStatus('idle');
  }, []);

  const play = useCallback(
    async (lv, full = false) => {
      if (!song) return;
      stop();
      const ctx = getCtx();
      await ctx.resume();
      setStatus('loading');
      let buf;
      try {
        buf = await getBuffer(song.url);
      } catch {
        setStatus('error');
        return;
      }
      // Pick the start point once per song so every level is a longer slice of the same moment.
      if (offsetRef.current === null) {
        offsetRef.current = randomStart ? Math.random() * Math.max(0, buf.duration - LEVELS[4] - 1) : 0;
      }
      // Question clips use the song's start point; the reveal playback jumps to song.reveal.
      const offset = full ? Math.min(song.reveal || 0, Math.max(0, buf.duration - 1)) : offsetRef.current;
      const dur = full ? Math.max(0.1, buf.duration - offset) : Math.min(LEVELS[lv], buf.duration - offset);
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      if (full) {
        const fade = Math.min(REVEAL_FADE_IN, dur / 2);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + fade);
      }
      gain.gain.setValueAtTime(1, t + Math.max(0, dur - 0.03));
      gain.gain.linearRampToValueAtTime(0, t + dur); // tiny fade avoids a click at the cut
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain).connect(ctx.destination);
      src.onended = () => {
        if (srcRef.current === src) {
          srcRef.current = null;
          setStatus('idle');
        }
      };
      srcRef.current = src;
      src.start(t, offset, dur);
      setStatus('playing');
    },
    [song, randomStart, stop]
  );

  // New song: reset state and preload the next one.
  useEffect(() => {
    if (phase !== 'play') return;
    offsetRef.current = null;
    if (queue[idx]) getBuffer(queue[idx].url).catch(() => {});
    if (queue[idx + 1]) getBuffer(queue[idx + 1].url).catch(() => {});
  }, [phase, idx, queue]);

  const startGame = () => {
    const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
    const unique = [...new Set(list)].map((name) => ({ name, score: 0 }));
    if (!unique.length || !songs?.length) return;
    setPlayers(unique);
    setQueue(shuffle(songs).slice(0, Math.max(1, Math.min(rounds, songs.length))));
    setIdx(0);
    setLevel(0);
    setRevealed(false);
    setPhase('play');
    getCtx(); // create the audio context inside the click gesture
  };

  const reveal = useCallback(() => {
    setRevealed(true);
  }, []);

  // The scoreboard is just counters you control by hand; it never touches the game flow.
  const setScore = (i, value) =>
    setPlayers((ps) => ps.map((p, n) => (n === i ? { ...p, score: Number.isFinite(value) ? value : 0 } : p)));
  const adjust = (i, delta) => setScore(i, players[i].score + delta);

  const next = () => {
    stop();
    if (idx + 1 >= queue.length) return setPhase('end');
    setIdx(idx + 1);
    setLevel(0);
    setRevealed(false);
  };

  const longer = useCallback(() => {
    if (level >= LEVELS.length - 1) return;
    setLevel(level + 1);
    play(level + 1);
  }, [level, play]);

  // Keyboard shortcuts for the host: Space = play, → = longer clip, R = reveal, N = next song.
  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.target.tagName === 'BUTTON' && e.key === ' ') return;
      if (e.key === ' ') { e.preventDefault(); play(level); }
      else if (e.key === 'ArrowRight' && !revealed) longer();
      else if (e.key.toLowerCase() === 'r') reveal();
      else if (e.key.toLowerCase() === 'n' && revealed) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- Screens ---------- */

  if (phase === 'setup') {
    return (
      <main className="wrap">
        <h1 className="title">Name That Tune</h1>
        <p className="sub">
          Each song starts with a tiny clip and gets longer until someone knows it. You keep score by hand.
        </p>
        <div className="setup">
          {loadError && <p className="err">Couldn&apos;t load songs.json. Run the app with npm run dev.</p>}
          {songs && songs.length === 0 && (
            <p className="err">No songs found. Add mp3 files to public/songs and restart.</p>
          )}
          <label className="field">
            Players or teams
            <small>One per line</small>
            <textarea value={names} onChange={(e) => setNames(e.target.value)} />
          </label>
          <label className="field">
            Songs this game {songs ? `(${songs.length} available)` : ''}
            <input
              type="number"
              min={1}
              max={songs?.length || 1}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={randomStart} onChange={(e) => setRandomStart(e.target.checked)} />
            <span>
              <strong>Start clips at a random point</strong>
              <br />
              <small className="hint">Off: clips always start at the beginning of the song.</small>
            </span>
          </label>
          <div>
            <button className="btn main" onClick={startGame} disabled={!songs?.length}>
              Start game
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'end') {
    const ranked = [...players].sort((a, b) => b.score - a.score);
    return (
      <main className="wrap">
        <h1 className="title">{ranked[0]?.name} wins</h1>
        <p className="sub">Final scores after {queue.length} songs.</p>
        <div className="panel" style={{ maxWidth: 520, marginTop: 28 }}>
          <ul className="score">
            {ranked.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <span className="pts">{p.score}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn main" onClick={startGame}>Play again</button>
          <button className="btn ghost" onClick={() => setPhase('setup')}>Change setup</button>
        </div>
      </main>
    );
  }

  const atMax = level >= LEVELS.length - 1;
  const playing = status === 'playing';

  return (
    <main className="wrap">
      <div className="topbar">
        <span>Song {idx + 1} of {queue.length}</span>
        <button className="btn ghost" onClick={() => { stop(); setPhase('end'); }}>End game</button>
      </div>

      <div className="stage">
        <svg className={`disc ${playing ? 'playing' : ''}`} viewBox="0 0 200 200" role="img"
          aria-label={`Level ${level + 1} of ${LEVELS.length}, ${LEVELS[level]} second clip`}>
          <g className="spin">
            {RING_RADII.map((r, i) => (
              <circle key={r} cx="100" cy="100" r={r} className={`ring ${i <= level ? 'lit' : ''}`} />
            ))}
          </g>
          <circle cx="100" cy="100" r="12" fill="var(--pink)" />
          <text x="100" y="196" className="center-label">{LEVELS[level]}s clip</text>
        </svg>

        <div>
          <div className="answer" aria-live="polite">
            {revealed ? (
              <>
                <p className="big">{song.title}</p>
                {song.artist && <p className="who">{song.artist}</p>}
              </>
            ) : (
              <p className="big hidden">Who knows this one?</p>
            )}
          </div>

          <div className="row">
            <button className="btn main" onClick={() => play(level)} disabled={status === 'loading'}>
              {status === 'loading' ? 'Loading…' : `Play ${LEVELS[level]}s`}
            </button>
            {playing && <button className="btn" onClick={stop}>Stop</button>}
            {!revealed && (
              <button className="btn alt" onClick={longer} disabled={atMax}>
                {atMax ? 'Longest clip' : `Longer: ${LEVELS[level + 1]}s`}
              </button>
            )}
          </div>
          {status === 'error' && <p className="err">Couldn&apos;t load this file. Skip to the next song.</p>}
          <p className="hint">Space: play · Right arrow: longer · R: reveal · N: next</p>

          <div className="row">
            {!revealed ? (
              <button className="btn alt" onClick={reveal}>Reveal answer</button>
            ) : (
              <>
                <button className="btn" onClick={() => play(level, true)}>{song.reveal > 0 ? 'Play from reveal point' : 'Play full song'}</button>
                <button className="btn main" onClick={next}>
                  {idx + 1 >= queue.length ? 'Final scores' : 'Next song'}
                </button>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Scoreboard</h2>
            <ul className="score">
              {players.map((p, i) => (
                <li key={p.name}>
                  <span className="pname">{p.name}</span>
                  <span className="adj">
                    <button className="btn sm" onClick={() => adjust(i, -1)} aria-label={`Remove 1 point from ${p.name}`}>-1</button>
                    <input
                      type="number"
                      className="pts-input"
                      value={p.score}
                      onChange={(e) => setScore(i, e.target.valueAsNumber)}
                      aria-label={`${p.name} score`}
                    />
                    <button className="btn sm" onClick={() => adjust(i, 1)} aria-label={`Add 1 point to ${p.name}`}>+1</button>
                    <button className="btn sm alt" onClick={() => adjust(i, 5)} aria-label={`Add 5 points to ${p.name}`}>+5</button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="hint">Type a number to set a score directly.</p>
          </div>
        </div>
      </div>
    </main>
  );
}