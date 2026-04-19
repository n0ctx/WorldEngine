/* DESIGN.md §8.1 */
const svgNoise = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <filter id='parchment'>
    <feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/>
    <feColorMatrix type='matrix' values='0 0 0 0 0.55  0 0 0 0 0.44  0 0 0 0 0.29  0 0 0 0.055 0'/>
  </filter>
  <rect width='256' height='256' filter='url(%23parchment)'/>
</svg>`;

const svgFiber = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>
  <filter id='fiber'>
    <feTurbulence type='turbulence' baseFrequency='1.4 0.3' numOctaves='2' stitchTiles='stitch'/>
    <feColorMatrix type='matrix' values='0 0 0 0 0.42  0 0 0 0 0.34  0 0 0 0 0.22  0 0 0 0.035 0'/>
  </filter>
  <rect width='128' height='128' filter='url(%23fiber)'/>
</svg>`;

export default function ParchmentTexture({ opacity = 0.7, blendMode = 'multiply', zIndex = 20 }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex,
          opacity,
          mixBlendMode: blendMode,
          backgroundImage: `url("data:image/svg+xml,${svgNoise}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: zIndex + 1,
          opacity: 0.22,
          mixBlendMode: blendMode,
          backgroundImage: `url("data:image/svg+xml,${svgFiber}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />
    </>
  );
}
