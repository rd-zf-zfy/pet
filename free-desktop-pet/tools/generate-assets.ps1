param(
  [string]$SourceZip = "D:\res\Free.zip",
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

$sourceDir = Join-Path $ProjectRoot "assets\source"
$generatedDir = Join-Path $ProjectRoot "assets\generated"
$statesDir = Join-Path $generatedDir "states"
$effectsDir = Join-Path $generatedDir "effects"
$propsDir = Join-Path $generatedDir "props"
$uiDir = Join-Path $generatedDir "ui"

foreach ($dir in @($sourceDir, $statesDir, $effectsDir, $propsDir, $uiDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

function Save-Bitmap {
  param([Drawing.Bitmap]$Bitmap, [string]$Path)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $Bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
}

function New-TransparentBitmap {
  param([int]$Width, [int]$Height)
  $bitmap = [Drawing.Bitmap]::new($Width, $Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([Drawing.Color]::FromArgb(0, 0, 0, 0))
  $graphics.Dispose()
  return $bitmap
}

function Set-PixelGraphics {
  param([Drawing.Graphics]$Graphics)
  $Graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $Graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::None
  $Graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::Half
  $Graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighSpeed
}

function Clone-Frame {
  param(
    [Drawing.Bitmap]$Sheet,
    [int]$Column,
    [int]$Row,
    [int]$FrameWidth = 64,
    [int]$FrameHeight = 128
  )
  $rect = [Drawing.Rectangle]::new($Column * $FrameWidth, $Row * $FrameHeight, $FrameWidth, $FrameHeight)
  return $Sheet.Clone($rect, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Draw-Image {
  param(
    [Drawing.Graphics]$Graphics,
    [Drawing.Image]$Image,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )
  Set-PixelGraphics $Graphics
  $dest = [Drawing.Rectangle]::new($X, $Y, $Width, $Height)
  $Graphics.DrawImage($Image, $dest)
}

function Fill-Rect {
  param([Drawing.Graphics]$Graphics, [Drawing.Color]$Color, [int]$X, [int]$Y, [int]$Width, [int]$Height)
  $brush = [Drawing.SolidBrush]::new($Color)
  $Graphics.FillRectangle($brush, $X, $Y, $Width, $Height)
  $brush.Dispose()
}

function Stroke-Rect {
  param([Drawing.Graphics]$Graphics, [Drawing.Color]$Color, [int]$X, [int]$Y, [int]$Width, [int]$Height, [int]$Thickness = 1)
  $pen = [Drawing.Pen]::new($Color, $Thickness)
  $Graphics.DrawRectangle($pen, $X, $Y, $Width, $Height)
  $pen.Dispose()
}

function Fill-Ellipse {
  param([Drawing.Graphics]$Graphics, [Drawing.Color]$Color, [int]$X, [int]$Y, [int]$Width, [int]$Height)
  $brush = [Drawing.SolidBrush]::new($Color)
  $Graphics.FillEllipse($brush, $X, $Y, $Width, $Height)
  $brush.Dispose()
}

function Draw-PixelPattern {
  param(
    [Drawing.Graphics]$Graphics,
    [string[]]$Rows,
    [int]$X,
    [int]$Y,
    [int]$Scale,
    [Drawing.Color]$Color
  )
  for ($row = 0; $row -lt $Rows.Count; $row++) {
    for ($col = 0; $col -lt $Rows[$row].Length; $col++) {
      if ($Rows[$row][$col] -eq "1") {
        Fill-Rect $Graphics $Color ($X + $col * $Scale) ($Y + $row * $Scale) $Scale $Scale
      }
    }
  }
}

function Draw-Heart {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Scale = 2)
  Draw-PixelPattern $Graphics @(
    "01100110",
    "11111111",
    "11111111",
    "01111110",
    "00111100",
    "00011000"
  ) $X $Y $Scale ([Drawing.Color]::FromArgb(255, 238, 72, 105))
  Draw-PixelPattern $Graphics @(
    "01000000",
    "10000001"
  ) ($X + $Scale) ($Y + $Scale) $Scale ([Drawing.Color]::FromArgb(255, 255, 169, 187))
}

function Draw-Star {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Scale = 2)
  Draw-PixelPattern $Graphics @(
    "00100",
    "01110",
    "11111",
    "01110",
    "10101"
  ) $X $Y $Scale ([Drawing.Color]::FromArgb(255, 255, 221, 87))
  Draw-PixelPattern $Graphics @("00100", "01010") ($X) ($Y) $Scale ([Drawing.Color]::FromArgb(255, 255, 246, 174))
}

function Draw-Exclaim {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Scale = 2)
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 58, 48, 42)) ($X - $Scale) ($Y - $Scale) ($Scale * 4) ($Scale * 9)
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 213, 67)) $X $Y ($Scale * 2) ($Scale * 6)
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 213, 67)) $X ($Y + $Scale * 8) ($Scale * 2) ($Scale * 2)
}

function Draw-AngryMark {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Scale = 2)
  $red = [Drawing.Color]::FromArgb(255, 227, 47, 58)
  Fill-Rect $Graphics $red $X ($Y + $Scale * 2) ($Scale * 8) $Scale
  Fill-Rect $Graphics $red ($X + $Scale * 3) $Y $Scale ($Scale * 8)
  Fill-Rect $Graphics $red ($X + $Scale) ($Y + $Scale) ($Scale * 2) $Scale
  Fill-Rect $Graphics $red ($X + $Scale * 5) ($Y + $Scale * 5) ($Scale * 2) $Scale
}

function Draw-Z {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y, [int]$Scale = 2)
  $color = [Drawing.Color]::FromArgb(255, 99, 114, 182)
  Fill-Rect $Graphics $color $X $Y ($Scale * 6) $Scale
  Fill-Rect $Graphics $color ($X + $Scale * 4) ($Y + $Scale) $Scale $Scale
  Fill-Rect $Graphics $color ($X + $Scale * 3) ($Y + $Scale * 2) $Scale $Scale
  Fill-Rect $Graphics $color ($X + $Scale * 2) ($Y + $Scale * 3) $Scale $Scale
  Fill-Rect $Graphics $color $X ($Y + $Scale * 4) ($Scale * 6) $Scale
}

function Draw-Pillow {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y)
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 79, 91, 159)) ($X + 2) ($Y + 2) 44 20
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 214, 220, 255)) $X $Y 44 20
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 190, 198, 245)) ($X + 4) ($Y + 14) 34 3
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 255, 255)) ($X + 5) ($Y + 3) 12 4
}

function Draw-Snack {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y)
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 95, 62, 42)) ($X + 18) ($Y + 18) 28 22
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 238, 185, 92)) ($X + 16) ($Y + 16) 28 22
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 230, 138)) ($X + 22) ($Y + 20) 10 4
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 177, 93, 53)) ($X + 15) ($Y + 38) 31 4
}

function Draw-Ball {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y)
  Fill-Ellipse $Graphics ([Drawing.Color]::FromArgb(255, 57, 56, 78)) ($X + 13) ($Y + 15) 38 38
  Fill-Ellipse $Graphics ([Drawing.Color]::FromArgb(255, 255, 118, 84)) ($X + 12) ($Y + 12) 38 38
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 219, 93)) ($X + 28) ($Y + 12) 5 38
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 219, 93)) ($X + 12) ($Y + 28) 38 5
}

function Draw-Gift {
  param([Drawing.Graphics]$Graphics, [int]$X, [int]$Y)
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 66, 49, 86)) ($X + 16) ($Y + 26) 34 26
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 222, 77, 91)) ($X + 14) ($Y + 24) 34 26
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 220, 86)) ($X + 28) ($Y + 24) 6 26
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 220, 86)) ($X + 14) ($Y + 33) 34 6
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 220, 86)) ($X + 21) ($Y + 15) 8 8
  Fill-Rect $Graphics ([Drawing.Color]::FromArgb(255, 255, 220, 86)) ($X + 34) ($Y + 15) 8 8
}

function Draw-SpeechBubble {
  param([string]$Path, [int]$Width, [int]$Height, [string]$Kind)
  $bmp = New-TransparentBitmap $Width $Height
  $g = [Drawing.Graphics]::FromImage($bmp)
  Set-PixelGraphics $g
  $shadow = [Drawing.Color]::FromArgb(145, 51, 45, 70)
  $outline = [Drawing.Color]::FromArgb(255, 60, 54, 72)
  $fill = [Drawing.Color]::FromArgb(245, 255, 250, 238)
  Fill-Rect $g $shadow 8 8 ($Width - 14) ($Height - 18)
  Fill-Rect $g $outline 4 4 ($Width - 14) ($Height - 18)
  Fill-Rect $g $fill 7 7 ($Width - 20) ($Height - 24)

  if ($Kind -eq "thought") {
    Fill-Ellipse $g $outline ($Width - 38) ($Height - 20) 14 10
    Fill-Ellipse $g $fill ($Width - 36) ($Height - 18) 10 6
    Fill-Ellipse $g $outline ($Width - 20) ($Height - 10) 8 6
    Fill-Ellipse $g $fill ($Width - 18) ($Height - 8) 4 3
  } else {
    Fill-Rect $g $outline ($Width - 32) ($Height - 19) 17 9
    Fill-Rect $g $fill ($Width - 30) ($Height - 17) 11 5
  }

  Save-Bitmap $bmp $Path
  $g.Dispose()
  $bmp.Dispose()
}

function New-StateSheet {
  param(
    [string]$Path,
    [int]$FrameWidth,
    [int]$FrameHeight,
    [int]$Columns,
    [scriptblock]$DrawFrame
  )
  $sheet = New-TransparentBitmap ($FrameWidth * $Columns) $FrameHeight
  $graphics = [Drawing.Graphics]::FromImage($sheet)
  Set-PixelGraphics $graphics
  for ($i = 0; $i -lt $Columns; $i++) {
    & $DrawFrame $graphics $i ($i * $FrameWidth) 0
  }
  Save-Bitmap $sheet $Path
  $graphics.Dispose()
  $sheet.Dispose()
}

function New-EffectSheet {
  param([string]$Path, [string]$Kind)
  New-StateSheet $Path 64 64 6 {
    param($g, $i, $x, $y)
    $scale = 2 + [Math]::Floor($i / 2)
    $alpha = [Math]::Max(60, 255 - $i * 34)
    if ($Kind -eq "heart") {
      Draw-Heart $g ($x + 22 - $i) (28 - $i * 2) $scale
    } elseif ($Kind -eq "star") {
      Draw-Star $g ($x + 24 - $i) (26 - $i * 2) $scale
    } else {
      Draw-Exclaim $g ($x + 30) (18 - $i) 2
    }
    Fill-Ellipse $g ([Drawing.Color]::FromArgb($alpha, 255, 255, 255)) ($x + 26 - $i) (54 - $i) (8 + $i * 2) 2
  }
}

if (-not (Test-Path $SourceZip)) {
  throw "Source zip not found: $SourceZip"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($SourceZip)
try {
  $extractMap = @{
    "Free/64X128_Idle_Free.png" = "64X128_Idle_Free.png"
    "Free/64X128_Runing_Free.png" = "64X128_Runing_Free.png"
    "Free/64X128_Walking_Free.png" = "64X128_Walking_Free.png"
  }
  foreach ($entryName in $extractMap.Keys) {
    $entry = $zip.GetEntry($entryName)
    if ($null -eq $entry) {
      throw "Missing expected entry in Free.zip: $entryName"
    }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $sourceDir $extractMap[$entryName]), $true)
  }
}
finally {
  $zip.Dispose()
}

$idlePath = Join-Path $sourceDir "64X128_Idle_Free.png"
$idle = [Drawing.Bitmap]::FromFile($idlePath)

try {
  New-StateSheet (Join-Path $statesDir "happy.png") 96 128 8 {
    param($g, $i, $x, $y)
    $frame = Clone-Frame $idle $i 0
    Draw-Image $g $frame ($x + 16) 0 64 128
    $frame.Dispose()
    Draw-Heart $g ($x + 65) (14 + ($i % 2)) 2
    Draw-Star $g ($x + 12) (25 - ($i % 3)) 2
  }

  New-StateSheet (Join-Path $statesDir "angry.png") 96 128 8 {
    param($g, $i, $x, $y)
    $frame = Clone-Frame $idle $i 0
    Draw-Image $g $frame ($x + 16) 0 64 128
    $frame.Dispose()
    Draw-AngryMark $g ($x + 64) (15 + ($i % 2)) 2
    Fill-Rect $g ([Drawing.Color]::FromArgb(170, 220, 45, 55)) ($x + 24) 72 48 3
  }

  New-StateSheet (Join-Path $statesDir "surprised.png") 96 128 8 {
    param($g, $i, $x, $y)
    $frame = Clone-Frame $idle $i 0
    Draw-Image $g $frame ($x + 16) 0 64 128
    $frame.Dispose()
    Draw-Exclaim $g ($x + 70) (11 - ($i % 2)) 2
    Draw-Star $g ($x + 15) (22 - ($i % 2)) 2
  }

  New-StateSheet (Join-Path $statesDir "dragged.png") 96 128 8 {
    param($g, $i, $x, $y)
    $frame = Clone-Frame $idle $i 0
    $bob = [int][Math]::Round([Math]::Sin($i * [Math]::PI / 4) * 3)
    Fill-Ellipse $g ([Drawing.Color]::FromArgb(90, 35, 32, 52)) ($x + 26) 118 44 7
    Draw-Image $g $frame ($x + 16) (0 + $bob) 64 128
    $frame.Dispose()
    Fill-Rect $g ([Drawing.Color]::FromArgb(190, 170, 190, 255)) ($x + 45) (4 + $bob) 6 22
    Fill-Rect $g ([Drawing.Color]::FromArgb(210, 255, 255, 255)) ($x + 40) (2 + $bob) 16 4
  }

  New-StateSheet (Join-Path $statesDir "sleep.png") 128 128 8 {
    param($g, $i, $x, $y)
    Draw-Pillow $g ($x + 8) 84
    $frame = Clone-Frame $idle ($i % 8) 1
    $frame.RotateFlip([Drawing.RotateFlipType]::Rotate90FlipNone)
    $bob = [int][Math]::Floor(($i % 4) / 2)
    Draw-Image $g $frame ($x + 18) (50 + $bob) 128 64
    $frame.Dispose()
    Draw-Z $g ($x + 88) (24 - ($i % 3)) 2
    if ($i -gt 2) { Draw-Z $g ($x + 103) (11 - ($i % 2)) 1 }
  }

  New-StateSheet (Join-Path $statesDir "fall.png") 128 128 8 {
    param($g, $i, $x, $y)
    Fill-Ellipse $g ([Drawing.Color]::FromArgb(95, 36, 33, 48)) ($x + 24) 107 80 10
    $frame = Clone-Frame $idle ([Math]::Min($i, 7)) 0
    $frame.RotateFlip([Drawing.RotateFlipType]::Rotate270FlipNone)
    Draw-Image $g $frame ($x + 0) 48 128 64
    $frame.Dispose()
    Draw-Star $g ($x + 22 + ($i % 2) * 2) (28 - ($i % 3)) 2
    Draw-Star $g ($x + 94 - ($i % 2) * 2) (32 - ($i % 2)) 2
  }
}
finally {
  $idle.Dispose()
}

New-EffectSheet (Join-Path $effectsDir "click_heart.png") "heart"
New-EffectSheet (Join-Path $effectsDir "click_star.png") "star"
New-EffectSheet (Join-Path $effectsDir "click_exclaim.png") "exclaim"

foreach ($prop in @("pillow", "snack", "ball", "gift")) {
  $bmp = New-TransparentBitmap 64 64
  $g = [Drawing.Graphics]::FromImage($bmp)
  Set-PixelGraphics $g
  switch ($prop) {
    "pillow" { Draw-Pillow $g 10 22 }
    "snack" { Draw-Snack $g 0 0 }
    "ball" { Draw-Ball $g 0 0 }
    "gift" { Draw-Gift $g 0 0 }
  }
  Save-Bitmap $bmp (Join-Path $propsDir "$prop.png")
  $g.Dispose()
  $bmp.Dispose()
}

Draw-SpeechBubble (Join-Path $uiDir "speech_bubble.png") 192 72 "speech"
Draw-SpeechBubble (Join-Path $uiDir "thought_bubble.png") 160 72 "thought"
Draw-SpeechBubble (Join-Path $uiDir "angry_bubble.png") 120 64 "speech"

$manifest = @'
{
  "name": "Free Desktop Pet Extended",
  "style": "64x128 anime pixel desktop pet with transparent window interactions",
  "baseFrame": {
    "width": 64,
    "height": 128
  },
  "states": {
    "idle": {
      "sheet": "assets/source/64X128_Idle_Free.png",
      "frameWidth": 64,
      "frameHeight": 128,
      "columns": 8,
      "rows": 4,
      "fps": 8,
      "directions": {
        "front": 0,
        "left": 1,
        "right": 2,
        "back": 3
      }
    },
    "walk": {
      "sheet": "assets/source/64X128_Walking_Free.png",
      "frameWidth": 64,
      "frameHeight": 128,
      "columns": 10,
      "rows": 4,
      "fps": 10,
      "directions": {
        "front": 0,
        "left": 1,
        "right": 2,
        "back": 3
      }
    },
    "run": {
      "sheet": "assets/source/64X128_Runing_Free.png",
      "frameWidth": 64,
      "frameHeight": 128,
      "columns": 8,
      "rows": 4,
      "fps": 12,
      "directions": {
        "front": 0,
        "left": 1,
        "right": 2,
        "back": 3
      }
    },
    "happy": {
      "sheet": "assets/generated/states/happy.png",
      "frameWidth": 96,
      "frameHeight": 128,
      "columns": 8,
      "rows": 1,
      "fps": 8
    },
    "angry": {
      "sheet": "assets/generated/states/angry.png",
      "frameWidth": 96,
      "frameHeight": 128,
      "columns": 8,
      "rows": 1,
      "fps": 8
    },
    "surprised": {
      "sheet": "assets/generated/states/surprised.png",
      "frameWidth": 96,
      "frameHeight": 128,
      "columns": 8,
      "rows": 1,
      "fps": 8
    },
    "dragged": {
      "sheet": "assets/generated/states/dragged.png",
      "frameWidth": 96,
      "frameHeight": 128,
      "columns": 8,
      "rows": 1,
      "fps": 10
    },
    "sleep": {
      "sheet": "assets/generated/states/sleep.png",
      "frameWidth": 128,
      "frameHeight": 128,
      "columns": 8,
      "rows": 1,
      "fps": 5
    },
    "fall": {
      "sheet": "assets/generated/states/fall.png",
      "frameWidth": 128,
      "frameHeight": 128,
      "columns": 8,
      "rows": 1,
      "fps": 8
    }
  },
  "effects": {
    "heart": {
      "sheet": "assets/generated/effects/click_heart.png",
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 6,
      "fps": 14
    },
    "star": {
      "sheet": "assets/generated/effects/click_star.png",
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 6,
      "fps": 14
    },
    "exclaim": {
      "sheet": "assets/generated/effects/click_exclaim.png",
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 6,
      "fps": 14
    }
  },
  "props": {
    "pillow": "assets/generated/props/pillow.png",
    "snack": "assets/generated/props/snack.png",
    "ball": "assets/generated/props/ball.png",
    "gift": "assets/generated/props/gift.png"
  },
  "ui": {
    "speech": "assets/generated/ui/speech_bubble.png",
    "thought": "assets/generated/ui/thought_bubble.png",
    "angry": "assets/generated/ui/angry_bubble.png"
  }
}
'@

$manifestPath = Join-Path $ProjectRoot "assets\manifest.json"
$manifestFormsDir = Join-Path $ProjectRoot "assets\manifests"
$lanyuManifestPath = Join-Path $manifestFormsDir "lanyu.json"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
New-Item -ItemType Directory -Force -Path $manifestFormsDir | Out-Null
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8NoBom)
[System.IO.File]::WriteAllText($lanyuManifestPath, $manifest, $utf8NoBom)

Write-Host "Generated desktop pet assets under $generatedDir"
