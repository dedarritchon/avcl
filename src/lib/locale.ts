export type Locale = 'es' | 'en'

export const LOCALE_STORAGE_KEY = 'varela-locale'
export const DEFAULT_LOCALE: Locale = 'es'

type Section = {
  id: 'hero' | 'grey' | 'massif' | 'walk' | 'contact'
  kicker: string
  title: string
  body: string
}

type Copy = {
  sections: readonly Section[]
  cta: string
  contactTitle: string
  contactEmail: string
  contactLinkedIn: string
  contactWhatsApp: string
  loader: string
  langToggle: string
  langEs: string
  langEn: string
  themeToggle: string
  themeLight: string
  themeDark: string
}

export const copy: Record<Locale, Copy> = {
  es: {
    sections: [
      {
        id: 'hero',
        kicker: 'Circuito W · Torres del Paine',
        title: 'Agustín Varela',
        body: 'Guía de exploración en Patagonia. El viaje empieza al oeste del macizo — hacia el Grey — con experiencias seguras, conscientes y con sentido.',
      },
      {
        id: 'grey',
        kicker: 'Glaciar Grey',
        title: 'El hielo que abre la ruta',
        body: 'Primera gran vista del Circuito W: el Grey delante, el viento en la cara. Aquí se sienta el ritmo de la exploración y el cuidado del lugar.',
      },
      {
        id: 'massif',
        kicker: 'Valle del Francés',
        title: 'Al corazón del macizo',
        body: 'El centro de la W. Las paredes se cierran, los Cuernos se alzan adelante, y el valle pide paciencia más que prisa. Agustín reparte contexto: geología, historia y cultura del paisaje.',
      },
      {
        id: 'walk',
        kicker: 'Flanco oriental',
        title: 'Hacia el este, y más allá',
        body: 'Salida del Francés y el camino largo que esconde las torres hasta el último giro. Sostenibilidad y conservación van con cada paso.',
      },
      {
        id: 'contact',
        kicker: 'Mirador Base Torres',
        title: 'Tres torres. Una llegada.',
        body: 'El último giro hacia Ascencio: la laguna adelante, luego los tres monolitos de granito. Cuéntale las fechas — arma la ruta pensando en este final.',
      },
    ],
    cta: 'Escribir a Agustín',
    contactTitle: 'Contacto',
    contactEmail: 'Correo',
    contactLinkedIn: 'LinkedIn',
    contactWhatsApp: 'WhatsApp',
    loader: 'Preparando la ruta…',
    langToggle: 'Idioma',
    langEs: 'ES',
    langEn: 'EN',
    themeToggle: 'Tema',
    themeLight: 'Día',
    themeDark: 'Noche',
  },
  en: {
    sections: [
      {
        id: 'hero',
        kicker: 'W Circuit · Torres del Paine',
        title: 'Agustín Varela',
        body: 'Exploration guide in Patagonia. The journey begins west of the massif — toward Grey — through safe, thoughtful, and meaningful experiences.',
      },
      {
        id: 'grey',
        kicker: 'Grey Glacier',
        title: 'The ice that opens the route',
        body: 'First great view of the W Circuit: Grey ahead, wind in your face. Here the pace of exploration — and care for the place — takes hold.',
      },
      {
        id: 'massif',
        kicker: 'French Valley',
        title: 'Deep into the massif',
        body: 'The heart of the W. Walls close in, the Cuernos rise ahead, and the valley asks for patience more than speed. Agustín shares geology, history, and the culture of this landscape.',
      },
      {
        id: 'walk',
        kicker: 'Eastern flank',
        title: 'East, then further',
        body: 'Out of Francés and along the long way that keeps the towers hidden until the last turn. Sustainability and conservation walk with every step.',
      },
      {
        id: 'contact',
        kicker: 'Base Torres Lookout',
        title: 'Three towers. One arrival.',
        body: 'The last turn into Ascencio: lagoon ahead, then the three granite towers rising straight up. Tell him the dates — he builds the route around this finish.',
      },
    ],
    cta: 'Write to Agustín',
    contactTitle: 'Contact',
    contactEmail: 'Email',
    contactLinkedIn: 'LinkedIn',
    contactWhatsApp: 'WhatsApp',
    loader: 'Preparing the route…',
    langToggle: 'Language',
    langEs: 'ES',
    langEn: 'EN',
    themeToggle: 'Theme',
    themeLight: 'Day',
    themeDark: 'Night',
  },
}

export function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (raw === 'es' || raw === 'en') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE
}
