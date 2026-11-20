/* =========================================================
   SONICVAULT — APLICAÇÃO
   Navegação, biblioteca e reprodução
   ========================================================= */

import { formatTime, removeExtension } from "./Utils.js";
import { elements } from "./Elements.js";
import { state } from "./State.js";
import { parseBlob, parseBuffer } from "./vendor/music-metadata.js";
import { readFlacMetadata } from "./FlacMetadata.js";

const {
    audio,
    cover,
    title,
    artist,
    progress,
    currentTime,
    duration,
    playlist,
    queue,
    albums,
    search,
    selectFolder,
    playBtn,
    nextBtn,
    prevBtn,
    shuffleBtn,
    repeatBtn,
    volume,
    volumeBtn,
    songsBtn,
    albumsBtn,
    queueBtn,
    pipButton
} = elements;

/* =========================================================
   ELEMENTOS DA NOVA INTERFACE
   ========================================================= */

const appShell = document.querySelector(".app-shell");
const sidebarToggle = document.getElementById("sidebarToggle");
const dashboardView = document.getElementById("dashboardView");
const musicLibrary = document.getElementById("musicLibrary");
const pageTitle = document.querySelector(".page-heading h1");
const navButtons = [...document.querySelectorAll("[data-nav]")];

let currentLibraryView = "songs";
let currentSongList = state.songs;
let pipWindow = null;

const DEFAULT_COVER =
    "https://placehold.co/350x350/24212f/f4f4f5?text=SV";

/* =========================================================
   NAVEGAÇÃO PRINCIPAL
   ========================================================= */

function setActiveNavigation(button) {
    navButtons.forEach(item => {
        const isActive = item === button;

        item.classList.toggle("active", isActive);

        if (isActive) {
            item.setAttribute("aria-current", "page");
        } else {
            item.removeAttribute("aria-current");
        }
    });

    [songsBtn, albumsBtn, queueBtn].forEach(item => {
        item.classList.remove("active");
    });
}

function showDashboard() {
    dashboardView.hidden = false;
    musicLibrary.hidden = true;

    dashboardView.style.display = "grid";
    musicLibrary.style.display = "none";

    pageTitle.textContent = "Visão geral";
    search.value = "";
    setActiveNavigation(document.querySelector('[data-nav="dashboard"]'));
}

function showMusic(view = "songs") {
    dashboardView.hidden = true;
    musicLibrary.hidden = false;

    dashboardView.style.display = "none";
    musicLibrary.style.display = "block";

    currentLibraryView = view;

    if (view === "albums") {
        showAlbums();
        pageTitle.textContent = "Álbuns";
    } else if (view === "queue") {
        showQueue();
        pageTitle.textContent = "Fila de reprodução";
    } else {
        showSongs();
        pageTitle.textContent = "Músicas";
    }

    const musicNav = document.querySelector('[data-nav="music"]');
    setActiveNavigation(musicNav);
}

function showSongs(list = state.songs) {
    currentLibraryView = "songs";
    currentSongList = list;

    playlist.style.display = "block";
    albums.style.display = "none";
    queue.style.display = "none";

    playlist.setAttribute("aria-label", "Lista de músicas");
    renderPlaylist(list);

    songsBtn.classList.add("active");
    albumsBtn.classList.remove("active");
    queueBtn.classList.remove("active");
}

function showAlbums() {
    currentLibraryView = "albums";

    playlist.style.display = "none";
    albums.style.display = "grid";
    queue.style.display = "none";

    renderAlbums();

    songsBtn.classList.remove("active");
    albumsBtn.classList.add("active");
    queueBtn.classList.remove("active");
}

function showQueue() {
    currentLibraryView = "queue";

    playlist.style.display = "none";
    albums.style.display = "none";
    queue.style.display = "block";

    renderQueue();

    songsBtn.classList.remove("active");
    albumsBtn.classList.remove("active");
    queueBtn.classList.add("active");
}

navButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (button.getAttribute("aria-disabled") === "true") return;

        const destination = button.dataset.nav;

        if (destination === "dashboard") {
            showDashboard();
        }

        if (destination === "music") {
            showMusic("songs");
        }
    });
});

sidebarToggle?.addEventListener("click", () => {
    const collapsed = appShell.classList.toggle("sidebar-collapsed");

    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute(
        "aria-label",
        collapsed ? "Expandir menu" : "Recolher menu"
    );

    sidebarToggle.title = collapsed ? "Expandir menu" : "Recolher menu";
});

songsBtn.addEventListener("click", () => showMusic("songs"));
albumsBtn.addEventListener("click", () => showMusic("albums"));
queueBtn.addEventListener("click", () => showMusic("queue"));

/* =========================================================
   GERENCIAMENTO DE MEMÓRIA
   ========================================================= */

function clearLibrary() {
    const urls = new Set();

    state.songs.forEach(song => {
        if (song.url) urls.add(song.url);
        if (song.cover) urls.add(song.cover);
    });

    urls.forEach(url => URL.revokeObjectURL(url));
}

/* =========================================================
   LEITURA RECURSIVA DA PASTA
   ========================================================= */

const AUDIO_EXTENSIONS = new Set([
    "mp3", "wav", "ogg", "m4a", "flac", "aac", "opus", "weba"
]);

const COVER_NAMES = new Set([
    "cover.jpg", "cover.png", "folder.jpg", "folder.png",
    "cover.jpeg", "folder.jpeg"
]);

async function scanFolder(folder, albumName = "") {
    let coverImage = null;

    for await (const item of folder.values()) {
        if (item.kind !== "file") continue;

        if (COVER_NAMES.has(item.name.toLowerCase())) {
            const file = await item.getFile();
            coverImage = URL.createObjectURL(file);
            break;
        }
    }

    for await (const item of folder.values()) {
        if (item.kind === "directory") {
            const nestedAlbumName = albumName
                ? `${albumName} / ${item.name}`
                : item.name;

            await scanFolder(item, nestedAlbumName);
            continue;
        }

        if (item.kind !== "file") continue;

        const extension = item.name.split(".").pop().toLowerCase();
        if (!AUDIO_EXTENSIONS.has(extension)) continue;

        const file = await item.getFile();
        const metadata = await readAudioMetadata(file);
        const embeddedCover = metadata.picture
            ? URL.createObjectURL(new Blob([metadata.picture.data], { type: metadata.picture.format || "image/jpeg" }))
            : null;
        const song = {
            name: metadata.title || removeExtension(item.name),
            artist: metadata.artist || "Artista desconhecido",
            album: metadata.album || albumName || "Sem álbum",
            track: metadata.track || null,
            year: metadata.year || null,
            genre: metadata.genre || "",
            file,
            url: URL.createObjectURL(file),
            cover: embeddedCover || coverImage
        };

        state.songs.push(song);

        const albumKey = `${song.artist.toLocaleLowerCase("pt-BR")}::${song.album.toLocaleLowerCase("pt-BR")}`;
        song.albumKey = albumKey;
        if (!state.albums[albumKey]) {
            state.albums[albumKey] = {
                name: song.album,
                artist: song.artist,
                cover: song.cover,
                songs: []
            };
        } else if (!state.albums[albumKey].cover && song.cover) {
            state.albums[albumKey].cover = song.cover;
        }
        state.albums[albumKey].songs.push(song);
    }
}

async function readAudioMetadata(file) {
    try {
        const flacMetadata = await readFlacMetadata(file);
        if (flacMetadata && (
            flacMetadata.title || flacMetadata.artist ||
            flacMetadata.album || flacMetadata.picture
        )) {
            return normalizeMetadata(flacMetadata);
        }
    } catch (error) {
        console.warn(`Leitura direta de FLAC falhou em ${file.name}; tentando o leitor geral.`, error);
    }

    let streamed = null;
    let streamError = null;

    try {
        streamed = await parseBlob(file, { duration: false });
    } catch (error) {
        streamError = error;
    }

    const streamedCommon = streamed?.common || {};
    const hasUsefulMetadata = streamedCommon.title || streamedCommon.artist ||
        streamedCommon.album || streamedCommon.picture?.length;

    if (hasUsefulMetadata && streamedCommon.title && streamedCommon.artist &&
        streamedCommon.album && streamedCommon.picture?.length) {
        return normalizeMetadata(streamedCommon);
    }

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const buffered = await parseBuffer(bytes, {
            path: file.name,
            mimeType: file.type,
            size: file.size
        }, { duration: false });
        const bufferedCommon = buffered.common || {};

        return normalizeMetadata({
            ...streamedCommon,
            ...bufferedCommon,
            picture: streamedCommon.picture?.length
                ? streamedCommon.picture
                : bufferedCommon.picture
        });
    } catch (bufferError) {
        console.warn(`Não foi possível ler as tags de ${file.name}.`, {
            streamError,
            bufferError
        });
        return normalizeMetadata(streamedCommon);
    }
}

function normalizeMetadata(common) {
    const picture = Array.isArray(common.picture)
        ? common.picture[0]
        : common.picture || null;

    return {
        title: common.title?.trim(),
        artist: common.artist?.trim(),
        album: common.album?.trim(),
        track: common.track?.no ?? common.track?.number ?? null,
        year: common.year ?? null,
        genre: Array.isArray(common.genre) ? common.genre[0] : common.genre ?? "",
        picture
    };
}

/* =========================================================
   SELEÇÃO DA PASTA
   ========================================================= */

selectFolder.addEventListener("click", async () => {
    if (!("showDirectoryPicker" in window)) {
        alert("Seu navegador não oferece suporte à seleção de pastas. Use um navegador baseado em Chromium.");
        return;
    }

    try {
        const folder = await window.showDirectoryPicker();
        const permission = await folder.requestPermission({ mode: "read" });

        if (permission !== "granted") {
            alert("Permissão de leitura não concedida.");
            return;
        }

        clearLibrary();

        state.songs = [];
        state.albums = {};
        state.queue = [];
        state.currentIndex = 0;

        await scanFolder(folder);
        sortAlbumTracks();

        renderPlaylist();
        renderAlbums();
        renderQueue();

        if (state.songs.length > 0) {
            loadSong(0);
            showMusic("songs");
        } else {
            playlist.innerHTML = `
                <div class="empty-state">
                    <strong>Nenhuma música encontrada.</strong>
                    <p>Escolha uma pasta que contenha arquivos de áudio compatíveis.</p>
                </div>
            `;
            showMusic("songs");
        }

        await saveFolder(folder);
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Não foi possível carregar a pasta:", error);
            alert("Não foi possível carregar essa pasta. Consulte o console para ver o erro.");
        }
    }
});

/* =========================================================
   RENDERIZAÇÃO DA LISTA DE MÚSICAS
   ========================================================= */

function renderPlaylist(list = state.songs) {
    playlist.replaceChildren();

    if (!list.length) {
        playlist.innerHTML = `
            <div class="empty-state">
                <strong>Sua biblioteca está vazia.</strong>
                <p>Use “Adicionar pasta” para importar suas músicas.</p>
            </div>
        `;
        return;
    }

    list.forEach(song => {
        const index = state.songs.indexOf(song);
        const item = document.createElement("div");

        item.className = "song";
        item.dataset.index = String(index);

        const songName = document.createElement("strong");
        songName.textContent = song.name;

        const albumName = document.createElement("small");
        albumName.textContent = song.album;

        const addButton = document.createElement("button");
        addButton.className = "add-queue";
        addButton.type = "button";
        addButton.textContent = "+";
        addButton.setAttribute("aria-label", "Adicionar à fila");
        addButton.title = "Adicionar à fila";

        const nextButton = document.createElement("button");
        nextButton.className = "add-queue play-next-button";
        nextButton.type = "button";
        nextButton.textContent = "↥";
        nextButton.setAttribute("aria-label", "Tocar em seguida");
        nextButton.title = "Tocar em seguida";
        item.append(songName, albumName, addButton, nextButton);

        item.addEventListener("click", () => {
            if (index < 0) return;
            loadSong(index);
            play();
        });

        addButton.addEventListener("click", event => {
            event.stopPropagation();
            addToQueue(song);

            addButton.textContent = "✓";
            window.setTimeout(() => {
                if (addButton.isConnected) addButton.textContent = "+";
            }, 700);
        });
        nextButton.addEventListener("click", event => {
            event.stopPropagation();
            addToQueue(song, "next");
            nextButton.textContent = "✓";
            window.setTimeout(() => { if (nextButton.isConnected) nextButton.textContent = "↥"; }, 700);
        });

        playlist.appendChild(item);
    });

    updateActiveSong();
}

/* =========================================================
   FILA DE REPRODUÇÃO
   ========================================================= */

function renderQueue() {
    queue.replaceChildren();
    if (!state.queue.length) {
        queue.innerHTML = `<div class="empty-state"><strong>Nenhuma música na fila.</strong><p>Adicione faixas usando os comandos da biblioteca.</p></div>`;
        return;
    }
    const toolbar = document.createElement("div");
    toolbar.className = "queue-toolbar";
    const label = document.createElement("span");
    label.textContent = `${state.queue.length} faixa(s) na fila`;
    const clearButton = document.createElement("button");
    clearButton.type = "button"; clearButton.textContent = "Limpar fila";
    clearButton.addEventListener("click", () => { state.queue = []; renderQueue(); });
    toolbar.append(label, clearButton); queue.append(toolbar);

    state.queue.forEach((song, index) => {
        const item = document.createElement("div");
        item.className = "queue-song"; item.draggable = true; item.dataset.queueIndex = String(index);
        const image = document.createElement("img"); image.className = "queue-cover"; image.src = song.cover || DEFAULT_COVER; image.alt = "";
        const info = document.createElement("div"); info.className = "queue-info";
        const songName = document.createElement("strong"); songName.textContent = song.name;
        const albumName = document.createElement("small"); albumName.textContent = `${song.artist} · ${song.album}`;
        info.append(songName, albumName);
        const playNext = document.createElement("button"); playNext.type = "button"; playNext.textContent = "Tocar agora"; playNext.title = "Tocar agora";
        const removeButton = document.createElement("button"); removeButton.type = "button"; removeButton.textContent = "×"; removeButton.title = "Remover da fila"; removeButton.setAttribute("aria-label", `Remover ${song.name}`);
        playNext.addEventListener("click", () => { const i = state.songs.indexOf(song); if (i >= 0) { state.queue.splice(index, 1); renderQueue(); loadSong(i); play(); } });
        removeButton.addEventListener("click", () => { state.queue.splice(index, 1); renderQueue(); });
        item.append(image, info, playNext, removeButton);
        item.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", String(index)); e.dataTransfer.effectAllowed = "move"; item.classList.add("dragging"); });
        item.addEventListener("dragend", () => item.classList.remove("dragging"));
        item.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; item.classList.add("drag-over"); });
        item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
        item.addEventListener("drop", e => { e.preventDefault(); item.classList.remove("drag-over"); const from = Number(e.dataTransfer.getData("text/plain")); const to = index; if (!Number.isInteger(from) || from === to || from < 0 || from >= state.queue.length) return; const [moved] = state.queue.splice(from, 1); state.queue.splice(to, 0, moved); renderQueue(); });
        queue.append(item);
    });
}

function addToQueue(song, position = "end") {
    if (position === "next") state.queue.unshift(song);
    else state.queue.push(song);
    renderQueue();
}

function sortAlbumTracks() {
    Object.values(state.albums).forEach(album => album.songs.sort((a, b) => {
        const an = Number(a.track?.no ?? a.track ?? 0), bn = Number(b.track?.no ?? b.track ?? 0);
        if (an && bn && an !== bn) return an - bn;
        if (an && !bn) return -1;
        if (!an && bn) return 1;
        return a.name.localeCompare(b.name, "pt-BR");
    }));
}

/* =========================================================
   ÁLBUNS
   ========================================================= */

function renderAlbums() {
    albums.replaceChildren();

    const albumEntries = Object.entries(state.albums);

    if (!albumEntries.length) {
        albums.innerHTML = `
            <div class="empty-state">
                <strong>Nenhum álbum encontrado.</strong>
                <p>Organize suas músicas em pastas para agrupá-las como álbuns.</p>
            </div>
        `;
        return;
    }

    albumEntries.forEach(([key, album]) => {
        const name = album.name || key;
        const card = document.createElement("button");
        card.type = "button";
        card.className = "album-card";

        const image = document.createElement("img");
        image.src = album.cover || DEFAULT_COVER;
        image.alt = `Capa de ${name}`;

        const heading = document.createElement("h3");
        heading.textContent = name;
        const artistLabel = document.createElement("small");
        artistLabel.className = "album-artist";
        artistLabel.textContent = album.artist || "Artista desconhecido";

        const count = document.createElement("p");
        count.className = "album-count";
        count.textContent = `${album.songs.length} faixa(s)`;

        card.append(image, heading, artistLabel, count);

        card.addEventListener("click", () => {
            showSongs(album.songs);
            pageTitle.textContent = name;
        });

        albums.appendChild(card);
    });
}

/* =========================================================
   PESQUISA
   ========================================================= */

search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("pt-BR");

    if (dashboardView.hidden === false) {
        showMusic("songs");
    }

    const filteredSongs = state.songs.filter(song => {
        const searchableText = `${song.name} ${song.artist} ${song.album}`.toLocaleLowerCase("pt-BR");
        return searchableText.includes(query);
    });

    showSongs(filteredSongs);
    pageTitle.textContent = query ? "Resultados da pesquisa" : "Músicas";
});

/* =========================================================
   CARREGAR E ATUALIZAR MÚSICA
   ========================================================= */

function loadSong(index) {
    const song = state.songs[index];
    if (!song) return;

    state.currentIndex = index;

    audio.src = song.url;
    title.textContent = song.name;
    artist.textContent = `${song.artist} • ${song.album}`;
    cover.src = song.cover || DEFAULT_COVER;

    progress.value = 0;
    currentTime.textContent = "0:00";
    duration.textContent = "0:00";

    updateActiveSong();
    syncMiniPlayer();
}

function updateActiveSong() {
    document.querySelectorAll(".song").forEach(item => {
        item.classList.toggle(
            "active",
            Number(item.dataset.index) === state.currentIndex
        );
    });
}

/* =========================================================
   CONTROLES DO PLAYER
   ========================================================= */

async function play() {
    if (!audio.src) return;

    try {
        await audio.play();
        playBtn.textContent = "Ⅱ";
        playBtn.setAttribute("aria-label", "Pausar");
        playBtn.title = "Pausar";
    } catch (error) {
        console.error("Falha ao reproduzir áudio:", error);
    }

    syncMiniPlayer();
}

function pause() {
    audio.pause();
    playBtn.textContent = "▶";
    playBtn.setAttribute("aria-label", "Reproduzir");
    playBtn.title = "Reproduzir";
    syncMiniPlayer();
}

playBtn.addEventListener("click", () => {
    if (audio.paused) {
        play();
    } else {
        pause();
    }
});

audio.addEventListener("play", () => {
    playBtn.textContent = "Ⅱ";
    playBtn.setAttribute("aria-label", "Pausar");
    syncMiniPlayer();
});

audio.addEventListener("pause", () => {
    playBtn.textContent = "▶";
    playBtn.setAttribute("aria-label", "Reproduzir");
    syncMiniPlayer();
});

function nextSong() {
    if (!state.songs.length) return;

    if (state.queue.length) {
        const next = state.queue.shift();
        renderQueue();

        const index = state.songs.indexOf(next);
        if (index !== -1) {
            loadSong(index);
            play();
        }
        return;
    }

    let nextIndex;

    if (state.shuffle && state.songs.length > 1) {
        do {
            nextIndex = Math.floor(Math.random() * state.songs.length);
        } while (nextIndex === state.currentIndex);
    } else {
        nextIndex = (state.currentIndex + 1) % state.songs.length;
    }

    loadSong(nextIndex);
    play();
}

function previousSong() {
    if (!state.songs.length) return;

    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }

    const previousIndex =
        (state.currentIndex - 1 + state.songs.length) % state.songs.length;

    loadSong(previousIndex);
    play();
}

nextBtn.addEventListener("click", nextSong);
prevBtn.addEventListener("click", previousSong);

shuffleBtn.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    shuffleBtn.classList.toggle("active", state.shuffle);
    shuffleBtn.setAttribute("aria-pressed", String(state.shuffle));
});

repeatBtn.addEventListener("click", () => {
    state.repeat = !state.repeat;
    repeatBtn.classList.toggle("active", state.repeat);
    repeatBtn.setAttribute("aria-pressed", String(state.repeat));
});

audio.addEventListener("ended", () => {
    if (state.repeat) {
        audio.currentTime = 0;
        play();
    } else {
        nextSong();
    }
});

/* =========================================================
   TEMPO E BARRA DE PROGRESSO
   ========================================================= */

audio.addEventListener("loadedmetadata", () => {
    duration.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

    progress.value = String((audio.currentTime / audio.duration) * 100);
    currentTime.textContent = formatTime(audio.currentTime);
    syncMiniPlayer();
});

progress.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

    audio.currentTime = (Number(progress.value) / 100) * audio.duration;
});

/* =========================================================
   VOLUME
   ========================================================= */

function updateVolumeIcon() {
    if (audio.volume === 0) {
        volumeBtn.textContent = "🔇";
        volumeBtn.setAttribute("aria-label", "Ativar som");
    } else if (audio.volume < 0.4) {
        volumeBtn.textContent = "🔈";
        volumeBtn.setAttribute("aria-label", "Silenciar volume");
    } else if (audio.volume < 0.7) {
        volumeBtn.textContent = "🔉";
        volumeBtn.setAttribute("aria-label", "Silenciar volume");
    } else {
        volumeBtn.textContent = "🔊";
        volumeBtn.setAttribute("aria-label", "Silenciar volume");
    }
}

volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
    if (audio.volume > 0) audio.dataset.lastVolume = String(audio.volume);
    updateVolumeIcon();
});

volumeBtn.addEventListener("click", () => {
    if (audio.volume > 0) {
        audio.dataset.lastVolume = String(audio.volume);
        audio.volume = 0;
    } else {
        audio.volume = Number(audio.dataset.lastVolume || 1);
    }

    volume.value = String(audio.volume);
    updateVolumeIcon();
});

audio.volume = Number(volume.value);
updateVolumeIcon();

/* =========================================================
   INDEXEDDB: SALVAR PASTA ESCOLHIDA
   ========================================================= */

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("MusicPlayer", 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("folders")) {
                db.createObjectStore("folders");
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveFolder(folder) {
    try {
        const db = await openDB();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction("folders", "readwrite");
            transaction.objectStore("folders").put(folder, "last");
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });

        db.close();
    } catch (error) {
        console.warn("Não foi possível salvar a pasta:", error);
    }
}

async function loadFolder() {
    try {
        const db = await openDB();

        const folder = await new Promise((resolve, reject) => {
            const transaction = db.transaction("folders", "readonly");
            const request = transaction.objectStore("folders").get("last");

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });

        db.close();
        return folder;
    } catch (error) {
        console.warn("Não foi possível recuperar a pasta:", error);
        return null;
    }
}

async function restoreFolder() {
    const folder = await loadFolder();
    if (!folder) return;

    try {
        let permission = await folder.queryPermission({ mode: "read" });

        if (permission !== "granted") {
            permission = await folder.requestPermission({ mode: "read" });
        }

        if (permission !== "granted") return;

        state.songs = [];
        state.albums = {};
        state.queue = [];

        await scanFolder(folder);
        sortAlbumTracks();

        renderPlaylist();
        renderAlbums();
        renderQueue();

        if (state.songs.length) {
            loadSong(0);
            showMusic("songs");
        }
    } catch (error) {
        console.warn("A pasta salva não pôde ser restaurada:", error);
    }
}

/* =========================================================
   MINI PLAYER — DOCUMENT PICTURE-IN-PICTURE
   ========================================================= */
if (pipButton) pipButton.addEventListener("click", async () => {
    if (!("documentPictureInPicture" in window)) { alert("Seu navegador não oferece suporte ao Mini Player. Use Chrome ou Edge atualizado."); return; }
    if (pipWindow) { pipWindow.close(); return; }
    try {
        pipWindow = await window.documentPictureInPicture.requestWindow({ width: 520, height: 250 });
        [...document.styleSheets].forEach(sheet => { try { const link = pipWindow.document.createElement("link"); link.rel = "stylesheet"; link.href = sheet.href; pipWindow.document.head.append(link); } catch {} });
        pipWindow.addEventListener("pagehide", () => { pipWindow = null; });
        drawMiniPlayer();
    } catch (error) { console.error("Não foi possível abrir o Mini Player:", error); }
});

function drawMiniPlayer() {
    if (!pipWindow) return;
    const doc = pipWindow.document;
    doc.body.innerHTML = `
      <style>
        *{box-sizing:border-box} body{margin:0;background:#111219;color:#f4f4f5;font-family:Inter,system-ui,sans-serif;overflow:hidden}
        .svpip{height:100vh;display:grid;grid-template-columns:164px minmax(0,1fr) 38px;gap:15px;padding:16px;align-items:center}
        .svpip-cover{width:164px;height:164px;object-fit:cover;border-radius:15px;background:#24212f;box-shadow:0 10px 30px #0007}
        .svpip-main{min-width:0;display:flex;flex-direction:column;gap:10px}.svpip-title-wrap{overflow:hidden;white-space:nowrap;position:relative}
        .svpip-title{display:inline-block;font-size:15px;font-weight:750;max-width:100%;white-space:nowrap}.svpip-title.marquee{max-width:none;animation:sv-marquee 12s ease-in-out infinite alternate}
        @keyframes sv-marquee{0%,12%{transform:translateX(0)}88%,100%{transform:translateX(var(--sv-shift))}}
        .svpip-artist{font-size:11px;color:#a1a1aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .svpip-controls{display:flex;align-items:center;gap:12px}.svpip button{border:0;color:#f4f4f5;background:#282936;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:14px}.svpip button:hover{background:#454052}.svpip .svpip-play{width:42px;height:42px;background:#8b5cf6;font-size:17px}
        .svpip-time{display:flex;align-items:center;gap:8px;color:#a1a1aa;font-size:10px;font-variant-numeric:tabular-nums}.svpip-time input{flex:1;min-width:0;accent-color:#8b5cf6;cursor:pointer}
        .svpip-volume{height:164px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#a1a1aa;font-size:13px}.svpip-volume input{height:105px;width:5px;writing-mode:vertical-lr;direction:rtl;accent-color:#8b5cf6;cursor:pointer}
        @media(max-width:390px){.svpip{grid-template-columns:112px minmax(0,1fr) 28px;gap:9px;padding:10px}.svpip-cover{width:112px;height:112px}.svpip-volume{height:130px}.svpip-volume input{height:85px}}
      </style>
      <main class="svpip">
        <img class="svpip-cover" id="miniCover" alt="Capa do álbum">
        <section class="svpip-main">
          <div class="svpip-title-wrap"><div class="svpip-title" id="miniTitle"></div></div>
          <div class="svpip-artist" id="miniArtist"></div>
          <div class="svpip-controls"><button id="miniPrev" title="Anterior" aria-label="Anterior">|◀</button><button class="svpip-play" id="miniPlay" title="Reproduzir ou pausar" aria-label="Reproduzir ou pausar">▶</button><button id="miniNext" title="Próxima" aria-label="Próxima">▶|</button></div>
          <div class="svpip-time"><span id="miniCurrent">0:00</span><input id="miniProgress" type="range" min="0" max="100" step="0.1" value="0" aria-label="Progresso"><span id="miniDuration">0:00</span></div>
        </section>
        <aside class="svpip-volume"><span>♫</span><input id="miniVolume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume"></aside>
      </main>`;
    doc.getElementById("miniPrev").addEventListener("click", previousSong);
    doc.getElementById("miniNext").addEventListener("click", nextSong);
    doc.getElementById("miniPlay").addEventListener("click", () => audio.paused ? play() : pause());
    doc.getElementById("miniProgress").addEventListener("input", e => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(e.target.value) / 100 * audio.duration; });
    doc.getElementById("miniVolume").addEventListener("input", e => { audio.volume = Number(e.target.value); volume.value = e.target.value; updateVolumeIcon(); });
    syncMiniPlayer();
}

function syncMiniPlayer() {
    if (!pipWindow) return;
    const doc = pipWindow.document;
    const set = (id, value) => { const el = doc.getElementById(id); if (el) el.textContent = value; };
    const miniTitle = doc.getElementById("miniTitle"), miniCover = doc.getElementById("miniCover"), miniProgress = doc.getElementById("miniProgress"), miniVolume = doc.getElementById("miniVolume");
    if (miniTitle) {
        miniTitle.textContent = title.textContent;
        requestAnimationFrame(() => { if (!pipWindow || !miniTitle.isConnected) return; const wrap = miniTitle.parentElement; const overflow = miniTitle.scrollWidth - wrap.clientWidth; miniTitle.classList.toggle("marquee", overflow > 4); miniTitle.style.setProperty("--sv-shift", `${-Math.max(0, overflow)}px`); });
    }
    if (miniCover) miniCover.src = cover.src;
    set("miniArtist", artist.textContent);
    set("miniPlay", audio.paused ? "▶" : "Ⅱ");
    set("miniCurrent", formatTime(audio.currentTime || 0));
    set("miniDuration", formatTime(Number.isFinite(audio.duration) ? audio.duration : 0));
    if (miniProgress && Number.isFinite(audio.duration) && audio.duration > 0) miniProgress.value = String(audio.currentTime / audio.duration * 100);
    if (miniVolume) miniVolume.value = String(audio.volume);
}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

showDashboard();
renderPlaylist();
renderAlbums();
renderQueue();
restoreFolder();

console.log("SonicVault carregado.");
