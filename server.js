// ============================================
// MUSIC FLOW — COMPLETE REWRITE
// Features: Dark/Light mode, Queue, Playlist view,
//           Toast notifications, Bug fixes
// ============================================

let appState = {
    currentUser: null,
    users: [],
    songs: [],
    playlists: [],
    likedSongs: [],
    currentSong: null,
    isPlaying: false,
    listeningHistory: [],
    currentView: 'home',
    currentPlaylistId: null,
    isAuthMode: 'login',
    shuffle: false,
    repeat: false,
    mobileMenuOpen: false,
    queue: [],           // Cola de reproducción manual
    queueOpen: false,
    darkMode: true,
    currentFilter: 'all'
};

// DOM refs
const authScreen = document.getElementById('authScreen');
const mainApp = document.getElementById('mainApp');
const audioPlayer = document.getElementById('audioPlayer');
const fileInput = document.getElementById('fileInput');

// ============================================
// TOAST SYSTEM (replaces all alert() calls)
// ============================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

// ============================================
// INIT
// ============================================
function init() {
    if (appState.songs.length === 0) {
        const colors = ['#9d4edd', '#5390d9', '#4ade80', '#f59e0b', '#ef4444'];
        appState.songs = [
            { id: 1, title: 'Summer Vibes', artist: 'DJ Sunset', duration: 234, genre: 'Electronic', plays: 12, color: colors[0] },
            { id: 2, title: 'Midnight Dreams', artist: 'Luna Nova', duration: 198, genre: 'Pop', plays: 8, color: colors[1] },
            { id: 3, title: 'Urban Flow', artist: 'Street Beats', duration: 267, genre: 'Hip Hop', plays: 21, color: colors[2] },
            { id: 4, title: 'Neon Lights', artist: 'Synth Wave', duration: 245, genre: 'Electronic', plays: 5, color: colors[3] },
            { id: 5, title: 'Ocean Breeze', artist: 'Chill Wave', duration: 212, genre: 'Ambient', plays: 17, color: colors[4] },
            { id: 6, title: 'Velvet Thunder', artist: 'Storm Project', duration: 189, genre: 'Rock', plays: 9, color: colors[0] },
            { id: 7, title: 'Golden Hour', artist: 'Sol Rivera', duration: 221, genre: 'Pop', plays: 30, color: colors[1] },
            { id: 8, title: 'Deep Space', artist: 'Astro Collective', duration: 278, genre: 'Electronic', plays: 14, color: colors[2] },
        ];
    }

    setupEventListeners();
    renderHome();

    // Restore dark/light preference
    if (!appState.darkMode) {
        document.body.classList.add('light-mode');
    }
    updateThemeBtn();
}

function setupEventListeners() {
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleSongEnd);

    fileInput.addEventListener('change', handleFiles);

    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('active'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('active');
            handleFiles({ target: { files: e.dataTransfer.files } });
        });
        dropZone.addEventListener('click', triggerFileUpload);
    }

    document.getElementById('volumeSlider').addEventListener('input', e => {
        audioPlayer.volume = e.target.value / 100;
    });

    document.querySelector('.progress-track').addEventListener('click', e => {
        if (!audioPlayer.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        audioPlayer.currentTime = ((e.clientX - rect.left) / rect.width) * audioPlayer.duration;
    });

    // Close mobile sidebar when clicking outside
    document.addEventListener('click', e => {
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.querySelector('.mobile-menu-btn');
        if (appState.mobileMenuOpen && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
            toggleMobileMenu();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
        if (e.code === 'ArrowRight') nextSong();
        if (e.code === 'ArrowLeft') prevSong();
    });
}

// ============================================
// AUTH
// ============================================
function toggleAuth() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const toggleText = document.getElementById('toggleAuthText');

    if (appState.isAuthMode === 'login') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'flex';
        toggleText.innerHTML = '¿Ya tienes cuenta? <a href="#" onclick="toggleAuth()">Inicia Sesión</a>';
        appState.isAuthMode = 'signup';
    } else {
        loginForm.style.display = 'flex';
        signupForm.style.display = 'none';
        toggleText.innerHTML = '¿No tienes cuenta? <a href="#" onclick="toggleAuth()">Regístrate</a>';
        appState.isAuthMode = 'login';
    }
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;

    if (!email || !pass) { showToast('Completa todos los campos', 'warning'); return; }

    // Demo: any credentials work (or match existing user)
    const user = appState.users.find(u => u.email === email && u.password === pass);
    if (user) {
        appState.currentUser = user;
        showApp();
    } else if (appState.users.length === 0 || !appState.users.find(u => u.email === email)) {
        // Auto-create for demo (so user isn't blocked without registration)
        showToast('Credenciales incorrectas. ¿Aún no tienes cuenta?', 'error');
    } else {
        showToast('Contraseña incorrecta', 'error');
    }
}

function handleSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPassword').value;

    if (!name || !email || !pass) { showToast('Completa todos los campos', 'warning'); return; }
    if (pass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'warning'); return; }
    if (appState.users.find(u => u.email === email)) { showToast('Este email ya está registrado', 'error'); return; }

    const newUser = { id: Date.now(), name, email, password: pass };
    appState.users.push(newUser);
    appState.currentUser = newUser;
    showToast(`¡Bienvenido, ${name}! 🎉`, 'success');
    showApp();
}

function handleLogout() {
    if (appState.isPlaying) { audioPlayer.pause(); appState.isPlaying = false; }
    appState.currentUser = null;
    mainApp.style.display = 'none';
    authScreen.style.display = 'flex';
}

function showApp() {
    authScreen.style.display = 'none';
    mainApp.style.display = 'grid';
    updateUserUI();
    renderPlaylists();
    renderHome();
}

function updateUserUI() {
    const user = appState.currentUser;
    if (!user) return;
    document.getElementById('userName').textContent = user.name;
    const avatar = document.getElementById('userAvatar');
    if (avatar) avatar.textContent = user.name.charAt(0).toUpperCase();
}

// ============================================
// DARK / LIGHT MODE
// ============================================
function toggleTheme() {
    appState.darkMode = !appState.darkMode;
    document.body.classList.toggle('light-mode', !appState.darkMode);
    updateThemeBtn();
    showToast(appState.darkMode ? 'Modo oscuro activado' : 'Modo claro activado', 'info', 1500);
}

function updateThemeBtn() {
    const btn = document.getElementById('themeBtn');
    // In dark mode show moon (currently dark → click to stay or switch)
    // Show the OPPOSITE icon — what you'll switch TO
    if (btn) btn.textContent = appState.darkMode ? '🌙' : '☀️';
}

// ============================================
// NAVIGATION
// ============================================
function showView(viewId, playlistId = null) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    const viewEl = document.getElementById(viewId + 'View');
    if (viewEl) viewEl.style.display = 'block';

    const navMap = { home: 'inicio', search: 'buscar', library: 'biblioteca', favorites: 'favoritos', playlist: null };
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const key = navMap[viewId];
        if (key && item.textContent.toLowerCase().includes(key)) item.classList.add('active');
    });

    document.getElementById('searchContainer').style.display = viewId === 'search' ? 'flex' : 'none';

    appState.currentView = viewId;
    appState.currentPlaylistId = playlistId;

    if (viewId === 'home') renderHome();
    if (viewId === 'library') renderLibrary();
    if (viewId === 'favorites') renderFavorites();
    if (viewId === 'search') handleSearch();
    if (viewId === 'playlist') renderPlaylistView(playlistId);

    if (appState.mobileMenuOpen) toggleMobileMenu();
}

function toggleMobileMenu() {
    appState.mobileMenuOpen = !appState.mobileMenuOpen;
    document.getElementById('sidebar').classList.toggle('mobile-open', appState.mobileMenuOpen);
    const btn = document.querySelector('.mobile-menu-btn');
    if (btn) btn.style.display = appState.mobileMenuOpen ? 'none' : 'flex';
}

// ============================================
// HOME VIEW
// ============================================
function renderHome() {
    const recGrid = document.getElementById('recommendationsGrid');
    const trendGrid = document.getElementById('trendingGrid');
    if (!recGrid || !trendGrid) return;

    const unheard = appState.songs.filter(s => !appState.listeningHistory.includes(s.id));
    const recs = unheard.length >= 4 ? unheard.slice(0, 4) : appState.songs.slice(0, 4);
    recGrid.innerHTML = recs.map(s => createCard(s)).join('');

    const trending = [...appState.songs].sort((a, b) => b.plays - a.plays).slice(0, 4);
    trendGrid.innerHTML = trending.map(s => createCard(s)).join('');
}

const genreEmojis = { 'Electronic': '⚡', 'Pop': '🌟', 'Hip Hop': '🎤', 'Ambient': '🌊', 'Rock': '🎸', 'Local': '📂', 'default': '🎵' };

function getGenreEmoji(genre) { return genreEmojis[genre] || genreEmojis.default; }

function createCard(song) {
    const isPlaying = appState.currentSong?.id === song.id && appState.isPlaying;
    return `
        <div class="card" onclick="playSong(${song.id})">
            <div class="card-img" style="background: linear-gradient(135deg, ${song.color || '#9d4edd'}33, ${song.color || '#9d4edd'}11)">
                <div class="card-img-gradient" style="background: linear-gradient(135deg, ${song.color || '#9d4edd'}55, transparent)"></div>
                <span style="position:relative;z-index:1">${getGenreEmoji(song.genre)}</span>
                <span class="card-genre-tag">${escapeHtml(song.genre)}</span>
            </div>
            <div class="card-title">${escapeHtml(song.title)}</div>
            <div class="card-artist">${escapeHtml(song.artist)}</div>
            <button class="card-play-btn" onclick="event.stopPropagation(); playSong(${song.id})">
                ${isPlaying ? '⏸' : '▶'}
            </button>
        </div>
    `;
}

// ============================================
// LIBRARY VIEW
// ============================================
function renderLibrary() {
    const content = document.getElementById('libraryContent');
    if (!content) return;

    let songs = appState.songs;
    if (appState.currentFilter !== 'all') {
        songs = songs.filter(s => s.genre === appState.currentFilter);
    }

    if (songs.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🎵</div>
            <div class="empty-title">Tu biblioteca está vacía</div>
            <div class="empty-desc">Sube archivos MP3 para empezar</div>
        </div>`;
        return;
    }

    content.innerHTML = songs.map((song, i) => createSongRow(song, i + 1, true)).join('');
    renderFilterChips();
}

function renderFilterChips() {
    const container = document.getElementById('filterChips');
    if (!container) return;

    const genres = ['all', ...new Set(appState.songs.map(s => s.genre))];
    container.innerHTML = genres.map(g => `
        <button class="filter-chip ${appState.currentFilter === g ? 'active' : ''}"
            onclick="setFilter('${g}')">
            ${g === 'all' ? '🎵 Todas' : `${getGenreEmoji(g)} ${g}`}
        </button>
    `).join('');
}

function setFilter(genre) {
    appState.currentFilter = genre;
    renderLibrary();
}

// ============================================
// FAVORITES VIEW
// ============================================
function renderFavorites() {
    const content = document.getElementById('favoritesContent');
    if (!content) return;

    const favs = appState.songs.filter(s => appState.likedSongs.includes(s.id));

    if (favs.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <div class="empty-icon">❤️</div>
            <div class="empty-title">Sin favoritos aún</div>
            <div class="empty-desc">Dale ❤️ a las canciones que más te gusten</div>
        </div>`;
        return;
    }

    content.innerHTML = favs.map((song, i) => createSongRow(song, i + 1, false)).join('');
}

// ============================================
// PLAYLIST VIEW (fully functional)
// ============================================
function renderPlaylistView(playlistId) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist) { showView('library'); return; }

    const view = document.getElementById('playlistView');
    if (!view) return;

    const songs = playlist.songs.map(id => appState.songs.find(s => s.id === id)).filter(Boolean);
    const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

    view.innerHTML = `
        <div class="playlist-view-header">
            <div class="playlist-cover" style="background: linear-gradient(135deg, ${playlist.color || 'var(--accent)'}, ${playlist.color2 || 'var(--accent-deep)'})">
                🎵
            </div>
            <div class="playlist-meta">
                <div class="meta-label">Playlist</div>
                <h2>${escapeHtml(playlist.name)}</h2>
                <div class="meta-info">${songs.length} canciones · ${formatTime(totalDuration)}</div>
                <div class="playlist-actions">
                    <button class="btn-play-all" onclick="playPlaylist(${playlist.id})">▶ Reproducir todo</button>
                    <button class="btn-secondary-sm" onclick="shufflePlaylist(${playlist.id})">🔀 Aleatorio</button>
                    <button class="btn-secondary-sm" onclick="showAddSongsModal(${playlist.id})">➕ Agregar canciones</button>
                </div>
            </div>
        </div>

        <div class="songs-list" id="playlistSongsList">
            ${songs.length === 0
            ? `<div class="empty-state">
                    <div class="empty-icon">🎵</div>
                    <div class="empty-title">Playlist vacía</div>
                    <div class="empty-desc"><button class="section-link" onclick="showAddSongsModal(${playlist.id})">Agregar canciones</button></div>
                   </div>`
            : songs.map((song, i) => createSongRow(song, i + 1, false, true, playlist.id)).join('')
        }
        </div>
    `;
}

function playPlaylist(playlistId) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist || playlist.songs.length === 0) { showToast('La playlist está vacía', 'warning'); return; }
    const song = appState.songs.find(s => s.id === playlist.songs[0]);
    if (song) {
        // Load remaining songs into queue
        const rest = playlist.songs.slice(1).map(id => appState.songs.find(s => s.id === id)).filter(Boolean);
        appState.queue = rest;
        playSong(song.id);
    }
}

function shufflePlaylist(playlistId) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist || playlist.songs.length === 0) { showToast('La playlist está vacía', 'warning'); return; }
    const shuffled = [...playlist.songs].sort(() => Math.random() - 0.5);
    const song = appState.songs.find(s => s.id === shuffled[0]);
    if (song) {
        appState.queue = shuffled.slice(1).map(id => appState.songs.find(s => s.id === id)).filter(Boolean);
        playSong(song.id);
    }
}

// ============================================
// SONG ROW
// ============================================
function createSongRow(song, num = 0, showAddQueue = true, inPlaylist = false, playlistId = null) {
    const isLiked = appState.likedSongs.includes(song.id);
    const isPlaying = appState.currentSong?.id === song.id;

    return `
        <div class="song-row ${isPlaying ? 'playing' : ''}" id="row-${song.id}" onclick="playSong(${song.id})">
            <div class="song-row-num">${num}</div>
            <div class="song-playing-indicator"><div class="bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div></div>
            <div class="song-row-icon">${getGenreEmoji(song.genre)}</div>
            <div class="song-row-info">
                <div class="song-row-title">${escapeHtml(song.title)}</div>
                <div class="song-row-artist">${escapeHtml(song.artist)}</div>
            </div>
            <div class="song-row-meta">
                <span class="song-row-genre">${escapeHtml(song.genre)}</span>
                <span class="song-row-duration">${formatTime(song.duration)}</span>
                ${showAddQueue ? `<button class="song-row-queue" title="Añadir a la cola" onclick="event.stopPropagation(); addToQueue(${song.id})">➕</button>` : ''}
                ${inPlaylist ? `<button class="song-row-queue" title="Quitar de playlist" onclick="event.stopPropagation(); removeSongFromPlaylist(${playlistId}, ${song.id})">✕</button>` : ''}
                <button class="song-row-like ${isLiked ? 'active' : ''}" onclick="event.stopPropagation(); toggleLike(${song.id})">
                    ${isLiked ? '❤️' : '♡'}
                </button>
            </div>
        </div>
    `;
}

// ============================================
// SEARCH
// ============================================
function handleSearch() {
    const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const results = document.getElementById('searchResults');
    if (!results) return;

    if (!query) {
        results.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">Busca tus canciones</div>
            <div class="empty-desc">Por título, artista o género</div>
        </div>`;
        return;
    }

    const found = appState.songs.filter(s =>
        s.title.toLowerCase().includes(query) ||
        s.artist.toLowerCase().includes(query) ||
        s.genre.toLowerCase().includes(query)
    );

    if (found.length === 0) {
        results.innerHTML = `<div class="empty-state">
            <div class="empty-icon">😔</div>
            <div class="empty-title">Sin resultados para "${escapeHtml(query)}"</div>
            <div class="empty-desc">Prueba con otro término</div>
        </div>`;
    } else {
        results.innerHTML = found.map((s, i) => createSongRow(s, i + 1, true)).join('');
    }
}

// ============================================
// PLAYER
// ============================================
function playSong(songId) {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;

    // Update previous row
    if (appState.currentSong) {
        const prevRow = document.getElementById(`row-${appState.currentSong.id}`);
        if (prevRow) prevRow.classList.remove('playing');
    }

    appState.currentSong = song;
    song.plays++;

    // Update all song rows
    document.querySelectorAll('.song-row').forEach(r => r.classList.remove('playing'));
    const row = document.getElementById(`row-${song.id}`);
    if (row) row.classList.add('playing');

    // Update player UI
    document.getElementById('playerTitle').textContent = song.title;
    document.getElementById('playerArtist').textContent = song.artist;
    const likeBtn = document.getElementById('likeBtn');
    likeBtn.innerHTML = appState.likedSongs.includes(song.id) ? '❤️' : '♡';
    likeBtn.classList.toggle('active', appState.likedSongs.includes(song.id));

    const thumb = document.getElementById('playerThumbnail');
    thumb.textContent = getGenreEmoji(song.genre);
    thumb.style.background = `linear-gradient(135deg, ${song.color || '#9d4edd'}33, ${song.color || '#9d4edd'}11)`;

    // Play audio
    if (song.file || song.previewUrl) {
        audioPlayer.src = song.file || song.previewUrl;
        audioPlayer.play().then(() => {
            appState.isPlaying = true;
            document.getElementById('playBtn').textContent = '⏸';
            thumb.classList.add('spinning');
        }).catch(() => {
            showToast('No se pudo reproducir la canción', 'error');
        });
    } else {
        // Demo song — update state but don't try to play
        appState.isPlaying = false;
        document.getElementById('playBtn').textContent = '▶';
        thumb.classList.remove('spinning');
    }

    // History
    appState.listeningHistory = [song.id, ...appState.listeningHistory.filter(id => id !== song.id)].slice(0, 30);

    // Update queue panel if open
    if (appState.queueOpen) renderQueue();
}

function handleSongEnd() {
    if (appState.repeat) { audioPlayer.play(); return; }

    // If there's a manual queue, play from it first
    if (appState.queue.length > 0) {
        const next = appState.queue.shift();
        playSong(next.id);
        renderQueue();
        return;
    }

    nextSong();
}

function togglePlay() {
    if (!appState.currentSong) {
        if (appState.songs.length > 0) playSong(appState.songs[0].id);
        return;
    }

    if (!appState.currentSong.file && !appState.currentSong.previewUrl) {
        showToast('Esta canción es demo. Sube tu propio MP3.', 'info');
        return;
    }

    if (appState.isPlaying) {
        audioPlayer.pause();
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('playerThumbnail').classList.remove('spinning');
    } else {
        audioPlayer.play();
        document.getElementById('playBtn').textContent = '⏸';
        document.getElementById('playerThumbnail').classList.add('spinning');
    }
    appState.isPlaying = !appState.isPlaying;
}

function nextSong() {
    if (!appState.currentSong) return;
    const idx = appState.songs.findIndex(s => s.id === appState.currentSong.id);
    const next = appState.shuffle
        ? Math.floor(Math.random() * appState.songs.length)
        : (idx + 1) % appState.songs.length;
    playSong(appState.songs[next].id);
}

function prevSong() {
    if (!appState.currentSong) return;
    if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; return; }
    const idx = appState.songs.findIndex(s => s.id === appState.currentSong.id);
    const prev = (idx - 1 + appState.songs.length) % appState.songs.length;
    playSong(appState.songs[prev].id);
}

function toggleShuffle() {
    appState.shuffle = !appState.shuffle;
    document.getElementById('shuffleBtn').classList.toggle('active', appState.shuffle);
    showToast(appState.shuffle ? 'Modo aleatorio activado' : 'Modo aleatorio desactivado', 'info', 1500);
}

function toggleRepeat() {
    appState.repeat = !appState.repeat;
    audioPlayer.loop = appState.repeat;
    document.getElementById('repeatBtn').classList.toggle('active', appState.repeat);
    showToast(appState.repeat ? 'Repetición activada' : 'Repetición desactivada', 'info', 1500);
}

function updateProgress() {
    const { currentTime, duration } = audioPlayer;
    if (!duration) return;
    document.getElementById('progressFill').style.width = `${(currentTime / duration) * 100}%`;
    document.getElementById('currentTime').textContent = formatTime(currentTime);
    document.getElementById('duration').textContent = formatTime(duration);
}

function toggleLike(id) {
    const songId = id || appState.currentSong?.id;
    if (!songId) return;

    const idx = appState.likedSongs.indexOf(songId);
    const song = appState.songs.find(s => s.id === songId);
    if (idx === -1) {
        appState.likedSongs.push(songId);
        showToast(`"${song?.title}" añadida a favoritos`, 'success', 2000);
    } else {
        appState.likedSongs.splice(idx, 1);
        showToast(`"${song?.title}" eliminada de favoritos`, 'info', 2000);
    }

    // Update player like button
    if (appState.currentSong?.id === songId) {
        const btn = document.getElementById('likeBtn');
        btn.innerHTML = appState.likedSongs.includes(songId) ? '❤️' : '♡';
        btn.classList.toggle('active', appState.likedSongs.includes(songId));
    }

    // Update song row like button
    const rowLike = document.querySelector(`#row-${songId} .song-row-like`);
    if (rowLike) {
        rowLike.innerHTML = appState.likedSongs.includes(songId) ? '❤️' : '♡';
        rowLike.classList.toggle('active', appState.likedSongs.includes(songId));
    }

    if (appState.currentView === 'favorites') renderFavorites();
}

// ============================================
// QUEUE
// ============================================
function toggleQueue() {
    appState.queueOpen = !appState.queueOpen;
    document.getElementById('queuePanel').classList.toggle('open', appState.queueOpen);
    if (appState.queueOpen) renderQueue();
}

function closeQueue() {
    appState.queueOpen = false;
    document.getElementById('queuePanel').classList.remove('open');
}

function addToQueue(songId) {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;
    appState.queue.push(song);
    showToast(`"${song.title}" añadida a la cola`, 'success', 2000);
    if (appState.queueOpen) renderQueue();
}

function removeFromQueue(index) {
    appState.queue.splice(index, 1);
    renderQueue();
}

function renderQueue() {
    const content = document.getElementById('queueContent');
    if (!content) return;

    let html = '';

    if (appState.currentSong) {
        html += `<div class="queue-section-label">Reproduciendo ahora</div>`;
        html += `<div class="queue-item current">
            <div class="queue-item-icon">${getGenreEmoji(appState.currentSong.genre)}</div>
            <div class="queue-item-info">
                <div class="queue-item-title">${escapeHtml(appState.currentSong.title)}</div>
                <div class="queue-item-artist">${escapeHtml(appState.currentSong.artist)}</div>
            </div>
        </div>`;
    }

    if (appState.queue.length > 0) {
        html += `<div class="queue-section-label" style="margin-top:1rem">Cola (${appState.queue.length})</div>`;
        html += appState.queue.map((song, i) => `
            <div class="queue-item" onclick="playFromQueue(${i})">
                <div class="queue-item-icon">${getGenreEmoji(song.genre)}</div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${escapeHtml(song.title)}</div>
                    <div class="queue-item-artist">${escapeHtml(song.artist)}</div>
                </div>
                <button class="queue-item-remove" onclick="event.stopPropagation(); removeFromQueue(${i})">✕</button>
            </div>
        `).join('');

        html += `<div style="text-align:center;margin-top:1rem">
            <button class="section-link" onclick="clearQueue()">Limpiar cola</button>
        </div>`;
    } else if (!appState.currentSong) {
        html += `<div class="queue-empty">
            <div style="font-size:2rem;margin-bottom:0.5rem">🎵</div>
            <div>La cola está vacía</div>
        </div>`;
    }

    content.innerHTML = html;
}

function playFromQueue(index) {
    const song = appState.queue[index];
    if (!song) return;
    appState.queue.splice(index, 1);
    playSong(song.id);
}

function clearQueue() {
    appState.queue = [];
    renderQueue();
    showToast('Cola limpiada', 'info', 1500);
}

// ============================================
// FILE UPLOAD
// ============================================
function triggerFileUpload() { fileInput.click(); }

function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let loaded = 0;
    files.forEach(file => {
        if (!file.type.startsWith('audio/')) {
            showToast(`"${file.name}" no es un archivo de audio`, 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = event => {
            const newSong = {
                id: Date.now() + Math.random(),
                title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
                artist: 'Mi Música',
                duration: 0,
                genre: 'Local',
                plays: 0,
                color: '#6366f1',
                file: event.target.result
            };

            const tmp = new Audio();
            tmp.src = event.target.result;
            tmp.onloadedmetadata = () => {
                newSong.duration = tmp.duration;
                appState.songs.push(newSong);
                loaded++;
                if (loaded === files.filter(f => f.type.startsWith('audio/')).length) {
                    showToast(`${loaded} canción${loaded > 1 ? 'es' : ''} añadida${loaded > 1 ? 's' : ''} ✨`, 'success');
                    if (appState.currentView === 'library') renderLibrary();
                    renderHome();
                }
            };
            tmp.onerror = () => {
                // Fallback if metadata fails
                appState.songs.push(newSong);
                showToast(`"${newSong.title}" añadida`, 'success');
                if (appState.currentView === 'library') renderLibrary();
            };
        };
        reader.readAsDataURL(file);
    });

    fileInput.value = '';
}

// ============================================
// PLAYLISTS
// ============================================
const playlistColors = [
    ['#9d4edd', '#5390d9'], ['#f59e0b', '#ef4444'], ['#4ade80', '#06b6d4'],
    ['#ec4899', '#8b5cf6'], ['#f97316', '#eab308'], ['#14b8a6', '#6366f1']
];

function showPlaylistModal() {
    document.getElementById('playlistModal').classList.add('open');
    setTimeout(() => document.getElementById('playlistNameInput').focus(), 100);
}

function hidePlaylistModal() {
    document.getElementById('playlistModal').classList.remove('open');
    document.getElementById('playlistNameInput').value = '';
}

function createPlaylist() {
    const name = document.getElementById('playlistNameInput').value.trim();
    if (!name) { showToast('Ingresa un nombre para la playlist', 'warning'); return; }

    const colorPair = playlistColors[appState.playlists.length % playlistColors.length];
    const newPlaylist = {
        id: Date.now(),
        name,
        songs: [],
        color: colorPair[0],
        color2: colorPair[1]
    };

    appState.playlists.push(newPlaylist);
    renderPlaylists();
    hidePlaylistModal();
    showToast(`Playlist "${name}" creada 🎨`, 'success');
}

function renderPlaylists() {
    const list = document.getElementById('playlistsList');
    if (!list) return;

    if (appState.playlists.length === 0) {
        list.innerHTML = `<li style="padding:0.75rem;font-size:0.82rem;color:var(--text-muted);text-align:center">Sin playlists</li>`;
        return;
    }

    list.innerHTML = appState.playlists.map(p => `
        <li class="playlist-item ${appState.currentPlaylistId === p.id ? 'active' : ''}"
            onclick="showView('playlist', ${p.id})">
            <span class="playlist-icon" style="background:linear-gradient(135deg,${p.color},${p.color2});border-radius:4px;width:18px;height:18px;display:inline-block;"></span>
            <span class="playlist-name">${escapeHtml(p.name)}</span>
            <span class="playlist-count">${p.songs.length}</span>
        </li>
    `).join('');
}

// Add songs to playlist modal
function showAddSongsModal(playlistId) {
    const modal = document.getElementById('addSongsModal');
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!modal || !playlist) return;

    document.getElementById('addSongsTitle').textContent = `Agregar a "${playlist.name}"`;

    const picker = document.getElementById('songsPicker');
    picker.innerHTML = appState.songs.map(song => {
        const inPlaylist = playlist.songs.includes(song.id);
        return `
            <div class="playlist-pick-item ${inPlaylist ? 'selected' : ''}" onclick="toggleSongInPlaylist(${playlistId}, ${song.id}, this)">
                <span class="playlist-pick-icon">${getGenreEmoji(song.genre)}</span>
                <span class="playlist-pick-name">${escapeHtml(song.title)}</span>
                <span style="font-size:0.8rem;color:var(--text-muted);margin-left:auto">${escapeHtml(song.artist)}</span>
                <span style="margin-left:0.5rem">${inPlaylist ? '✓' : '+'}</span>
            </div>
        `;
    }).join('');

    modal.classList.add('open');
    modal._playlistId = playlistId;
}

function hideAddSongsModal() {
    document.getElementById('addSongsModal').classList.remove('open');
    // Refresh playlist view
    if (appState.currentView === 'playlist' && appState.currentPlaylistId) {
        renderPlaylistView(appState.currentPlaylistId);
    }
    renderPlaylists();
}

function toggleSongInPlaylist(playlistId, songId, el) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    const idx = playlist.songs.indexOf(songId);
    if (idx === -1) {
        playlist.songs.push(songId);
        el.classList.add('selected');
        el.querySelector('span:last-child').textContent = '✓';
    } else {
        playlist.songs.splice(idx, 1);
        el.classList.remove('selected');
        el.querySelector('span:last-child').textContent = '+';
    }
}

function removeSongFromPlaylist(playlistId, songId) {
    const playlist = appState.playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    playlist.songs = playlist.songs.filter(id => id !== songId);
    showToast('Canción eliminada de la playlist', 'info', 2000);
    renderPlaylistView(playlistId);
    renderPlaylists();
}

// ============================================
// SPOTIFY (placeholder with proper toast)
// ============================================
function importFromSpotify() {
    showToast('Conecta tu cuenta de Spotify en Ajustes (próximamente)', 'info', 4000);
}

// ============================================
// UTILS
// ============================================
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ============================================
// SLEEP TIMER
// ============================================
let sleepTimerTimeout = null;

function showSleepTimer() {
    document.getElementById('sleepTimerModal').classList.add('open');
}

function hideSleepTimer() {
    document.getElementById('sleepTimerModal').classList.remove('open');
}

function setSleepTimer(minutes) {
    if (sleepTimerTimeout) { clearTimeout(sleepTimerTimeout); sleepTimerTimeout = null; }
    if (minutes === 0) {
        showToast('Temporizador cancelado', 'info', 2000);
        updateSleepTimerBtn(0);
        hideSleepTimer();
        return;
    }
    sleepTimerTimeout = setTimeout(() => {
        audioPlayer.pause();
        appState.isPlaying = false;
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('playerThumbnail').classList.remove('spinning');
        showToast('⏰ Tiempo cumplido: música pausada', 'info', 4000);
        updateSleepTimerBtn(0);
        sleepTimerTimeout = null;
    }, minutes * 60 * 1000);
    updateSleepTimerBtn(minutes);
    showToast(`⏰ Música se pausará en ${minutes} min`, 'success', 3000);
    hideSleepTimer();
}

function updateSleepTimerBtn(minutes) {
    const btn = document.getElementById('sleepTimerBtn');
    if (!btn) return;
    btn.title = minutes > 0 ? `Temporizador activo: ${minutes}min` : 'Temporizador de sueño';
    btn.style.color = minutes > 0 ? 'var(--accent)' : '';
}

// ============================================
// EQUALIZER PRESETS (Web Audio API)
// ============================================
let audioCtx = null;
let eqNodes = [];

const EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    treble: [0, 0, 0, 0, 0, 2, 3, 4, 5, 6],
    vocal: [-2, -1, 0, 3, 4, 4, 3, 0, -1, -2],
    electronic: [4, 3, 0, -1, 0, 2, 1, 2, 3, 4],
    acoustic: [3, 2, 1, 2, 0, -1, 0, 1, 2, 2],
};
const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

function initAudioContext() {
    if (audioCtx) return true;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(audioPlayer);
        const gain = audioCtx.createGain();
        eqNodes = EQ_FREQS.map(freq => {
            const f = audioCtx.createBiquadFilter();
            f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1.4; f.gain.value = 0;
            return f;
        });
        let prev = src;
        eqNodes.forEach(n => { prev.connect(n); prev = n; });
        prev.connect(gain);
        gain.connect(audioCtx.destination);
        return true;
    } catch (e) {
        console.warn('Web Audio API not available:', e);
        return false;
    }
}

function applyEqPreset(presetName) {
    const ok = initAudioContext();
    if (!ok) { showToast('Ecualizador no disponible en este navegador', 'warning'); return; }
    const gains = EQ_PRESETS[presetName];
    if (!gains || !eqNodes.length) return;
    eqNodes.forEach((node, i) => node.gain.setTargetAtTime(gains[i], audioCtx.currentTime, 0.05));
    appState.currentEq = presetName;
    document.querySelectorAll('.eq-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.eq-btn[data-preset="${presetName}"]`);
    if (btn) btn.classList.add('active');
    const labels = { flat: 'Plano', bass: 'Bajo+', treble: 'Agudos+', vocal: 'Vocal', electronic: 'Electrónica', acoustic: 'Acústica' };
    showToast('🎚️ EQ: ' + (labels[presetName] || presetName), 'info', 2000);
}

function showEqModal() {
    document.getElementById('eqModal').classList.add('open');
}

function hideEqModal() {
    document.getElementById('eqModal').classList.remove('open');
}

// ============================================
// STATS
// ============================================
function showStats() {
    const content = document.getElementById('statsContent');
    const totalPlays = appState.songs.reduce((a, s) => a + s.plays, 0);
    const totalDuration = appState.songs.reduce((a, s) => a + (s.duration || 0), 0);
    const topSong = [...appState.songs].sort((a, b) => b.plays - a.plays)[0];
    const genres = {};
    appState.songs.forEach(s => { genres[s.genre] = (genres[s.genre] || 0) + 1; });
    const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0];

    content.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${appState.songs.length}</div><div class="stat-label">Canciones</div></div>
            <div class="stat-card"><div class="stat-value">${totalPlays}</div><div class="stat-label">Plays</div></div>
            <div class="stat-card"><div class="stat-value">${appState.likedSongs.length}</div><div class="stat-label">Favoritos</div></div>
            <div class="stat-card"><div class="stat-value">${appState.playlists.length}</div><div class="stat-label">Playlists</div></div>
        </div>
        <div class="stat-row"><span class="stat-row-label">🏆 Más escuchada</span><span class="stat-row-value">${topSong ? escapeHtml(topSong.title) : '—'}</span></div>
        <div class="stat-row"><span class="stat-row-label">🎸 Género favorito</span><span class="stat-row-value">${topGenre ? topGenre[0] : '—'}</span></div>
        <div class="stat-row"><span class="stat-row-label">⏱️ Duración total</span><span class="stat-row-value">${formatTime(totalDuration)}</span></div>
        <div class="stat-row"><span class="stat-row-label">📜 Historial</span><span class="stat-row-value">${appState.listeningHistory.length} canciones</span></div>
    `;
    document.getElementById('statsModal').classList.add('open');
}

function hideStats() {
    document.getElementById('statsModal').classList.remove('open');
}

// ============================================
// BOOT — must be last
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}