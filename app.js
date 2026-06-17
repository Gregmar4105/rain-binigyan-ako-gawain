// State Management
const state = {
  playlistTitle: "QUADRANT/PLAYLIST",
  recordDuration: "10", // in seconds or "full"
  slots: [
    { title: "Song Title 1", artist: "ARTIST 1", videoFile: null, videoUrl: null, imageFile: null, imageUrl: null, extractedThumbnailUrl: null, videoElement: null },
    { title: "Song Title 2", artist: "ARTIST 2", videoFile: null, videoUrl: null, imageFile: null, imageUrl: null, extractedThumbnailUrl: null, videoElement: null },
    { title: "Song Title 3", artist: "ARTIST 3", videoFile: null, videoUrl: null, imageFile: null, imageUrl: null, extractedThumbnailUrl: null, videoElement: null },
    { title: "Song Title 4", artist: "ARTIST 4", videoFile: null, videoUrl: null, imageFile: null, imageUrl: null, extractedThumbnailUrl: null, videoElement: null },
    { title: "Song Title 5", artist: "ARTIST 5", videoFile: null, videoUrl: null, imageFile: null, imageUrl: null, extractedThumbnailUrl: null, videoElement: null }
  ],
  selectedIndex: -1,
  isAnimating: false,
  isRecording: false,
  vinylAngle: 0,
  vinylSpeed: 0.005, // base speed
  noisePattern: null,
  activeVideo: null,
  showNowPlaying: false
};

// Canvas references
const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');

// Web Audio API Context & Nodes
let audioCtx = null;
let audioDest = null;
let synthGain = null;

// UI Elements
const playlistTitleInput = document.getElementById('playlist-title');
const recordDurationSelect = document.getElementById('record-duration');
const btnPlay = document.getElementById('btn-play');
const btnRecord = document.getElementById('btn-record');
const statusText = document.getElementById('status-text');
const statusSpinner = document.getElementById('status-spinner');
const videoPool = document.getElementById('video-pool');

// Initialize the application
function init() {
  setupEventListeners();
  pregenerateNoisePattern();
  
  // Start render loop
  requestAnimationFrame(renderLoop);
  
  // Update canvas text on change
  playlistTitleInput.addEventListener('input', (e) => {
    state.playlistTitle = e.target.value || "QUADRANT/PLAYLIST";
  });
  
  recordDurationSelect.addEventListener('change', (e) => {
    state.recordDuration = e.target.value;
  });
}

// Set up all user input events
function setupEventListeners() {
  // Title & Artist inputs
  document.querySelectorAll('.song-title-input').forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      state.slots[idx].title = e.target.value || `Song Title ${idx + 1}`;
    });
  });

  document.querySelectorAll('.song-artist-input').forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      state.slots[idx].artist = (e.target.value || `ARTIST ${idx + 1}`).toUpperCase();
    });
  });

  // File uploads (Videos)
  document.querySelectorAll('.song-video-file').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const idx = parseInt(e.target.dataset.index);
      const file = e.target.files[0];
      if (!file) return;

      const label = document.getElementById(`label-video-${idx}`);
      label.textContent = "Loading...";
      label.classList.add('loaded');

      // Cleanup old url
      if (state.slots[idx].videoUrl) {
        URL.revokeObjectURL(state.slots[idx].videoUrl);
      }
      if (state.slots[idx].videoElement) {
        state.slots[idx].videoElement.remove();
      }

      const videoUrl = URL.createObjectURL(file);
      state.slots[idx].videoFile = file;
      state.slots[idx].videoUrl = videoUrl;

      // Create video element
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.style.display = 'none';
      videoPool.appendChild(video);
      state.slots[idx].videoElement = video;

      // Extract thumbnail
      label.textContent = "Extracting frame...";
      try {
        const thumbUrl = await extractVideoFrame(video);
        state.slots[idx].extractedThumbnailUrl = thumbUrl;
        label.textContent = file.name;
        updateStatus();
      } catch (err) {
        console.error("Frame extraction error:", err);
        label.textContent = file.name;
        updateStatus();
      }
    });
  });

  // File uploads (Images)
  document.querySelectorAll('.song-image-file').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      const file = e.target.files[0];
      if (!file) return;

      const label = document.getElementById(`label-image-${idx}`);
      label.textContent = "Loading...";
      label.classList.add('loaded');

      if (state.slots[idx].imageUrl) {
        URL.revokeObjectURL(state.slots[idx].imageUrl);
      }

      const imageUrl = URL.createObjectURL(file);
      state.slots[idx].imageFile = file;
      state.slots[idx].imageUrl = imageUrl;
      
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        label.textContent = file.name;
        updateStatus();
      };
    });
  });

  // Buttons
  btnPlay.addEventListener('click', () => startSelection(false));
  btnRecord.addEventListener('click', () => startSelection(true));
}

// Generate static noise texture to draw over the canvas for retro grit
function pregenerateNoisePattern() {
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 120;
  noiseCanvas.height = 120;
  const nCtx = noiseCanvas.getContext('2d');
  const imgData = nCtx.createImageData(120, 120);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const val = Math.floor(Math.random() * 255);
    data[i] = val;     // R
    data[i+1] = val;   // G
    data[i+2] = val;   // B
    data[i+3] = 18;    // Alpha (subtle overlay)
  }
  nCtx.putImageData(imgData, 0, 0);
  state.noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
}

// Extract frame at 1s of video as thumbnail
function extractVideoFrame(video) {
  return new Promise((resolve, reject) => {
    // Wait until metadata is loaded so we know dimensions
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 1.0; // Seek to 1s to ensure non-black frame
    }, { once: true });

    video.addEventListener('seeked', () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth || 640;
      tempCanvas.height = video.videoHeight || 360;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      const url = tempCanvas.toDataURL('image/jpeg', 0.85);
      resolve(url);
    }, { once: true });

    video.addEventListener('error', (e) => reject(e), { once: true });
    
    // Safety timeout
    setTimeout(() => reject(new Error("Frame extraction timeout")), 5000);
  });
}

// Update status and toggle play buttons
function updateStatus() {
  const missingVideos = state.slots.filter(s => !s.videoUrl).length;
  if (missingVideos === 0) {
    btnPlay.removeAttribute('disabled');
    btnRecord.removeAttribute('disabled');
    statusText.textContent = "Ready! Click 'Select & Play' or 'Record & Download'.";
  } else {
    btnPlay.setAttribute('disabled', 'true');
    btnRecord.setAttribute('disabled', 'true');
    statusText.textContent = `Please upload videos for all 5 slots. (${missingVideos} left)`;
  }
}

// Setup Audio Context for recording and synthesized sounds
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioDest = audioCtx.createMediaStreamDestination();
  
  synthGain = audioCtx.createGain();
  synthGain.gain.setValueAtTime(0, audioCtx.currentTime);
  synthGain.connect(audioCtx.destination);
  synthGain.connect(audioDest);
}

// Synthesize a retro clicking tick sound using Web Audio API
function playTickSound() {
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
  
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.connect(audioDest);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.06);
}

// Synthesize a bell chime when roulette lands
function playChimeSound() {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord
  
  frequencies.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5 - idx * 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.connect(audioDest);
    
    osc.start();
    osc.stop(now + 1.6);
  });
}

// Main Roulette Animation & Selection Flow
async function startSelection(recordMode = false) {
  if (state.isAnimating) return;
  
  initAudio();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Stop any currently playing video
  if (state.activeVideo) {
    state.activeVideo.pause();
    state.activeVideo = null;
  }
  
  state.isAnimating = true;
  state.isRecording = recordMode;
  state.selectedIndex = -1;
  state.vinylSpeed = 0.05; // increase vinyl spin speed
  
  statusSpinner.classList.add('active');
  statusText.textContent = recordMode ? "Recording selection process..." : "Selecting a random song...";

  // Disable controls during animation
  btnPlay.setAttribute('disabled', 'true');
  btnRecord.setAttribute('disabled', 'true');
  playlistTitleInput.setAttribute('readonly', 'true');
  recordDurationSelect.setAttribute('disabled', 'true');

  let recorder = null;
  let recordedChunks = [];
  let videoSourceNode = null;

  // Setup media recorder if recording mode
  if (recordMode) {
    recordedChunks = [];
    const canvasStream = canvas.captureStream(30);
    const mixedStream = new MediaStream();
    
    // Add canvas video tracks
    canvasStream.getVideoTracks().forEach(track => mixedStream.addTrack(track));
    // Add audio destination tracks
    audioDest.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));

    const candidateMimeTypes = [
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    let mimeType = '';
    for (const type of candidateMimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    if (!mimeType) {
      alert("Your browser does not support video recording. Please use Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari.");
      state.isAnimating = false;
      state.isRecording = false;
      enableControls();
      statusSpinner.classList.remove('active');
      statusText.textContent = "Recording failed: Video recording is not supported by your browser.";
      return;
    }

    try {
      recorder = new MediaRecorder(mixedStream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      recorder.onstop = async () => {
        statusText.textContent = "Transcoding to H.264 video and AAC audio...";
        const rawBlob = new Blob(recordedChunks, { type: mimeType });
        
        try {
          if (typeof FFmpeg === 'undefined') {
            throw new Error("FFmpeg library was not loaded from CDN.");
          }
          
          const { createFFmpeg, fetchFile } = FFmpeg;
          const ffmpeg = createFFmpeg({
            log: false,
            corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
          });
          
          ffmpeg.setProgress(({ ratio }) => {
            if (ratio >= 0 && ratio <= 1) {
              statusText.textContent = `Transcoding to social-media-compatible MP4: ${Math.round(ratio * 100)}%`;
            }
          });

          await ffmpeg.load();
          
          // Write the raw fragmented video to virtual filesystem
          ffmpeg.FS('writeFile', 'input.bin', await fetchFile(rawBlob));
          
          // Run transcoding: transcode video to H.264 (using ultrafast preset for web efficiency),
          // transcode audio to AAC, set pixel format to yuv420p for maximum platform support,
          // and add +faststart flag so video plays instantly on web pages.
          await ffmpeg.run(
            '-i', 'input.bin',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            'output.mp4'
          );
          
          // Read output file
          const data = ffmpeg.FS('readFile', 'output.mp4');
          
          // Create download link
          const outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
          const url = URL.createObjectURL(outputBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `playlist-selector-reveal.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          statusText.textContent = `Video saved and downloaded successfully as H.264 & AAC MP4!`;
        } catch (err) {
          console.error("FFmpeg H.264/AAC transcoding failed:", err);
          alert("Export failed: Could not save the video as an MP4 file using H.264/AAC. Please ensure your browser supports WebAssembly.");
          statusText.textContent = `Error: MP4 export failed.`;
        }
        
        statusSpinner.classList.remove('active');
        enableControls();
      };
      recorder.start();
    } catch (e) {
      console.error("Failed to initialize recorder:", e);
      state.isRecording = false;
    }
  }

  // Animation parameters
  const totalSteps = 24 + Math.floor(Math.random() * 10); // 24 to 33 steps
  const finalSlot = Math.floor(Math.random() * 5); // 0 to 4
  
  let step = 0;
  
  function runStep() {
    state.selectedIndex = step % 5;
    playTickSound();
    
    step++;
    if (step < totalSteps) {
      // Slow down animation progressively
      const progress = step / totalSteps;
      const delay = 60 + 500 * Math.pow(progress, 3); // starts at 60ms, slows to 560ms
      setTimeout(runStep, delay);
    } else {
      // Land on the actual final randomly selected slot
      state.selectedIndex = finalSlot;
      playChimeSound();
      state.vinylSpeed = 0.02; // playback record speed
      state.showNowPlaying = true; // Show Now Playing screen immediately!
      
      statusText.textContent = `Selected: ${state.slots[finalSlot].title}! Playing video...`;
      
      // Wait 1 second after landing, then play video
      setTimeout(() => {
        playSelectedVideo(finalSlot);
      }, 1000);
    }
  }

  // Start the roulette loop
  setTimeout(runStep, 100);

  // Playback & Stop recording execution
  function playSelectedVideo(idx) {
    const slot = state.slots[idx];
    const video = slot.videoElement;
    
    if (!video) {
      state.isAnimating = false;
      enableControls();
      return;
    }

    state.activeVideo = video;
    video.currentTime = 0;
    video.muted = false; // Unmute so user and recorder can hear

    // Connect video audio to AudioContext if not already connected
    // This allows route path: video -> audioCtx -> destination/recorder
    try {
      if (!video.dataset.connected) {
        videoSourceNode = audioCtx.createMediaElementSource(video);
        // Connect to speaker destination
        videoSourceNode.connect(audioCtx.destination);
        // Connect to recording destination
        videoSourceNode.connect(audioDest);
        video.dataset.connected = "true";
      }
    } catch (err) {
      console.warn("Audio connection notice:", err);
    }

    video.play();

    // Setup recording duration trigger
    if (state.recordDuration !== "full") {
      const durationMs = parseInt(state.recordDuration) * 1000;
      setTimeout(() => {
        stopPlaybackAndRecording();
      }, durationMs);
    } else {
      // Stop when video ends
      video.onended = () => {
        stopPlaybackAndRecording();
      };
      // Backup stop if video runs too long (safety threshold: 60s)
      setTimeout(() => {
        if (state.activeVideo === video) {
          stopPlaybackAndRecording();
        }
      }, 60000);
    }
  }

  function stopPlaybackAndRecording() {
    if (state.activeVideo) {
      state.activeVideo.pause();
      state.activeVideo.muted = true;
      state.activeVideo = null;
    }
    
    state.isAnimating = false;
    state.showNowPlaying = false; // Reset to selection board!
    state.vinylSpeed = 0.005; // return to idle speed
    
    if (state.isRecording && recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      statusText.textContent = "Playback completed.";
      statusSpinner.classList.remove('active');
      enableControls();
    }
    state.isRecording = false;
  }
}

// Re-enable input controls
function enableControls() {
  btnPlay.removeAttribute('disabled');
  btnRecord.removeAttribute('disabled');
  playlistTitleInput.removeAttribute('readonly');
  recordDurationSelect.removeAttribute('disabled');
}

// Render loop for the HTML5 Canvas
function renderLoop() {
  // Clear Canvas
  ctx.fillStyle = '#0f0f12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.activeVideo && !state.activeVideo.paused) {
    // Render the Now Playing Screen Layout (Image 2 style)
    drawNowPlayingScreen();
  } else {
    // Render the Selection Playlist Layout
    // 1. Draw Wavy lines
    drawWavyDecorations();

    // 2. Draw Vinyl record
    drawVinylRecord();

    // 3. Draw Header Title
    drawHeaderTitle();

    // 4. Draw Slots
    drawPlaylistSlots();
  }

  // 5. Apply subtle procedural noise/grit overlay for premium aesthetics
  if (state.noisePattern) {
    ctx.fillStyle = state.noisePattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Loop request
  requestAnimationFrame(renderLoop);
}

// Draw Now Playing Screen (Facebook compliant, stylized progressive card)
function drawNowPlayingScreen() {
  const activeSlot = state.slots[state.selectedIndex];
  if (!activeSlot) return;

  // 1. Draw Straight top stripes (Image 2 style)
  drawStraightStripes(40);

  // 2. Draw Straight bottom stripes (Image 2 style)
  drawStraightStripes(1800);

  // 3. Draw center container card (solid dark color matching the screenshot)
  const cardX = 100;
  const cardY = 240;
  const cardW = 880;
  const cardH = 1460;

  ctx.save();
  ctx.fillStyle = '#121214'; // Solid dark grey card background
  ctx.strokeStyle = '#222226'; // Subtle border outline
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 60;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24, true, true);
  ctx.restore();

  // 4. Draw Video frame inside card
  const videoX = cardX + 80;
  const videoY = cardY + 80;
  const videoSize = cardW - 160; // 720x720 square video frame

  ctx.save();
  // Clip rounded corners for video
  ctx.beginPath();
  drawRoundedRect(ctx, videoX, videoY, videoSize, videoSize, 16, false, false);
  ctx.clip();

  if (state.activeVideo) {
    const vw = state.activeVideo.videoWidth || 640;
    const vh = state.activeVideo.videoHeight || 360;
    const size = Math.min(vw, vh);
    // Draw cropped center of the video frame
    ctx.drawImage(
      state.activeVideo,
      (vw - size) / 2, (vh - size) / 2, size, size, // source center
      videoX, videoY, videoSize, videoSize          // destination
    );
  }
  ctx.restore();

  // 5. Draw Video border outline
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, videoX, videoY, videoSize, videoSize, 16, false, true);
  ctx.restore();

  // 6. Draw Title & Artist text below video player (left-aligned with the video!)
  const textX = videoX;
  const textY = videoY + videoSize + 90;

  // Song Title
  ctx.save();
  ctx.font = "bold 56px 'Outfit', sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(activeSlot.title, textX, textY);
  ctx.restore();

  // Artist Name (all caps, clean muted grey)
  ctx.save();
  ctx.font = "400 32px 'Outfit', sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#a1a1a6'; // light muted grey
  ctx.fillText(activeSlot.artist.toUpperCase(), textX, textY + 85);
  ctx.restore();
}

// Draw straight horizontal stripes at the top/bottom of Now Playing screen
function drawStraightStripes(yStart) {
  // Teal, Green, Yellow, Orange, Red matching retro palette
  const colors = [
    '#799890', // light teal
    '#355c56', // dark teal
    '#e07a3f', // orange
    '#e8b031', // yellow
    '#8f2d2d', // red
    '#e07a3f', // orange
    '#e8b031', // yellow
    '#8f2d2d'  // red
  ];
  ctx.lineWidth = 8;
  colors.forEach((color, idx) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, yStart + idx * 12);
    ctx.lineTo(1080, yStart + idx * 12);
    ctx.stroke();
  });
}

// Draw retro colored curves at corners (horizontal wave stripes)
function drawWavyDecorations() {
  const colors = [
    '#e07a3f', // wave orange
    '#e8b031', // wave yellow
    '#355c56', // wave dark teal
    '#799890'  // wave light teal
  ];

  ctx.lineWidth = 20;
  ctx.lineCap = 'round';

  // Top-left waves (matching direction: left to right)
  colors.forEach((color, idx) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    const startY = 45 + idx * 36;
    ctx.moveTo(0, startY);
    ctx.bezierCurveTo(120, startY + 35, 210, startY - 35, 360, startY + 15);
    ctx.stroke();
  });

  // Bottom-right waves (matching shape and horizontal orientation exactly!)
  colors.forEach((color, idx) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    const startY = 1750 + idx * 36;
    ctx.moveTo(720, startY);
    ctx.bezierCurveTo(840, startY + 35, 930, startY - 35, 1080, startY + 15);
    ctx.stroke();
  });
}

// Draw procedural vinyl record that spins dynamically during idle/roulette states
function drawVinylRecord() {
  const recordX = 820;
  const recordY = 960;
  const maxRadius = 360;

  // Spin rotation angle
  state.vinylAngle += state.vinylSpeed;

  ctx.save();
  ctx.translate(recordX, recordY);
  ctx.rotate(state.vinylAngle);

  // Solid dark vinyl body
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#1e1e22';
  ctx.beginPath();
  ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent'; // Reset shadow

  // Vinyl concentric groove lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 2;
  for (let r = 120; r < maxRadius - 15; r += 22) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw record center label
  ctx.fillStyle = '#8f2d2d'; // retro label center
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.fill();

  // Groove border line for label
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.stroke();

  // Spindle center hole
  ctx.fillStyle = '#0f0f12';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Draw the playlist title on the canvas
function drawHeaderTitle() {
  ctx.save();
  ctx.font = "bold 68px 'DM Serif Display', Georgia, serif";
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Retro drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;
  
  ctx.fillText(state.playlistTitle, canvas.width / 2, 270);
  ctx.restore();
}

// Helper to draw rounded rectangle
function drawRoundedRect(c, x, y, width, height, radius, fill = false, stroke = true) {
  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + width - radius, y);
  c.quadraticCurveTo(x + width, y, x + width, y + radius);
  c.lineTo(x + width, y + height - radius);
  c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  c.lineTo(x + radius, y + height);
  c.quadraticCurveTo(x, y + height, x, y + height - radius);
  c.lineTo(x, y + radius);
  c.quadraticCurveTo(x, y, x + radius, y);
  c.closePath();
  if (fill) c.fill();
  if (stroke) c.stroke();
}

// Render the 5 slots with thumbnails, numbers, titles, and artists
function drawPlaylistSlots() {
  const startY = 400;
  const gapY = 240;
  const slotWidth = 800;
  const slotHeight = 180;
  const slotX = 140;

  state.slots.forEach((slot, idx) => {
    const currentY = startY + idx * gapY;
    const isSelected = (idx === state.selectedIndex);

    // Glowing Neon Highlight if slot is currently selected by roulette
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 25;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      drawRoundedRect(ctx, slotX - 10, currentY - 10, slotWidth + 20, slotHeight + 20, 24, true, true);
      ctx.restore();
    }

    // Draw Big Number
    ctx.save();
    ctx.font = "bold 68px 'Outfit', sans-serif";
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(`${idx + 1}`, slotX + 50, currentY + slotHeight / 2);
    ctx.restore();

    // Draw Square Cover Thumbnail
    const thumbX = slotX + 90;
    const thumbY = currentY + (slotHeight - 140) / 2;
    const thumbSize = 140;

    ctx.save();
    // Clip rounded corners for cover art
    ctx.beginPath();
    drawRoundedRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 16, false, false);
    ctx.clip();

    let imageDrawn = false;
    
    // Try Custom Image upload first or extracted frame
    let coverImgSrc = null;
    if (slot.imageUrl) {
      coverImgSrc = slot.imageUrl;
    } else if (slot.extractedThumbnailUrl) {
      coverImgSrc = slot.extractedThumbnailUrl;
    }

    if (coverImgSrc) {
      const img = new Image();
      img.src = coverImgSrc;
      ctx.drawImage(img, thumbX, thumbY, thumbSize, thumbSize);
      imageDrawn = true;
    }

    // Fallback: draw generic musical gradient placeholder if no image is available
    if (!imageDrawn) {
      const grad = ctx.createLinearGradient(thumbX, thumbY, thumbX + thumbSize, thumbY + thumbSize);
      grad.addColorStop(0, '#3e625a');
      grad.addColorStop(1, '#e07a3f');
      ctx.fillStyle = grad;
      ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Draw Title & Artist details
    const textX = thumbX + thumbSize + 35;
    const textY = currentY + slotHeight / 2;

    // Song Title text
    ctx.save();
    ctx.font = "bold 44px 'Outfit', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(slot.title, textX, textY - 6);
    ctx.restore();

    // Artist text
    ctx.save();
    ctx.font = "600 26px 'Outfit', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isSelected ? '#e8b031' : '#b2b2b8';
    ctx.fillText(slot.artist, textX, textY + 8);
    ctx.restore();
  });
}

// Fire up index init on DOM content load
document.addEventListener('DOMContentLoaded', init);
