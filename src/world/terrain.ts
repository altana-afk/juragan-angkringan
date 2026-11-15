/**
 * Jenis permukaan tanah. Data logika (ketinggian, bisa dilalui) dipisah dari
 * cara menggambarnya (src/graphics/art/ground.ts).
 */

export type TerrainId = 'grass' | 'dirt' | 'paving' | 'sidewalk' | 'asphalt' | 'asphaltCenter' | 'zebra' | 'concrete';

export interface TerrainDef {
  readonly id: TerrainId;
  readonly label: string;
  /** Ketinggian permukaan dalam piksel (trotoar sedikit lebih tinggi). */
  readonly elevation: number;
  readonly walkable: boolean;
  /** Bagian dari jalan raya (untuk marka & lalu lintas di masa depan). */
  readonly road: boolean;
}

export const TERRAINS: Readonly<Record<TerrainId, TerrainDef>> = {
  grass: { id: 'grass', label: 'Rumput', elevation: 0, walkable: true, road: false },
  dirt: { id: 'dirt', label: 'Tanah', elevation: 0, walkable: true, road: false },
  paving: { id: 'paving', label: 'Paving', elevation: 0, walkable: true, road: false },
  sidewalk: { id: 'sidewalk', label: 'Trotoar', elevation: 2, walkable: true, road: false },
  asphalt: { id: 'asphalt', label: 'Aspal', elevation: 0, walkable: true, road: true },
  asphaltCenter: { id: 'asphaltCenter', label: 'Aspal (marka tengah)', elevation: 0, walkable: true, road: true },
  zebra: { id: 'zebra', label: 'Zebra cross', elevation: 0, walkable: true, road: true },
  concrete: { id: 'concrete', label: 'Jalan gang', elevation: 0, walkable: true, road: false },
};

export function isTerrainId(value: string): value is TerrainId {
  return Object.prototype.hasOwnProperty.call(TERRAINS, value);
}
