# Agustín Varela — Torres del Paine

Scroll-driven React + Three.js landing page for expedition guide **Agustín Varela**.

## Setup

```bash
npm install
npm run dev
```

The terrain GLB is already in `public/torres.glb` (converted from the USDZ).

To regenerate the model from the extracted USDA:

```bash
npm run convert:model
```

## Notes

- Camera path is scrubbed by page scroll (`src/lib/cameraPath.ts`).
- Model credit: David Stuardo / Sketchfab, CC BY-NC-SA 4.0.
# avcl
