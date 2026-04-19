// ============================================================
// MUSIC FLOW — PATCH: Ecualizador Web Audio API + Letras lrclib.net
// Insertar ANTES de la línea `if (document.readyState === 'loading')...`
// ============================================================

// ============================================================
// WEB AUDIO API — ECUALIZADOR DE 10 BANDAS
// ============================================================

const AudioEngine = (() => {
    let ctx = null;
    let source = null;
    let analyser = null;
    let gainNode = null;
    let filters = [];
    let connected = false;
    let canvasAnim = null;

    // 10 bandas ISO estándar
    const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const BAND_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1k', '2k', '4k', '8k', '16k'];

    // Presets: [32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k]
    const PRESETS = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: [8, 7, 6, 3, 1, 0, 0, 0, 0, 0],
        treble: [0, 0, 0, 0, 0, 2, 3, 5, 7, 8],
        vocal: [-2, -1, 0, 3, 5, 5, 4, 2, 0, -1],
        electronic: [6, 5, 0, 2, 0, -2, 0, 3, 5, 6],
        acoustic: [3, 2, 1, 3, 4, 3, 2, 2, 1, 0],
        rock: [4, 3, 2, 0, -1, -1, 0, 2, 4, 5],
        jazz: [3, 2, 1, 3, 4, 3, 0, -1, -2, -2],
        classical: [3, 2, 2, 2, 0, 0, -1, -1, 0, 1],
        hiphop: [5, 5, 3, 2, 1, 0, 0, 1, 2, 3],
        lofi: [4, 3, 2, 1, 0, -1, -2, -3, -4, -5],
        podcast: [-3, -3, -1, 2, 5, 5, 5, 3, 0, -1],
    };

    function init() {
        if (ctx) return;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            gainNode = ctx.createGain();
            gainNode.gain.value = 1;

            // Crear 10 filtros peaking EQ
            filters = BANDS.map((freq, i) => {
                const f = ctx.createBiquadFilter();
                f.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
                f.frequency.value = freq;
                f.Q.value = 1.4;
                f.gain.value = 0;
                return f;
            });

            // Cadena: source → filters[0..9] → gainNode → analyser → destination
            filters.reduce((prev, curr) => { prev.connect(curr); return curr; });
            filters[filters.length - 1].connect(gainNode);
            gainNode.connect(analyser);
            analyser.connect(ctx.destination);

        } catch (e) {
            console.warn('Web Audio API no disponible:', e);
        }
    }

    function connectAudio(audioEl) {
        if (!ctx) init();
        if (!ctx) return;
        if (connected) return;
        try {
            source = ctx.createMediaElementSource(audioEl);
            source.connect(filters[0]);
            connected = true;
            // Resume context on user interaction
            if (ctx.state === 'suspended') ctx.resume();
        } catch (e) {
            console.warn('Error conectando audio:', e);
        }
    }

    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function setBandGain(bandIndex, gainDb) {
        if (!filters[bandIndex]) return;
        filters[bandIndex].gain.value = Math.max(-12, Math.min(12, gainDb));
    }

    function getBandGain(bandIndex) {
        if (!filters[bandIndex]) return 0;
        return filters[bandIndex].gain.value;
    }

    function applyPreset(name) {
        const vals = PRESETS[name];
        if (!vals) return;
        vals.forEach((v, i) => setBandGain(i, v));
    }

    function getFrequencyData() {
        if (!analyser) return new Uint8Array(0);
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        return data;
    }

    function getWaveformData() {
        if (!analyser) return new Uint8Array(0);
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        return data;
    }

    function setMasterGain(val) {
        if (gainNode) gainNode.gain.value = val;
    }

    return {
        init, connectAudio, resume, setBandGain, getBandGain, applyPreset,
        getFrequencyData, getWaveformData, setMasterGain,
        BANDS, BAND_LABELS, PRESETS
    };
})();

// ============================================================
// INTEGRACIÓN: conectar audioPlayer al AudioEngine
// ============================================================

const _origPlay = audioPlayer.play.bind(audioPlayer);
audioPlayer.play = function (...args) {
    AudioEngine.connectAudio(audioPlayer);
    AudioEngine.resume();
    return _origPlay(...args);
};

audioPlayer.addEventListener('play', () => {
    AudioEngine.connectAudio(audioPlayer);
    AudioEngine.resume();
});

// ============================================================
// VISUALIZADOR DE ESPECTRO REAL (canvas)
// ============================================================

let spectrumCanvas = null;
let spectrumCtx = null;
let spectrumAnimId = null;

function startSpectrumVisualizer(canvasEl) {
    spectrumCanvas = canvasEl;
    spectrumCtx = canvasEl.getContext('2d');
    if (spectrumAnimId) cancelAnimationFrame(spectrumAnimId);

    function draw() {
        spectrumAnimId = requestAnimationFrame(draw);
        const W = spectrumCanvas.width;
        const H = spectrumCanvas.height;
        const data = AudioEngine.getFrequencyData();

        spectrumCtx.clearRect(0, 0, W, H);

        if (!data.length) return;

        const barCount = 64;
        const step = Math.floor(data.length / barCount);
        const barW = W / barCount - 1;

        for (let i = 0; i < barCount; i++) {
            const val = data[i * step] / 255;
            const barH = val * H * 0.9;
            const x = i * (barW + 1);

            // Gradient per bar
            const hue = 260 + val * 80;
            const gradient = spectrumCtx.createLinearGradient(0, H, 0, H - barH);
            gradient.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.9)`);
            gradient.addColorStop(1, `hsla(${hue + 40}, 90%, 75%, 1)`);

            spectrumCtx.fillStyle = gradient;
            spectrumCtx.beginPath();
            spectrumCtx.roundRect(x, H - barH, barW, barH, [2, 2, 0, 0]);
            spectrumCtx.fill();

            // Peak dot
            spectrumCtx.fillStyle = `hsla(${hue + 40}, 100%, 85%, 0.8)`;
            spectrumCtx.fillRect(x, H - barH - 2, barW, 2);
        }
    }
    draw();
}

function stopSpectrumVisualizer() {
    if (spectrumAnimId) { cancelAnimationFrame(spectrumAnimId); spectrumAnimId = null; }
    if (spectrumCtx && spectrumCanvas) spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
}

// ============================================================
// MODAL DEL ECUALIZADOR — reemplaza showEqModal
// ============================================================

let eqCurrentPreset = 'flat';
let eqSliderValues = new Array(10).fill(0);

function showEqModal() {
    // Sync slider values from AudioEngine
    eqSliderValues = AudioEngine.BANDS.map((_, i) => AudioEngine.getBandGain(i));

    const modal = document.getElementById('eqModal');
    const content = modal.querySelector('.modal-content') || modal;

    // Rebuild the modal HTML
    modal.innerHTML = `
    <div class="modal-content eq-modal-content" style="max-width:680px;padding:0;overflow:hidden;border-radius:16px;background:var(--bg-card);border:1px solid var(--border)">
        <div class="eq-header" style="padding:1.2rem 1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:0.8rem">
                <span style="font-size:1.3rem">🎚️</span>
                <div>
                    <div style="font-weight:700;font-size:1rem;color:var(--text-primary)">Ecualizador 10 Bandas</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">Web Audio API · Tiempo real</div>
                </div>
            </div>
            <button onclick="hideEqModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;padding:0.3rem">✕</button>
        </div>

        <!-- Spectrum Visualizer -->
        <div style="padding:1rem 1.5rem 0;background:var(--bg-secondary,#0d0d1a)">
            <canvas id="eqSpectrumCanvas" height="80" style="width:100%;border-radius:8px;display:block;background:rgba(0,0,0,0.3)"></canvas>
        </div>

        <!-- Presets -->
        <div style="padding:1rem 1.5rem;border-bottom:1px solid var(--border)">
            <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.6rem;font-weight:600">Presets</div>
            <div id="eqPresetBtns" style="display:flex;flex-wrap:wrap;gap:0.4rem">
                ${Object.keys(AudioEngine.PRESETS).map(p => {
        const icons = { flat: '⚖️', bass: '🔊', treble: '✨', vocal: '🎤', electronic: '⚡', acoustic: '🎸', rock: '🤘', jazz: '🎷', classical: '🎻', hiphop: '🎧', lofi: '📻', podcast: '🎙️' };
        const names = { flat: 'Plano', bass: 'Bajo+', treble: 'Agudos', vocal: 'Vocal', electronic: 'Electrónica', acoustic: 'Acústica', rock: 'Rock', jazz: 'Jazz', classical: 'Clásica', hiphop: 'Hip Hop', lofi: 'Lo-Fi', podcast: 'Podcast' };
        return `<button class="eq-preset-btn ${p === eqCurrentPreset ? 'active' : ''}" onclick="applyEqPresetUI('${p}')"
                        style="padding:0.35rem 0.75rem;border-radius:999px;border:1px solid var(--border);background:${p === eqCurrentPreset ? 'var(--accent,#9d4edd)' : 'transparent'};color:${p === eqCurrentPreset ? '#fff' : 'var(--text-secondary)'};font-size:0.78rem;cursor:pointer;transition:all 0.15s;font-family:inherit">
                        ${icons[p] || '🎵'} ${names[p] || p}
                    </button>`;
    }).join('')}
            </div>
        </div>

        <!-- 10-Band Sliders -->
        <div style="padding:1.2rem 1.5rem">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
                <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:600">Bandas de frecuencia</div>
                <button onclick="applyEqPresetUI('flat')" style="font-size:0.75rem;padding:0.25rem 0.7rem;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;font-family:inherit">Resetear</button>
            </div>
            <div id="eqBandsContainer" style="display:flex;gap:0.5rem;align-items:flex-end;justify-content:space-between;height:180px;padding:0 0.2rem">
                ${AudioEngine.BAND_LABELS.map((label, i) => `
                <div class="eq-band-col" style="display:flex;flex-direction:column;align-items:center;flex:1;gap:0.4rem;height:100%">
                    <div class="eq-db-label" id="eqDb${i}" style="font-size:0.7rem;color:var(--accent,#9d4edd);font-weight:600;height:16px;line-height:16px;font-family:'DM Mono',monospace">0</div>
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;width:100%">
                        <div style="position:absolute;width:1px;height:100%;background:var(--border);opacity:0.5;left:50%;transform:translateX(-50%)"></div>
                        <div style="position:absolute;width:60%;height:1px;background:var(--border);top:50%;opacity:0.3"></div>
                        <input type="range" class="eq-vslider" id="eqSlider${i}"
                            min="-12" max="12" step="0.5" value="${eqSliderValues[i]}"
                            orient="vertical"
                            oninput="onEqSlider(${i}, this.value)"
                            style="writing-mode:vertical-lr;direction:rtl;-webkit-appearance:slider-vertical;width:28px;height:100%;cursor:pointer;accent-color:var(--accent,#9d4edd)">
                    </div>
                    <div style="font-size:0.63rem;color:var(--text-muted);text-align:center;white-space:nowrap;transform:rotate(-30deg);margin-top:0.2rem">${label}</div>
                </div>`).join('')}
            </div>
        </div>

        <!-- Master Gain -->
        <div style="padding:0.8rem 1.5rem 1.2rem;border-top:1px solid var(--border);display:flex;align-items:center;gap:1rem">
            <span style="font-size:0.8rem;color:var(--text-muted);min-width:80px">Ganancia master</span>
            <input type="range" id="eqMasterGain" min="0" max="2" step="0.01" value="1"
                oninput="AudioEngine.setMasterGain(this.value); document.getElementById('eqMasterVal').textContent = Math.round(this.value * 100) + '%'"
                style="flex:1;accent-color:var(--accent,#9d4edd);cursor:pointer">
            <span id="eqMasterVal" style="font-size:0.8rem;color:var(--text-primary);min-width:36px;text-align:right;font-family:'DM Mono',monospace">100%</span>
        </div>
    </div>`;

    modal.classList.add('open');

    // Start spectrum canvas
    setTimeout(() => {
        const canvas = document.getElementById('eqSpectrumCanvas');
        if (canvas) {
            canvas.width = canvas.offsetWidth * window.devicePixelRatio || 600;
            startSpectrumVisualizer(canvas);
        }
    }, 50);

    // Close on backdrop click
    modal.onclick = (e) => { if (e.target === modal) hideEqModal(); };
}

function hideEqModal() {
    stopSpectrumVisualizer();
    const modal = document.getElementById('eqModal');
    modal.classList.remove('open');
}

function onEqSlider(bandIndex, val) {
    const gain = parseFloat(val);
    eqSliderValues[bandIndex] = gain;
    AudioEngine.setBandGain(bandIndex, gain);
    const label = document.getElementById(`eqDb${bandIndex}`);
    if (label) {
        label.textContent = gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1);
        label.style.color = gain > 0 ? '#c77dff' : gain < 0 ? '#f093fb' : 'var(--text-muted)';
    }
    // Mark as custom
    eqCurrentPreset = 'custom';
    document.querySelectorAll('.eq-preset-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
    });
}

function applyEqPresetUI(preset) {
    AudioEngine.applyPreset(preset);
    eqCurrentPreset = preset;
    // Update sliders
    AudioEngine.BANDS.forEach((_, i) => {
        const gain = AudioEngine.getBandGain(i);
        eqSliderValues[i] = gain;
        const slider = document.getElementById(`eqSlider${i}`);
        if (slider) slider.value = gain;
        const label = document.getElementById(`eqDb${i}`);
        if (label) {
            label.textContent = gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1);
            label.style.color = gain > 0 ? '#c77dff' : gain < 0 ? '#f093fb' : 'var(--text-muted)';
        }
    });
    // Update preset buttons
    document.querySelectorAll('.eq-preset-btn').forEach(b => {
        const isActive = b.textContent.trim().toLowerCase().includes(preset) || b.getAttribute('onclick')?.includes(`'${preset}'`);
        b.style.background = isActive ? 'var(--accent,#9d4edd)' : 'transparent';
        b.style.color = isActive ? '#fff' : 'var(--text-secondary)';
    });

    const names = { flat: 'Plano', bass: 'Bajo+', treble: 'Agudos+', vocal: 'Vocal', electronic: 'Electrónica', acoustic: 'Acústica', rock: 'Rock', jazz: 'Jazz', classical: 'Clásica', hiphop: 'Hip Hop', lofi: 'Lo-Fi', podcast: 'Podcast' };
    showToast(`🎚️ Preset: ${names[preset] || preset}`);
    document.getElementById('eqBtn').style.color = preset === 'flat' ? '' : '#f093fb';
}

// Override the original applyEqPreset to use AudioEngine
window.applyEqPreset = applyEqPresetUI;

// ============================================================
// LETRAS — lrclib.net API
// ============================================================

const LyricsEngine = (() => {
    const BASE = 'https://lrclib.net/api';
    let cache = {};

    async function fetchLyrics(title, artist, duration) {
        const key = `${title}|${artist}`.toLowerCase();
        if (cache[key] !== undefined) return cache[key];

        try {
            // Try synced lyrics first (search endpoint)
            let url = `${BASE}/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
            let res = await fetch(url);
            let data = await res.json();

            if (Array.isArray(data) && data.length > 0) {
                // Sort by duration proximity
                if (duration) {
                    data.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
                }
                const match = data[0];
                const result = {
                    plainLyrics: match.plainLyrics || null,
                    syncedLyrics: match.syncedLyrics || null,
                    source: match.artistName + ' — ' + match.trackName,
                    id: match.id
                };
                cache[key] = result;
                return result;
            }
        } catch (e) {
            console.warn('lrclib fetch error:', e);
        }
        cache[key] = null;
        return null;
    }

    function parseLRC(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const parsed = [];
        const timeRegex = /\[(\d{2,3}):(\d{2})\.(\d{2,3})\]/g;
        lines.forEach(line => {
            const matches = [...line.matchAll(/\[(\d{2,3}):(\d{2})\.(\d{2,3})\]/g)];
            if (matches.length === 0) return;
            const text = line.replace(/\[\d{2,3}:\d{2}\.\d{2,3}\]/g, '').trim();
            if (!text) return;
            matches.forEach(m => {
                const mins = parseInt(m[1]);
                const secs = parseInt(m[2]);
                const ms = parseInt(m[3].padEnd(3, '0'));
                const time = mins * 60 + secs + ms / 1000;
                parsed.push({ time, text });
            });
        });
        return parsed.sort((a, b) => a.time - b.time);
    }

    return { fetchLyrics, parseLRC };
})();

// ============================================================
// REEMPLAZAR showLyrics con versión lrclib.net
// ============================================================

let lyricsAutoScrollActive = false;
let lyricsKaraokeInterval = null;

window.showLyrics = async function (songId) {
    const id = songId || (appState.currentSong ? appState.currentSong.id : null);
    if (!id) { showToast('⚠️ No hay canción seleccionada'); return; }
    const song = appState.songs.find(s => s.id === id);
    if (!song) return;

    const modal = document.getElementById('lyricsModal');
    const body = document.getElementById('lyricsBody');
    const titleEl = document.getElementById('lyricsTitle');

    titleEl.textContent = `🎤 ${song.title} — ${song.artist}`;
    body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem;gap:1rem;color:var(--text-muted)">
            <div class="lyrics-loading-spinner"></div>
            <div style="font-size:0.9rem">Buscando letra en lrclib.net…</div>
        </div>`;
    modal.classList.add('open');

    // Check local cache first
    let lyricsResult = appState.lyricsData[id];
    let parsed = null;
    let plain = null;

    if (lyricsResult && lyricsResult.lines) {
        // Already have synced lyrics
        parsed = lyricsResult.lines;
    } else {
        // Fetch from lrclib.net
        const fetched = await LyricsEngine.fetchLyrics(song.title, song.artist, song.duration);
        if (fetched) {
            if (fetched.syncedLyrics) {
                parsed = LyricsEngine.parseLRC(fetched.syncedLyrics);
                if (parsed.length > 0) {
                    appState.lyricsData[id] = { lines: parsed, source: fetched.source, synced: true };
                    saveState();
                }
            }
            if (!parsed || parsed.length === 0) {
                plain = fetched.plainLyrics;
                appState.lyricsData[id] = { plain, source: fetched.source, synced: false };
                saveState();
            }
        }
    }

    renderLyricsBody(id, song, parsed, plain || (lyricsResult && lyricsResult.plain), lyricsResult?.source);

    if (appState.currentSong && appState.currentSong.id === id && appState.isPlaying) {
        lyricsAutoScrollActive = true;
        updateLyricsHighlight();
    }
};

function renderLyricsBody(id, song, parsed, plain, source) {
    const body = document.getElementById('lyricsBody');
    const hasSynced = parsed && parsed.length > 0;
    const hasPlain = plain && plain.trim().length > 0;

    if (!hasSynced && !hasPlain) {
        body.innerHTML = `
            <div style="text-align:center;padding:3rem 1.5rem;color:var(--text-muted)">
                <div style="font-size:2.5rem;margin-bottom:1rem">🎵</div>
                <div style="font-size:0.95rem;margin-bottom:0.5rem">No se encontró letra para esta canción</div>
                <div style="font-size:0.8rem;opacity:0.6">Prueba editando el título o artista en ✏️</div>
            </div>`;
        return;
    }

    let html = '';
    if (source) {
        html += `<div class="lyrics-source-tag" style="font-size:0.72rem;color:var(--text-muted);text-align:center;padding:0.6rem;margin-bottom:0.5rem;opacity:0.7">
            vía <a href="https://lrclib.net" target="_blank" style="color:var(--accent,#9d4edd);text-decoration:none">lrclib.net</a> · ${escapeHtml(source)}
            ${hasSynced ? '<span style="margin-left:0.5rem;color:#43e97b;font-weight:600">⏱ Sincronizada</span>' : ''}
        </div>`;
    }

    if (hasSynced) {
        html += `<div class="lyrics-lines" id="lyricsLineContainer">
            ${parsed.map((l, i) =>
            `<p class="lyrics-line" data-index="${i}" data-time="${l.time}">${escapeHtml(l.text)}</p>`
        ).join('')}
        </div>`;
    } else if (hasPlain) {
        const lines = plain.split('\n');
        html += `<div class="lyrics-lines lyrics-plain" id="lyricsLineContainer">
            ${lines.map((l, i) => l.trim()
            ? `<p class="lyrics-line">${escapeHtml(l)}</p>`
            : `<p class="lyrics-line-break" style="height:0.8rem"></p>`
        ).join('')}
        </div>`;
    }

    body.innerHTML = html;
}

// Override updateLyricsHighlight
window.updateLyricsHighlight = function () {
    const id = appState.currentSong?.id;
    const lyricsData = appState.lyricsData[id];
    if (!lyricsData || !lyricsData.lines) return;
    const currentTime = audioPlayer.currentTime;
    let activeIndex = 0;
    lyricsData.lines.forEach((line, i) => { if (currentTime >= line.time) activeIndex = i; });
    document.querySelectorAll('.lyrics-line').forEach((el, i) => {
        el.classList.toggle('active', i === activeIndex);
        if (i === activeIndex && lyricsAutoScrollActive) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
};

// Override karaoke
window.startKaraoke = function () {
    if (!appState.currentSong) { showToast('▶️ Reproduce una canción primero'); return; }
    const hasSynced = appState.lyricsData[appState.currentSong.id]?.lines?.length > 0;
    if (!hasSynced) { showToast('⚠️ Busca primero la letra de esta canción'); showLyrics(appState.currentSong.id); return; }
    appState.karaokeActive = true;
    lyricsAutoScrollActive = true;
    document.getElementById('karaokeBtn').classList.add('active');
    document.getElementById('karaokeBtn').style.color = '#f093fb';
    showLyrics(appState.currentSong.id);
    document.getElementById('lyricsModal').classList.add('karaoke-mode');
    document.getElementById('karaokeToggleBtn').textContent = '🎤 Detener Karaoke';
    lyricsKaraokeInterval = setInterval(() => { if (appState.isPlaying) updateLyricsHighlight(); }, 150);
    showToast('🎤 Modo karaoke activado');
};

window.stopKaraoke = function () {
    appState.karaokeActive = false;
    lyricsAutoScrollActive = false;
    clearInterval(lyricsKaraokeInterval);
    lyricsKaraokeInterval = null;
    document.getElementById('karaokeBtn').classList.remove('active');
    document.getElementById('karaokeBtn').style.color = '';
    document.getElementById('lyricsModal').classList.remove('karaoke-mode');
    const btn = document.getElementById('karaokeToggleBtn');
    if (btn) btn.textContent = '🎤 Iniciar Karaoke';
    showToast('🎤 Modo karaoke desactivado');
};

// ============================================================
// ESTILOS DEL ECUALIZADOR (inyectar CSS)
// ============================================================

const eqStyles = document.createElement('style');
eqStyles.textContent = `
    .eq-vslider {
        writing-mode: vertical-lr;
        direction: rtl;
        -webkit-appearance: slider-vertical;
        width: 28px;
        cursor: pointer;
        accent-color: var(--accent, #9d4edd);
        background: transparent;
        border: none;
        outline: none;
        height: 120px;
    }
    /* Firefox vertical slider */
    @-moz-document url-prefix() {
        .eq-vslider { writing-mode: vertical-lr; }
    }
    .eq-preset-btn:hover {
        background: rgba(157, 78, 221, 0.2) !important;
        border-color: var(--accent, #9d4edd) !important;
        color: var(--text-primary) !important;
    }
    .lyrics-loading-spinner {
        width: 32px; height: 32px;
        border: 3px solid rgba(157,78,221,0.2);
        border-top-color: var(--accent, #9d4edd);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Karaoke line animations */
    .lyrics-line {
        transition: color 0.3s, transform 0.3s, opacity 0.3s;
    }
    .karaoke-mode .lyrics-line {
        opacity: 0.35;
        transform: scale(0.95);
        font-size: 1.1rem;
        color: var(--text-secondary);
    }
    .karaoke-mode .lyrics-line.active {
        opacity: 1;
        transform: scale(1.08);
        color: #fff;
        font-size: 1.25rem;
        font-weight: 700;
        text-shadow: 0 0 20px var(--accent, #9d4edd), 0 0 40px rgba(157,78,221,0.4);
    }
    .lyrics-line.active:not(.karaoke-mode .lyrics-line) {
        color: var(--accent, #9d4edd) !important;
        font-weight: 600;
    }
`;
document.head.appendChild(eqStyles);

// Initialize AudioEngine early
AudioEngine.init();