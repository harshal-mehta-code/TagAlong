import { audioContext } from './audio'

/**
 * Decode a media blob's audio track into an AudioBuffer.
 *
 * decodeAudioData handles webm/audio blobs, but Safari rejects its OWN
 * MediaRecorder mp4s — which silently killed the measured mediaOffset on iOS
 * and left every take's video placed by the MediaRecorder start-event guess.
 * The fallback demuxes the file with mediabunny and decodes the audio track
 * through WebCodecs, which Safari does support.
 */
export async function decodeMediaAudio(media: Blob): Promise<AudioBuffer | null> {
  const c = audioContext()
  try {
    return await c.decodeAudioData(await media.arrayBuffer())
  } catch { /* mp4 video blob — demux below */ }

  try {
    const { ALL_FORMATS, AudioBufferSink, BlobSource, Input } = await import('mediabunny')
    const input = new Input({ source: new BlobSource(media), formats: ALL_FORMATS })
    try {
      const track = await input.getPrimaryAudioTrack()
      if (!track || !(await track.canDecode())) return null
      const sink = new AudioBufferSink(track)
      const chunks: { buffer: AudioBuffer; timestamp: number }[] = []
      for await (const { buffer, timestamp } of sink.buffers()) {
        chunks.push({ buffer, timestamp })
      }
      if (chunks.length === 0) return null
      const rate = chunks[0].buffer.sampleRate
      const channels = chunks[0].buffer.numberOfChannels
      // keep the container's own timeline: leading offset becomes silence so
      // buffer position == media currentTime (what mediaOffset refers to)
      const lead = Math.max(0, Math.round(chunks[0].timestamp * rate))
      const total = lead + chunks.reduce((n, ch) => n + ch.buffer.length, 0)
      const out = new AudioBuffer({ length: total, numberOfChannels: channels, sampleRate: rate })
      let pos = lead
      for (const ch of chunks) {
        for (let i = 0; i < channels; i++) {
          out.copyToChannel(ch.buffer.getChannelData(Math.min(i, ch.buffer.numberOfChannels - 1)), i, pos)
        }
        pos += ch.buffer.length
      }
      return out
    } finally {
      input.dispose()
    }
  } catch {
    return null
  }
}
