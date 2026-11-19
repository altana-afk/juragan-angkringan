import { paintSellerFrames } from './characters';
import { paintBubblesAndEmotes, paintCats, paintChallengeFolk, paintCustomers } from './customers';
import { paintEffects } from './effects';
import {
  paintBenches,
  paintCanopy,
  paintCart,
  paintLowTable,
  paintMat,
  paintMotorbikes,
  paintPlantPot,
  paintRiders,
  paintRescueVehicles,
  paintSignBoard,
  paintPlasticChairs,
  paintUmbrellaTable,
  paintStove,
  paintStoveFireFrames,
  paintTrashBin,
} from './props';
import { paintCampusVariants, paintCarousel, paintFerrisWheel, paintMarketStalls, paintRail, paintStation, paintStringLights, paintHouses, paintPosRonda, paintPowerPole, paintShops, paintStreetLamp, paintTrees } from './structures';
import type { ArtJob } from './types';

/**
 * Daftar seluruh aset placeholder prosedural.
 * Di Stage 6, entri di sini bisa diganti dengan sprite PNG tanpa mengubah kode gameplay
 * selama kunci teksturnya sama.
 */
export const ART_JOBS: readonly ArtJob[] = [
  { label: 'Efek cahaya', build: paintEffects },
  { label: 'Gerobak angkringan', build: () => [paintCart('basic'), paintCart('standar')] },
  { label: 'Gerobak modern', build: () => [paintCart('modern'), paintCart('premium')] },
  { label: 'Tenda terpal', build: () => [paintCanopy('orange'), paintCanopy('lights')] },
  { label: 'Anglo & ceret', build: () => [paintStove(), ...paintStoveFireFrames()] },
  { label: 'Bangku & tikar', build: () => [...paintBenches('wood'), ...paintBenches('premium'), paintMat(), paintLowTable()] },
  { label: 'Perabot jalan', build: () => [paintTrashBin(), paintPlantPot(), paintSignBoard(), ...paintMotorbikes()] },
  { label: 'Penjual', build: paintSellerFrames },
  { label: 'Rumah warga', build: paintHouses },
  { label: 'Ruko', build: paintShops },
  { label: 'Pos ronda', build: () => [paintPosRonda()] },
  { label: 'Gedung kampus, RSJ & Mabes', build: paintCampusVariants },
  { label: 'Lapak pasar', build: paintMarketStalls },
  { label: 'Stasiun', build: () => [paintStation(), paintRail()] },
  { label: 'Wahana pasar malam', build: () => [paintFerrisWheel(), paintCarousel(), paintStringLights()] },
  { label: 'Tempat duduk tambahan', build: () => [paintPlasticChairs(), paintUmbrellaTable()] },
  { label: 'Lampu & tiang listrik', build: () => [paintStreetLamp(), paintPowerPole()] },
  { label: 'Pepohonan', build: paintTrees },
  { label: 'Pelanggan', build: paintCustomers },
  { label: 'Pengantar online', build: paintRiders },
  { label: 'Tantangan kampung', build: () => [...paintChallengeFolk(), ...paintCats(), ...paintRescueVehicles()] },
  { label: 'Ikon pesanan', build: paintBubblesAndEmotes },
];
