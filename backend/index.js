const express = require('express');
const cors = require('cors');
const youtubedl = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Download = require('./models/Download');

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/ytdownloader')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(err));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // allow frontend access
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Prepare temp downloads folder
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// 1. Get video info
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
            ],
            extractorArgs: 'youtube:player_client=ios,android,web'
        });

        const allowedQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160];

        let rawVideoFormats = info.formats
            .filter(f => f.url && f.vcodec !== 'none' && f.height && allowedQualities.includes(f.height));

        let videoFormatsRaw = rawVideoFormats.map(f => {
            let resLabel = `${f.height}p`;
            if (f.height === 1440) resLabel = '2K';
            if (f.height === 2160) resLabel = '4K';
            if (f.fps && f.fps > 30) resLabel += ` ${f.fps}fps`;

            return {
                format_id: f.format_id,
                ext: f.ext,
                resolution: resLabel,
                height: f.height,
                fps: f.fps || 0,
                filesize: f.filesize || f.filesize_approx,
                vcodec: f.vcodec,
                acodec: f.acodec,
                format_note: f.format_note || ''
            };
        });

        let bestVideoFormats = [];
        let seen = new Set();

        videoFormatsRaw.sort((a, b) => {
            if (b.height !== a.height) return b.height - a.height;
            if (b.fps !== a.fps) return b.fps - a.fps;
            if (b.ext === 'mp4' && a.ext !== 'mp4') return 1;
            if (a.ext === 'mp4' && b.ext !== 'mp4') return -1;
            return 0;
        });

        for (let vf of videoFormatsRaw) {
            if (!seen.has(vf.resolution)) {
                seen.add(vf.resolution);
                bestVideoFormats.push(vf);
            }
        }

        bestVideoFormats.reverse();

        const audioFormats = info.formats
            .filter(f => f.url && f.acodec !== 'none' && f.vcodec === 'none')
            .map(f => ({
                format_id: f.format_id,
                ext: f.ext,
                resolution: 'audio only',
                filesize: f.filesize || f.filesize_approx,
                vcodec: f.vcodec,
                acodec: f.acodec,
                format_note: f.format_note || ''
            }));

        const bestAudioFormats = audioFormats.sort((a, b) => (b.filesize || 0) - (a.filesize || 0)).slice(0, 3);

        const formats = [...bestVideoFormats, ...bestAudioFormats];

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration_string || info.duration,
            formats: formats
        });
    } catch (error) {
        console.error("Info Fetch Error:", error.message);
        res.status(500).json({ error: 'Failed to fetch video info', details: error.message });
    }
});

// Serve static files for download
app.use('/downloads', express.static(downloadsDir));

// Socket.IO logic for download progress
io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    socket.on('start-download', async ({ url, format_id, type }) => {
        try {
            console.log(`Starting download for ${url} (type: ${type})`);
            const info = await youtubedl(url, { dumpSingleJson: true });

            // Clean title for file name
            const cleanTitle = info.title.replace(/[^a-zA-Z0-9]/g, '_');
            const ext = type === 'audio' ? 'mp3' : 'mp4';
            const filename = `${cleanTitle}_${Date.now()}.${ext}`;
            const filepath = path.join(downloadsDir, filename);

            const ffmpegPath = require('ffmpeg-static');
            let dlOptions = {
                output: filepath,
                format: type === 'audio' ? 'bestaudio' : `${format_id}+bestaudio/best`,
                ffmpegLocation: ffmpegPath,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
                ],
                extractorArgs: 'youtube:player_client=ios,android,web',
                concurrentFragments: 10,
                httpChunkSize: '10M',
                downloaderArgs: 'ffmpeg:-threads 4'
            };

            if (type === 'audio') {
                dlOptions.extractAudio = true;
                dlOptions.audioFormat = 'mp3';
            } else {
                dlOptions.mergeOutputFormat = 'mp4';
            }

            // Save to MongoDB (Pending)
            const downloadDoc = new Download({
                url,
                title: info.title,
                format: format_id,
                type
            });
            await downloadDoc.save();

            const ytdlpProcess = youtubedl.exec(url, dlOptions);

            ytdlpProcess.stdout.on('data', (data) => {
                const text = data.toString();
                // Extract progress details like " [download]  10.0% of 50.0MiB at 1.5MiB/s ETA 00:30 "
                const progressMatch = text.match(/\[download\]\s+([\d\.]+)\%\s+of\s+([~\d\.\w]+)\s+at\s+([\d\.\w\/]+)\s+ETA\s+([\d:]+)/);
                if (progressMatch) {
                    socket.emit('progress', {
                        percent: progressMatch[1],
                        size: progressMatch[2],
                        speed: progressMatch[3],
                        eta: progressMatch[4]
                    });
                }
            });

            ytdlpProcess.stderr.on('data', (data) => {
                console.error('yt-dlp stderr:', data.toString());
            });

            ytdlpProcess.on('close', async (code) => {
                if (code === 0) {
                    downloadDoc.status = 'completed';
                    await downloadDoc.save();
                    socket.emit('completed', {
                        downloadUrl: `/downloads/${filename}`,
                        filename: filename
                    });
                } else {
                    downloadDoc.status = 'failed';
                    await downloadDoc.save();
                    socket.emit('error', { message: 'Download process exited with code ' + code });
                }
            });

            ytdlpProcess.on('error', async (err) => {
                downloadDoc.status = 'failed';
                await downloadDoc.save();
                socket.emit('error', { message: err.message });
            });

        } catch (error) {
            console.error(error);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
