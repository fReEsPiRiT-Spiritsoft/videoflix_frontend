let overlayHls = null;
let NEWEST = document.getElementById('newest')

/**
 * Scrolls a video list container horizontally.
 * @param {HTMLElement} button - The button that triggered the scroll.
 * @param {number} amount - The number of pixels to scroll.
 */
function scrollHorizontally(button, amount) {
    const wrapper = button.closest('.scroll-wrapper');
    const container = wrapper.querySelector('ul');

    container.scrollBy({
        left: amount, behavior: 'smooth'
    });
}

/**
 * Initializes the video list and UI elements on page load.
 */
async function initVideoList() {
    initDOMElements();
    initEventListeners();
    setHeader();
    startRefreshIntervall();
    await loadAndSetupVideos();
    initScrollIndicators();
}

/**
 * Initializes key DOM elements used for video playback.
 */
function initDOMElements() {
    videoContainer = document.getElementById('videoPlayer');
    overlayVideoContainer = document.getElementById('overlayVideo');
    LASTREFRESH = new Date().getTime();
}

/**
 * Sets up event listeners such as resolution change.
 */
function initEventListeners() {
    // Custom controls are initialized when the overlay opens
    initCustomControls();
}

/**
 * Loads videos from the backend and sets up the UI.
 */
async function loadAndSetupVideos() {
    let response
    try {
        response = await getData();
        VIDEOS = await response.json();
        await getNewestVideos();
        setStartVideo();
        await renderVideosDynamically();
        setupInitialVideo();
    } catch (error) {
        document.getElementById('videoTitle').style.color = 'red';
        document.getElementById('category-new').style.display = 'none';
        document.getElementById('playButton').style.display = 'none';
        showToastMessage(true, ['Failed to load videos']);
    }
}

/**
 * Sets the initial video on page load.
 */
function setupInitialVideo() {
    if (VIDEOS && VIDEOS.length > 0) {
        currentVideo = VIDEOS[0].id;
        loadVideo(VIDEOS[0].id, '480p');
    }
}

/**
 * Filters the most recent videos (within the last 5 days).
 */
async function getNewestVideos() {
    let currentDate = new Date();
    let timeSpan = new Date(currentDate.getTime() - (5 * 24 * 60 * 60 * 1000));
    VIDEOS.forEach(video => {
        const videoDate = new Date(video.created_at)
        if (videoDate >= timeSpan) {
            LATESTVIDEOS.push(video)
        }
    })
}

/**
 * Sets the title and description for the first video.
 */
function setStartVideo() {
    document.getElementById('videoTitle').innerHTML = VIDEOS[0].title;
    document.getElementById('videoDescription').innerHTML = VIDEOS[0].description;
}

/**
 * Dynamically renders all video sections: first the "Newest" section, then all other categories.
 * It collects unique categories from the VIDEOS array, removes existing dynamic sections,
 * and creates new sections grouped by category.
 *
 * @async
 * @function
 */
async function renderVideosDynamically() {
    const container = document.querySelector('.list_section');

    renderNewestSection();

    const categories = new Set(VIDEOS.map(v => v.category.toLowerCase()));
    clearDynamicSections(container);

    categories.forEach(cat => {
        if (cat === 'newest') return;
        const videosInCategory = VIDEOS.filter(v => v.category.toLowerCase() === cat);
        const section = renderCategorySection(cat, videosInCategory);
        container.appendChild(section);
    });
}

/**
 * Renders the "Newest" video section.
 * Clears the existing content and appends each video from LATESTVIDEOS
 * using the `videoTemplate` function.
 *
 * @function
 */
function renderNewestSection() {
    NEWEST.innerHTML = '';
    LATESTVIDEOS.forEach(video => {
        NEWEST.append(videoTemplate(video, video.thumbnail_url));
    });
}

/**
 * Removes all dynamically generated category sections from the given container.
 *
 * @param {HTMLElement} container - The parent element containing video sections.
 *
 * @function
 */
function clearDynamicSections(container) {
    [...container.querySelectorAll('.video_list.dynamic-category')].forEach(el => el.remove());
}

/**
 * Creates a section element for a specific video category, including a heading and video list.
 *
 * @param {string} cat - The category name (in lowercase).
 * @param {Object[]} videos - An array of video objects belonging to this category.
 * @returns {HTMLElement} - The constructed <section> DOM element.
 *
 * @function
 */
function renderCategorySection(cat, videos) {
    const section = document.createElement('section');
    section.classList.add('video_list', 'dynamic-category');

    const h2 = document.createElement('h2');
    h2.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    section.appendChild(h2);

    const scrollWrapper = document.createElement('div');
    scrollWrapper.classList.add('scroll-wrapper');

    const ul = document.createElement('ul');
    ul.id = cat;

    videos.forEach(video => {
        ul.appendChild(videoTemplate(video));
    });

    scrollWrapper.appendChild(ul);
    section.appendChild(scrollWrapper);

    return section;
}

/**
 * Creates a video thumbnail element.
 * @param {Object} video - The video object.
 * @returns {HTMLElement} The list item containing the video thumbnail.
 */
function videoTemplate(video) {
    let listItem = document.createElement('li');
    let img = document.createElement('img');
    img.setAttribute("src", video.thumbnail_url)
    img.setAttribute("alt", video.title)
    img.setAttribute("onclick", `showVideo(${video.id})`)
    listItem.append(img);
    return listItem;
}

/**
 * Displays video details and loads the selected video.
 * @param {number} id - The video ID.
 */
function showVideo(id) {
    let video = VIDEOS.find(video => video.id == id);
    document.getElementById('videoTitle').innerHTML = video.title;
    document.getElementById('videoDescription').innerHTML = video.description;
    document.getElementById('playButton').setAttribute("onclick", `playVideo(${id})`)
    currentVideo = id
    loadVideo(id, '480p');
}

/**
 * Starts an interval that refreshes the JWT token every 20 minutes.
 */
function startRefreshIntervall() {
    STARTINTERVALL = setInterval(async () => {
        await doRefresh();
    }, 20 * 60 * 1000);
}

/**
 * Calls the backend to refresh the JWT token.
 */
async function doRefresh() {
    await fetch(`${API_BASE_URL}${REFRESH_URL}`, {
        method: 'POST', headers: {
            'Content-Type': 'application/json',
        }, credentials: 'include',
    })
}

/**
 * Loads and plays a video using HLS.js.
 * @param {number} id - The video ID.
 * @param {string} resolution - The desired video resolution (e.g., '480p').
 */
function loadVideo(id, resolution) {
    if (hls) {
        hls.destroy();
    }
    hls = new Hls({
        xhrSetup: function (xhr) {
            xhr.withCredentials = true
        },
        // BUFFER-MANAGEMENT
        maxBufferLength: 45,
        maxMaxBufferLength: 900,
        maxBufferSize: 90 * 1000 * 1000,
        maxBufferHole: 0.5,
        backBufferLength: 90,

        // STALL-DETECTION
        lowBufferWatchdogPeriod: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
        maxFragLookUpTolerance: 0.25,

        // PERFORMANCE
        enableWorker: true,
        startFragPrefetch: true,
        testBandwidth: true,
        enableSoftwareAES: true,

        // SEEK
        maxSeekHole: 2,
        seekHoleNudgeDuration: 0.01,

        // NETWORK-CONFIGURATION
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,

        // APPEND-CONFIGURATION
        appendErrorMaxRetry: 3,
        loaderMaxRetry: 2,
        loaderMaxRetryTimeout: 64000,

        // ADVANCED SETTINGS
        lowLatencyMode: false,
        enableCEA708Captions: false,
        stretchShortVideoTrack: false,
        forceKeyFrameOnDiscontinuity: true,

        // LIVE-STREAM-CONFIGURATION
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: false,

        // FRAGMENT-DRIFT-TOLERANCE
        maxAudioFramesDrift: 1,
        maxVideoFramesDrift: 1,

        // DEBUG
        debug: false,

        // METADATA-CONFIGURATION
        enableDateRangeMetadataCues: false,
        enableEmsgMetadataCues: false,
        enableID3MetadataCues: false
    });
    hls.loadSource(`${API_BASE_URL}${URL_TO_INDEX_M3U8(id, resolution)}`);
    hls.attachMedia(videoContainer);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setTimeout(() => {
            videoContainer.play().catch(() => {
                console.log("User interaction required to start playback");
            });
        }, 2000)
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
            console.error("HLS fatal error:", data);
        }
    });
}

/**
 * Proofs if a container is scrollable and add then the CSS class
 * @param {HTMLElement} container - container that should be proofed
 */
function updateScrollIndicator(container) {
    const scrollWrapper = container.closest('.scroll-wrapper');
    if (!scrollWrapper) return;

    const isScrollable = container.scrollWidth > container.clientWidth;

    if (isScrollable) {
        scrollWrapper.classList.add('scrollable');
    } else {
        scrollWrapper.classList.remove('scrollable');
    }
}

/**
 * Initialised scroll indicators for all video lists
 */
function initScrollIndicators() {
    const videoLists = document.querySelectorAll('.video_list ul');

    videoLists.forEach(list => {
        updateScrollIndicator(list);

        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                updateScrollIndicator(list);
            });
            resizeObserver.observe(list);
            resizeObserver.observe(list.parentElement);
        }

        window.addEventListener('resize', () => {
            setTimeout(() => updateScrollIndicator(list), 100);
        });
    });
}

/**
 * Refreshes all scroll indicators
 */
function updateAllScrollIndicators() {
    const videoLists = document.querySelectorAll('.video_list ul');
    videoLists.forEach(list => {
        updateScrollIndicator(list);
    });
}

/**
 * Loads a video in the overlay using HLS.js.
 * @param {number} id - The video ID.
 * @param {string} resolution - The desired resolution.
 */
function loadVideoInOverlay(id, resolution) {
    if (overlayHls) {
        overlayHls.destroy();
    }

    overlayHls = new Hls({
        xhrSetup: function (xhr) {
            xhr.withCredentials = true
        },
        // BUFFER-MANAGEMENT
        maxBufferLength: 45,
        maxMaxBufferLength: 900,
        maxBufferSize: 90 * 1000 * 1000,
        maxBufferHole: 0.5,
        backBufferLength: 90,

        // STALL-DETECTION
        lowBufferWatchdogPeriod: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
        maxFragLookUpTolerance: 0.25,

        // PERFORMANCE
        enableWorker: true,
        startFragPrefetch: true,
        testBandwidth: true,
        enableSoftwareAES: true,

        // SEEK
        maxSeekHole: 2,
        seekHoleNudgeDuration: 0.01,

        // NETWORK-CONFIGURATION
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,

        // APPEND-CONFIGURATION
        appendErrorMaxRetry: 3,
        loaderMaxRetry: 2,
        loaderMaxRetryTimeout: 64000,

        // ADVANCED SETTINGS
        lowLatencyMode: false,
        enableCEA708Captions: false,
        stretchShortVideoTrack: false,
        forceKeyFrameOnDiscontinuity: true,

        // LIVE-STREAM-CONFIGURATION
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: false,

        // FRAGMENT-DRIFT-TOLERANCE
        maxAudioFramesDrift: 1,
        maxVideoFramesDrift: 1,

        // DEBUG
        debug: false,

        // METADATA-CONFIGURATION
        enableDateRangeMetadataCues: false,
        enableEmsgMetadataCues: false,
        enableID3MetadataCues: false
    });

    overlayHls.loadSource(`${API_BASE_URL}${URL_TO_INDEX_M3U8(id, resolution)}`);
    overlayHls.attachMedia(overlayVideoContainer);

    overlayHls.on(Hls.Events.MANIFEST_PARSED, () => {
        setTimeout(() => {
            overlayVideoContainer.play().catch(() => {
            console.log("User interaction required to start overlay playback");
        });
        }, 2000)
    });

    overlayHls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
            console.error("HLS fatal error:", data);
        }
    });
}

/**
 * Opens the overlay player and starts playback.
 * @param {number} videoId - The video ID.
 * @param {string} resolution - The resolution to play.
 */
function openVideoOverlay(videoId, resolution) {
    const video = VIDEOS.find(video => video.id == videoId);
    if (!video) return;

    hideHeader();
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    document.body.classList.add('overlay-open');
    document.getElementById('overlayTitle').innerHTML = video.title;
    
    // Update quality selection in menu
    const options = document.querySelectorAll('.quality-option');
    options.forEach(option => {
        const checkmark = option.querySelector('.checkmark');
        if (option.dataset.quality === resolution) {
            option.classList.add('active');
            checkmark.style.display = 'inline';
        } else {
            option.classList.remove('active');
            checkmark.style.display = 'none';
        }
    });
    
    currentResolution = resolution;
    loadVideoInOverlay(videoId, resolution);
    document.body.style.overflow = 'hidden';
    
    // Initialize custom controls
    initCustomControls();
}

/**
 * Closes the overlay video player and resets the UI.
 */
function closeVideoOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'none';

    document.body.classList.remove('overlay-open');

    showHeader();

    if (overlayHls) {
        overlayHls.destroy();
        overlayHls = null;
    }

    overlayVideoContainer.pause();
    overlayVideoContainer.src = '';

    document.body.style.overflow = 'auto';
}

/**
 * Opens the video overlay for the given video.
 * @param {number} id - The video ID.
 */
function playVideo(id) {
    if (!id) {
        id = currentVideo;
    }
    openVideoOverlay(id, currentResolution);
}

/**
 * Hides the main header (e.g., when playing video fullscreen).
 */
function hideHeader() {
    const header = document.querySelector('.main_header');
    if (header) {
        header.style.transform = 'translateY(-100%)';
        header.style.opacity = '0';
        header.style.transition = 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out';
    }
}

/**
 * Shows the main header again.
 */
function showHeader() {
    const header = document.querySelector('.main_header');
    if (header) {
        header.style.transform = 'translateY(0)';
        header.style.opacity = '1';
        header.style.transition = 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out';
    }
}

/**
 * Closes the overlay when the Escape key is pressed.
 */
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeVideoOverlay();
    }
});

/* ========================================
   CUSTOM VIDEO PLAYER CONTROLS
   ======================================== */

let controlsTimeout;
let isSettingsMenuOpen = false;
let lastVolume = 1;

/**
 * Toggles play/pause for the overlay video.
 */
function togglePlayPause() {
    const video = overlayVideoContainer;
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    
    if (video.paused) {
        video.play();
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        video.pause();
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

/**
 * Toggles mute/unmute for the video.
 */
function toggleMute() {
    const video = overlayVideoContainer;
    const volumeIcon = document.getElementById('volumeIcon');
    const mutedIcon = document.getElementById('mutedIcon');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (video.muted || video.volume === 0) {
        video.muted = false;
        video.volume = lastVolume > 0 ? lastVolume : 0.5;
        volumeSlider.value = video.volume * 100;
        volumeIcon.style.display = 'block';
        mutedIcon.style.display = 'none';
    } else {
        lastVolume = video.volume;
        video.muted = true;
        volumeIcon.style.display = 'none';
        mutedIcon.style.display = 'block';
    }
    updateVolumeSliderBackground();
}

/**
 * Updates the volume slider background gradient.
 */
function updateVolumeSliderBackground() {
    const volumeSlider = document.getElementById('volumeSlider');
    const percentage = volumeSlider.value;
    volumeSlider.style.setProperty('--volume-percentage', percentage + '%');
}

/**
 * Toggles the settings menu visibility.
 */
function toggleSettingsMenu() {
    const menu = document.getElementById('settingsMenu');
    isSettingsMenuOpen = !isSettingsMenuOpen;
    
    if (isSettingsMenuOpen) {
        menu.classList.add('show');
    } else {
        menu.classList.remove('show');
    }
}

/**
 * Changes video quality and updates the UI.
 * @param {string} quality - The selected quality (e.g., '720p', '1080p', or 'auto').
 */
function changeQuality(quality) {
    const options = document.querySelectorAll('.quality-option');
    
    // Update active state
    options.forEach(option => {
        const checkmark = option.querySelector('.checkmark');
        if (option.dataset.quality === quality) {
            option.classList.add('active');
            checkmark.style.display = 'inline';
        } else {
            option.classList.remove('active');
            checkmark.style.display = 'none';
        }
    });
    
    // Close menu
    toggleSettingsMenu();
    
    // Save current playback position
    const currentTime = overlayVideoContainer.currentTime;
    
    if (quality === 'auto') {
        // Enable automatic quality selection
        enableAutoQuality();
    } else {
        // Manual quality selection
        currentResolution = quality;
        if (currentVideo) {
            loadVideoInOverlay(currentVideo, quality);
            
            // Restore playback position after loading
            overlayVideoContainer.addEventListener('loadedmetadata', function restoreTime() {
                overlayVideoContainer.currentTime = currentTime;
                overlayVideoContainer.removeEventListener('loadedmetadata', restoreTime);
            });
        }
    }
}

/**
 * Enables automatic quality selection using HLS adaptive bitrate.
 */
function enableAutoQuality() {
    if (overlayHls) {
        overlayHls.currentLevel = -1; // -1 enables automatic level selection
        console.log('Auto quality enabled');
    }
}

/**
 * Toggles fullscreen mode for the video wrapper.
 */
function toggleFullscreen() {
    const videoWrapper = document.querySelector('.video-wrapper');
    
    if (!document.fullscreenElement) {
        videoWrapper.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

/**
 * Updates the progress bar based on video playback.
 */
function updateProgress() {
    const video = overlayVideoContainer;
    const progressBar = document.getElementById('progressBar');
    
    if (video.duration) {
        const progress = (video.currentTime / video.duration) * 100;
        progressBar.style.width = progress + '%';
    }
}

/**
 * Updates the time display (current time and duration).
 */
function updateTimeDisplay() {
    const video = overlayVideoContainer;
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    
    if (currentTimeEl && video.currentTime !== undefined) {
        currentTimeEl.textContent = formatTime(video.currentTime);
    }
    
    if (durationEl && video.duration) {
        durationEl.textContent = formatTime(video.duration);
    }
}

/**
 * Formats seconds into MM:SS or HH:MM:SS format.
 * @param {number} seconds - Time in seconds.
 * @returns {string} Formatted time string.
 */
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Shows the custom controls.
 */
function showControls() {
    const controls = document.querySelector('.custom-controls');
    if (controls) {
        controls.classList.add('show');
        resetControlsTimeout();
    }
}

/**
 * Hides the custom controls after a delay.
 */
function hideControls() {
    const controls = document.querySelector('.custom-controls');
    const video = overlayVideoContainer;
    
    if (controls && !video.paused && !isSettingsMenuOpen) {
        controls.classList.remove('show');
    }
}

/**
 * Resets the auto-hide timeout for controls.
 */
function resetControlsTimeout() {
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, 3000);
}

/**
 * Initializes custom video player controls.
 */
function initCustomControls() {
    const video = overlayVideoContainer;
    const videoWrapper = document.querySelector('.video-wrapper');
    const progressContainer = document.getElementById('progressContainer');
    const controls = document.querySelector('.custom-controls');
    
    if (!video || !videoWrapper || !progressContainer || !controls) return;
    
    // Time update
    video.addEventListener('timeupdate', () => {
        updateProgress();
        updateTimeDisplay();
    });
    
    // Progress bar click
    progressContainer.addEventListener('click', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
    });
    
    // Show controls on mouse move
    videoWrapper.addEventListener('mousemove', showControls);
    videoWrapper.addEventListener('mouseenter', showControls);
    videoWrapper.addEventListener('mouseleave', () => {
        if (!video.paused && !isSettingsMenuOpen) {
            hideControls();
        }
    });
    
    // Click to play/pause
    video.addEventListener('click', togglePlayPause);
    
    // Space bar to play/pause
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.getElementById('overlay').style.display === 'flex') {
            e.preventDefault();
            togglePlayPause();
        }
        // F for fullscreen
        if (e.code === 'KeyF' && document.getElementById('overlay').style.display === 'flex') {
            toggleFullscreen();
        }
    });
    
    // Close settings menu when clicking outside
    document.addEventListener('click', (e) => {
        const settingsContainer = document.querySelector('.settings-container');
        if (isSettingsMenuOpen && settingsContainer && !settingsContainer.contains(e.target)) {
            toggleSettingsMenu();
        }
    });
    
    // Update play/pause icon when video state changes
    video.addEventListener('play', () => {
        document.getElementById('playIcon').style.display = 'none';
        document.getElementById('pauseIcon').style.display = 'block';
    });
    
    video.addEventListener('pause', () => {
        document.getElementById('playIcon').style.display = 'block';
        document.getElementById('pauseIcon').style.display = 'none';
        showControls();
    });
    
    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            video.volume = volume;
            video.muted = volume === 0;
            
            const volumeIcon = document.getElementById('volumeIcon');
            const mutedIcon = document.getElementById('mutedIcon');
            
            if (volume === 0) {
                volumeIcon.style.display = 'none';
                mutedIcon.style.display = 'block';
            } else {
                volumeIcon.style.display = 'block';
                mutedIcon.style.display = 'none';
                lastVolume = volume;
            }
            
            updateVolumeSliderBackground();
        });
        
        // Initialize volume slider background
        updateVolumeSliderBackground();
    }
    
    // Show controls initially
    showControls();
}
