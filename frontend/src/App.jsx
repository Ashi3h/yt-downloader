import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Youtube, Search, Download, FileAudio, FileVideo, AlertCircle, CheckCircle2, Loader2, PlaySquare } from 'lucide-react';
import { io } from 'socket.io-client';
import axios from 'axios';


const API_URL = 'https://ytd-r46v.onrender.com';
const socket = io(API_URL);

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [error, setError] = useState('');

  const [selectedType, setSelectedType] = useState('video'); // 'video' | 'audio'
  const [selectedFormat, setSelectedFormat] = useState('');

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  useEffect(() => {
    socket.on('progress', (data) => {
      setProgress(data);
    });

    socket.on('completed', (data) => {
      setDownloading(false);
      setProgress(null);
      setDownloadSuccess(data);
      // Trigger actual file download
      window.location.href = `${API_URL}${data.downloadUrl}`;
    });

    socket.on('error', (err) => {
      setDownloading(false);
      setProgress(null);
      setError('Download Error: ' + err.message);
    });

    return () => {
      socket.off('progress');
      socket.off('completed');
      socket.off('error');
    };
  }, []);

  const handleFetchInfo = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setVideoInfo(null);
    setError('');
    setDownloadSuccess(null);

    try {
      const res = await axios.post(`${API_URL}/api/info`, { url });
      setVideoInfo(res.data);

      // Auto-select best video format
      const videoFormats = res.data.formats.filter(f => f.vcodec && f.vcodec !== 'none');
      if (videoFormats.length > 0) {
        setSelectedFormat(videoFormats[videoFormats.length - 1].format_id); // usually last is best
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const startDownload = () => {
    if (!videoInfo || !selectedFormat && selectedType === 'video') return;

    setDownloading(true);
    setError('');
    setDownloadSuccess(null);
    setProgress({ percent: 0, size: '0', speed: '0', eta: 'Calculating...' });

    socket.emit('start-download', {
      url,
      format_id: selectedFormat,
      type: selectedType
    });
  };

  const audioFormats = videoInfo?.formats?.filter(f => f.acodec && f.acodec !== 'none' && f.vcodec === 'none') || [];
  const videoFormats = videoInfo?.formats?.filter(f => f.vcodec && f.vcodec !== 'none') || [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans selection:bg-red-500/30">

      {/* Background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 p-8 rounded-3xl shadow-2xl relative z-10"
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="bg-red-500/10 p-3 rounded-2xl">
            <Youtube className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-transparent">
            YT Downloader
          </h1>
        </div>

        <form onSubmit={handleFetchInfo} className="relative mb-8 group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-red-500 transition-colors">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube URL here..."
            className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-2xl py-4 pl-12 pr-32 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all shadow-inner"
            required
          />
          <button
            type="submit"
            disabled={loading || downloading}
            className="absolute inset-y-2 right-2 bg-white text-black hover:bg-neutral-200 px-6 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
          </button>
        </form>

        <AnimatePresence mode='wait'>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3 mb-6"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}

          {videoInfo && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row gap-6 bg-neutral-950/50 p-4 rounded-2xl border border-neutral-800">
                <div className="relative shrink-0 rounded-xl overflow-hidden aspect-video sm:w-48 group">
                  <img src={videoInfo.thumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <PlaySquare className="w-8 h-8 text-white/80" />
                  </div>
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <h3 className="font-semibold text-lg truncate mb-2" title={videoInfo.title}>{videoInfo.title}</h3>
                  <div className="flex items-center gap-4 text-sm text-neutral-400">
                    <span className="bg-neutral-800/50 px-3 py-1 rounded-full border border-neutral-700/50">
                      Duration: {videoInfo.duration}s
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950/50 p-6 rounded-2xl border border-neutral-800 space-y-6">

                <div className="flex bg-neutral-900 rounded-xl p-1 border border-neutral-800">
                  <button
                    onClick={() => setSelectedType('video')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${selectedType === 'video' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                      }`}
                  >
                    <FileVideo className="w-4 h-4" /> Video (MP4)
                  </button>
                  <button
                    onClick={() => setSelectedType('audio')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${selectedType === 'audio' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                      }`}
                  >
                    <FileAudio className="w-4 h-4" /> Audio (MP3)
                  </button>
                </div>

                {selectedType === 'video' && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-neutral-400 block ml-1">Select Quality</label>
                    <div className="relative">
                      <select
                        value={selectedFormat}
                        onChange={(e) => setSelectedFormat(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl p-4 appearance-none focus:outline-none focus:ring-2 focus:ring-white/20 transition-all font-medium"
                      >
                        {videoFormats.map(f => (
                          <option key={f.format_id} value={f.format_id} className="bg-neutral-900">
                            {f.resolution} {f.vcodec !== 'none' ? `(${f.ext})` : ''} — {f.filesize ? (f.filesize / 1024 / 1024).toFixed(1) + ' MB' : 'Unknown size'}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={startDownload}
                  disabled={downloading}
                  className="w-full bg-red-600 hover:bg-red-500 text-white p-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  {downloading ? 'Processing...' : 'Download File'}
                  {!downloading && <Download className="w-5 h-5" />}
                </button>

              </div>

            </motion.div>
          )}

          {progress && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 bg-neutral-950/80 p-6 rounded-2xl border border-neutral-800 backdrop-blur-sm"
            >
              <div className="flex justify-between text-sm mb-3">
                <span className="font-medium text-red-500">Downloading... {progress.percent}%</span>
                <span className="text-neutral-400">{progress.speed}</span>
              </div>
              <div className="w-full bg-neutral-900 rounded-full h-3 mb-3 border border-neutral-800 overflow-hidden relative">
                <motion.div
                  className="bg-gradient-to-r from-red-600 to-purple-600 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.percent}%` }}
                  transition={{ ease: "linear", duration: 0.5 }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-500 font-medium">
                <span>Size: {progress.size}</span>
                <span>ETA: {progress.eta}</span>
              </div>
            </motion.div>
          )}

          {downloadSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 bg-green-500/10 border border-green-500/20 text-green-400 p-6 rounded-2xl text-center flex flex-col items-center gap-3 backdrop-blur-sm"
            >
              <div className="bg-green-500/20 p-3 rounded-full">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-lg text-green-500">Download Complete!</p>
                <p className="text-sm mt-1 text-green-400/80">{downloadSuccess.filename}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default App;
