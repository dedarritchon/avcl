import type { CSSProperties } from 'react'
import { copy, type Locale } from '../lib/locale'
import type { Theme } from '../lib/theme'
import {
  SCROLL_BEATS,
  beatOpacity,
  type ScrollBeatId,
} from '../lib/scrollBeats'

type Props = {
  progress: number
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  /** False during automatic camera intro — hero appears when true */
  revealed?: boolean
  onEnterBirdsView?: () => void
  birdsViewAvailable?: boolean
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="finale-contacts__icon">
      <path
        fill="currentColor"
        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z"
      />
    </svg>
  )
}

function IconLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="finale-contacts__icon">
      <path
        fill="currentColor"
        d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM8.3 18.3H5.7V9.7h2.6v8.6ZM7 8.4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm11.3 9.9h-2.6v-4.2c0-1-.4-1.7-1.3-1.7-.7 0-1.1.5-1.3 1-.1.2-.1.5-.1.8v4.1h-2.6V9.7h2.5v1.2c.3-.6 1-1.4 2.4-1.4 1.8 0 3.1 1.2 3.1 3.7v5.1Z"
      />
    </svg>
  )
}

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="finale-contacts__icon">
      <path
        fill="currentColor"
        d="M12 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.3-1.4A9.9 9.9 0 1 0 12 2Zm0 18a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 12 20Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.1-.3.2-.6.1a6.6 6.6 0 0 1-2-1.2 7.3 7.3 0 0 1-1.3-1.7c-.1-.3 0-.4.1-.6l.4-.5c.1-.1.2-.3.3-.4.1-.1.1-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.5 2.3 1 2.3.7 2.7.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3Z"
      />
    </svg>
  )
}

function captionStyle(progress: number, id: ScrollBeatId): CSSProperties {
  const opacity = beatOpacity(progress, id)
  return {
    opacity,
    // Keep invisible captions out of the way for a11y / clicks
    visibility: opacity < 0.04 ? 'hidden' : 'visible',
  }
}

export function ScrollNarrative({
  progress,
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
  revealed = true,
  onEnterBirdsView,
  birdsViewAvailable = false,
}: Props) {
  const t = copy[locale]
  const finaleOpacity = beatOpacity(progress, 'finale')

  return (
    <main className={`narrative${revealed ? ' is-revealed' : ''}`}>
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

        {birdsViewAvailable && onEnterBirdsView ? (
          <button
            type="button"
            className="birds-toggle"
            onClick={onEnterBirdsView}
          >
            {t.birdsViewEnter}
          </button>
        ) : null}
      </div>

      {/* Scroll length only — camera + captions are driven by remapped progress */}
      <div className="scroll-track" aria-hidden>
        {SCROLL_BEATS.map((beat) => (
          <section
            key={beat.id}
            id={beat.id}
            className={`scroll-beat scroll-beat--${beat.id}`}
          />
        ))}
      </div>

      {/* Fixed captions — soft mist CSS sits with the copy */}
      <div className="captions">
        {t.sections.map((section) => {
          const id = section.id as ScrollBeatId
          return (
            <article
              key={section.id}
              className={`caption caption--${section.id}`}
              style={captionStyle(progress, id)}
              aria-hidden={beatOpacity(progress, id) < 0.08}
            >
              <span className="caption-mist" aria-hidden>
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
                <span className="caption-mist__puff" />
              </span>
              <p className="panel__kicker">{section.kicker}</p>
              {section.id === 'hero' ? (
                <h1 className="panel__title">{section.title}</h1>
              ) : (
                <h2 className="panel__title">{section.title}</h2>
              )}
              <p className="panel__body">{section.body}</p>
            </article>
          )
        })}

        <div
          className="caption caption--finale"
          style={captionStyle(progress, 'finale')}
          aria-hidden={finaleOpacity < 0.08}
        >
          <div
            className="finale-contacts"
            style={{ pointerEvents: finaleOpacity > 0.4 ? 'auto' : 'none' }}
          >
            <h2 id="finale-contact-title" className="finale-contacts__title">
              {t.contactTitle}
            </h2>
            <div className="finale-contacts__row">
              <a
                className="finale-contacts__btn"
                href="mailto:agustin.varela.cl@gmail.com"
                aria-label={t.contactEmail}
                title={t.contactEmail}
              >
                <IconMail />
              </a>
              <a
                className="finale-contacts__btn"
                href="https://www.linkedin.com/in/avcl/"
                target="_blank"
                rel="noreferrer"
                aria-label={t.contactLinkedIn}
                title={t.contactLinkedIn}
              >
                <IconLinkedIn />
              </a>
              <a
                className="finale-contacts__btn"
                href="https://wa.me/56958442626"
                aria-label={t.contactWhatsApp}
                title={t.contactWhatsApp}
              >
                <IconWhatsApp />
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
