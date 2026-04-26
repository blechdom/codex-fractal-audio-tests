export interface MandelbrotLocationPreset {
  id: string;
  name: string;
  centerX: number;
  centerY: number;
  zoom: number;
  maxIter: number;
}

export const MANDELBROT_LOCATION_PRESETS: MandelbrotLocationPreset[] = [
  {
    id: "main-cardioid",
    name: "Main Cardioid",
    centerX: -0.5,
    centerY: 0.0,
    zoom: 0.0,
    maxIter: 120,
  },
  {
    id: "seahorse-valley",
    name: "Seahorse Valley",
    centerX: -0.74364388703,
    centerY: 0.13182590421,
    zoom: 0.62,
    maxIter: 220,
  },
  {
    id: "elephant-valley",
    name: "Elephant Valley",
    centerX: 0.285,
    centerY: 0.01,
    zoom: 0.36,
    maxIter: 180,
  },
  {
    id: "triple-spiral",
    name: "Triple Spiral Valley",
    centerX: -0.088,
    centerY: 0.654,
    zoom: 0.46,
    maxIter: 220,
  },
  {
    id: "airplane",
    name: "Airplane",
    centerX: -1.75,
    centerY: 0.02,
    zoom: 0.2,
    maxIter: 160,
  },
  {
    id: "antenna",
    name: "Antenna",
    centerX: -1.25,
    centerY: 0.0,
    zoom: 0.4,
    maxIter: 200,
  },
  {
    id: "mini-brot",
    name: "Mini-Brot",
    centerX: -1.25066,
    centerY: 0.02012,
    zoom: 0.72,
    maxIter: 280,
  },
  {
    id: "dendrite-needle",
    name: "Dendrite Needle",
    centerX: -0.1011,
    centerY: 0.9563,
    zoom: 0.68,
    maxIter: 260,
  },
];
