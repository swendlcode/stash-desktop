/**
 * Encodes an AudioBuffer into a 16-bit PCM WAV file (Uint8Array). Interleaves
 * channels and writes a standard RIFF/WAVE header. Used by the sample editor
 * to materialize the rendered edit for drag-out to a DAW.
 */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLen = frames * blockAlign;
  const bufSize = 44 + dataLen;
  const out = new ArrayBuffer(bufSize);
  const view = new DataView(out);

  let o = 0;
  writeAscii(view, o, 'RIFF'); o += 4;
  view.setUint32(o, 36 + dataLen, true); o += 4;
  writeAscii(view, o, 'WAVE'); o += 4;
  writeAscii(view, o, 'fmt '); o += 4;
  view.setUint32(o, 16, true); o += 4;       // chunk size
  view.setUint16(o, 1, true); o += 2;        // format: PCM
  view.setUint16(o, channels, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, byteRate, true); o += 4;
  view.setUint16(o, blockAlign, true); o += 2;
  view.setUint16(o, bytesPerSample * 8, true); o += 2;
  writeAscii(view, o, 'data'); o += 4;
  view.setUint32(o, dataLen, true); o += 4;

  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out);
}

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
