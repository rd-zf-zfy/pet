import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

function readPngSize(filePath) {
  const data = fs.readFileSync(filePath);
  const signature = data.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`Not a PNG: ${filePath}`);
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  };
}

function assertState(name, spec) {
  const filePath = path.join(root, spec.sheet);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing state sheet: ${spec.sheet}`);
  }

  const size = readPngSize(filePath);
  const expectedWidth = manifest.frame.width * spec.columns;
  if (size.width !== expectedWidth) {
    throw new Error(`${name} width ${size.width}, expected ${expectedWidth}`);
  }
  if (size.height !== manifest.frame.height) {
    throw new Error(`${name} height ${size.height}, expected ${manifest.frame.height}`);
  }

  const trim = spec.trim;
  if (!trim || trim.x < 0 || trim.y < 0 || trim.width <= 0 || trim.height <= 0) {
    throw new Error(`${name} has invalid trim`);
  }
  if (trim.x + trim.width > manifest.frame.width || trim.y + trim.height > manifest.frame.height) {
    throw new Error(`${name} trim exceeds frame bounds`);
  }

  console.log(`state ${name}: ok`);
}

for (const [name, spec] of Object.entries(manifest.states)) {
  assertState(name, spec);
}

console.log('asset manifest validation passed');
