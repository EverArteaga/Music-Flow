// ============================================================
// MUSIC FLOW — script.js (versión mejorada)
// ============================================================

// Estado de la aplicación
let appState = {
    currentUser: null,
    users: [],
    songs: [],
    playlists: [],
    likedSongs: [],
    currentSong: null,
    isPlaying: false,
    listeningHistory: [],   // [{id, title, artist, timestamp}]
    currentView: 'home',
    isAuthMode: 'login',
    shuffle: false,
    repeat: false,
    mobileMenuOpen: false,
    activeGenreFilter: null,
    karaokeActive: false,
    lyricsData: {},
    activePlaylistId: null,
    playlistQueue: [],
    playlistQueueIndex: -1,
    isMuted: false,
    lastVolume: 70,
    manualQueue: [],        // cola manual añadida por el usuario
    currentSpeed: 1,
    nowPlayingOpen: false,
    smartMixList: [],
    editingMetadataId: null,
    activeQueueTab: 'next'
};

// Referencias al DOM
const authScreen = document.getElementById('authScreen');
const mainApp = document.getElementById('mainApp');
const audioPlayer = document.getElementById('audioPlayer');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');

// ============================================================
// PERSISTENCIA localStorage
// ============================================================

// ============================================================
// INDEXEDDB — Persistencia de archivos de audio
// ============================================================

let idb = null;
const IDB_NAME = 'musicflow_db';
const IDB_VERSION = 1;
const IDB_STORE_AUDIO = 'audio_files';

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE_AUDIO)) {
                db.createObjectStore(IDB_STORE_AUDIO, { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => { idb = e.target.result; resolve(); };
        req.onerror = () => { console.warn('IndexedDB no disponible'); resolve(); };
    });
}

function saveAudioToIDB(songId, dataUrl) {
    if (!idb) return Promise.resolve();
    return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE_AUDIO, 'readwrite');
        tx.objectStore(IDB_STORE_AUDIO).put({ id: songId, data: dataUrl });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
    });
}

function deleteAudioFromIDB(songId) {
    if (!idb) return Promise.resolve();
    return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE_AUDIO, 'readwrite');
        tx.objectStore(IDB_STORE_AUDIO).delete(songId);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
    });
}

function loadAudioFilesFromIDB() {
    if (!idb) return Promise.resolve();
    return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE_AUDIO, 'readonly');
        const req = tx.objectStore(IDB_STORE_AUDIO).getAll();
        req.onsuccess = (e) => {
            const records = e.target.result || [];
            records.forEach(record => {
                const song = appState.songs.find(s => s.id === record.id);
                if (song) song.file = record.data;
            });
            resolve();
        };
        req.onerror = resolve;
    });
}

// ============================================================
// PERSISTENCIA localStorage (metadatos sin archivos)
// ============================================================

function saveState() {
    try {
        const toSave = {
            users: appState.users,
            // Guardar canciones SIN el data URL (se guarda en IndexedDB)
            songs: appState.songs.map(s => {
                const { file, ...rest } = s;
                return { ...rest, hasFile: !!file };
            }),
            playlists: appState.playlists,
            likedSongs: appState.likedSongs,
            listeningHistory: appState.listeningHistory,
            lyricsData: appState.lyricsData
        };
        localStorage.setItem('musicflow_state', JSON.stringify(toSave));
    } catch (e) { /* quota exceeded */ }
}

function loadState() {
    try {
        const raw = localStorage.getItem('musicflow_state');
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (saved.users) appState.users = saved.users;
        if (saved.playlists) appState.playlists = saved.playlists;
        if (saved.likedSongs) appState.likedSongs = saved.likedSongs;
        if (saved.listeningHistory) appState.listeningHistory = saved.listeningHistory;
        if (saved.lyricsData) appState.lyricsData = { ...appState.lyricsData, ...saved.lyricsData };
        // Restaurar canciones (sin archivo, se carga desde IDB después)
        if (saved.songs) {
            appState.songs = saved.songs.map(s => ({ ...s, file: null }));
        }
        return true;
    } catch (e) { return false; }
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

function init() {
    appState.songs = [];
    appState.lyricsData = {};

    // Inicializar IndexedDB y luego cargar estado
    initIndexedDB().then(() => {
        loadState();
        loadAudioFilesFromIDB().then(() => {
            setupEventListeners();
            setupKeyboardShortcuts();
            renderHome();
        });
    });
}

function setupEventListeners() {
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleSongEnded);
    fileInput.addEventListener('change', handleFiles);

    const importInput = document.getElementById('importPlaylistInput');
    if (importInput) importInput.addEventListener('change', importPlaylist);

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            handleFiles({ target: { files: e.dataTransfer.files } });
        });
    }

    document.getElementById('volumeSlider').addEventListener('input', (e) => {
        const val = e.target.value;
        audioPlayer.volume = val / 100;
        appState.lastVolume = val;
        updateVolumeUI(val);
    });

    document.querySelector('.progress-track').addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        if (audioPlayer.duration) audioPlayer.currentTime = pos * audioPlayer.duration;
    });

    // Drag progress
    let dragging = false;
    const pt = document.querySelector('.progress-track');
    pt.addEventListener('mousedown', () => dragging = true);
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = pt.getBoundingClientRect();
        const pos = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        if (audioPlayer.duration) audioPlayer.currentTime = pos * audioPlayer.duration;
    });
    document.addEventListener('mouseup', () => dragging = false);
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        switch (e.key) {
            case ' ': e.preventDefault(); togglePlay(); break;
            case 'ArrowRight': nextSong(); break;
            case 'ArrowLeft': prevSong(); break;
            case 'm': case 'M': toggleMute(); break;
            case 'l': case 'L': showLyrics(); break;
            case 's': case 'S': showSmartMixModal(); break;
        }
    });
}

// ============================================================
// AUTENTICACIÓN
// ============================================================

function toggleAuth() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const toggleAuthText = document.getElementById('toggleAuthText');
    if (appState.isAuthMode === 'login') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        toggleAuthText.innerHTML = '¿Ya tienes cuenta? <a onclick="toggleAuth()">Inicia Sesión</a>';
        appState.isAuthMode = 'signup';
    } else {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        toggleAuthText.innerHTML = '¿No tienes cuenta? <a onclick="toggleAuth()">Regístrate</a>';
        appState.isAuthMode = 'login';
    }
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    if (!email || !pass) { showToast('⚠️ Completa todos los campos'); return; }
    const user = appState.users.find(u => u.email === email && u.password === pass);
    if (user) { appState.currentUser = user; showApp(); }
    else showToast('❌ Credenciales incorrectas');
}

function handleSignup() {
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    if (!name || !email || !pass) { showToast('⚠️ Completa todos los campos'); return; }
    if (pass.length < 6) { showToast('⚠️ La contraseña debe tener al menos 6 caracteres'); return; }
    if (appState.users.find(u => u.email === email)) { showToast('❌ El email ya está registrado'); return; }
    const newUser = { id: Date.now(), name, email, password: pass };
    appState.users.push(newUser);
    appState.currentUser = newUser;
    saveState();
    showApp();
}

function handleLogout() {
    appState.currentUser = null;
    mainApp.style.display = 'none';
    authScreen.style.display = 'flex';
    if (appState.isPlaying) { audioPlayer.pause(); appState.isPlaying = false; }
}

function showApp() {
    authScreen.style.display = 'none';
    mainApp.style.display = 'grid';
    document.getElementById('userName').textContent = appState.currentUser.name;
    document.getElementById('userAvatar').textContent = appState.currentUser.name.charAt(0).toUpperCase();
    renderPlaylists();
    renderHome();
}

// ============================================================
// NAVEGACIÓN
// ============================================================

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(viewId + 'View').style.display = 'block';
    const navItem = Array.from(document.querySelectorAll('.nav-item')).find(item =>
        item.textContent.toLowerCase().includes(
            viewId === 'home' ? 'inicio' : viewId === 'search' ? 'buscar' :
                viewId === 'library' ? 'biblioteca' : viewId === 'favorites' ? 'favoritos' : 'historial'
        ));
    if (navItem) navItem.classList.add('active');
    document.getElementById('searchContainer').style.display = viewId === 'search' ? 'block' : 'none';
    appState.currentView = viewId;
    if (viewId === 'home') renderHome();
    if (viewId === 'library') renderLibrary();
    if (viewId === 'favorites') renderFavorites();
    if (viewId === 'history') renderHistory();
    if (appState.mobileMenuOpen) toggleMobileMenu();
}

function toggleMobileMenu() {
    appState.mobileMenuOpen = !appState.mobileMenuOpen;
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    sidebar.classList.toggle('mobile-open', appState.mobileMenuOpen);
    mobileMenuBtn.style.display = appState.mobileMenuOpen ? 'none' : 'flex';
}

// ============================================================
// HOME
// ============================================================

function renderHome() {
    const recommendationsGrid = document.getElementById('recommendationsGrid');
    const trendingGrid = document.getElementById('trendingGrid');
    const recommendations = appState.songs.slice(0, 4);
    recommendationsGrid.innerHTML = recommendations.map(song => createCard(song)).join('');
    const trending = [...appState.songs].sort((a, b) => b.plays - a.plays).slice(0, 4);
    trendingGrid.innerHTML = trending.map(song => createCard(song)).join('');
}

function createCard(song) {
    const colors = ['#9d4edd,#5390d9', '#f093fb,#f5576c', '#4facfe,#00f2fe', '#43e97b,#38f9d7', '#fa709a,#fee140'];
    const gradient = colors[song.id % colors.length] || colors[0];
    const isCurrent = appState.currentSong && appState.currentSong.id === song.id;
    return `
        <div class="card ${isCurrent ? 'card-playing' : ''}" onclick="playSong(${song.id})">
            <div class="card-img" style="background:linear-gradient(135deg,${gradient})">
                <span style="font-size:2rem">🎵</span>
                <div class="card-genre-tag">${escapeHtml(song.genre)}</div>
            </div>
            <div class="card-title">${escapeHtml(song.title)}</div>
            <div class="card-artist">${escapeHtml(song.artist)}</div>
            <button class="card-play-btn" onclick="event.stopPropagation(); playSong(${song.id})">▶</button>
        </div>`;
}

// ============================================================
// LIBRARY & FAVORITES
// ============================================================

function renderLibrary() {
    const libraryContent = document.getElementById('libraryContent');
    renderGenreChips();
    const filtered = appState.activeGenreFilter
        ? appState.songs.filter(s => s.genre === appState.activeGenreFilter)
        : appState.songs;
    if (filtered.length === 0) {
        libraryContent.innerHTML = appState.songs.length === 0
            ? '<p class="empty-state">Tu biblioteca está vacía. ¡Sube algunas canciones!</p>'
            : '<p class="empty-state">No hay canciones en este género.</p>';
    } else {
        libraryContent.innerHTML = filtered.map((song, i) => createSongRow(song, i)).join('');
    }
}

function renderFavorites() {
    const favoritesContent = document.getElementById('favoritesContent');
    const favoriteSongs = appState.songs.filter(s => appState.likedSongs.includes(s.id));
    if (favoriteSongs.length === 0) {
        favoritesContent.innerHTML = '<p class="empty-state">No tienes canciones favoritas aún. ¡Dale ❤️ a las que te gusten!</p>';
    } else {
        favoritesContent.innerHTML = favoriteSongs.map((song, i) => createSongRow(song, i)).join('');
    }
}

// ============================================================
// HISTORIAL
// ============================================================

function renderHistory() {
    const historyContent = document.getElementById('historyContent');
    if (appState.listeningHistory.length === 0) {
        historyContent.innerHTML = '<p class="empty-state">Tu historial está vacío. ¡Empieza a escuchar!</p>';
        return;
    }
    historyContent.innerHTML = appState.listeningHistory.map(entry => {
        const song = appState.songs.find(s => s.id === entry.id);
        if (!song) return '';
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        const isCurrent = appState.currentSong && appState.currentSong.id === song.id;
        return `
        <div class="song-row ${isCurrent ? 'playing' : ''}" onclick="playSong(${song.id})">
            <div class="song-row-info">
                <div class="song-row-icon">🎵</div>
                <div class="song-row-details">
                    <div class="song-row-title">${escapeHtml(song.title)}</div>
                    <div class="song-row-artist">${escapeHtml(song.artist)}
                        <span class="genre-badge">${escapeHtml(song.genre)}</span>
                    </div>
                </div>
            </div>
            <div class="song-row-meta">
                <span class="history-date">${dateStr} · ${timeStr}</span>
                <span class="song-row-duration">${formatTime(song.duration)}</span>
            </div>
        </div>`;
    }).filter(Boolean).join('');
}

function clearHistory() {
    if (!confirm('¿Limpiar todo el historial?')) return;
    appState.listeningHistory = [];
    saveState();
    renderHistory();
    showToast('🗑️ Historial limpiado');
}

// ============================================================
// SONG ROW
// ============================================================

function createSongRow(song, index) {
    const isLiked = appState.likedSongs.includes(song.id);
    const hasLyrics = !!appState.lyricsData[song.id];
    const isCurrent = appState.currentSong && appState.currentSong.id === song.id;
    const stars = '★'.repeat(song.rating || 0) + '☆'.repeat(5 - (song.rating || 0));
    return `
        <div class="song-row ${isCurrent ? 'playing' : ''}" onclick="playSong(${song.id})">
            <div class="song-row-info">
                <div class="song-row-icon">
                    ${isCurrent ? '<div class="bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>' : '🎵'}
                </div>
                <div class="song-row-details">
                    <div class="song-row-title">${escapeHtml(song.title)}</div>
                    <div class="song-row-artist">${escapeHtml(song.artist)}
                        <span class="genre-badge" onclick="event.stopPropagation(); filterByGenre('${escapeHtml(song.genre)}')">${escapeHtml(song.genre)}</span>
                    </div>
                </div>
            </div>
            <div class="song-row-meta">
                <span class="star-rating" onclick="event.stopPropagation()" title="Valorar">
                    ${[1, 2, 3, 4, 5].map(n => `<span onclick="rateSong(${song.id},${n})" class="star ${(song.rating || 0) >= n ? 'star-on' : ''}">${(song.rating || 0) >= n ? '★' : '☆'}</span>`).join('')}
                </span>
                <span class="song-row-duration">${formatTime(song.duration)}</span>
                ${hasLyrics ? `<button onclick="event.stopPropagation(); showLyrics(${song.id})" class="song-row-lyrics-btn" title="Ver letra">🎤</button>` : ''}
                <button onclick="event.stopPropagation(); addToQueue(${song.id})" class="song-row-queue-btn" title="Añadir a cola">+</button>
                <button onclick="event.stopPropagation(); toggleLike(${song.id})" class="song-row-like ${isLiked ? 'active' : ''}">${isLiked ? '❤️' : '♡'}</button>
                <button onclick="event.stopPropagation(); showEditMetadata(${song.id})" class="song-row-edit-btn" title="Editar">✏️</button>
                <button onclick="event.stopPropagation(); deleteSong(${song.id})" class="song-row-delete-btn" title="Eliminar canción">🗑️</button>
            </div>
        </div>`;
}

// ============================================================
// BÚSQUEDA
// ============================================================

function handleSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const searchResults = document.getElementById('searchResults');
    if (!query) {
        searchResults.innerHTML = '<p class="empty-state">Escribe algo para buscar canciones...</p>';
        return;
    }
    const results = appState.songs.filter(song =>
        song.title.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.genre.toLowerCase().includes(query)
    );
    if (results.length === 0) {
        searchResults.innerHTML = '<p class="empty-state">No se encontraron resultados</p>';
    } else {
        // highlight
        searchResults.innerHTML = results.map((song, i) => createSongRow(song, i)).join('');
    }
}

// ============================================================
// REPRODUCTOR
// ============================================================

function playSong(songId, fromFade = false) {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;

    if (!fromFade && appState.isPlaying && appState.currentSong) {
        // Fade out
        const fadeOut = setInterval(() => {
            if (audioPlayer.volume > 0.05) {
                audioPlayer.volume = Math.max(0, audioPlayer.volume - 0.05);
            } else {
                clearInterval(fadeOut);
                audioPlayer.volume = (appState.lastVolume || 70) / 100;
                playSong(songId, true);
            }
        }, 40);
        return;
    }

    appState.currentSong = song;
    song.plays++;

    // Update player UI
    document.getElementById('playerTitle').textContent = song.title;
    document.getElementById('playerArtist').textContent = song.artist;
    const liked = appState.likedSongs.includes(song.id);
    document.getElementById('likeBtn').innerHTML = liked ? '❤️' : '♡';
    document.getElementById('likeBtn').classList.toggle('active', liked);

    // Now playing panel
    document.getElementById('nowPlayingTitle').textContent = song.title;
    document.getElementById('nowPlayingArtist').textContent = song.artist;
    const colors = ['#9d4edd,#5390d9', '#f093fb,#f5576c', '#4facfe,#00f2fe', '#43e97b,#38f9d7', '#fa709a,#fee140'];
    const g = colors[song.id % colors.length] || colors[0];
    document.getElementById('nowPlayingArt').style.background = `linear-gradient(135deg,${g})`;
    document.getElementById('nowPlayingLike').innerHTML = liked ? '❤️' : '♡';

    // Card highlight
    document.querySelectorAll('.card').forEach(c => c.classList.remove('card-playing'));

    // Audio
    if (song.file) {
        audioPlayer.src = song.file;
        audioPlayer.volume = (appState.lastVolume || 70) / 100;
        audioPlayer.playbackRate = appState.currentSpeed;
        audioPlayer.play();
        appState.isPlaying = true;
        setPlayIcon(true);
        startVisualizer();
    } else if (song.previewUrl) {
        audioPlayer.src = song.previewUrl;
        audioPlayer.volume = (appState.lastVolume || 70) / 100;
        audioPlayer.playbackRate = appState.currentSpeed;
        audioPlayer.play();
        appState.isPlaying = true;
        setPlayIcon(true);
        startVisualizer();
    } else {
        showToast('⚠️ Esta canción no tiene archivo de audio');
        setPlayIcon(false);
        appState.isPlaying = false;
    }

    // History entry
    appState.listeningHistory.unshift({ id: song.id, timestamp: Date.now() });
    if (appState.listeningHistory.length > 50) appState.listeningHistory.pop();

    saveState();
    if (appState.currentView === 'library') renderLibrary();
    if (appState.currentView === 'favorites') renderFavorites();
    if (appState.currentView === 'history') renderHistory();
    renderHome();
    if (focusModeActive) updateFocusModeUI();
}

function setPlayIcon(playing) {
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    if (!playIcon || !pauseIcon) return;
    playIcon.style.display = playing ? 'none' : 'block';
    pauseIcon.style.display = playing ? 'block' : 'none';
}

function togglePlay() {
    if (!appState.currentSong && appState.songs.length > 0) { playSong(appState.songs[0].id); return; }
    if (!appState.currentSong) { showToast('No hay canciones disponibles'); return; }
    if (appState.isPlaying) { audioPlayer.pause(); setPlayIcon(false); stopVisualizer(); }
    else { audioPlayer.play(); setPlayIcon(true); startVisualizer(); }
    appState.isPlaying = !appState.isPlaying;
}

function handleSongEnded() {
    // Check manual queue first
    if (appState.manualQueue.length > 0) {
        const nextId = appState.manualQueue.shift();
        playSong(nextId);
        renderQueue();
        return;
    }
    if (appState.repeat) { audioPlayer.currentTime = 0; audioPlayer.play(); return; }
    nextSong();
}

function nextSong() {
    // Check manual queue
    if (appState.manualQueue.length > 0) {
        const nextId = appState.manualQueue.shift();
        playSong(nextId);
        renderQueue();
        return;
    }
    if (!appState.currentSong) return;
    const pool = appState.songs;
    const currentIndex = pool.findIndex(s => s.id === appState.currentSong.id);
    let nextIndex;
    if (appState.shuffle) nextIndex = Math.floor(Math.random() * pool.length);
    else nextIndex = (currentIndex + 1) % pool.length;
    playSong(pool[nextIndex].id);
}

function prevSong() {
    if (!appState.currentSong) return;
    if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; return; }
    const pool = appState.songs;
    const currentIndex = pool.findIndex(s => s.id === appState.currentSong.id);
    const prevIndex = (currentIndex - 1 + pool.length) % pool.length;
    playSong(pool[prevIndex].id);
}

function toggleShuffle() {
    appState.shuffle = !appState.shuffle;
    document.getElementById('shuffleBtn').classList.toggle('active', appState.shuffle);
    showToast(appState.shuffle ? '🔀 Aleatorio activado' : '🔀 Aleatorio desactivado');
}

function toggleRepeat() {
    appState.repeat = !appState.repeat;
    document.getElementById('repeatBtn').classList.toggle('active', appState.repeat);
    audioPlayer.loop = appState.repeat;
    showToast(appState.repeat ? '🔁 Repetir activado' : '🔁 Repetir desactivado');
}

function updateProgress() {
    const { currentTime, duration } = audioPlayer;
    if (duration) {
        document.getElementById('progressFill').style.width = `${(currentTime / duration) * 100}%`;
        document.getElementById('currentTime').textContent = formatTime(currentTime);
        document.getElementById('duration').textContent = formatTime(duration);
    }
}

function toggleLike(id) {
    const songId = id || (appState.currentSong ? appState.currentSong.id : null);
    if (!songId) return;
    const index = appState.likedSongs.indexOf(songId);
    if (index === -1) { appState.likedSongs.push(songId); showToast('❤️ Agregado a favoritos'); }
    else { appState.likedSongs.splice(index, 1); showToast('♡ Eliminado de favoritos'); }
    const liked = appState.likedSongs.includes(songId);
    if (appState.currentSong && appState.currentSong.id === songId) {
        document.getElementById('likeBtn').innerHTML = liked ? '❤️' : '♡';
        document.getElementById('likeBtn').classList.toggle('active', liked);
        document.getElementById('nowPlayingLike').innerHTML = liked ? '❤️' : '♡';
    }
    saveState();
    if (appState.currentView === 'favorites') renderFavorites();
    if (appState.currentView === 'library') renderLibrary();
}

// ============================================================
// VELOCIDAD DE REPRODUCCIÓN
// ============================================================

function setSpeed(speed) {
    appState.currentSpeed = speed;
    audioPlayer.playbackRate = speed;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.speed-btn').forEach(b => {
        if (parseFloat(b.textContent) === speed) b.classList.add('active');
    });
    showToast(`⚡ Velocidad: ${speed}x`);
}

// ============================================================
// VISUALIZADOR
// ============================================================

let visualizerInterval = null;

function startVisualizer() {
    const bars = document.querySelectorAll('.np-bar');
    if (!bars.length) return;
    bars.forEach(b => b.style.animationPlayState = 'running');
    document.getElementById('nowPlayingArt').classList.add('np-art-playing');
}

function stopVisualizer() {
    const bars = document.querySelectorAll('.np-bar');
    bars.forEach(b => b.style.animationPlayState = 'paused');
    document.getElementById('nowPlayingArt').classList.remove('np-art-playing');
}

// ============================================================
// NOW PLAYING PANEL
// ============================================================

function toggleNowPlaying() {
    const panel = document.getElementById('nowPlayingPanel');
    appState.nowPlayingOpen = !appState.nowPlayingOpen;
    panel.classList.toggle('open', appState.nowPlayingOpen);
    document.getElementById('nowPlayingBtn').classList.toggle('active', appState.nowPlayingOpen);
    if (appState.nowPlayingOpen && appState.isPlaying) startVisualizer();
}

function closeNowPlaying() {
    appState.nowPlayingOpen = false;
    document.getElementById('nowPlayingPanel').classList.remove('open');
    document.getElementById('nowPlayingBtn').classList.remove('active');
}

// ============================================================
// COLA MANUAL
// ============================================================

function addToQueue(songId) {
    if (!songId) return;
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;
    appState.manualQueue.push(songId);
    showToast(`➕ "${song.title}" añadido a la cola`);
    if (document.getElementById('queuePanel').classList.contains('open')) renderQueue();
}

function clearManualQueue() {
    appState.manualQueue = [];
    renderQueue();
    showToast('🗑️ Cola limpiada');
}

function switchQueueTab(tab) {
    appState.activeQueueTab = tab;
    document.querySelectorAll('.queue-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.queue-tab').forEach(t => {
        if (t.textContent.toLowerCase().includes(tab === 'next' ? 'siguiente' : 'cola')) t.classList.add('active');
    });
    renderQueue();
}

function toggleQueue() {
    const panel = document.getElementById('queuePanel');
    const isOpen = panel.classList.contains('open');
    if (isOpen) { closeQueue(); }
    else { renderQueue(); panel.classList.add('open'); document.getElementById('queueBtn').classList.add('active'); }
}

function closeQueue() {
    document.getElementById('queuePanel').classList.remove('open');
    document.getElementById('queueBtn').classList.remove('active');
}

function renderQueue() {
    const content = document.getElementById('queueContent');
    const tab = appState.activeQueueTab;

    if (tab === 'manual') {
        if (appState.manualQueue.length === 0) {
            content.innerHTML = '<div class="queue-empty"><div style="font-size:2rem;margin-bottom:0.5rem">➕</div><div>La cola manual está vacía</div><div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.4rem">Añade canciones con el botón +</div></div>';
            return;
        }
        content.innerHTML = appState.manualQueue.map((id, i) => {
            const song = appState.songs.find(s => s.id === id);
            if (!song) return '';
            return `<div class="queue-item">
                <div class="queue-item-num">${i + 1}</div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${escapeHtml(song.title)}</div>
                    <div class="queue-item-artist">${escapeHtml(song.artist)}</div>
                </div>
                <div class="queue-item-duration">${formatTime(song.duration)}</div>
                <button onclick="appState.manualQueue.splice(${i},1); renderQueue()" class="queue-item-remove">✕</button>
            </div>`;
        }).filter(Boolean).join('');
        return;
    }

    // Next up
    if (appState.songs.length === 0) {
        content.innerHTML = '<div class="queue-empty"><div style="font-size:2rem;margin-bottom:0.5rem">🎵</div><div>La cola está vacía</div></div>';
        return;
    }
    const currentId = appState.currentSong ? appState.currentSong.id : null;
    content.innerHTML = appState.songs.map((song, i) => `
        <div class="queue-item ${song.id === currentId ? 'queue-item-active' : ''}" onclick="playSong(${song.id})">
            <div class="queue-item-num">${song.id === currentId ? '▶' : (i + 1)}</div>
            <div class="queue-item-info">
                <div class="queue-item-title">${escapeHtml(song.title)}</div>
                <div class="queue-item-artist">${escapeHtml(song.artist)}</div>
            </div>
            <div class="queue-item-duration">${formatTime(song.duration)}</div>
        </div>`).join('');
}

// ============================================================
// SUBIDA DE ARCHIVOS
// ============================================================

function triggerFileUpload() { fileInput.click(); }

function handleFiles(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const audioFiles = files.filter(f => f.type.startsWith('audio/'));
    if (audioFiles.length === 0) { showToast('❌ No se encontraron archivos de audio'); return; }
    let loaded = 0;
    audioFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const newSong = {
                id: Date.now() + Math.random(),
                title: file.name.replace(/\.[^/.]+$/, ''),
                artist: 'Mi Música',
                duration: 0,
                genre: 'Local',
                plays: 0,
                rating: 0,
                file: dataUrl
            };
            const tempAudio = new Audio();
            tempAudio.src = dataUrl;
            tempAudio.onloadedmetadata = () => {
                newSong.duration = tempAudio.duration;
                appState.songs.push(newSong);
                // Guardar archivo de audio en IndexedDB
                saveAudioToIDB(newSong.id, dataUrl);
                loaded++;
                if (loaded === audioFiles.length) {
                    renderLibrary(); renderHome();
                    showToast(`✅ ${loaded} canción${loaded !== 1 ? 'es' : ''} agregada${loaded !== 1 ? 's' : ''} y guardada${loaded !== 1 ? 's' : ''}`);
                    saveState();
                }
            };
            tempAudio.onerror = () => {
                loaded++;
                showToast(`❌ No se pudo leer "${file.name}"`);
                if (loaded === audioFiles.length && appState.songs.length > 0) {
                    renderLibrary(); renderHome(); saveState();
                }
            };
        };
        reader.readAsDataURL(file);
    });
    fileInput.value = '';
}

function toggleMute() {
    appState.isMuted = !appState.isMuted;
    audioPlayer.muted = appState.isMuted;
    updateVolumeUI(appState.isMuted ? 0 : appState.lastVolume);
}

function updateVolumeUI(val) {
    const fill = document.getElementById('volumeFill');
    const pct = document.getElementById('volumePct');
    const slider = document.getElementById('volumeSlider');
    const hi = document.getElementById('volHighIcon');
    const mid = document.getElementById('volMidIcon');
    const mute = document.getElementById('volMuteIcon');
    if (fill) fill.style.width = val + '%';
    if (pct) pct.textContent = Math.round(val);
    if (slider && !appState.isMuted) slider.value = val;
    const n = Number(val);
    if (hi) hi.style.display = (!appState.isMuted && n > 50) ? 'block' : 'none';
    if (mid) mid.style.display = (!appState.isMuted && n > 0 && n <= 50) ? 'block' : 'none';
    if (mute) mute.style.display = (appState.isMuted || n === 0) ? 'block' : 'none';
}

// ============================================================
// PLAYLISTS
// ============================================================

function showPlaylistModal() {
    document.getElementById('playlistModal').style.display = 'flex';
    setTimeout(() => document.getElementById('playlistNameInput').focus(), 50);
}

function hidePlaylistModal() {
    document.getElementById('playlistModal').style.display = 'none';
    document.getElementById('playlistNameInput').value = '';
}

function createPlaylist() {
    const name = document.getElementById('playlistNameInput').value.trim();
    if (!name) { showToast('⚠️ Ingresa un nombre'); return; }
    const newPlaylist = { id: Date.now(), name, songs: [], createdAt: Date.now() };
    appState.playlists.push(newPlaylist);
    renderPlaylists();
    hidePlaylistModal();
    showToast(`✅ Playlist "${name}" creada`);
    saveState();
}

function renderPlaylists() {
    const list = document.getElementById('playlistsList');
    if (appState.playlists.length === 0) {
        list.innerHTML = '<li style="padding:1rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.82rem">Sin playlists</li>';
    } else {
        list.innerHTML = appState.playlists.map(p => `
            <li class="playlist-item" onclick="viewPlaylist(${p.id})">
                <span class="playlist-icon">📁</span>
                <span class="playlist-name">${escapeHtml(p.name)}</span>
                <span class="playlist-count">${p.songs.length}</span>
            </li>`).join('');
    }
}

function viewPlaylist(playlistId) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    appState.activePlaylistId = playlistId;
    document.getElementById('playlistDetailTitle').textContent = `📁 ${playlist.name}`;
    renderPlaylistDetailSongs(playlist);
    document.getElementById('playlistDetailModal').classList.add('open');
}

function hidePlaylistDetail() {
    document.getElementById('playlistDetailModal').classList.remove('open');
    appState.activePlaylistId = null;
}

function renderPlaylistDetailSongs(playlist) {
    const container = document.getElementById('playlistDetailSongs');
    if (!playlist.songs || playlist.songs.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem 0">Playlist vacía.<br>Agrega canciones con el botón ➕</p>`;
        return;
    }
    container.innerHTML = playlist.songs.map((songId, idx) => {
        const song = appState.songs.find(s => s.id === songId);
        if (!song) return '';
        const isLiked = appState.likedSongs.includes(song.id);
        const isCurrent = appState.currentSong && appState.currentSong.id === song.id;
        return `
        <div class="song-row ${isCurrent ? 'song-row-active' : ''}" onclick="playPlaylistSong(${playlist.id}, ${idx})">
            <div class="song-row-info">
                <div class="song-row-num">${isCurrent ? '▶' : (idx + 1)}</div>
                <div class="song-row-details">
                    <div class="song-row-title">${escapeHtml(song.title)}</div>
                    <div class="song-row-artist">${escapeHtml(song.artist)}</div>
                </div>
            </div>
            <div class="song-row-meta">
                <span class="song-row-duration">${formatTime(song.duration)}</span>
                <button onclick="event.stopPropagation(); toggleLike(${song.id})" class="song-row-like ${isLiked ? 'active' : ''}">${isLiked ? '❤️' : '♡'}</button>
                <button onclick="event.stopPropagation(); removeSongFromPlaylist(${playlist.id}, ${songId})" class="song-row-remove" title="Quitar">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        </div>`;
    }).filter(Boolean).join('');
}

function playPlaylistSong(playlistId, index) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist || !playlist.songs[index]) return;
    appState.playlistQueue = playlist.songs;
    appState.playlistQueueIndex = index;
    playSong(playlist.songs[index]);
    renderPlaylistDetailSongs(playlist);
}

function playPlaylistFromStart() {
    const playlist = appState.playlists.find(p => p.id === appState.activePlaylistId);
    if (!playlist || playlist.songs.length === 0) { showToast('⚠️ La playlist está vacía'); return; }
    playPlaylistSong(playlist.id, 0);
    showToast(`▶️ Reproduciendo: ${playlist.name}`);
}

function removeSongFromPlaylist(playlistId, songId) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    playlist.songs = playlist.songs.filter(id => id !== songId);
    renderPlaylistDetailSongs(playlist);
    saveState();
    showToast('🗑️ Canción eliminada de la playlist');
}

function deleteCurrentPlaylist() {
    const playlist = appState.playlists.find(p => p.id === appState.activePlaylistId);
    if (!playlist) return;
    if (!confirm(`¿Eliminar la playlist "${playlist.name}"?`)) return;
    appState.playlists = appState.playlists.filter(p => p.id !== appState.activePlaylistId);
    renderPlaylists();
    hidePlaylistDetail();
    saveState();
    showToast(`🗑️ Playlist "${playlist.name}" eliminada`);
}

function openAddSongsToPlaylist() {
    const playlist = appState.playlists.find(p => p.id === appState.activePlaylistId);
    if (!playlist) return;
    document.getElementById('addSongsTitle').textContent = `➕ Agregar a: ${playlist.name}`;
    const picker = document.getElementById('songsPicker');
    picker.innerHTML = appState.songs.map(song => {
        const inPlaylist = playlist.songs.includes(song.id);
        return `
        <label class="picker-item ${inPlaylist ? 'picker-item-in' : ''}">
            <input type="checkbox" value="${song.id}" ${inPlaylist ? 'checked' : ''} class="picker-checkbox">
            <div class="picker-info">
                <span class="picker-title">${escapeHtml(song.title)}</span>
                <span class="picker-artist">${escapeHtml(song.artist)}</span>
            </div>
            ${inPlaylist ? '<span class="picker-tag">Ya agregada</span>' : ''}
        </label>`;
    }).join('');
    document.getElementById('addSongsModal').classList.add('open');
}

function hideAddSongsModal() { document.getElementById('addSongsModal').classList.remove('open'); }

function saveAddSongs() {
    const playlist = appState.playlists.find(p => p.id === appState.activePlaylistId);
    if (!playlist) return;
    const checked = [...document.querySelectorAll('.picker-checkbox:checked')].map(cb => Number(cb.value));
    playlist.songs = checked;
    hideAddSongsModal();
    renderPlaylistDetailSongs(playlist);
    renderPlaylists();
    saveState();
    showToast(`✅ Playlist actualizada (${checked.length} canciones)`);
}

// EXPORT / IMPORT PLAYLIST
function exportPlaylist() {
    const playlist = appState.playlists.find(p => p.id === appState.activePlaylistId);
    if (!playlist) return;
    const songs = playlist.songs.map(id => {
        const s = appState.songs.find(s => s.id === id);
        return s ? { title: s.title, artist: s.artist, genre: s.genre, duration: s.duration } : null;
    }).filter(Boolean);
    const data = JSON.stringify({ name: playlist.name, songs }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${playlist.name}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('📤 Playlist exportada');
}

function importPlaylist() {
    const input = document.getElementById('importPlaylistInput');
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            const newPlaylist = { id: Date.now(), name: data.name || 'Importada', songs: [], createdAt: Date.now() };
            data.songs.forEach(s => {
                const existing = appState.songs.find(es => es.title === s.title && es.artist === s.artist);
                if (existing) newPlaylist.songs.push(existing.id);
            });
            appState.playlists.push(newPlaylist);
            renderPlaylists();
            saveState();
            showToast(`📥 Playlist "${newPlaylist.name}" importada`);
        } catch (err) { showToast('❌ Archivo inválido'); }
    };
    reader.readAsText(file);
    input.value = '';
}

// ============================================================
// TEMA
// ============================================================

function toggleTheme() {
    const body = document.body;
    const btn = document.getElementById('themeBtn');
    body.classList.toggle('light-mode');
    const isLight = body.classList.contains('light-mode');
    btn.textContent = isLight ? '☀️' : '🌙';
}

// ============================================================
// TEMPORIZADOR DE SUEÑO
// ============================================================

let sleepTimerTimeout = null;

function showSleepTimer() { document.getElementById('sleepTimerModal').classList.add('open'); }
function hideSleepTimer() { document.getElementById('sleepTimerModal').classList.remove('open'); }

function setSleepTimer(minutes) {
    if (sleepTimerTimeout) { clearTimeout(sleepTimerTimeout); sleepTimerTimeout = null; }
    const btn = document.getElementById('sleepTimerBtn');
    if (minutes === 0) { btn.style.color = ''; btn.title = 'Temporizador'; showToast('⏰ Temporizador cancelado'); hideSleepTimer(); return; }
    sleepTimerTimeout = setTimeout(() => {
        audioPlayer.pause(); appState.isPlaying = false; setPlayIcon(false); stopVisualizer();
        showToast('😴 Música pausada por el temporizador');
        btn.style.color = ''; sleepTimerTimeout = null;
    }, minutes * 60 * 1000);
    btn.style.color = '#f093fb'; btn.title = `Timer: ${minutes} min`;
    showToast(`⏰ La música se pausará en ${minutes} minutos`);
    hideSleepTimer();
}

// ============================================================
// ECUALIZADOR
// ============================================================

function showEqModal() { document.getElementById('eqModal').classList.add('open'); }
function hideEqModal() { document.getElementById('eqModal').classList.remove('open'); }

function applyEqPreset(preset) {
    document.querySelectorAll('.eq-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.eq-btn[data-preset="${preset}"]`);
    if (btn) btn.classList.add('active');
    const names = { flat: 'Plano', bass: 'Bajo+', treble: 'Agudos+', vocal: 'Vocal', electronic: 'Electrónica', acoustic: 'Acústica' };
    document.getElementById('eqBtn').style.color = preset === 'flat' ? '' : '#f093fb';
    showToast(`🎚️ Preset: ${names[preset] || preset}`);
    hideEqModal();
}

// ============================================================
// ESTADÍSTICAS
// ============================================================

function showStats() {
    const content = document.getElementById('statsContent');
    const totalSongs = appState.songs.length;
    const totalLiked = appState.likedSongs.length;
    const totalPlayed = appState.listeningHistory.length;
    const totalPlaylists = appState.playlists.length;
    const totalMinutes = Math.round(appState.listeningHistory.reduce((acc, e) => {
        const s = appState.songs.find(s => s.id === e.id);
        return acc + (s ? s.duration : 0);
    }, 0) / 60);

    const topSongs = [...appState.songs].sort((a, b) => b.plays - a.plays).slice(0, 3).filter(s => s.plays > 0);
    const genreCount = appState.songs.reduce((acc, s) => { acc[s.genre] = (acc[s.genre] || 0) + s.plays; return acc; }, {});
    const topGenre = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0];
    const topRated = [...appState.songs].filter(s => s.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 3);

    content.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${totalSongs}</div><div class="stat-label">Canciones</div></div>
            <div class="stat-card"><div class="stat-value">${totalLiked}</div><div class="stat-label">Favoritas</div></div>
            <div class="stat-card"><div class="stat-value">${totalPlayed}</div><div class="stat-label">Reproducciones</div></div>
            <div class="stat-card"><div class="stat-value">${totalPlaylists}</div><div class="stat-label">Playlists</div></div>
            <div class="stat-card"><div class="stat-value">${totalMinutes}</div><div class="stat-label">Min. escuchados</div></div>
            <div class="stat-card"><div class="stat-value">${appState.likedSongs.length}</div><div class="stat-label">Me gusta</div></div>
        </div>
        ${topSongs.length > 0 ? `
        <div style="margin-top:1.2rem">
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.6rem;font-weight:600">🎵 Más escuchadas</div>
            ${topSongs.map((s, i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
                    <span style="font-size:0.9rem">${i + 1}. ${escapeHtml(s.title)}</span>
                    <span style="font-size:0.8rem;color:var(--text-muted)">${s.plays} plays</span>
                </div>`).join('')}
        </div>` : ''}
        ${topRated.length > 0 ? `
        <div style="margin-top:1.2rem">
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.6rem;font-weight:600">⭐ Mejor valoradas</div>
            ${topRated.map(s => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
                    <span style="font-size:0.9rem">${escapeHtml(s.title)}</span>
                    <span style="color:#fbbf24">${'★'.repeat(s.rating)}</span>
                </div>`).join('')}
        </div>` : ''}
        ${topGenre ? `<div style="margin-top:1rem;font-size:0.88rem;color:var(--text-secondary)">🎸 Género favorito: <strong style="color:var(--text-primary)">${topGenre[0]}</strong></div>` : ''}
    `;
    document.getElementById('statsModal').classList.add('open');
}

function hideStats() { document.getElementById('statsModal').classList.remove('open'); }

// ============================================================
// VALORAR CANCIONES
// ============================================================

function rateSong(songId, rating) {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;
    song.rating = song.rating === rating ? 0 : rating;
    saveState();
    if (appState.currentView === 'library') renderLibrary();
    if (appState.currentView === 'favorites') renderFavorites();
    showToast(song.rating ? `⭐ Valoración: ${song.rating}/5` : '☆ Valoración eliminada');
}

// ============================================================
// EDITAR METADATOS
// ============================================================

function showEditMetadata(songId) {
    const id = songId || (appState.currentSong ? appState.currentSong.id : null);
    if (!id) { showToast('⚠️ No hay canción seleccionada'); return; }
    const song = appState.songs.find(s => s.id === id);
    if (!song) return;
    appState.editingMetadataId = id;
    document.getElementById('editTitle').value = song.title;
    document.getElementById('editArtist').value = song.artist;
    document.getElementById('editGenre').value = song.genre;
    document.getElementById('editMetadataModal').classList.add('open');
}

function hideEditMetadata() {
    document.getElementById('editMetadataModal').classList.remove('open');
    appState.editingMetadataId = null;
}

function saveMetadata() {
    const song = appState.songs.find(s => s.id === appState.editingMetadataId);
    if (!song) return;
    song.title = document.getElementById('editTitle').value.trim() || song.title;
    song.artist = document.getElementById('editArtist').value.trim() || song.artist;
    song.genre = document.getElementById('editGenre').value;
    // Update player if current
    if (appState.currentSong && appState.currentSong.id === song.id) {
        document.getElementById('playerTitle').textContent = song.title;
        document.getElementById('playerArtist').textContent = song.artist;
        document.getElementById('nowPlayingTitle').textContent = song.title;
        document.getElementById('nowPlayingArtist').textContent = song.artist;
        appState.currentSong = song;
    }
    saveState();
    hideEditMetadata();
    if (appState.currentView === 'library') renderLibrary();
    if (appState.currentView === 'favorites') renderFavorites();
    renderHome();
    showToast('✅ Información actualizada');
}

function deleteSong(songId) {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;
    if (!confirm(`¿Eliminar "${song.title}" de tu biblioteca?`)) return;
    // Si es la canción actual, detener reproducción
    if (appState.currentSong && appState.currentSong.id === songId) {
        audioPlayer.pause();
        audioPlayer.src = '';
        appState.currentSong = null;
        appState.isPlaying = false;
        setPlayIcon(false);
        stopVisualizer();
        document.getElementById('playerTitle').textContent = 'Sin canción';
        document.getElementById('playerArtist').textContent = '—';
    }
    // Eliminar de todas las playlists
    appState.playlists.forEach(p => { p.songs = p.songs.filter(id => id !== songId); });
    // Eliminar de favoritos e historial
    appState.likedSongs = appState.likedSongs.filter(id => id !== songId);
    appState.listeningHistory = appState.listeningHistory.filter(e => e.id !== songId);
    // Eliminar de canciones
    appState.songs = appState.songs.filter(s => s.id !== songId);
    // Eliminar archivo de IndexedDB
    deleteAudioFromIDB(songId);
    saveState();
    renderPlaylists();
    if (appState.currentView === 'library') renderLibrary();
    if (appState.currentView === 'favorites') renderFavorites();
    if (appState.currentView === 'history') renderHistory();
    renderHome();
    showToast(`🗑️ "${song.title}" eliminada`);
}

// ============================================================
// COMPARTIR
// ============================================================

function shareSong() {
    const song = appState.currentSong;
    if (!song) { showToast('⚠️ No hay canción seleccionada'); return; }
    const content = document.getElementById('shareContent');
    const shareText = `🎵 Escuchando "${song.title}" de ${song.artist} en Music Flow`;
    content.innerHTML = `
        <div class="share-card">
            <div class="share-art" style="background:linear-gradient(135deg,#9d4edd,#5390d9)">🎵</div>
            <div class="share-info">
                <div class="share-title">${escapeHtml(song.title)}</div>
                <div class="share-artist">${escapeHtml(song.artist)}</div>
                <div class="share-genre">${escapeHtml(song.genre)}</div>
            </div>
        </div>
        <div class="share-text-box" id="shareTextBox">${escapeHtml(shareText)}</div>
        <div class="share-buttons">
            <button class="share-btn" onclick="copyShareText()">📋 Copiar texto</button>
            ${navigator.share ? `<button class="share-btn share-btn-primary" onclick="nativeShare()">📤 Compartir</button>` : ''}
            <button class="share-btn" onclick="downloadShareCard()">🖼️ Guardar imagen</button>
        </div>`;
    document.getElementById('shareModal').classList.add('open');
}

function copyShareText() {
    const song = appState.currentSong;
    if (!song) return;
    const text = `🎵 Escuchando "${song.title}" de ${song.artist} en Music Flow`;
    navigator.clipboard.writeText(text).then(() => showToast('📋 Texto copiado')).catch(() => showToast('❌ No se pudo copiar'));
}

function nativeShare() {
    const song = appState.currentSong;
    if (!song || !navigator.share) return;
    navigator.share({ title: song.title, text: `Escuchando "${song.title}" de ${song.artist}`, url: window.location.href });
}

function downloadShareCard() {
    const song = appState.currentSong;
    if (!song) return;
    // Create a simple canvas card
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 600, 300);
    grad.addColorStop(0, '#2d1b69'); grad.addColorStop(1, '#0d0d20');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 600, 300);
    ctx.fillStyle = '#c77dff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('🎵 Music Flow', 40, 60);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px sans-serif'; ctx.fillText(song.title, 40, 130);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '22px sans-serif'; ctx.fillText(song.artist, 40, 175);
    ctx.fillStyle = '#c77dff'; ctx.font = '18px sans-serif'; ctx.fillText(song.genre, 40, 215);
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${song.title}.png`;
        a.click(); URL.revokeObjectURL(url);
    });
    showToast('🖼️ Imagen guardada');
}

function hideShareModal() { document.getElementById('shareModal').classList.remove('open'); }

// ============================================================
// MIX INTELIGENTE
// ============================================================

function showSmartMixModal() {
    const content = document.getElementById('smartMixContent');
    const genreCount = {};
    appState.listeningHistory.forEach(e => {
        const s = appState.songs.find(s => s.id === e.id);
        if (s) genreCount[s.genre] = (genreCount[s.genre] || 0) + 1;
    });
    appState.likedSongs.forEach(id => {
        const s = appState.songs.find(s => s.id === id);
        if (s) genreCount[s.genre] = (genreCount[s.genre] || 0) + 2;
    });

    const favGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    let mixSongs = favGenres.length > 0
        ? appState.songs.filter(s => favGenres.includes(s.genre))
        : [...appState.songs];

    // Add some random discovery
    const unexplored = appState.songs.filter(s => s.plays === 0 && !mixSongs.includes(s));
    const discovery = unexplored.slice(0, Math.min(2, unexplored.length));
    mixSongs = [...mixSongs, ...discovery];

    // Shuffle the mix
    mixSongs = mixSongs.sort(() => Math.random() - 0.5).slice(0, Math.min(10, mixSongs.length));
    appState.smartMixList = mixSongs.map(s => s.id);

    if (mixSongs.length === 0) {
        content.innerHTML = '<p class="empty-state">No hay suficientes canciones para el mix. ¡Sube más música!</p>';
    } else {
        content.innerHTML = `
            <div class="smart-mix-info">
                <div class="smart-mix-genres">
                    ${favGenres.length > 0 ? `Basado en: ${favGenres.map(g => `<span class="genre-badge">${g}</span>`).join(' ')}` : '🎲 Mix aleatorio'}
                </div>
            </div>
            <div class="smart-mix-songs">
                ${mixSongs.map((s, i) => `
                    <div class="smart-mix-item">
                        <span class="smart-mix-num">${i + 1}</span>
                        <div class="smart-mix-info-text">
                            <div class="smart-mix-title">${escapeHtml(s.title)}</div>
                            <div class="smart-mix-artist">${escapeHtml(s.artist)}</div>
                        </div>
                        <span class="genre-badge">${escapeHtml(s.genre)}</span>
                        <span class="smart-mix-dur">${formatTime(s.duration)}</span>
                    </div>`).join('')}
            </div>`;
    }
    document.getElementById('smartMixModal').classList.add('open');
}

function hideSmartMixModal() { document.getElementById('smartMixModal').classList.remove('open'); }

function playSmartMix() {
    if (appState.smartMixList.length === 0) { showToast('⚠️ No hay canciones en el mix'); return; }
    appState.manualQueue = [...appState.smartMixList.slice(1)];
    playSong(appState.smartMixList[0]);
    hideSmartMixModal();
    showToast('🎲 Mix inteligente iniciado');
}

// ============================================================
// GÉNEROS
// ============================================================

function getGenres() { return [...new Set(appState.songs.map(s => s.genre))].sort(); }

function renderGenreChips() {
    const container = document.getElementById('filterChips');
    if (!container) return;
    const genres = getGenres();
    if (genres.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <button class="genre-chip ${!appState.activeGenreFilter ? 'active' : ''}" onclick="filterByGenre(null)">Todos</button>
        ${genres.map(g => `<button class="genre-chip ${appState.activeGenreFilter === g ? 'active' : ''}" onclick="filterByGenre('${escapeHtml(g)}')">${escapeHtml(g)}</button>`).join('')}`;
}

function filterByGenre(genre) {
    appState.activeGenreFilter = genre;
    renderLibrary();
    if (appState.currentView !== 'library') showView('library');
    if (genre) showToast(`🎸 Filtrando por: ${genre}`);
}

function showGenreModal() {
    const genres = getGenres();
    const modal = document.getElementById('genreModal');
    const content = document.getElementById('genreModalContent');
    const genreEmojis = { 'Electronic': '⚡', 'Pop': '🌟', 'Hip Hop': '🎤', 'Rock': '🎸', 'Jazz': '🎷', 'Classical': '🎻', 'Ambient': '🌊', 'R&B': '🎶', 'Latin': '💃', 'Local': '📁', 'Reggaeton': '🔥' };
    content.innerHTML = genres.length === 0 ? '<p class="empty-state">No hay géneros disponibles.</p>' :
        `<div class="genre-modal-grid">${genres.map(g => {
            const count = appState.songs.filter(s => s.genre === g).length;
            return `<div class="genre-modal-card ${appState.activeGenreFilter === g ? 'active' : ''}" onclick="filterByGenre('${escapeHtml(g)}'); hideGenreModal()">
                <div class="genre-modal-emoji">${genreEmojis[g] || '🎵'}</div>
                <div class="genre-modal-name">${escapeHtml(g)}</div>
                <div class="genre-modal-count">${count} canción${count !== 1 ? 'es' : ''}</div>
            </div>`;
        }).join('')}</div>`;
    modal.classList.add('open');
}

function hideGenreModal() { document.getElementById('genreModal').classList.remove('open'); }

// ============================================================
// LETRAS & KARAOKE
// ============================================================

function showLyrics(songId) {
    const id = songId || (appState.currentSong ? appState.currentSong.id : null);
    if (!id) { showToast('⚠️ No hay canción seleccionada'); return; }
    const song = appState.songs.find(s => s.id === id);
    const lyrics = appState.lyricsData[id];
    const modal = document.getElementById('lyricsModal');
    document.getElementById('lyricsTitle').textContent = song ? `🎤 ${song.title} — ${song.artist}` : '🎤 Letra';
    const body = document.getElementById('lyricsBody');
    if (!lyrics) {
        body.innerHTML = '<p class="empty-state">No hay letra disponible para esta canción.</p>';
    } else {
        body.innerHTML = `<div class="lyrics-lines">${lyrics.lines.map((l, i) =>
            `<p class="lyrics-line" data-index="${i}" data-time="${l.time}">${escapeHtml(l.text)}</p>`).join('')}</div>`;
    }
    modal.classList.add('open');
    if (appState.currentSong && appState.currentSong.id === id && appState.isPlaying) updateLyricsHighlight();
}

function hideLyricsModal() { document.getElementById('lyricsModal').classList.remove('open'); if (appState.karaokeActive) stopKaraoke(); }

function updateLyricsHighlight() {
    const lyrics = appState.lyricsData[appState.currentSong?.id];
    if (!lyrics) return;
    const currentTime = audioPlayer.currentTime;
    let activeIndex = 0;
    lyrics.lines.forEach((line, i) => { if (currentTime >= line.time) activeIndex = i; });
    document.querySelectorAll('.lyrics-line').forEach((el, i) => {
        el.classList.toggle('active', i === activeIndex);
        if (i === activeIndex) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

let karaokeInterval = null;

function toggleKaraoke() { appState.karaokeActive ? stopKaraoke() : startKaraoke(); }

function startKaraoke() {
    if (!appState.currentSong) { showToast('▶️ Reproduce una canción primero'); return; }
    if (!appState.lyricsData[appState.currentSong.id]) { showToast('⚠️ No hay letra para esta canción'); return; }
    appState.karaokeActive = true;
    document.getElementById('karaokeBtn').classList.add('active');
    document.getElementById('karaokeBtn').style.color = '#f093fb';
    showLyrics(appState.currentSong.id);
    document.getElementById('lyricsModal').classList.add('karaoke-mode');
    document.getElementById('karaokeToggleBtn').textContent = '🎤 Detener Karaoke';
    karaokeInterval = setInterval(() => { if (appState.isPlaying) updateLyricsHighlight(); }, 300);
    showToast('🎤 Modo karaoke activado');
}

function stopKaraoke() {
    appState.karaokeActive = false;
    clearInterval(karaokeInterval);
    karaokeInterval = null;
    document.getElementById('karaokeBtn').classList.remove('active');
    document.getElementById('karaokeBtn').style.color = '';
    document.getElementById('lyricsModal').classList.remove('karaoke-mode');
    const btn = document.getElementById('karaokeToggleBtn');
    if (btn) btn.textContent = '🎤 Iniciar Karaoke';
    showToast('🎤 Modo karaoke desactivado');
}

audioPlayer.addEventListener('timeupdate', () => {
    if (appState.karaokeActive && document.getElementById('lyricsModal').classList.contains('open')) updateLyricsHighlight();
});

// ============================================================
// TOASTS
// ============================================================

function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================
// UTILIDADES
// ============================================================

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// INICIALIZAR
// ============================================================

// ============================================================
// MENÚ "MÁS OPCIONES"
// ============================================================

function toggleMoreMenu() {
    const menu = document.getElementById('moreMenu');
    const wrap = document.getElementById('moreMenuWrap');
    const isOpen = wrap.classList.contains('open');
    if (isOpen) closeMoreMenu();
    else { wrap.classList.add('open'); }
}

function closeMoreMenu() {
    document.getElementById('moreMenuWrap').classList.remove('open');
}

document.addEventListener('click', (e) => {
    const wrap = document.getElementById('moreMenuWrap');
    if (wrap && !wrap.contains(e.target)) closeMoreMenu();
});

// ============================================================
// MODO SIN DISTRACCIONES (FOCUS MODE)
// ============================================================

let focusModeActive = false;
let focusProgressInterval = null;

function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    const overlay = document.getElementById('focusModeOverlay');
    const btn = document.getElementById('focusModeBtn');

    if (focusModeActive) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('focus-open'));
        btn.classList.add('active');
        btn.title = 'Salir del modo sin distracciones (F)';
        updateFocusModeUI();
        focusProgressInterval = setInterval(updateFocusProgress, 500);
        // Intentar pantalla completa
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { });
        }
    } else {
        overlay.classList.remove('focus-open');
        setTimeout(() => { overlay.style.display = 'none'; }, 400);
        btn.classList.remove('active');
        btn.title = 'Modo sin distracciones (F)';
        clearInterval(focusProgressInterval);
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
    }
}

function updateFocusModeUI() {
    const song = appState.currentSong;
    const colors = ['#9d4edd,#5390d9', '#f093fb,#f5576c', '#4facfe,#00f2fe', '#43e97b,#38f9d7', '#fa709a,#fee140'];

    if (song) {
        document.getElementById('focusTitle').textContent = song.title;
        document.getElementById('focusArtist').textContent = song.artist;
        const gradient = colors[song.id % colors.length] || colors[0];
        document.getElementById('focusArt').style.background = `linear-gradient(135deg,${gradient})`;
        document.getElementById('focusArt').textContent = '🎵';
        document.getElementById('focusOverlayBg').style.background =
            `linear-gradient(135deg, ${gradient.split(',')[0]}33, #0d0d14 60%)`;
    } else {
        document.getElementById('focusTitle').textContent = 'Sin canción';
        document.getElementById('focusArtist').textContent = '—';
        document.getElementById('focusArt').style.background = 'var(--bg-card)';
    }

    // Sync play/pause icons
    const playing = appState.isPlaying;
    document.getElementById('focusPlayIcon').style.display = playing ? 'none' : 'block';
    document.getElementById('focusPauseIcon').style.display = playing ? 'block' : 'none';

    // Sync like button
    const liked = song && appState.likedSongs.includes(song.id);
    document.getElementById('focusLikeBtn').innerHTML = liked ? '❤️' : '♡';

    // Sync shuffle
    document.getElementById('focusShuffleBtn').classList.toggle('active', appState.shuffle);

    // Sync visualizer bars
    const bars = document.querySelectorAll('.focus-bar');
    bars.forEach(b => { b.style.animationPlayState = playing ? 'running' : 'paused'; });
}

function updateFocusProgress() {
    if (!focusModeActive) return;
    const { currentTime, duration } = audioPlayer;
    document.getElementById('focusCurrentTime').textContent = formatTime(currentTime);
    document.getElementById('focusDuration').textContent = formatTime(duration);
    if (duration) {
        document.getElementById('focusProgressFill').style.width = `${(currentTime / duration) * 100}%`;
    }
    // Keep play/pause synced
    document.getElementById('focusPlayIcon').style.display = appState.isPlaying ? 'none' : 'block';
    document.getElementById('focusPauseIcon').style.display = appState.isPlaying ? 'block' : 'none';
    const bars = document.querySelectorAll('.focus-bar');
    bars.forEach(b => { b.style.animationPlayState = appState.isPlaying ? 'running' : 'paused'; });
}

// Click en la barra de progreso del focus mode
document.addEventListener('DOMContentLoaded', () => {
    const fpt = document.getElementById('focusProgressTrack');
    if (fpt) {
        fpt.addEventListener('click', (e) => {
            const rect = fpt.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            if (audioPlayer.duration) audioPlayer.currentTime = pos * audioPlayer.duration;
        });
    }
});

// Actualizar focus mode cuando cambia la canción
const _originalPlaySong = typeof playSong === 'function' ? playSong : null;

audioPlayer.addEventListener('play', () => { if (focusModeActive) updateFocusModeUI(); });
audioPlayer.addEventListener('pause', () => { if (focusModeActive) updateFocusModeUI(); });

// Atajo de teclado F y Escape para focus mode
document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    if (e.key === 'f' || e.key === 'F') toggleFocusMode();
    if (e.key === 'Escape' && focusModeActive) toggleFocusMode();
});

// ============================================================
// EXPORTAR PLAYLIST COMO M3U
// ============================================================

function exportPlaylistM3U() {
    const playlist = appState.playlists.find(p => p.id === appState.activePlaylistId);
    if (!playlist) return;
    if (playlist.songs.length === 0) { showToast('⚠️ La playlist está vacía'); return; }

    const songs = playlist.songs.map(id => appState.songs.find(s => s.id === id)).filter(Boolean);

    let m3u = '#EXTM3U\n';
    m3u += `#PLAYLIST:${playlist.name}\n\n`;
    songs.forEach(s => {
        const duration = Math.round(s.duration) || -1;
        m3u += `#EXTINF:${duration},${s.artist} - ${s.title}\n`;
        // Si la canción tiene URL de archivo local, la omitimos (no es portable)
        // Usamos el nombre como referencia simbólica
        m3u += `${s.title}.mp3\n\n`;
    });

    const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlist.name}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`📋 Playlist exportada como M3U (${songs.length} canciones)`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();