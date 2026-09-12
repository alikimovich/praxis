// Joined geometry from the supplied load.svg; each contour reveals as one piece.
const shapes = [
  'M422 91h32v32h-32Z',
  'M710 91h32v32h-32Z',
  'M454 123h32v32h-32Z',
  'M678 123h32v32h-32Z',
  'M486 155h32v32h-32Z',
  'M646 155h32v32h-32Z',
  'M646 187V219H518V187H646Z',
  'M422 251H390V123H422V251Z',
  'M774 251H742V123H774V251Z',
  'M390 347H358V251H390V347Z',
  'M806 347H774V251H806V347Z',
  'M518 379H486V315H518V379Z',
  'M678 379H646V315H678V379Z',
  'M614 379V411H550V379H614Z',
  'M358 443H326V347H358V379H390V411H358V443Z',
  'M838 443H806V411H774V379H806V347H838V443Z',
  'M390 507H358V443H454V475H390V507Z',
  'M326 507h32v32h-32Z',
  'M454 571H358V539H390V507H454V571Z',
  'M678 539V571H486V539H678Z',
  'M742 571H710V443H806V475H742V571Z'
] as const

export default function StartupCat(): React.JSX.Element {
  return (
    <svg width="640" height="640" viewBox="262 11 640 640" fill="none" aria-hidden="true">
      <defs>
        <filter
          id="startup-gooey-squares"
          x="-20%"
          y="-70%"
          width="140%"
          height="240%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.36" result="softened" />
          <feColorMatrix
            in="softened"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -24"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
      <g filter="url(#startup-gooey-squares)">
        {shapes.map((d) => (
          <path
            key={d}
            className="pixel"
            d={d}
            fill="#1A0DAB"
            style={{ opacity: 0, fill: 'color(display-p3 0.1020 0.0510 0.6706)' }}
          />
        ))}
      </g>
    </svg>
  )
}
