/**
 * PCM capture processor for stem recording. Runs on the audio rendering
 * thread, so UI work on the main thread can never drop mic buffers (the
 * ScriptProcessorNode it replaces glitched under render load).
 *
 * Protocol (port messages to main):
 *   { kind: 'start', ctxTime }        — context time of the first captured sample
 *   { kind: 'chunk', samples }        — Float32Array (transferred)
 *   { kind: 'flushed' }               — reply to a 'flush' request; tail chunk sent first
 *
 * Plain JS in public/ so it is served verbatim in dev and build alike.
 */
class StemCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(4096)
    this.len = 0
    this.started = false
    this.stopped = false
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this.sendChunk()
        this.stopped = true
        this.port.postMessage({ kind: 'flushed' })
      }
    }
  }

  sendChunk() {
    if (this.len === 0) return
    const out = this.buf.slice(0, this.len)
    this.port.postMessage({ kind: 'chunk', samples: out }, [out.buffer])
    this.len = 0
  }

  process(inputs) {
    if (this.stopped) return false
    const channel = inputs[0] && inputs[0][0]
    if (!channel || channel.length === 0) return true
    if (!this.started) {
      this.started = true
      // currentFrame is the context-timeline position of this render quantum —
      // the same timeline the count-in clicks are scheduled on
      this.port.postMessage({ kind: 'start', ctxTime: currentFrame / sampleRate })
    }
    if (this.len + channel.length > this.buf.length) this.sendChunk()
    this.buf.set(channel, this.len)
    this.len += channel.length
    return true
  }
}

registerProcessor('stem-capture', StemCaptureProcessor)
