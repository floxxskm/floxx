window.addEventListener('DOMContentLoaded', () => {
    const elements = {
        body: document.body,
        title: document.getElementById('track-title'),
        coverArtContainer: document.getElementById('cover-art-container'),
        cover: document.getElementById('cover-art'),
        buyLinkSmall: document.getElementById('buy-link-small'),
        hashtags: document.getElementById('hashtags-container'),
        player: document.getElementById('audio-player'),
        playIcon: document.getElementById('play-pause-btn').querySelector('.material-icons'),
        playPauseBtn: document.getElementById('play-pause-btn'),
        nextBtn: document.getElementById('next-btn'),
        prevBtn: document.getElementById('prev-btn'),
        likeBtn: document.getElementById('like-btn'),
        dislikeBtn: document.getElementById('dislike-btn'),
        progressBar: document.getElementById('progress-bar'),
        currentTime: document.getElementById('current-time'),
        duration: document.getElementById('duration'),
        bgCanvas: document.getElementById('background-canvas'),
        contentWrapper: document.querySelector('.content-wrapper'),
        filterBtn: document.getElementById('filter-btn'),
        filterSidebar: document.getElementById('filter-sidebar'),
        filterTags: document.getElementById('filter-tags'),
        playerContainer: document.querySelector('.player-container'),
        playerCore: document.getElementById('player-core'),
        footerControls: document.querySelector('.footer-controls'),
        noResults: document.getElementById('no-results'),
        volumeSlider: document.getElementById('volume-slider'),
        tagSearchInput: document.getElementById('tag-search-input'),
        selectedTagsContainer: document.getElementById('selected-tags-container'),
        authorLogo: document.getElementById('author-logo'),
        modalOverlay: document.getElementById('author-modal-overlay'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        clearCacheBtn: document.getElementById('clear-cache-btn'),
        similarTrackBtn: document.getElementById('similar-track-btn'),
        similarTrackPreview: document.getElementById('similar-track-preview'),
        nextTrackPreview: document.getElementById('next-track-preview'),
        prevTrackPreview: document.getElementById('prev-track-preview'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        vizToggleBtn: document.getElementById('viz-toggle-btn'),
        likedListContainer: document.getElementById('liked-list').querySelector('.side-list-content'),
        dislikedListContainer: document.getElementById('disliked-list').querySelector('.side-list-content'),
        likedListPanel: document.getElementById('liked-list'),
        dislikedListPanel: document.getElementById('disliked-list'),
        showLikedBtn: document.getElementById('show-liked-btn'),
        showDislikedBtn: document.getElementById('show-disliked-btn'),
        likedListToggle: document.getElementById('liked-list-toggle'),
        dislikedListToggle: document.getElementById('disliked-list-toggle'),
        likedCount: document.getElementById('liked-count'),
        dislikedCount: document.getElementById('disliked-count'),
        showLinksBtn: document.getElementById('show-links-btn'),
        linksModalOverlay: document.getElementById('links-modal-overlay'),
        closeLinksModalBtn: document.getElementById('close-links-modal-btn'),
        sideListCloseBtns: document.querySelectorAll('.side-list-close-btn'),
    };

    let allBeats = [], currentPlaylist = [], currentTrackIndex = -1, isSwitching = false, particles = [], isClearingCache = false;
    let audioContext, analyser, frequencyData, isAudioSetup = false;
    let activeFilters = new Set(), likedTracks = new Set(), dislikedTracks = new Set();
    const animationSpeed = 180, ctx = elements.bgCanvas.getContext('2d');
    const vizModes = ['particles', 'stars', 'waves'], themes = ['dark-theme', 'light-theme'];
    let currentVizModeIndex = 0, currentThemeIndex = 0;
    let effectiveBinCount;
    let allowPreview = true;
    
    const audioBuffers = new Map();

    function saveState() {
        const state = { filters: Array.from(activeFilters), liked: Array.from(likedTracks), disliked: Array.from(dislikedTracks), vizMode: vizModes[currentVizModeIndex], theme: themes[currentThemeIndex] };
        localStorage.setItem('floxxPlayerState', JSON.stringify(state));
    }

    function loadState() {
        try {
            const state = JSON.parse(localStorage.getItem('floxxPlayerState')) || {};
            likedTracks = new Set(state.liked || []);
            dislikedTracks = new Set(state.disliked || []);
            activeFilters = new Set(state.filters || []);
            currentThemeIndex = themes.indexOf(state.theme) > -1 ? themes.indexOf(state.theme) : 0;
            currentVizModeIndex = vizModes.indexOf(state.vizMode) > -1 ? vizModes.indexOf(state.vizMode) : 0;
        } catch (e) { console.error("Could not parse saved state:", e); }
    }

    async function initialize() {
        loadState();
        try {
            const response = await fetch(`beats_data.json?v=${Date.now()}`);
            allBeats = await response.json();
            if (allBeats.length === 0) throw new Error('Список битов пуст.');

            elements.body.className = themes[currentThemeIndex];
            elements.vizToggleBtn.dataset.tooltip = vizModes[currentVizModeIndex];
            populateFilterPanel();
            renderSideLists();
            
            currentPlaylist = allBeats.filter(beat => !dislikedTracks.has(beat.file));
            // --- ИСПРАВЛЕНИЕ: Перемешиваем при каждом запуске ---
            currentPlaylist.sort(() => Math.random() - 0.5); 
            
            if (currentPlaylist.length > 0) {
                 await loadTrack(0, false, 'none');
                 showPlayer();
            } else {
                 showNoResults();
            }
             updateSliderProgress(elements.volumeSlider);
        } catch (error) { showNoResults(error.message); }
        setupCanvas();
        animateBackground();
        await setupEventListeners();
    }

    function populateFilterPanel() {
        elements.selectedTagsContainer.innerHTML = '';
        const tagCounts = {};
        allBeats.flatMap(b => b.hashtags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
        const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
        elements.filterTags.innerHTML = '';
        sortedTags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = 'filter-tag'; btn.textContent = tag; btn.dataset.tag = tag;
            if (activeFilters.has(tag)) { btn.classList.add('active'); addTagToSelectedContainer(tag); }
            btn.onclick = () => handleTagClick(btn, tag);
            elements.filterTags.appendChild(btn);
        });
    }
    
    function addTagToSelectedContainer(tag) {
        if (elements.selectedTagsContainer.querySelector(`[data-tag="${tag}"]`)) return;
        const tagEl = document.createElement('div');
        tagEl.className = 'selected-tag'; tagEl.textContent = tag; tagEl.dataset.tag = tag;
        tagEl.onclick = () => { const btn = elements.filterTags.querySelector(`[data-tag="${tag}"]`); if (btn) handleTagClick(btn, tag); };
        elements.selectedTagsContainer.appendChild(tagEl);
    }

    function removeTagFromSelectedContainer(tag) { const tagEl = elements.selectedTagsContainer.querySelector(`[data-tag="${tag}"]`); if (tagEl) tagEl.remove(); }

    function handleTagClick(button, tag) {
        button.classList.toggle('active');
        if (activeFilters.has(tag)) { activeFilters.delete(tag); removeTagFromSelectedContainer(tag);
        } else { activeFilters.add(tag); addTagToSelectedContainer(tag); }
        updatePlaylist();
    }
    
    function clearAllFilters() {
        activeFilters.clear(); elements.selectedTagsContainer.innerHTML = '';
        document.querySelectorAll('.filter-tag.active').forEach(b => b.classList.remove('active'));
        elements.filterBtn.classList.remove('active'); elements.tagSearchInput.value = '';
        elements.filterTags.querySelectorAll('.filter-tag').forEach(tag => { tag.style.display = 'block'; });
        updatePlaylist();
    }
    
    function resetPlayerUI() {
        elements.player.pause(); elements.player.src = "";
        elements.title.textContent = '---'; elements.cover.src = '';
        elements.coverArtContainer.style.boxShadow = 'none'; elements.hashtags.innerHTML = "";
        elements.currentTime.textContent = '0:00'; elements.duration.textContent = '0:00';
        elements.progressBar.value = 0; elements.progressBar.max = 0;
        updateSliderProgress(elements.progressBar); updateLikeDislikeStatus();
    }
    
    // --- ИСПРАВЛЕНИЕ: Логика обновления плейлиста с полным рандомом ---
    function updatePlaylist() {
        const currentlyPlayingTrack = !elements.player.paused && currentTrackIndex > -1 ? currentPlaylist[currentTrackIndex] : null;

        // 1. Фильтруем биты по новым тегам
        let newFilteredPlaylist = allBeats
            .filter(beat => !dislikedTracks.has(beat.file))
            .filter(b => activeFilters.size === 0 || [...activeFilters].every(f => (b.hashtags || []).includes(f)));

        // 2. СРАЗУ ЖЕ ПЕРЕМЕШИВАЕМ результат
        newFilteredPlaylist.sort(() => Math.random() - 0.5);

        // 3. Обрабатываем играющий трек
        if (currentlyPlayingTrack) {
            // Ищем его в новом (уже перемешанном) плейлисте
            const indexInNewPlaylist = newFilteredPlaylist.findIndex(t => t.file === currentlyPlayingTrack.file);

            if (indexInNewPlaylist !== -1) {
                // Если он есть - удаляем его со случайной позиции...
                newFilteredPlaylist.splice(indexInNewPlaylist, 1);
            }
            // ... и всегда ставим в начало, чтобы он доиграл.
            newFilteredPlaylist.unshift(currentlyPlayingTrack);
        }
        
        currentPlaylist = newFilteredPlaylist;
        
        if (currentlyPlayingTrack) {
            // Индекс играющего трека теперь всегда 0
            currentTrackIndex = 0; 
        } else {
            // Если ничего не играло и плейлист не пуст...
            if(currentPlaylist.length > 0) {
                 // ...загружаем первый (случайный) трек на паузе
                 currentTrackIndex = 0;
                 loadTrack(currentTrackIndex, false, 'none');
                 showPlayer();
            } else {
                // Если плейлист пуст, всё сбрасываем
                currentTrackIndex = -1;
                resetPlayerUI();
                showNoResults();
            }
        }
        elements.filterBtn.classList.toggle('active', activeFilters.size > 0);
    }

    function showNoResults() { elements.playerCore.style.display = 'none'; elements.noResults.style.display = 'flex'; }
    function showPlayer() { elements.playerCore.style.display = 'flex'; elements.noResults.style.display = 'none'; }
    
    async function loadAudioForEffect(trackData) {
        if (!audioContext || audioBuffers.has(trackData.file)) return;
        try {
            const response = await fetch(`mp3/${encodeURIComponent(trackData.file)}`);
            const arrayBuffer = await response.arrayBuffer();
            const decodedData = await audioContext.decodeAudioData(arrayBuffer);
            audioBuffers.set(trackData.file, decodedData);
        } catch (error) { console.error('Не удалось загрузить аудио для эффекта:', error); }
    }
    
    async function loadTrack(index, shouldPlay, direction = 'next') {
        if (isSwitching || !currentPlaylist || !currentPlaylist[index]) { isSwitching = false; return; }
        isSwitching = true;
        hideAllPreviews();

        const trackData = currentPlaylist[index];
        currentTrackIndex = index;
        loadAudioForEffect(trackData);
        
        const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
        const inClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';
        if (direction !== 'none') elements.contentWrapper.classList.add(outClass);

        setTimeout(() => {
            showPlayer();
            elements.coverArtContainer.style.boxShadow = 'none';
            elements.player.src = `mp3/${encodeURIComponent(trackData.file)}`;
            elements.title.textContent = trackData.title;
            if (trackData.cover_path) {
                const coverPath = trackData.cover_path.replace(/\\/g, '/');
                elements.cover.src = encodeURIComponent(coverPath);
                elements.cover.onload = () => getDominantColor(elements.cover);
                elements.cover.onerror = () => { console.error("Ошибка загрузки обложки: " + elements.cover.src); elements.coverArtContainer.style.boxShadow = 'none'; };
            } else { elements.cover.src = ""; elements.coverArtContainer.style.boxShadow = 'none'; }
            elements.buyLinkSmall.href = trackData.buy_link || '#';
            elements.buyLinkSmall.style.display = trackData.buy_link ? "block" : "none";
            elements.hashtags.innerHTML = "";
            (trackData.hashtags || []).forEach(tag => { const tagEl = document.createElement("span"); tagEl.className = "hashtag"; tagEl.textContent = tag; elements.hashtags.appendChild(tagEl); });
            updateLikeDislikeStatus();

            if (direction !== 'none') {
                elements.contentWrapper.classList.remove(outClass); void elements.contentWrapper.offsetWidth; 
                elements.contentWrapper.classList.add(inClass);
            }
            if (shouldPlay) elements.player.play().catch(e => console.error("Play error:", e));
            setTimeout(() => { if (direction !== 'none') elements.contentWrapper.classList.remove(inClass); isSwitching = false; }, animationSpeed);
        }, direction !== 'none' ? animationSpeed : 0);
    }
    
    function formatTime(s) { const m = Math.floor(s / 60) || 0; const t = Math.floor(s - m * 60) || 0; return `${m}:${t < 10 ? "0" : ""}${t}`; }
    function updateSliderProgress(s) { const p = (s.value - s.min) / (s.max - s.min); s.style.setProperty('--progress-percent', `${p * 100}%`); }
    function getDominantColor(img) { try { const c = document.createElement('canvas'); const ctx = c.getContext('2d', { willReadFrequently: true }); c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; elements.coverArtContainer.style.boxShadow = `0 0 25px 5px rgba(${d[0]},${d[1]},${d[2]},0.5)`; } catch (e) { elements.coverArtContainer.style.boxShadow = 'none'; } }
    function findSimilarTrack() {
        if (allBeats.length <= 1 || currentTrackIndex === -1) return null;
        const currentTrack = currentPlaylist[currentTrackIndex];
        if (!currentTrack) return null;
        const currentHashtags = new Set(currentTrack.hashtags);
        const scoredTracks = allBeats.filter(t => t.file !== currentTrack.file && !dislikedTracks.has(t.file)).map(track => ({ track, score: (track.hashtags || []).reduce((acc, tag) => acc + (currentHashtags.has(tag) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
        return (scoredTracks.length === 0 || scoredTracks[0].score === 0) ? null : scoredTracks[0].track;
    }

    function updateSidePreview(previewElement, trackData, customText = null) {
        if (!previewElement) return;
        if (customText) { previewElement.innerHTML = `<p class="side-preview-text">${customText}</p>`;
        } else if (trackData) {
            const coverPath = trackData.cover_path ? trackData.cover_path.replace(/\\/g, '/') : '';
            previewElement.innerHTML = `<img src="${coverPath ? encodeURIComponent(coverPath) : ''}" alt="${trackData.title}"><p>${trackData.title}</p>`;
        } else { previewElement.innerHTML = ''; }
        previewElement.classList.add('visible');
    }
    
    function hideAllPreviews() { hideSidePreview(elements.similarTrackPreview); hideSidePreview(elements.nextTrackPreview); hideSidePreview(elements.prevTrackPreview); }
    function hideSidePreview(previewElement) { if(previewElement) previewElement.classList.remove('visible'); }
    function updateSideListCounters() { if(elements.likedCount) elements.likedCount.textContent = likedTracks.size; if(elements.dislikedCount) elements.dislikedCount.textContent = dislikedTracks.size; }

    function triggerListUpdateAnimation(listPanel, isPositive) {
        if (!listPanel) return; listPanel.classList.add('flash');
        const toggle = listPanel.querySelector('.side-list-toggle');
        if (toggle) {
            const plusOne = document.createElement('span'); plusOne.className = 'plus-one-anim';
            plusOne.textContent = '+1'; plusOne.style.color = isPositive ? 'var(--like-color)' : 'var(--text-tertiary)';
            toggle.appendChild(plusOne); setTimeout(() => plusOne.remove(), 1200);
        } setTimeout(() => listPanel.classList.remove('flash'), 600);
    }
    
    function renderSideLists() { renderList(elements.likedListContainer, likedTracks, 'liked'); renderList(elements.dislikedListContainer, dislikedTracks, 'disliked'); updateSideListCounters(); }

    function renderList(container, trackSet, type) {
        container.innerHTML = ''; if (trackSet.size === 0) { container.innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-tertiary);">Здесь пока пусто.</p>`; return; }
        trackSet.forEach(file => {
            const trackData = allBeats.find(t => t.file === file); if (!trackData) return;
            const item = document.createElement('div'); item.className = 'side-list-item'; item.dataset.file = file;
            const coverPath = trackData.cover_path ? trackData.cover_path.replace(/\\/g, '/') : '';
            item.innerHTML = `<img src="${coverPath ? encodeURIComponent(coverPath) : ''}" alt=""><p class="side-list-item-title">${trackData.title}</p><button class="side-list-item-remove material-icons">close</button>`;
            item.addEventListener('click', async (e) => {
                if (e.target.classList.contains('side-list-item-remove')) return; if (window.innerWidth <= 1100) e.currentTarget.closest('.side-list').classList.remove('visible');
                if (activeFilters.size > 0) clearAllFilters(); else updatePlaylist();
                const trackToPlayIndex = currentPlaylist.findIndex(t => t.file === file);
                if(trackToPlayIndex !== -1) await loadTrack(trackToPlayIndex, true, 'next');
            });
            item.querySelector('.side-list-item-remove').onclick = (e) => { e.stopPropagation(); if (type === 'liked') likedTracks.delete(file); else dislikedTracks.delete(file); updatePlaylist(); renderSideLists(); updateLikeDislikeStatus(); saveState(); };
            container.appendChild(item);
        });
    }

    function updateLikeDislikeStatus() {
        const currentFile = currentTrackIndex > -1 && currentPlaylist.length > 0 ? currentPlaylist[currentTrackIndex]?.file : null;
        if (currentFile) {
            elements.likeBtn.classList.toggle('active', likedTracks.has(currentFile));
            elements.dislikeBtn.classList.toggle('active', dislikedTracks.has(currentFile));
        } else {
            elements.likeBtn.classList.remove('active');
            elements.dislikeBtn.classList.remove('active');
        }
    }
    
    function createReverb() {
        if (!audioContext) return null;
        const convolver = audioContext.createConvolver(); const sampleRate = audioContext.sampleRate;
        const length = sampleRate * 4.0; 
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0); const impulseR = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const n = length - i;
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 1.8);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 1.8);
        }
        convolver.buffer = impulse;
        return convolver;
    }
    
    function playPauseTail() {
        if (!audioContext || currentTrackIndex < 0) return;
        const trackData = currentPlaylist[currentTrackIndex];
        const audioBuffer = audioBuffers.get(trackData.file);
        if (!audioBuffer) return;

        const tailDuration = 0.05; 
        const sampleRate = audioBuffer.sampleRate;
        let startSample = Math.floor((elements.player.currentTime - tailDuration) * sampleRate);
        if (startSample < 0) startSample = 0;
        
        const endSample = startSample + Math.floor(tailDuration * sampleRate);
        const durationInSamples = endSample - startSample;
        if (durationInSamples <= 0) return;
        
        const segment = audioContext.createBuffer(audioBuffer.numberOfChannels, durationInSamples, sampleRate);
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            const channelData = audioBuffer.getChannelData(i).slice(startSample, endSample);
            segment.copyToChannel(channelData, i);
        }

        const source = audioContext.createBufferSource();
        source.buffer = segment;
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(elements.player.volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 6);

        const reverb = createReverb();
        source.connect(reverb).connect(gainNode).connect(audioContext.destination);
        source.start();
    }


    async function setupEventListeners() {
        const showNextPreview = () => { if (!allowPreview) return; const nextIndex = (currentTrackIndex + 1); if (nextIndex < currentPlaylist.length) { updateSidePreview(elements.nextTrackPreview, currentPlaylist[nextIndex]); } };
        const showPrevPreview = () => { if (!allowPreview) return; const prevIndex = (currentTrackIndex - 1); if (prevIndex >= 0) { updateSidePreview(elements.prevTrackPreview, currentPlaylist[prevIndex]); }};
        const showSimilarPreview = () => { if (!allowPreview) return; hideAllPreviews(); const similarTrack = findSimilarTrack(); updateSidePreview(elements.similarTrackPreview, similarTrack, similarTrack ? null : 'Похожих не найдено'); };
        const playTrackAction = async (playFn) => { if (isSwitching) return; allowPreview = false; hideAllPreviews(); await playFn(); setTimeout(() => { allowPreview = true; }, 100); };
        
        const playNext = async () => {
            // Берём следующий трек из УЖЕ отфильтрованного и перемешанного списка.
            const nextIndex = currentTrackIndex + 1;
            if (nextIndex < currentPlaylist.length) {
                await loadTrack(nextIndex, true, 'next');
            } else {
                resetPlayerUI(); showNoResults();
            }
        };
        const playPrev = async () => {
            const prevIndex = currentTrackIndex - 1;
            if (prevIndex >= 0) {
                await loadTrack(prevIndex, true, 'prev');
            }
        };
        const playSimilar = async () => {
            if (activeFilters.size > 0) clearAllFilters(); else updatePlaylist();
            setTimeout(async () => {
                 const similarTrack = findSimilarTrack();
                 if (similarTrack) {
                    const trackToPlayIndex = currentPlaylist.findIndex(t => t.file === similarTrack.file);
                    if (trackToPlayIndex !== -1) await loadTrack(trackToPlayIndex, true, 'next');
                 }
            }, 50);
        };
        
        elements.nextBtn.addEventListener('click', () => playTrackAction(playNext));
        elements.prevBtn.addEventListener('click', () => playTrackAction(playPrev));
        elements.similarTrackBtn.addEventListener('click', () => playTrackAction(playSimilar));
        elements.nextBtn.addEventListener('pointerenter', showNextPreview);
        elements.prevBtn.addEventListener('pointerenter', showPrevPreview);
        elements.similarTrackBtn.addEventListener('pointerenter', showSimilarPreview);
        elements.nextBtn.addEventListener('pointerleave', hideAllPreviews);
        elements.prevBtn.addEventListener('pointerleave', hideAllPreviews);
        elements.similarTrackBtn.addEventListener('pointerleave', hideAllPreviews);
        
        const togglePlayPause = () => {
            if (currentPlaylist.length === 0 || currentTrackIndex < 0) return;
            if (!isAudioSetup) setupAudioVisualizer();
            if (elements.player.paused) { elements.player.play(); } 
            else { elements.player.pause(); playPauseTail(); }
        };
        elements.playPauseBtn.onclick = togglePlayPause;

        elements.player.onended = () => playTrackAction(playNext);
        elements.player.onloadedmetadata = () => { elements.duration.textContent = formatTime(elements.player.duration); elements.progressBar.max = elements.player.duration; };
        
        let isSeeking = false;
        elements.progressBar.addEventListener('input', () => { elements.currentTime.textContent = formatTime(elements.progressBar.value); updateSliderProgress(elements.progressBar); });
        elements.progressBar.addEventListener('change', () => { elements.player.currentTime = elements.progressBar.value; });
        elements.player.ontimeupdate = () => { if (!isSeeking) { elements.progressBar.value = elements.player.currentTime; elements.currentTime.textContent = formatTime(elements.player.currentTime); updateSliderProgress(elements.progressBar); } };
        elements.progressBar.addEventListener('pointerdown', () => { isSeeking = true; });
        elements.progressBar.addEventListener('pointerup', () => { isSeeking = false; });
        
        elements.player.onpause = () => { elements.playIcon.textContent = "play_arrow"; elements.playPauseBtn.classList.remove("playing"); elements.coverArtContainer.classList.add("paused"); };
        elements.player.onplay = () => { if (!isAudioSetup) setupAudioVisualizer(); elements.playIcon.textContent = "pause"; elements.playPauseBtn.classList.add("playing"); elements.coverArtContainer.classList.remove("paused"); if (currentTrackIndex !== -1) document.title = `floxx. - ${currentPlaylist[currentTrackIndex]?.title || 'beatstore'}`; };
        
        const handleVolumeChange = (e) => { elements.player.volume = e.target.value; updateSliderProgress(e.target); };
        elements.volumeSlider.addEventListener('input', handleVolumeChange);
        elements.volumeSlider.addEventListener('change', handleVolumeChange);
        
        elements.filterBtn.onclick = () => { elements.filterSidebar.classList.toggle('visible'); elements.playerContainer.classList.toggle('sidebar-visible'); };
        elements.authorLogo.onclick = () => elements.modalOverlay.classList.add('visible');
        elements.closeModalBtn.onclick = () => elements.modalOverlay.classList.remove('visible');
        elements.clearCacheBtn.onclick = () => { isClearingCache = true; localStorage.removeItem('floxxPlayerState'); location.reload(); };
        elements.modalOverlay.onclick = (e) => { if (e.target === elements.modalOverlay) elements.modalOverlay.classList.remove('visible'); };
        
        elements.themeToggleBtn.onclick = () => { currentThemeIndex = (currentThemeIndex + 1) % themes.length; elements.body.className = themes[currentThemeIndex]; };
        elements.vizToggleBtn.onclick = () => { currentVizModeIndex = (currentVizModeIndex + 1) % vizModes.length; elements.vizToggleBtn.dataset.tooltip = vizModes[currentVizModeIndex]; };

        elements.likeBtn.onclick = () => {
            if (currentTrackIndex === -1) return;
            const currentFile = currentPlaylist[currentTrackIndex].file;
            if (likedTracks.has(currentFile)) { likedTracks.delete(currentFile); } 
            else {
                triggerListUpdateAnimation(elements.likedListPanel, true);
                likedTracks.add(currentFile);
                if (dislikedTracks.has(currentFile)) { dislikedTracks.delete(currentFile); updatePlaylist(); }
            }
            renderSideLists(); updateLikeDislikeStatus(); saveState();
        };
        elements.dislikeBtn.onclick = async () => {
            if (currentTrackIndex === -1) return;
            const currentFile = currentPlaylist[currentTrackIndex].file;
            const wasPlaying = !elements.player.paused;
            dislikedTracks.add(currentFile);
            if(likedTracks.has(currentFile)) likedTracks.delete(currentFile);
            triggerListUpdateAnimation(elements.dislikedListPanel, false);
            updatePlaylist(); // Обновляем плейлист (исключаем трек)
            if(wasPlaying) await playTrackAction(playNext); // и включаем следующий
            renderSideLists(); updateLikeDislikeStatus(); saveState();
        };
        
        const setupSidePanel = (panel, toggle) => { if (!panel || !toggle) return; toggle.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.toggle('visible'); panel.classList.remove('peek'); }); toggle.addEventListener('pointerenter', () => { if (!panel.classList.contains('visible')) panel.classList.add('peek'); }); toggle.addEventListener('pointerleave', () => panel.classList.remove('peek')); };
        setupSidePanel(elements.likedListPanel, elements.likedListToggle);
        setupSidePanel(elements.dislikedListPanel, elements.dislikedListToggle);
        
        document.addEventListener('click', (e) => { if (window.innerWidth > 1100) { if (e.target.closest('.side-list-toggle')) return; if (elements.likedListPanel.classList.contains('visible')) elements.likedListPanel.classList.remove('visible'); if (elements.dislikedListPanel.classList.contains('visible')) elements.dislikedListPanel.classList.remove('visible'); }});
        elements.tagSearchInput.addEventListener('input', (e) => { const searchTerm = e.target.value.toLowerCase().trim(); elements.filterTags.querySelectorAll('.filter-tag').forEach(tag => { tag.style.display = tag.dataset.tag.toLowerCase().includes(searchTerm) ? 'block' : 'none'; }); });
        elements.showLikedBtn.onclick = () => elements.likedListPanel.classList.add('visible');
        elements.showDislikedBtn.onclick = () => elements.dislikedListPanel.classList.add('visible');
        elements.showLinksBtn.onclick = () => elements.linksModalOverlay.classList.add('visible');
        elements.closeLinksModalBtn.onclick = () => elements.linksModalOverlay.classList.remove('visible');
        elements.linksModalOverlay.onclick = (e) => { if (e.target === elements.linksModalOverlay) elements.linksModalOverlay.classList.remove('visible'); };
        elements.sideListCloseBtns.forEach(btn => btn.onclick = () => btn.closest('.side-list').classList.remove('visible'));

        window.onbeforeunload = () => { if (!isClearingCache) saveState(); };
        window.addEventListener('resize', setupCanvas);
    }
    
    function setupCanvas() {
        elements.bgCanvas.width = window.innerWidth;
        elements.bgCanvas.height = window.innerHeight;
        particles = Array.from({ length: 200 }, () => ({
            x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
            baseRadius: 1.5 * Math.random() + 0.5,
            vx: 0.2 * Math.random() - 0.1, vy: 0.2 * Math.random() - 0.1,
            freqIndex: Math.floor(Math.random() * 256) 
        }));
    }
    
    function setupAudioVisualizer() {
        if (isAudioSetup) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaElementSource(elements.player);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            frequencyData = new Uint8Array(analyser.frequencyBinCount);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            const maxFrequency = 20000;
            const frequencyPerBin = audioContext.sampleRate / analyser.fftSize;
            effectiveBinCount = Math.floor(maxFrequency / frequencyPerBin);
            isAudioSetup = true;
        } catch (e) { console.error("Audio visualization setup failed:", e); }
    }
    
    function animateBackground() {
        requestAnimationFrame(animateBackground);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        if (isAudioSetup && analyser) { try { analyser.getByteFrequencyData(frequencyData); } catch (e) {} } else { frequencyData = null; }
        const mode = vizModes[currentVizModeIndex];
        const color = getComputedStyle(elements.body).getPropertyValue('--canvas-color').trim();

        function drawStars() {
            particles.forEach(p => {
                const i = (frequencyData) ? (frequencyData[p.freqIndex] / 255) : Math.random() * 0.1;
                const a = 0.2 + (i * 0.8 * Math.abs(Math.sin(p.x + Date.now() * 0.001)));
                ctx.beginPath(); ctx.arc(p.x, p.y, p.baseRadius, 0, 2 * Math.PI); ctx.fillStyle = `rgba(${color}, ${a})`; ctx.fill();
            });
        }
        
        switch(mode) {
            case 'particles': 
                particles.forEach(p => {
                    p.x += p.vx; p.y += p.vy;
                    if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1; if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;
                    const i = (frequencyData) ? (frequencyData[p.freqIndex] / 255) : 0;
                    const r = p.baseRadius + (i * 3); const a = 0.4 + (i * 0.6);
                    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fillStyle = `rgba(${color}, ${a})`; ctx.fill();
                }); break;
            case 'stars':  drawStars(); break;
            case 'waves':
                if (frequencyData && effectiveBinCount) {
                    ctx.shadowBlur = 15; ctx.shadowColor = `rgba(${color}, 0.6)`; ctx.fillStyle = `rgba(${color}, 0.55)`;
                    ctx.beginPath(); ctx.moveTo(0, window.innerHeight); 
                    for (let i = 0; i < effectiveBinCount; i++) {
                        const x = (i / (effectiveBinCount - 1)) * window.innerWidth;
                        const v = frequencyData[i] / 255.0;
                        const y = window.innerHeight - v * (window.innerHeight * 0.4); 
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(window.innerWidth, window.innerHeight);
                    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; 
                }
                drawStars(); break;
        }
    }
    
    initialize();
});