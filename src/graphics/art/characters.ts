import { objectTextureKey } from '../../world/objectTypes';
import type { Color } from '../color';
import { PixelCanvas } from '../PixelCanvas';
import { PAL } from '../palette';
import type { ArtEntry } from './types';

/**
 * Penjual angkringan: peci, kaos, handuk di bahu, sarung kotak-kotak.
 * Baris 0–14 adalah badan atas (bergerak saat animasi "bernapas").
 */
const SELLER_ROWS = [
  '....ooooo....',
  '...ohhhHho...',
  '...ohhhhho...',
  '...ossssso...',
  '...oseseso...',
  '...osmmmso...',
  '...oSsssSo...',
  '....oSSSo....',
  '..owwwwwwtto.',
  '.owwwwwwwtTo.',
  'oswwwwwwwWTso',
  'oswwwwwwwWWso',
  'oswwwwwwwWWso',
  'oSowwwwwwWoSo',
  'osoWwwwwwWoso',
  '..oPPPPPPPo..',
  '..opcppcppo..',
  '..opcppcppo..',
  '..occccccco..',
  '..opcppcppo..',
  '..opcppcpPo..',
  '..opcppcpPo..',
  '..occccccPo..',
  '..opcppcpPo..',
  '...opppPPo...',
  '...offoffo...',
  '...ooo.ooo...',
];
const UPPER_BODY_ROWS = 15;

const SELLER_PALETTE: Record<string, Color> = {
  o: 0x23181c,
  h: 0x1d1d26,
  H: 0x3a3a4a,
  s: PAL.skin,
  S: PAL.skinShadow,
  e: 0x1a1010,
  m: 0x2a1c18,
  w: 0xe6dcc6,
  W: 0xb9ad94,
  t: 0xcf4a3c,
  T: 0xa3362b,
  p: 0x3d5f8f,
  P: 0x2c4569,
  c: 0x6d8fbf,
  f: 0x4a3222,
};

export function paintSellerFrames(): ArtEntry[] {
  const width = 13;
  const height = SELLER_ROWS.length;
  return [0, 1].map((frame) => {
    const out = new PixelCanvas(width, height);
    // Kaki selalu di dasar kanvas; pada frame 1 badan atas turun 1 px (gerak bernapas).
    out.drawPattern(0, UPPER_BODY_ROWS, SELLER_ROWS.slice(UPPER_BODY_ROWS), SELLER_PALETTE);
    out.drawPattern(0, frame, SELLER_ROWS.slice(0, UPPER_BODY_ROWS), SELLER_PALETTE);
    return {
      key: objectTextureKey('seller', 'default', frame),
      art: { canvas: out, anchorX: width / 2, anchorY: height },
    };
  });
}
