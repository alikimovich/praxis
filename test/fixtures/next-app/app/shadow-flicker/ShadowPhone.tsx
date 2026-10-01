'use client'

const SHADOW_x = 0.72
const SHADOW_y = -0.28
const SHADOW_distance = 12
const SHADOW_blur = 24
const SHADOW_layers = 3
const SHADOW_decay = 0.6
const SHADOW_color = 'rgba(0, 0, 0, 0.35)'
const SHADOW_CSS =
  '-8.64px 3.36px 24px rgba(0, 0, 0, 0.35), -5.184px 2.016px 14.4px rgba(0, 0, 0, 0.21), -3.1104px 1.2096px 8.64px rgba(0, 0, 0, 0.126)'

export default function ShadowPhone() {
  return (
    <div
      id="shadow-phone"
      style={{
        margin: '80px auto',
        padding: 40,
        width: 180,
        background: 'white',
        borderRadius: 20,
        boxShadow: SHADOW_CSS
      }}
    >
      Shadow phone
    </div>
  )
}
