/**
 * Modul Keselamatan & Pematuhan AI (AI Safety & Compliance Layer)
 * Memastikan AI tidak membuat dakwaan perubatan berlebihan atau janji palsu.
 */

const FORBIDDEN_CLAIMS = [
  { regex: /dijamin sembuh|pasti sembuh|100% sembuh/gi, replacement: 'membantu melegakan dan menyokong keselesaan' },
  { regex: /ubat ajaib|ubat mujarab/gi, replacement: 'formulasi herba semulajadi' },
  { regex: /merawat kanser|merawat jantung|merawat strok/gi, replacement: 'menyokong kesihatan umum tubuh badan' },
  { regex: /sembuhkan penyakit kronik/gi, replacement: 'membantu melegakan ketidakselesaan' },
  { regex: /tak payah jumpa doktor|buang ubat hospital/gi, replacement: 'terus amalkan rawatan doktor di samping ikhtiar makanan tambahan' }
];

export function sanitizeAiResponse(responseText) {
  let cleaned = responseText;

  for (const item of FORBIDDEN_CLAIMS) {
    cleaned = cleaned.replace(item.regex, item.replacement);
  }

  return cleaned;
}

export function requiresMedicalDisclaimer(customerText) {
  const severeKeywords = ['kanser', 'strok', 'buah pinggang', 'jantung', 'dialisis', 'pembedahan'];
  const lower = customerText.toLowerCase();
  return severeKeywords.some(kw => lower.includes(kw));
}

export const MEDICAL_DISCLAIMER = "\n\n_Peringatan Mesra: Produk kami adalah formulasi herba semulajadi untuk menyokong keselesaan tubuh badan dan bukan pengganti rawatan atau ubat doktor pakar._";
