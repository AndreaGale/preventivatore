/**
 * Genera e scarica un file Excel template per l'importazione materiali
 * con scaglioni di prezzo multipli.
 *
 * Struttura: una riga per scaglione.
 * Il sistema raggruppa per codice e usa il prezzo corrispondente
 * alla quantità totale di bobine acquistate.
 */
export function downloadMaterialTemplate() {
  // CSV con separatore punto e virgola (compatibile Excel IT)
  const headers = [
    'code',
    'material_name',
    'brand',
    'color',
    'spool_weight_g',
    'min_spools',
    'price_per_spool_eur',
    'price_per_gram_eur',
  ];

  const examples = [
    // ASA EXTRUDR Bianco — 2 scaglioni
    ['ASA-EXT-WH', 'ASA', 'EXTRUDR', 'Bianco', 750, 1,  21.65, 0.0289],
    ['ASA-EXT-WH', 'ASA', 'EXTRUDR', 'Bianco', 750, 5,  17.32, 0.0231],
    // PLA BAMBU Black — 2 scaglioni
    ['PLA-BAM-BK', 'PLA', 'Bambu Lab', 'Nero',  1000, 1, 24.90, 0.0249],
    ['PLA-BAM-BK', 'PLA', 'Bambu Lab', 'Nero',  1000, 10, 19.90, 0.0199],
    // PETG generico — 1 scaglione
    ['PETG-GEN-TR', 'PETG', 'Generic', 'Trasparente', 1000, 1, 18.00, 0.0180],
  ];

  const rows = [headers, ...examples];
  const csv = rows.map(r => r.join(';')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_materiali_scaglioni.csv';
  a.click();
  URL.revokeObjectURL(url);
}