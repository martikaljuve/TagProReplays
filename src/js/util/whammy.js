/*
 This is a version of Whammy js, available at https://github.com/antimatter15/whammy

 Any part of the original is licensed under the following license:

The MIT License (MIT)

Copyright (c) 2015 Kevin Kwok

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

const ebml = require('ebml');

function assert(msg, test) {
  if (!test) throw new Error(msg);
}

const ids = {
  Cluster:            0x1f43b675,
  CodecID:            0x86,
  CodecName:          0x258688,
  CueClusterPosition: 0xf1,
  CuePoint:           0xbb,
  Cues:               0x1c53bb6b,
  CueTime:            0xb3,
  CueTrack:           0xf7,
  CueTrackPositions:  0xb7,
  DocType:            0x4282,
  DocTypeReadVersion: 0x4285,
  DocTypeVersion:     0x4287,
  Duration:           0x4489,
  EBML:               0x1a45dfa3,
  EBMLMaxIDLength:    0x42f2,
  EBMLMaxSizeLength:  0x42f3,
  EBMLReadVersion:    0x42f7,
  EBMLVersion:        0x4286,
  FlagLacing:         0x9c,
  Info:               0x1549a966,
  Language:           0x22b59c,
  MuxingApp:          0x4d80,
  PixelHeight:        0xba,
  PixelWidth:         0xb0,
  Timecode:           0xe7,
  TimecodeScale:      0x2ad7b1,
  TrackEntry:         0xae,
  TrackNumber:        0xd7,
  Tracks:             0x1654ae6b,
  TrackType:          0x83,
  TrackUID:           0x73c5,
  Segment:            0x18538067,
  SimpleBlock:        0xa3,
  Video:              0xe0,
  WritingApp:         0x5741,
};

module.exports = (function () {
  function toWebM(frames) {
    var info = checkFrames(frames);

    // Max duration by cluster in milliseconds
    var CLUSTER_MAX_DURATION = 30000;

    var EBML = [{
      "id": ids.EBML,
      "data": [{
        "id": ids.EBMLVersion,
        "data": 1
      }, {
        "id": ids.EBMLReadVersion,
        "data": 1
      }, {
        "id": ids.EBMLMaxIDLength,
        "data": 4,
      }, {
        "id": ids.EBMLMaxSizeLength,
        "data": 8
      }, {
        "id": ids.DocType,
        "data": "webm"
      }, {
        "id": ids.DocTypeVersion,
        "data": 2
      }, {
        "id": ids.DocTypeReadVersion,
        "data": 2
      }]
    }, {
      "id": ids.Segment,
      "data": [{
        "id": ids.Info,
        "data": [{
          "id": ids.TimecodeScale,
          "data": 1e6 // number of ns
        }, {
          "id": ids.MuxingApp,
          "data": "whammy"
        }, {
          "id": ids.WritingApp,
          "data": "whammy"
        }, {
          "id": ids.Duration,
          "data": doubleToString(info.duration)
        }]
      }, {
        "id": ids.Tracks,
        "data": [{
          "id": ids.TrackEntry,
          "data": [{
            "id": ids.TrackNumber,
            "data": 1
          }, {
            "id": ids.TrackUID,
            "data": 1
          }, {
            "id": ids.FlagLacing,
            "data": 0
          }, {
            "id": ids.Language,
            "data": "und"
          }, {
            "id": ids.CodecID,
            "data": "V_VP8"
          }, {
            "id": ids.CodecName,
            "data": "VP8"
          }, {
            "id": ids.TrackType,
            "data": 1
          }, {
            "id": ids.Video,
            "data": [{
              "id": ids.PixelWidth,
              "data": info.width
            }, {
              "id": ids.PixelHeight,
              "data": info.height
            }]
          }]
        }]
      }, {
        "id": ids.Cues,
        "data": []
      }, /*
        Cluster insertion point.
      */]
    }];


    let segment = EBML[1];
    let cues = segment.data[2];

    // Generate clusters (max duration)
    var frameNumber = 0;
    var clusterTimecode = 0;
    while (frameNumber < frames.length) {
      let cuePoint = {
        "id": ids.CuePoint,
        "data": [{
          "id": ids.CueTime,
          "data": Math.round(clusterTimecode)
        }, {
          "id": ids.CueTrackPositions,
          "data": [{
            "id": ids.CueTrack,
            "data": 1
          }, {
            "id": ids.CueClusterPosition,
            "data": 0, // we fill this in later.
            "size": 8
          }]
        }]
      };
      cues.data.push(cuePoint);
      var clusterFrames = [];
      var clusterDuration = 0;
      do {
        clusterFrames.push(frames[frameNumber]);
        clusterDuration += frames[frameNumber].duration;
        frameNumber++;
      } while (frameNumber < frames.length && clusterDuration < CLUSTER_MAX_DURATION);

      var clusterCounter = 0;
      let blocks = clusterFrames.map((webp) => {
        let block = makeSimpleBlock({
          discardable: 0,
          invisible: 0,
          keyframe: 1,
          lacing: 0,
          trackNum: 1,
          timecode: Math.round(clusterCounter)
        });
        clusterCounter += webp.duration;
        return {
          "id": ids.SimpleBlock,
          blob: new Blob([block, webp.blob])
        };
      });
      var cluster = {
        "id": ids.Cluster,
        "data": [{
          "id": ids.Timecode,
          "data": Math.round(clusterTimecode)
        }].concat(blocks)
      }

      segment.data.push(cluster);
      clusterTimecode += clusterDuration;
    }

    var position = 0;
    for (let i = 0; i < segment.data.length; i++) {
      if (i >= 3) {
        cues.data[i - 3].data[1].data[1].data = position;
      }
      let data = generateEBML([segment.data[i]]);
      position += data.size || data.byteLength || data.length;
      if (i != 2) { // not cues
        // Save results to avoid having to encode everything twice.
        segment.data[i] = data;
      }
    }

    return generateEBML(EBML);
  }

  function checkFrames(frames) {
    var width = frames[0].width,
      height = frames[0].height,
      duration = frames[0].duration;
    for (var i = 1; i < frames.length; i++) {
      if (frames[i].width != width) throw "Frame " + (i + 1) + " has a different width";
      if (frames[i].height != height) throw "Frame " + (i + 1) + " has a different height";
      if (frames[i].duration < 0 || frames[i].duration > 0x7fff) throw "Frame " + (i + 1) + " has a weird duration (must be between 0 and 32767)";
      duration += frames[i].duration;
    }
    return {
      duration: duration,
      width: width,
      height: height
    };
  }

  function numToBuffer(num) {
    var parts = [];
    while (num > 0) {
      parts.push(num & 0xff)
      num = num >> 8
    }
    return new Uint8Array(parts.reverse());
  }

  function numToFixedBuffer(num, size) {
    let parts = new Uint8Array(size);
    for (let i = size - 1; i >= 0; i--) {
      parts[i] = num & 0xff;
      num = num >> 8;
    }
    return parts;
  }

  function strToBuffer(str) {
    var arr = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i)
    }
    return arr;
  }

  function bitsToBuffer(bits) {
    var data = [];
    var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
    bits = pad + bits;
    for (var i = 0; i < bits.length; i += 8) {
      data.push(parseInt(bits.substr(i, 8), 2))
    }
    return new Uint8Array(data);
  }

  function generateEBML(jsons) {
    let ebml = [];
    for (let json of jsons) {
      if (!('id' in json)) {
        ebml.push(json);
        continue;
      }

      let data = json.blob || json.data;
      if (!json.blob) {
        if (typeof data == 'object') data = generateEBML(data);
        if (typeof data == 'number') {
          if ('size' in json) {
            data = numToFixedBuffer(data, json.size);
          } else {
            data = bitsToBuffer(data.toString(2));
          }
        }
        if (typeof data == 'string') data = new Blob([strToBuffer(data)]);
      }

      var len = data.size || data.byteLength || data.length;
      var zeroes = Math.ceil(Math.ceil(Math.log(len) / Math.log(2)) / 8);
      var size_str = len.toString(2);
      var padded = '0'.repeat((zeroes * 7 + 7) - size_str.length) + size_str;
      var size = '0'.repeat(zeroes) + '1' + padded;

      ebml.push(numToBuffer(json.id));
      ebml.push(bitsToBuffer(size));
      ebml.push(data);
    }
    return new Blob(ebml, {type: 'video/webm'});
  }

  function makeSimpleBlock(data) {
    var flags = 0;
    if (data.keyframe)    flags |= 128;
    if (data.invisible)   flags |= 8;
    if (data.lacing)      flags |= (data.lacing << 1);
    if (data.discardable) flags |= 1;
    if (data.trackNum > 127) {
      throw "TrackNumber > 127 not supported";
    }

    return new Uint8Array([
      data.trackNum | 0x80,
      data.timecode >> 8,
      data.timecode & 0xff,
      flags
    ]);
  }

  function parseWebP_old(riff) {
    return riff.RIFF[0].then((RIFF) => {
      let {width, height, blob} = RIFF.WEBP[0];
      return {width, height, riff: {RIFF: [RIFF]}, blob};
    });
  }

  function parseRIFF_old(blob) {
    return Promise.resolve(blob).then((blob) => {
      var offset = 0;
      var chunks = {};

      let res = new Response(blob.slice(0, 64));
      return res.arrayBuffer().then(function(buffer) {
        let dw = new DataView(buffer);
        let _id = dw.getUint32(0)
        let ids = {
          1464156752: 'WEBP',
          1380533830: 'RIFF',
          0: 'LIST'
        };

        while (offset < blob.size) {
          var id = ids[_id];
          chunks[id] = chunks[id] || [];
          if (ids[_id] === 'RIFF' || id === 'LIST') {
            let len = dw.getUint32(4);
            offset += 8 + len;
            chunks[id].push(parseRIFF(blob.slice(8)).then(function(out) {
              return out;
            }));
          } else if (id === 'WEBP') {
            let width = dw.getUint8(18); // Maybe it is: dw.getUint16(18, true)
            let height = dw.getUint8(20); // Maybe it is: dw.getUint16(20, true)
            let chunk = blob.slice(offset + 12);
        
            chunks.WEBP.push({width, height, blob: chunk});
            offset = blob.size;
          }
        }

        return chunks;
      });
    });
  }

  // New functions.
  function blobToBuffer(blob) {
    let res = new Response(blob);
    return res.arrayBuffer();
  }

  /**
   * Read FourCC and return string.
   * @param {DataView} view  the view referencing the buffer.
   * @param {number} offset  the offset from which to read the value.
   * @returns {string}  the extracted string
   */
  function readFourCC(view, offset = 0) {
    return String.fromCharCode(view.getUint8(offset),
                              view.getUint8(offset + 1),
                              view.getUint8(offset + 2),
                              view.getUint8(offset + 3));
  }

  let chunk_header_size = 8;
  /**
   * @param {ArrayBuffer} buffer
   * @param {number} offset
   * @returns {object}
   */
  function parseChunk(buffer, offset = 0) {
    let view = new DataView(buffer, offset, chunk_header_size);

    let chunk = {
      FourCC: readFourCC(view),
      Size: view.getUint32(4, true)
    };
    chunk.Payload = buffer.slice(offset + 8, offset + 8 + chunk.Size);
    // Odd-sized chunks have a 0 padding.
    let next = (chunk.Size % 2 == 0) ? offset + 8 + chunk.Size
                                    : offset + 8 + chunk.Size + 1;
    return [chunk, next];
  }

  /**
   * Parse WebP into sequence of chunks.
   * 
   * WebP format spec:
   * https://developers.google.com/speed/webp/docs/riff_container?csw=1
   * RIFF
   * size
   * WEBP
   * data
   * @param {ArrayBuffer} buffer
   * @returns {Array.<Chunk>}
   */
  function parseWebP(buffer) {
    let view = new DataView(buffer);
    let offset = 0;
    let label = readFourCC(view, offset);
    offset += 4;
    assert(`${label} should equal RIFF`, label === 'RIFF');
    let size = view.getUint32(4, true);
    offset += 4;
    label = readFourCC(view, 8);
    let read = 4;
    offset += 4;
    assert(`${label} should equal WEBP`, label === 'WEBP');
    let chunks = [];
    while (offset < size + 8) {
      let chunk;
      [chunk, offset] = parseChunk(buffer, offset);
      chunks.push(chunk);
    }
    return chunks;
  }
  exports.parseWebP = parseWebP;

  function getUint24le(view, offset = 0) {
    return (view.getUint8(offset + 2) << 16) |
          (view.getUint8(offset + 1) <<  8) |
            view.getUint8(offset);
  }

  function getUint24(view, offset) {
    return (view.getUint8(offset    ) << 16) |
          (view.getUint8(offset + 1) <<  8) |
            view.getUint8(offset + 2);
  }

  /**
   * @typedef Chunk
   * @property {number} Size
   * @property {ArrayBuffer} Payload
   */
  /**
   * Parse VP8 into keyframe and width/height.
   * https://tools.ietf.org/html/rfc6386
   * - section 19.1
   * @param {Chunk} chunk
   */
  function parseVP8(chunk) {
    let view = new DataView(chunk.Payload);
    let offset = 0;
    // 3 byte frame tag
    let tmp = getUint24le(view, offset);
    offset += 3;
    let key_frame = tmp & 0x1;
    let version = (tmp >> 1) & 0x7;
    let show_frame = (tmp >> 4) & 0x1;
    let first_part_size = (tmp >> 5) & 0x7FFFF;
    //assert(`VP8 chunk must be a key frame`, key_frame);
    // 3 byte start code
    let data_start = offset;
    let start_code = getUint24(view, offset);
    offset += 3;
    assert(`start code ${start_code} must equal 0x9d012a`, start_code === 0x9d012a);
    let horizontal_size_code = view.getUint16(offset, true);
    offset += 2;
    let width = horizontal_size_code & 0x3FFF;
    let horizontal_scale = horizontal_size_code >> 14;
    let vertical_size_code = view.getUint16(offset, true);
    offset += 2;
    let height = vertical_size_code & 0x3FFF;
    let vertical_scale = vertical_size_code >> 14;
    return {
      width: width,
      height: height,
      data: chunk.Payload.slice(data_start)
    };
  }

  function doubleToString(num) {
    return new Uint8Array(new Float64Array([num]))
    .map(e => String.fromCharCode(e)).reverse().join('');
  }

  function WhammyVideo(speed, quality) {
    this.frames = [];
    this.duration = 1000 / speed;
    this.quality = quality || 0.8;
  }

  WhammyVideo.prototype.add = function (frame, frameNum, duration) {
    if (typeof duration != 'undefined' && this.duration) throw "you can't pass a duration if the fps is set";
    if (typeof duration == 'undefined' && !this.duration) throw "if you don't have the fps set, you ned to have durations here."
    if (frame[Symbol.toStringTag] === 'Blob') {
      let frame1 = {
        imageBlob: frame,
        duration: duration || this.duration
      };

      let p = blobToBuffer(frame1.imageBlob).then((buffer) => {
        let chunks = parseWebP(buffer);
        let vp8 = chunks.find((chunk) => chunk.FourCC === 'VP8 ');
        let result = parseVP8(vp8);
        return {
          width: result.width,
          height: result.height,
          duration: frame1.duration,
          blob: new Blob([result.data], { type: 'image/webp' })
        };
      });

      /*// sb-1 way
      let p = parseRIFF(frame1.imageBlob).then(rff => {
        return parseWebP(rff).then(webp => {
          webp.duration = frame1.duration;
          webp.frameNum = frameNum;
          return webp;
        });
      });
      */

      this.frames.push(p);
      return p;
    }
    return Promise.reject(new Error('Frame must be a Blob.'));
  };

  WhammyVideo.prototype.compile = function() {
    return Promise.all(this.frames).then(toWebM);
  };

  return {
    Video: WhammyVideo,
    toWebM: toWebM
  };
})();
