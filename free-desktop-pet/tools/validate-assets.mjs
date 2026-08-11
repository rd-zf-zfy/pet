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

function assertPng(relativePath, expectedWidth, expectedHeight) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing asset: ${relativePath}`);
  }
  const size = readPngSize(filePath);
  if (expectedWidth && size.width !== expectedWidth) {
    throw new Error(`${relativePath} width ${size.width}, expected ${expectedWidth}`);
  }
  if (expectedHeight && size.height !== expectedHeight) {
    throw new Error(`${relativePath} height ${size.height}, expected ${expectedHeight}`);
  }
}

function validateManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  const label = path.relative(root, manifestPath);

  for (const [name, spec] of Object.entries(manifest.states)) {
    assertPng(
      spec.sheet,
      spec.frameWidth * spec.columns,
      spec.frameHeight * spec.rows
    );
    console.log(`${label} state ${name}: ok`);
  }

  for (const [name, spec] of Object.entries(manifest.effects)) {
    assertPng(spec.sheet, spec.frameWidth * spec.columns, spec.frameHeight);
    console.log(`${label} effect ${name}: ok`);
  }

  for (const [name, relativePath] of Object.entries(manifest.props)) {
    assertPng(relativePath, 64, 64);
    console.log(`${label} prop ${name}: ok`);
  }

  for (const [name, relativePath] of Object.entries(manifest.ui)) {
    assertPng(relativePath);
    console.log(`${label} ui ${name}: ok`);
  }

  console.log(`${label} validation passed`);
}

for (const manifestPath of manifestPaths) {
  validateManifest(manifestPath);
}
