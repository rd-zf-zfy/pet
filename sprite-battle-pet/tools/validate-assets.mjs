import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPaths = [
  path.join(root, 'assets', 'manifest.json')
];
const formsDir = path.join(root, 'assets', 'manifests');

if (fs.existsSync(formsDir)) {
  for (const fileName of fs.readdirSync(formsDir).sort()) {
    if (fileName.endsWith('.json')) {
      manifestPaths.push(path.join(formsDir, fileName));
    }
  }
}

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

function assertState(label, manifest, name, spec) {
  const filePath = path.join(root, spec.sheet);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing state sheet: ${spec.sheet}`);
  }

  const size = readPngSize(filePath);

  if (spec.trim) {
    const expectedWidth = manifest.frame.width * spec.columns;
    if (size.width !== expectedWidth) {
      throw new Error(`${label} ${name} width ${size.width}, expected ${expectedWidth}`);
    }
    if (size.height !== manifest.frame.height) {
      throw new Error(`${label} ${name} height ${size.height}, expected ${manifest.frame.height}`);
    }

    const trim = spec.trim;
    if (trim.x < 0 || trim.y < 0 || trim.width <= 0 || trim.height <= 0) {
      throw new Error(`${label} ${name} has invalid trim`);
    }
    if (trim.x + trim.width > manifest.frame.width || trim.y + trim.height > manifest.frame.height) {
      throw new Error(`${label} ${name} trim exceeds frame bounds`);
    }
  } else {
    const rows = spec.rows || 1;
    const expectedWidth = spec.frameWidth * spec.columns;
    const expectedHeight = spec.frameHeight * rows;
    if (size.width !== expectedWidth) {
      throw new Error(`${label} ${name} width ${size.width}, expected ${expectedWidth}`);
    }
    if (size.height !== expectedHeight) {
      throw new Error(`${label} ${name} height ${size.height}, expected ${expectedHeight}`);
    }
  }

  console.log(`${label} state ${name}: ok`);
}

function validateManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  const label = path.relative(root, manifestPath);

  for (const [name, spec] of Object.entries(manifest.states)) {
    assertState(label, manifest, name, spec);
  }

  console.log(`${label} validation passed`);
}

for (const manifestPath of manifestPaths) {
  validateManifest(manifestPath);
}
