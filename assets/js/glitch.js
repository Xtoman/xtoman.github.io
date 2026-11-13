/* Glitch tool: every step damages real image data and reads it back.
   An image here is { w, h, data: Uint8ClampedArray (RGBA) }; steps never mutate their input. */
(function () {
    'use strict';

    var SR = 44100; // nominal sample rate, gives audio parameters their usual meaning

    // ---------- helpers ----------

    function rng(seed) { // mulberry32
        var a = (seed * 2654435761) >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function toBytes(img, planar) {
        var n = img.w * img.h, d = img.data, out = new Uint8Array(n * 3), i, j;
        if (planar) {
            for (i = 0, j = 0; i < n; i++, j += 4) { out[i] = d[j]; out[n + i] = d[j + 1]; out[2 * n + i] = d[j + 2]; }
        } else {
            for (i = 0, j = 0; i < n * 3; i += 3, j += 4) { out[i] = d[j]; out[i + 1] = d[j + 1]; out[i + 2] = d[j + 2]; }
        }
        return out;
    }

    function fromBytes(bytes, w, h, planar) {
        var n = w * h, d = new Uint8ClampedArray(n * 4), i, j;
        if (planar) {
            for (i = 0, j = 0; i < n; i++, j += 4) { d[j] = bytes[i]; d[j + 1] = bytes[n + i]; d[j + 2] = bytes[2 * n + i]; d[j + 3] = 255; }
        } else {
            for (i = 0, j = 0; i < n * 3; i += 3, j += 4) { d[j] = bytes[i]; d[j + 1] = bytes[i + 1]; d[j + 2] = bytes[i + 2]; d[j + 3] = 255; }
        }
        return { w: w, h: h, data: d };
    }

    function imgToCanvas(img) {
        var c = document.createElement('canvas');
        c.width = img.w; c.height = img.h;
        c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
        return c;
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not encode image')); }, type, quality);
        });
    }

    // ---------- sample encodings (G.711) ----------

    function ulawEnc(s) {
        var sign = (s >> 8) & 0x80;
        if (sign) s = -s;
        if (s > 32635) s = 32635;
        s += 0x84;
        var exp = 7;
        for (var m = 0x4000; (s & m) === 0 && exp > 0; exp--, m >>= 1) { /* find segment */ }
        return ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0F)) & 0xFF;
    }
    function ulawDec(u) {
        u = ~u & 0xFF;
        var s = ((((u & 0x0F) << 3) + 0x84) << ((u >> 4) & 7)) - 0x84;
        return (u & 0x80) ? -s : s;
    }
    function alawEnc(s) {
        var sign = ((~s) >> 8) & 0x80, a;
        if (!sign) s = -s;
        if (s > 32635) s = 32635;
        if (s >= 256) {
            var exp = 7;
            for (var m = 0x4000; (s & m) === 0 && exp > 1; exp--, m >>= 1) { /* find segment */ }
            a = (exp << 4) | ((s >> (exp + 3)) & 0x0F);
        } else {
            a = s >> 4;
        }
        return (a ^ sign ^ 0x55) & 0xFF;
    }
    function alawDec(a) {
        a ^= 0x55;
        var exp = (a >> 4) & 7, mant = a & 0x0F;
        var s = exp ? (((mant << 4) + 0x108) << (exp - 1)) : ((mant << 4) + 8);
        return (a & 0x80) ? s : -s;
    }

    var codecs = {};
    function codec(name) {
        if (codecs[name]) return codecs[name];
        var dec = new Float32Array(256), lut = null, b, s;
        if (name === 'linear') {
            for (b = 0; b < 256; b++) dec[b] = (b - 127.5) / 127.5;
        } else {
            var e = name === 'ulaw' ? ulawEnc : alawEnc, d = name === 'ulaw' ? ulawDec : alawDec;
            for (b = 0; b < 256; b++) dec[b] = d(b) / 32768;
            lut = new Uint8Array(65536);
            for (s = -32768; s < 32768; s++) lut[s + 32768] = e(s);
        }
        return (codecs[name] = { dec: dec, lut: lut });
    }

    // ---------- audio effects (in place on a Float32Array) ----------

    function biquad(x, b0, b1, b2, a0, a1, a2) {
        b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
        var x1 = 0, x2 = 0, y1 = 0, y2 = 0, n, len = x.length, v, y;
        for (n = 0; n < len; n++) {
            v = x[n];
            y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1; x1 = v; y2 = y1; y1 = y;
            x[n] = y;
        }
    }

    var hz = function (v) { return v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : (v >= 10 ? Math.round(v) : v.toFixed(2)) + ' Hz'; };
    var pct = function (v) { return Math.round(v * 100) + '%'; };

    var AUDIO_FX = {
        echo: {
            label: 'Echo',
            params: [
                { id: 'delay', label: 'Delay', min: 1, max: 3000, def: 250, log: true, fmt: function (v) { return Math.round(v) + ' ms'; } },
                { id: 'decay', label: 'Decay', min: 0, max: 0.95, step: 0.01, def: 0.5, fmt: pct }
            ],
            run: function (x, p) {
                var d = Math.max(1, Math.round(p.delay * SR / 1000)), g = p.decay, len = x.length;
                for (var n = d; n < len; n++) x[n] += g * x[n - d];
            }
        },
        reverb: {
            label: 'Reverb',
            params: [
                { id: 'room', label: 'Room size', min: 0, max: 1, step: 0.01, def: 0.6, fmt: pct },
                { id: 'mix', label: 'Wet mix', min: 0, max: 1, step: 0.01, def: 0.4, fmt: pct }
            ],
            run: function (x, p) {
                var fb = 0.7 + 0.28 * p.room, damp = 0.3, mix = p.mix, len = x.length;
                var cb = [1116, 1188, 1277, 1356, 1422, 1491].map(function (d) { return new Float32Array(d); });
                var ci = [0, 0, 0, 0, 0, 0], cl = [0, 0, 0, 0, 0, 0];
                var ab = [new Float32Array(556), new Float32Array(441)], ai = [0, 0];
                var n, c, v, w, o, buf;
                for (n = 0; n < len; n++) {
                    v = x[n]; w = 0;
                    for (c = 0; c < 6; c++) {
                        buf = cb[c]; o = buf[ci[c]];
                        cl[c] = o * (1 - damp) + cl[c] * damp;
                        buf[ci[c]] = v + cl[c] * fb;
                        if (++ci[c] === buf.length) ci[c] = 0;
                        w += o;
                    }
                    w *= 0.06;
                    for (c = 0; c < 2; c++) {
                        buf = ab[c]; o = buf[ai[c]];
                        buf[ai[c]] = w + o * 0.5;
                        if (++ai[c] === buf.length) ai[c] = 0;
                        w = o - w;
                    }
                    x[n] = v * (1 - mix) + w * mix;
                }
            }
        },
        phaser: {
            label: 'Phaser',
            params: [
                { id: 'rate', label: 'LFO rate', min: 0.02, max: 20, def: 0.4, log: true, fmt: hz },
                { id: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, def: 0.8, fmt: pct },
                { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, step: 0.01, def: 0.6, fmt: pct },
                { id: 'stages', label: 'Stages', min: 2, max: 12, step: 2, def: 4 }
            ],
            run: function (x, p) {
                var st = p.stages | 0, z = new Float32Array(st), w = 2 * Math.PI * p.rate / SR;
                var a = 0, last = 0, len = x.length, n, s, y, o, d;
                for (n = 0; n < len; n++) {
                    if ((n & 31) === 0) {
                        d = 0.02 + 0.95 * p.depth * (0.5 + 0.5 * Math.sin(n * w));
                        a = (1 - d) / (1 + d);
                    }
                    y = x[n] + p.feedback * last;
                    for (s = 0; s < st; s++) { o = z[s] - a * y; z[s] = y + a * o; y = o; }
                    last = y;
                    x[n] = (x[n] + y) * 0.5;
                }
            }
        },
        wah: {
            label: 'Wah-wah',
            params: [
                { id: 'rate', label: 'LFO rate', min: 0.02, max: 20, def: 1.5, log: true, fmt: hz },
                { id: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, def: 0.7, fmt: pct },
                { id: 'res', label: 'Resonance', min: 0.5, max: 10, step: 0.1, def: 2.5 },
                { id: 'offset', label: 'Frequency offset', min: 0, max: 1, step: 0.01, def: 0.3, fmt: pct }
            ],
            run: function (x, p) {
                var skip = 2 * Math.PI * p.rate / SR, len = x.length;
                var b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0, n, f, om, sn, cs, al, v, y;
                for (n = 0; n < len; n++) {
                    if (n % 30 === 0) {
                        f = (1 + Math.cos(n * skip)) / 2;
                        f = f * p.depth * (1 - p.offset) + p.offset;
                        f = Math.exp((f - 1) * 6);
                        om = Math.PI * f; sn = Math.sin(om); cs = Math.cos(om); al = sn / (2 * p.res);
                        b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
                    }
                    v = x[n];
                    y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
                    x2 = x1; x1 = v; y2 = y1; y1 = y;
                    x[n] = y;
                }
            }
        },
        flanger: {
            label: 'Flanger',
            params: [
                { id: 'rate', label: 'LFO rate', min: 0.02, max: 20, def: 0.3, log: true, fmt: hz },
                { id: 'span', label: 'Sweep', min: 2, max: 2000, def: 300, log: true, fmt: function (v) { return Math.round(v) + ' samples'; } },
                { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, step: 0.01, def: 0.5, fmt: pct },
                { id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, def: 0.7, fmt: pct }
            ],
            run: function (x, p) {
                var size = 4096, mask = size - 1, buf = new Float32Array(size), w = 2 * Math.PI * p.rate / SR;
                var len = x.length, n, d, i0, fr, del, v;
                for (n = 0; n < len; n++) {
                    d = 1 + (p.span - 1) * (0.5 + 0.5 * Math.sin(n * w));
                    i0 = Math.floor(d); fr = d - i0;
                    del = buf[(n - i0) & mask] * (1 - fr) + buf[(n - i0 - 1) & mask] * fr;
                    v = x[n];
                    buf[n & mask] = v + p.feedback * del;
                    x[n] = v + p.mix * del;
                }
            }
        },
        lowpass: {
            label: 'Low-pass filter',
            params: [
                { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, def: 1500, log: true, fmt: hz },
                { id: 'q', label: 'Resonance', min: 0.3, max: 30, def: 4, log: true, fmt: function (v) { return v.toFixed(1); } }
            ],
            run: function (x, p) {
                var w = 2 * Math.PI * p.cutoff / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * p.q);
                biquad(x, (1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al);
            }
        },
        highpass: {
            label: 'High-pass filter',
            params: [
                { id: 'cutoff', label: 'Cutoff', min: 5, max: 20000, def: 60, log: true, fmt: hz },
                { id: 'q', label: 'Resonance', min: 0.3, max: 30, def: 2, log: true, fmt: function (v) { return v.toFixed(1); } }
            ],
            run: function (x, p) {
                var w = 2 * Math.PI * p.cutoff / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * p.q);
                biquad(x, (1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al);
            }
        },
        amplify: {
            label: 'Amplify',
            params: [
                { id: 'gain', label: 'Gain', min: 0.25, max: 32, def: 3, log: true, fmt: function (v) { return '×' + v.toFixed(2); } },
                { id: 'mode', label: 'Overflow', type: 'select', def: 'wrap', options: [['clip', 'Clip'], ['wrap', 'Wrap around'], ['fold', 'Fold back']] }
            ],
            run: function (x, p) {
                var g = p.gain, len = x.length, n, v;
                if (p.mode === 'clip') {
                    for (n = 0; n < len; n++) x[n] *= g; // clipped when written back
                } else if (p.mode === 'wrap') {
                    for (n = 0; n < len; n++) { v = (x[n] * g + 1) / 2; x[n] = (v - Math.floor(v)) * 2 - 1; }
                } else {
                    for (n = 0; n < len; n++) { v = (x[n] * g + 1) / 4; v -= Math.floor(v); x[n] = 1 - Math.abs(v * 4 - 2); x[n] = -x[n]; }
                }
            }
        },
        bitcrush: {
            label: 'Bitcrusher',
            params: [
                { id: 'bits', label: 'Bit depth', min: 1, max: 8, step: 1, def: 3, fmt: function (v) { return v + ' bit'; } },
                { id: 'hold', label: 'Sample hold', min: 1, max: 256, def: 4, log: true, fmt: function (v) { return Math.round(v) + ' samples'; } }
            ],
            run: function (x, p) {
                var levels = Math.pow(2, p.bits) / 2, hold = Math.max(1, Math.round(p.hold)), len = x.length, cur = 0;
                for (var n = 0; n < len; n++) {
                    if (n % hold === 0) cur = (Math.floor(x[n] * levels) + 0.5) / levels;
                    x[n] = cur;
                }
            }
        },
        tremolo: {
            label: 'Tremolo',
            params: [
                { id: 'rate', label: 'Rate', min: 0.05, max: 5000, def: 4, log: true, fmt: hz },
                { id: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, def: 0.8, fmt: pct }
            ],
            run: function (x, p) {
                var w = 2 * Math.PI * p.rate / SR, d = p.depth * 0.5, len = x.length;
                for (var n = 0; n < len; n++) x[n] *= 1 - d + d * Math.cos(n * w);
            }
        },
        speed: {
            label: 'Change speed',
            params: [
                { id: 'factor', label: 'Speed', min: 0.25, max: 4, def: 1.003, log: true, fmt: function (v) { return '×' + v.toFixed(3); } }
            ],
            run: function (x, p) {
                var src = x.slice(), len = x.length, f = p.factor, n, pos, i, fr;
                for (n = 0; n < len; n++) {
                    pos = (n * f) % len; i = Math.floor(pos); fr = pos - i;
                    x[n] = src[i] * (1 - fr) + src[(i + 1) % len] * fr;
                }
            }
        },
        reverse: {
            label: 'Reverse',
            params: [],
            run: function (x) { x.reverse(); }
        }
    };

    // ---------- engines ----------

    var SEED = { id: 'seed', label: 'Seed', min: 1, max: 999, step: 1, def: 1 };
    var FROM = { id: 'from', label: 'Start at', min: 0, max: 99, step: 1, def: 0, fmt: function (v) { return v + '%'; } };

    var ENGINES = {
        audio: {
            label: 'Audio',
            params: function (p) {
                var list = [
                    { id: 'fx', label: 'Effect', type: 'select', def: 'echo', rebuild: true, options: Object.keys(AUDIO_FX).map(function (k) { return [k, AUDIO_FX[k].label]; }) }
                ];
                AUDIO_FX[p.fx || 'echo'].params.forEach(function (q) {
                    var c = {}; for (var k in q) c[k] = q[k];
                    c.id = (p.fx || 'echo') + '.' + q.id;
                    list.push(c);
                });
                list.push(
                    { id: 'enc', label: 'Sample format', type: 'select', def: 'linear', options: [['linear', '8-bit PCM'], ['ulaw', 'µ-law'], ['alaw', 'A-law']] },
                    { id: 'layout', label: 'Byte order', type: 'select', def: 'rgb', options: [['rgb', 'RGB interleaved'], ['planar', 'Planar (R, G, B planes)']] },
                    { id: 'from', label: 'Selection start', min: 0, max: 100, step: 1, def: 0, fmt: function (v) { return v + '%'; } },
                    { id: 'to', label: 'Selection end', min: 0, max: 100, step: 1, def: 100, fmt: function (v) { return v + '%'; } }
                );
                return list;
            },
            run: function (img, p) {
                var planar = p.layout === 'planar', bytes = toBytes(img, planar), N = bytes.length;
                var a = Math.floor(N * Math.min(p.from, p.to) / 100), b = Math.floor(N * Math.max(p.from, p.to) / 100);
                if (b - a < 2) return img;
                var cd = codec(p.enc), dec = cd.dec, lut = cd.lut, x = new Float32Array(b - a), i, len = x.length, v, s;
                for (i = 0; i < len; i++) x[i] = dec[bytes[a + i]];
                var fx = AUDIO_FX[p.fx], fp = {};
                fx.params.forEach(function (q) { fp[q.id] = p[p.fx + '.' + q.id]; });
                fx.run(x, fp);
                for (i = 0; i < len; i++) {
                    v = x[i];
                    if (v === dec[bytes[a + i]]) continue; // untouched sample keeps its exact byte
                    if (v !== v) v = 0;
                    if (lut) {
                        s = Math.round(v * 32768);
                        bytes[a + i] = lut[(s < -32768 ? -32768 : s > 32767 ? 32767 : s) + 32768];
                    } else {
                        s = Math.round(v * 127.5 + 127.5);
                        bytes[a + i] = s < 0 ? 0 : s > 255 ? 255 : s;
                    }
                }
                return fromBytes(bytes, img.w, img.h, planar);
            }
        },

        jpeg: {
            label: 'JPEG',
            params: function () {
                return [
                    { id: 'quality', label: 'JPEG quality', min: 1, max: 100, step: 1, def: 75 },
                    { id: 'scan', label: 'Damaged bytes in image data', min: 0, max: 80, step: 1, def: 3 },
                    { id: 'from', label: 'Start at', min: 0, max: 99, step: 1, def: 25, fmt: function (v) { return v + '%'; } },
                    { id: 'quant', label: 'Damaged quantization values', min: 0, max: 40, step: 1, def: 0 },
                    SEED
                ];
            },
            run: async function (img, p) {
                var blob = await canvasBlob(imgToCanvas(img), 'image/jpeg', p.quality / 100);
                var src = new Uint8Array(await blob.arrayBuffer());
                var bmp = null;
                for (var attempt = 0; attempt < 6 && !bmp; attempt++) {
                    var bytes = src.slice();
                    damageJpeg(bytes, p, rng(p.seed + attempt * 7919));
                    try { bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })); } catch (e) { bmp = null; }
                }
                if (!bmp) throw new Error('The decoder refused this file — try another seed or fewer damaged bytes.');
                var c = document.createElement('canvas');
                c.width = img.w; c.height = img.h;
                var ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(bmp, 0, 0, img.w, img.h);
                if (bmp.close) bmp.close();
                return { w: img.w, h: img.h, data: ctx.getImageData(0, 0, img.w, img.h).data };
            }
        },

        png: {
            label: 'PNG filters',
            params: function () {
                return [
                    { id: 'filter', label: 'Scanline filter', type: 'select', def: 'paeth', options: [['sub', 'Sub (smears right)'], ['up', 'Up (smears down)'], ['avg', 'Average'], ['paeth', 'Paeth'], ['mixed', 'Mixed per row']] },
                    { id: 'bytes', label: 'Damaged bytes', min: 0, max: 2000, def: 6, log0: true, fmt: function (v) { return String(Math.round(v)); } },
                    { id: 'swap', label: 'Rows with wrong filter type', min: 0, max: 100, step: 1, def: 0, fmt: function (v) { return v + '%'; } },
                    FROM,
                    SEED
                ];
            },
            run: function (img, p) {
                var w = img.w, h = img.h, stride = w * 3, raw = toBytes(img, false), F = new Uint8Array(raw.length);
                var rnd = rng(p.seed), types = new Uint8Array(h), base = { sub: 1, up: 2, avg: 3, paeth: 4 }[p.filter] || 0;
                var y, i, o, a, b, c, pa, pb, pc, pr, t;
                for (y = 0; y < h; y++) types[y] = base || 1 + Math.floor(rnd() * 4);
                // filter (as a PNG encoder would)
                for (y = 0; y < h; y++) {
                    o = y * stride; t = types[y];
                    for (i = 0; i < stride; i++) {
                        a = i >= 3 ? raw[o + i - 3] : 0;
                        b = y ? raw[o + i - stride] : 0;
                        if (t === 1) pr = a;
                        else if (t === 2) pr = b;
                        else if (t === 3) pr = (a + b) >> 1;
                        else {
                            c = (i >= 3 && y) ? raw[o + i - stride - 3] : 0;
                            pa = Math.abs(b - c); pb = Math.abs(a - c); pc = Math.abs(a + b - 2 * c);
                            pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
                        }
                        F[o + i] = raw[o + i] - pr;
                    }
                }
                // damage
                var start = Math.floor(F.length * p.from / 100), span = F.length - start, count = Math.round(p.bytes);
                for (i = 0; i < count; i++) F[start + Math.floor(rnd() * span)] = Math.floor(rnd() * 256);
                var y0 = Math.floor(h * p.from / 100);
                for (y = y0; y < h; y++) {
                    if (rnd() * 100 < p.swap) types[y] = ((types[y] - 1 + 1 + Math.floor(rnd() * 3)) % 4) + 1;
                }
                // unfilter (as a PNG decoder would), in place
                for (y = 0; y < h; y++) {
                    o = y * stride; t = types[y];
                    for (i = 0; i < stride; i++) {
                        a = i >= 3 ? F[o + i - 3] : 0;
                        b = y ? F[o + i - stride] : 0;
                        if (t === 1) pr = a;
                        else if (t === 2) pr = b;
                        else if (t === 3) pr = (a + b) >> 1;
                        else {
                            c = (i >= 3 && y) ? F[o + i - stride - 3] : 0;
                            pa = Math.abs(b - c); pb = Math.abs(a - c); pc = Math.abs(a + b - 2 * c);
                            pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
                        }
                        F[o + i] = F[o + i] + pr;
                    }
                }
                return fromBytes(F, w, h, false);
            }
        },

        raw: {
            label: 'Raw misread',
            params: function () {
                return [
                    { id: 'width', label: 'Width error', min: -200, max: 200, step: 1, def: 1, fmt: function (v) { return (v > 0 ? '+' : '') + v + ' px'; } },
                    { id: 'offset', label: 'Byte offset', min: 0, max: 64, step: 1, def: 1 },
                    { id: 'bpp', label: 'Bytes per pixel', type: 'select', def: '3', options: [['3', '3 (correct)'], ['4', '4'], ['2', '2'], ['1', '1 (greyscale)']] },
                    { id: 'layout', label: 'Channel layout', type: 'select', def: 'same', options: [['same', 'As written'], ['i2p', 'Interleaved read as planar'], ['p2i', 'Planar read as interleaved']] }
                ];
            },
            run: function (img, p) {
                var w = img.w, h = img.h, n = w * h, N = n * 3;
                var S = toBytes(img, p.layout === 'p2i'), d = new Uint8ClampedArray(n * 4);
                var w2 = Math.max(1, w + p.width), bpp = +p.bpp, off = p.offset, planar = p.layout === 'i2p';
                var x, y, k, pos, j = 0;
                for (y = 0; y < h; y++) {
                    for (x = 0; x < w; x++, j += 4) {
                        k = y * w2 + x;
                        if (planar) {
                            d[j] = S[(off + k) % N]; d[j + 1] = S[(off + n + k) % N]; d[j + 2] = S[(off + 2 * n + k) % N];
                        } else {
                            pos = off + k * bpp;
                            d[j] = S[pos % N];
                            if (bpp === 1) { d[j + 1] = d[j + 2] = d[j]; }
                            else { d[j + 1] = S[(pos + 1) % N]; d[j + 2] = bpp === 2 ? 0 : S[(pos + 2) % N]; }
                        }
                        d[j + 3] = 255;
                    }
                }
                return { w: w, h: h, data: d };
            }
        }
    };

    // Overwrites bytes inside the entropy-coded scan and the quantization tables of a JPEG file.
    function damageJpeg(bytes, p, rnd) {
        var pos = 2, tables = [], scanStart = -1, len, q, i, k;
        while (pos + 4 <= bytes.length && bytes[pos] === 0xFF) {
            var marker = bytes[pos + 1];
            len = (bytes[pos + 2] << 8) | bytes[pos + 3];
            if (marker === 0xDB) {
                q = pos + 4;
                while (q < pos + 2 + len) {
                    var size = (bytes[q] >> 4) ? 128 : 64;
                    tables.push([q + 1, size]);
                    q += 1 + size;
                }
            }
            if (marker === 0xDA) { scanStart = pos + 2 + len; break; }
            pos += 2 + len;
        }
        if (tables.length) {
            for (i = 0; i < p.quant; i++) {
                var t = tables[Math.floor(rnd() * tables.length)];
                bytes[t[0] + Math.floor(rnd() * t[1])] = 1 + Math.floor(rnd() * 255);
            }
        }
        if (scanStart > 0) {
            var end = bytes.length - 2, a = scanStart + Math.floor((end - scanStart) * p.from / 100), span = end - a;
            for (i = 0; i < p.scan && span > 4; i++) {
                // keep 0xFF bytes (markers / stuffing) intact so the file stays parseable
                for (k = 0; k < 20; k++) {
                    var at = a + 1 + Math.floor(rnd() * (span - 2));
                    if (bytes[at] !== 0xFF && bytes[at - 1] !== 0xFF) { bytes[at] = Math.floor(rnd() * 255); break; }
                }
            }
        }
    }

    // ---------- state & rendering ----------

    var $ = function (id) { return document.getElementById(id); };
    var app = $('glitch-app'), canvas = $('glitch-canvas'), drop = $('glitch-drop'), fileInput = $('glitch-file');
    var statusEl = $('glitch-status'), chainEl = $('glitch-chain'), addEl = $('glitch-add'), sizeEl = $('glitch-size');
    var saveBtns = [$('glitch-save'), $('glitch-save-jpg')], compareBtn = $('glitch-compare');
    var ctx = canvas.getContext('2d');

    var bitmap = null, fileName = 'image', source = null;
    var chain = [];   // { engine, on, p, error, errEl }
    var cache = [];   // cache[i] = output of step i
    var valid = 0;    // number of leading cache entries that are up to date
    var token = 0, timer = 0, shown = null, comparing = false;

    function setStatus(text) { statusEl.textContent = text; }

    function draw(img) {
        if (canvas.width !== img.w || canvas.height !== img.h) { canvas.width = img.w; canvas.height = img.h; }
        ctx.putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
    }

    function invalidate(index) {
        valid = Math.min(valid, index);
        clearTimeout(timer);
        timer = setTimeout(render, 40);
    }

    async function render() {
        if (!source) return;
        var my = ++token, t0 = performance.now();
        var img = valid > 0 ? cache[valid - 1] : source;
        setStatus('Working…');
        for (var i = valid; i < chain.length; i++) {
            var step = chain[i], out = img, error = '';
            if (step.on) {
                await new Promise(function (r) { setTimeout(r, 0); }); // let the UI breathe
                if (my !== token) return;
                try { out = await ENGINES[step.engine].run(img, step.p); }
                catch (e) { error = e.message || String(e); }
                if (my !== token) return;
            }
            step.error = error;
            if (step.errEl) { step.errEl.textContent = error; step.errEl.hidden = !error; }
            cache[i] = img = out;
            valid = i + 1;
        }
        cache.length = chain.length;
        shown = img;
        if (!comparing) draw(img);
        var active = chain.filter(function (s) { return s.on; }).length;
        setStatus(img.w + ' × ' + img.h + ' px · ' + active + (active === 1 ? ' step' : ' steps') + ' · ' + Math.round(performance.now() - t0) + ' ms');
    }

    function rasterize() {
        if (!bitmap) return;
        var max = +sizeEl.value, scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        var w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var cx = c.getContext('2d', { willReadFrequently: true });
        cx.fillStyle = '#fff';
        cx.fillRect(0, 0, w, h);
        cx.drawImage(bitmap, 0, 0, w, h);
        source = { w: w, h: h, data: cx.getImageData(0, 0, w, h).data };
        valid = 0; cache = [];
        render();
    }

    // HEIC/HEIF decoder (libheif, ~3 MB) is fetched only when a file needs it
    var heicUrl = new URL('../lib/heic-to/heic-to.js', document.currentScript.src).href, heicPromise = null;
    function loadHeicDecoder() {
        if (!heicPromise) {
            heicPromise = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = heicUrl;
                s.onload = function () { window.HeicTo ? resolve(window.HeicTo) : reject(new Error('HEIF decoder missing')); };
                s.onerror = function () { heicPromise = null; reject(new Error('HEIF decoder failed to load')); };
                document.head.appendChild(s);
            });
        }
        return heicPromise;
    }

    async function loadFile(file) {
        if (!file) return;
        var bmp = null;
        try {
            bmp = await createImageBitmap(file);
        } catch (e) {
            // not a format the browser reads natively: try it as HEIC/HEIF (phone cameras)
            try {
                setStatus('Decoding HEIF…');
                var heicTo = await loadHeicDecoder();
                bmp = await heicTo({ blob: file, type: 'bitmap' });
            } catch (e2) {
                setStatus('This file could not be opened as an image.');
                return;
            }
        }
        if (bitmap && bitmap.close) bitmap.close();
        bitmap = bmp;
        fileName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
        drop.hidden = true; canvas.hidden = false;
        saveBtns.forEach(function (b) { b.disabled = false; });
        compareBtn.disabled = false;
        if (!chain.length) addStep('audio');
        rasterize();
    }

    // ---------- UI ----------

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function defaults(engine, p) {
        ENGINES[engine].params(p).forEach(function (q) { if (!(q.id in p)) p[q.id] = q.def; });
        return p;
    }

    function addStep(engine) {
        var p = defaults(engine, {});
        if ('seed' in p) p.seed = 1 + Math.floor(Math.random() * 999);
        chain.push({ engine: engine, on: true, p: p, error: '' });
        buildChain();
        invalidate(chain.length - 1);
    }

    function iconBtn(text, title, onClick, disabled) {
        var b = el('button', 'glitch-icon-btn', text);
        b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
        b.disabled = !!disabled;
        b.addEventListener('click', onClick);
        return b;
    }

    function buildField(step, q, index) {
        var field = el('label', 'glitch-field'), head = el('span', 'glitch-field-head'), input;
        head.appendChild(el('span', '', q.label));
        field.appendChild(head);
        if (q.type === 'select') {
            input = el('select');
            q.options.forEach(function (o) {
                var opt = el('option', '', o[1]); opt.value = o[0];
                input.appendChild(opt);
            });
            input.value = step.p[q.id];
            input.addEventListener('change', function () {
                step.p[q.id] = input.value;
                if (q.rebuild) { defaults(step.engine, step.p); buildChain(); }
                invalidate(chain.indexOf(step));
            });
        } else {
            var valueEl = el('span', 'glitch-field-value');
            head.appendChild(valueEl);
            var show = function () { var v = step.p[q.id]; valueEl.textContent = q.fmt ? q.fmt(v) : String(v); };
            // log: geometric scale; log0: geometric scale that also reaches zero
            var curved = q.log || q.log0, lo = q.log0 ? 1 : q.min;
            var toPos = function (v) { return q.log0 ? Math.log(v + 1) / Math.log(q.max + 1) : Math.log(v / lo) / Math.log(q.max / lo); };
            var toVal = function (t) { return q.log0 ? Math.round(Math.pow(q.max + 1, t) - 1) : lo * Math.pow(q.max / lo, t); };
            input = el('input');
            input.type = 'range';
            if (curved) { input.min = 0; input.max = 1; input.step = 0.001; input.value = toPos(step.p[q.id]); }
            else { input.min = q.min; input.max = q.max; input.step = q.step || 1; input.value = step.p[q.id]; }
            input.addEventListener('input', function () {
                step.p[q.id] = curved ? toVal(+input.value) : +input.value;
                show();
                invalidate(chain.indexOf(step));
            });
            show();
        }
        field.appendChild(input);
        return field;
    }

    function buildChain() {
        chainEl.textContent = '';
        chain.forEach(function (step, index) {
            var card = el('div', 'glitch-card' + (step.on ? '' : ' is-off'));
            var head = el('div', 'glitch-card-head');
            var title = el('label', 'glitch-card-title');
            var toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = step.on;
            toggle.setAttribute('aria-label', 'Enable step');
            toggle.addEventListener('change', function () {
                step.on = toggle.checked;
                card.classList.toggle('is-off', !step.on);
                invalidate(chain.indexOf(step));
            });
            title.appendChild(toggle);
            title.appendChild(el('span', '', (index + 1) + '. ' + ENGINES[step.engine].label));
            head.appendChild(title);
            if ('seed' in step.p) {
                head.appendChild(iconBtn('⚄', 'New random seed', function () {
                    step.p.seed = 1 + Math.floor(Math.random() * 999);
                    buildChain(); invalidate(chain.indexOf(step));
                }));
            }
            head.appendChild(iconBtn('↑', 'Move up', function () { move(step, -1); }, index === 0));
            head.appendChild(iconBtn('↓', 'Move down', function () { move(step, 1); }, index === chain.length - 1));
            head.appendChild(iconBtn('×', 'Remove step', function () {
                var i = chain.indexOf(step);
                chain.splice(i, 1);
                buildChain(); invalidate(i);
            }));
            card.appendChild(head);

            var body = el('div', 'glitch-card-body');
            ENGINES[step.engine].params(step.p).forEach(function (q) { body.appendChild(buildField(step, q, index)); });
            card.appendChild(body);

            step.errEl = el('p', 'glitch-card-error', step.error);
            step.errEl.hidden = !step.error;
            card.appendChild(step.errEl);
            chainEl.appendChild(card);
        });
    }

    function move(step, dir) {
        var i = chain.indexOf(step), j = i + dir;
        if (j < 0 || j >= chain.length) return;
        chain[i] = chain[j]; chain[j] = step;
        buildChain();
        invalidate(Math.min(i, j));
    }

    Object.keys(ENGINES).forEach(function (key) {
        var b = el('button', 'glitch-btn', '+ ' + ENGINES[key].label);
        b.type = 'button';
        b.addEventListener('click', function () { addStep(key); });
        addEl.appendChild(b);
    });

    $('glitch-open').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { loadFile(fileInput.files[0]); fileInput.value = ''; });
    sizeEl.addEventListener('change', rasterize);

    ['dragenter', 'dragover'].forEach(function (type) {
        app.addEventListener(type, function (e) { e.preventDefault(); app.classList.add('is-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
        app.addEventListener(type, function (e) { e.preventDefault(); app.classList.remove('is-dragover'); });
    });
    app.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(f);
    });
    document.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) { loadFile(items[i].getAsFile()); e.preventDefault(); return; }
        }
    });

    function compare(on) {
        if (!source || comparing === on) return;
        comparing = on;
        draw(on ? source : (shown || source));
    }
    compareBtn.addEventListener('pointerdown', function () { compare(true); });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function (t) {
        compareBtn.addEventListener(t, function () { compare(false); });
    });
    compareBtn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') compare(true); });
    compareBtn.addEventListener('keyup', function () { compare(false); });

    function save(type, ext, quality) {
        if (!shown) return;
        canvasBlob(imgToCanvas(shown), type, quality).then(function (blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName + '-glitch.' + ext;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        });
    }
    saveBtns[0].addEventListener('click', function () { save('image/png', 'png'); });
    saveBtns[1].addEventListener('click', function () { save('image/jpeg', 'jpg', 0.95); });
})();
