interface LogoProps {
  size?: number
}

function Logo({ size = 32 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19" stroke="#E8A33D" strokeWidth="2" />
      <circle cx="20" cy="20" r="13" stroke="#E8A33D" strokeWidth="1.2" opacity="0.5" />
      <circle cx="20" cy="20" r="7" fill="#0F3D3E" />
      <circle cx="20" cy="20" r="7" stroke="#E8A33D" strokeWidth="1.5" />
      <circle cx="17.5" cy="17.5" r="2" fill="#E8A33D" />
      <path
        d="M6 20c2-5 8-9 14-9s12 4 14 9c-2 5-8 9-14 9s-12-4-14-9z"
        stroke="#0F3D3E"
        strokeWidth="1"
        opacity="0.25"
        fill="none"
      />
    </svg>
  )
}

export default Logo