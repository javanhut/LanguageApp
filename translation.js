const translate = require('translate');

// Configure the translate library to use the offline google translate engine
translate.engine = 'google';
translate.key = process.env.GOOGLE_KEY || null;

// Offline translation cache
const translationCache = new Map();

// Language codes mapping
const languageMap = {
  'english': 'en',
  'spanish': 'es',
  'portuguese': 'pt',
  'french': 'fr',
  'german': 'de',
  'italian': 'it',
  'russian': 'ru',
  'chinese': 'zh',
  'japanese': 'ja',
  'korean': 'ko',
  'arabic': 'ar',
  'hindi': 'hi'
};

// Simple offline translation fallback using basic patterns
const offlineTranslations = {
  'en-es': {
    'hello': 'hola',
    'goodbye': 'adiós',
    'thank you': 'gracias',
    'yes': 'sí',
    'no': 'no',
    'please': 'por favor',
    'sorry': 'lo siento',
    'excuse me': 'disculpe',
    'good morning': 'buenos días',
    'good night': 'buenas noches',
    'how are you': 'cómo estás',
    'what is your name': 'cómo te llamas',
    'my name is': 'me llamo',
    'nice to meet you': 'mucho gusto',
    'i love you': 'te amo',
    'where is': 'dónde está',
    'how much': 'cuánto cuesta',
    'water': 'agua',
    'food': 'comida',
    'help': 'ayuda'
  },
  'en-pt': {
    'hello': 'olá',
    'goodbye': 'adeus',
    'thank you': 'obrigado',
    'yes': 'sim',
    'no': 'não',
    'please': 'por favor',
    'sorry': 'desculpe',
    'excuse me': 'com licença',
    'good morning': 'bom dia',
    'good night': 'boa noite',
    'how are you': 'como está',
    'what is your name': 'qual é o seu nome',
    'my name is': 'meu nome é',
    'nice to meet you': 'prazer em conhecê-lo',
    'i love you': 'eu te amo',
    'where is': 'onde está',
    'how much': 'quanto custa',
    'water': 'água',
    'food': 'comida',
    'help': 'ajuda'
  }
};

// Reverse translations for bidirectional support
function buildReverseTranslations() {
  const reverse = {};
  for (const [langPair, translations] of Object.entries(offlineTranslations)) {
    const [from, to] = langPair.split('-');
    const reversePair = `${to}-${from}`;
    if (!reverse[reversePair]) {
      reverse[reversePair] = {};
    }
    for (const [original, translated] of Object.entries(translations)) {
      reverse[reversePair][translated] = original;
    }
  }
  return reverse;
}

const reverseTranslations = buildReverseTranslations();
const allTranslations = { ...offlineTranslations, ...reverseTranslations };

async function translateText(text, fromLang, toLang) {
  if (!text || !fromLang || !toLang) {
    return text;
  }

  // Normalize language codes
  const from = languageMap[fromLang.toLowerCase()] || fromLang.toLowerCase();
  const to = languageMap[toLang.toLowerCase()] || toLang.toLowerCase();
  
  // Check cache first
  const cacheKey = `${text}|${from}|${to}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // Check offline translations
  const langPair = `${from}-${to}`;
  const normalizedText = text.toLowerCase().trim();
  
  if (allTranslations[langPair] && allTranslations[langPair][normalizedText]) {
    const result = allTranslations[langPair][normalizedText];
    translationCache.set(cacheKey, result);
    return result;
  }

  // Try online translation as fallback (will work if internet is available)
  try {
    const result = await translate(text, { from, to });
    translationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    // If online translation fails, return original text with a marker
    console.log('Translation failed, returning original text');
    return text;
  }
}

// Text-to-speech function using browser's speech synthesis
function generateSpeech(text, lang) {
  // This will be handled client-side
  return {
    text,
    lang: languageMap[lang.toLowerCase()] || lang.toLowerCase()
  };
}

module.exports = {
  translateText,
  generateSpeech,
  languageMap
};