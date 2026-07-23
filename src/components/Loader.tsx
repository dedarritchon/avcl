import { useProgress } from '@react-three/drei'
import { copy, type Locale } from '../lib/locale'

export function Loader({ visible, locale }: { visible: boolean; locale: Locale }) {
  const { progress } = useProgress()
  const value = visible ? Math.min(100, Math.max(0, progress)) : 100

  return (
    <div
      className={`loader${visible ? '' : ' loader--done'}`}
      role="status"
      aria-live="polite"
      aria-busy={visible}
      aria-hidden={!visible}
    >
      <div className="loader__mark">AVCL</div>
      <p className="loader__label">{copy[locale].loader}</p>
      <div
        className="loader__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-label={copy[locale].loader}
      >
        <div className="loader__bar-fill" style={{ transform: `scaleX(${value / 100})` }} />
      </div>
      <p className="loader__pct">{Math.round(value)}%</p>
    </div>
  )
}
