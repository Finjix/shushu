// Requires Node.js and system ffmpeg/ffprobe with the libwebp encoder.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const extensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff']);
function run(command, args) {
  const result = spawnSync(command, args, { maxBuffer: 512 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr.toString()}`);
  return result.stdout;
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : entry.isFile() ? [name] : [];
  }).sort();
}
function pixels(file) {
  return run('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
}
function dimensions(file) {
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]));
  return probe.streams[0];
}
function encode(source, destination) {
  run('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', source, '-map', '0:v:0', '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '0', '-quality', '100', '-compression_level', '6', '-pix_fmt', 'bgra', '-f', 'webp', destination]);
  const before = dimensions(source);
  const after = dimensions(destination);
  if (before.width !== after.width || before.height !== after.height) throw new Error(`Dimension verification failed: ${source}`);
  const original = pixels(source);
  const converted = pixels(destination);
  if (original.length !== before.width * before.height * 4 || converted.length !== original.length) throw new Error(`Decode verification failed: ${source}`);
  for (let i = 3; i < original.length; i += 4) {
    if (original[i] !== converted[i]) throw new Error(`Alpha verification failed: ${source}`);
  }
}
function main(root = ROOT) {
  run('ffmpeg', ['-version']);
  run('ffprobe', ['-version']);
  const publicDir = path.join(root, 'public');
  const archiveDir = path.join(root, 'original-assets');
  const allFiles = files(publicDir);
  const planned = new Set();
  const jobs = allFiles.filter(file => extensions.has(path.extname(file).toLowerCase())).map(source => {
    const relative = path.relative(publicDir, source);
    const destination = source.slice(0, -path.extname(source).length) + '.webp';
    const parts = relative.split(path.sep);
    const original = path.join(archiveDir, ...(parts[0] === 'asset' ? parts.slice(1) : parts));
    for (const target of [destination, original]) {
      const key = process.platform === 'win32' ? target.toLowerCase() : target;
      if (fs.existsSync(target) || planned.has(key)) throw new Error(`Refusing to overwrite: ${target}`);
      planned.add(key);
    }
    return { source, relative, destination, original };
  });
  // Reject animations before modifying any assets.
  for (const { source } of jobs) {
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', source]));
    if (probe.streams?.length !== 1 || Number(probe.streams[0].nb_read_frames) !== 1) {
      throw new Error(`Animated or unsupported images require manual conversion: ${source}`);
    }
  }
  for (const { source, relative, destination, original } of jobs) {
    const temporary = destination + '.tmp';
    if (fs.existsSync(temporary)) throw new Error(`Refusing to overwrite: ${temporary}`);
    try {
      encode(source, temporary);
      fs.mkdirSync(path.dirname(original), { recursive: true });
      fs.copyFileSync(source, original, fs.constants.COPYFILE_EXCL);
      fs.copyFileSync(temporary, destination, fs.constants.COPYFILE_EXCL);
      const oldUrl = '/' + relative.split(path.sep).join('/');
      const newUrl = '/' + path.relative(publicDir, destination).split(path.sep).join('/');
      for (const textFile of allFiles.filter(file => ['.html', '.css', '.js', '.json'].includes(path.extname(file).toLowerCase()))) {
        const text = fs.readFileSync(textFile, 'utf8');
        const updated = text.split(oldUrl).join(newUrl);
        if (updated !== text) fs.writeFileSync(textFile, updated);
      }
      fs.unlinkSync(source);
      console.log(`Converted: ${relative}`);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  console.log(`Done: ${jobs.length} images; originals in original-assets/`);
}
module.exports = { main, run, pixels, dimensions, encode };
if (require.main === module) {
  try { main(); } catch (error) { console.error(`Conversion failed: ${error.message}`); process.exitCode = 1; }
}
