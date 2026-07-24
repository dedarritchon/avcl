import { useMemo } from 'react'
import { copy, type Locale } from '../lib/locale'
import type { Theme } from '../lib/theme'
import { prefersTouchSteer } from '../lib/birdsViewTilt'

type Props = {
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onExit: () => void
}

export function BirdsViewHud({
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
  onExit,
}: Props) {
  const t = copy[locale]
  const touch = useMemo(() => prefersTouchSteer(), [])

  return (
    <div className="birds-hud">
      <div className="site-controls">
        <div className="lang-toggle" role="group" aria-label={t.langToggle}>
          <button
            type="button"
            className={`lang-toggle__btn${locale === 'es' ? ' is-active' : ''}`}
            aria-pressed={locale === 'es'}
            onClick={() => onLocaleChange('es')}
          >
            {t.langEs}
          </button>
          <span className="lang-toggle__sep" aria-hidden>
            /
          </span>
          <button
            type="button"
            className={`lang-toggle__btn${locale === 'en' ? ' is-active' : ''}`}
            aria-pressed={locale === 'en'}
            onClick={() => onLocaleChange('en')}
          >
            {t.langEn}
          </button>
        </div>

        <div className="lang-toggle" role="group" aria-label={t.themeToggle}>
          <button
            type="button"
            className={`lang-toggle__btn${theme === 'light' ? ' is-active' : ''}`}
            aria-pressed={theme === 'light'}
            onClick={() => onThemeChange('light')}
          >
            {t.themeLight}
          </button>
          <span className="lang-toggle__sep" aria-hidden>
            /
          </span>
          <button
            type="button"
            className={`lang-toggle__btn${theme === 'dark' ? ' is-active' : ''}`}
            aria-pressed={theme === 'dark'}
            onClick={() => onThemeChange('dark')}
          >
            {t.themeDark}
          </button>
        </div>

        <button
          type="button"
          className="birds-toggle is-active"
          onClick={onExit}
        >
          {t.birdsViewExit}
        </button>
      </div>

      <p className="birds-hud__hint">
        {touch ? t.birdsViewHintMobile : t.birdsViewHint}
      </p>
    </div>
  )
}
