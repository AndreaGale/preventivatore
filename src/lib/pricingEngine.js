// Tabella markup scalabile per quantità
const MARKUP_TABLE = [
  { qty: 1, markup: 2.4 },
  { qty: 10, markup: 2.3 },
  { qty: 50, markup: 2.15 },
  { qty: 100, markup: 2.0 },
  { qty: 200, markup: 1.8 },
  { qty: 500, markup: 1.5 },
  { qty: 1000, markup: 1.25 },
  { qty: 3000, markup: 1.2 },
  { qty: 5000, markup: 1.18 },
  { qty: 10000, markup: 1.15 },
  { qty: 20000, markup: 1.1 },
  { qty: 50000, markup: 1.0 },
];

export function getMarkup(quantity) {
  // Interpolazione lineare tra i livelli
  if (quantity <= MARKUP_TABLE[0].qty) return MARKUP_TABLE[0].markup;
  if (quantity >= MARKUP_TABLE[MARKUP_TABLE.length - 1].qty) return MARKUP_TABLE[MARKUP_TABLE.length - 1].markup;
  
  for (let i = 0; i < MARKUP_TABLE.length - 1; i++) {
    if (quantity >= MARKUP_TABLE[i].qty && quantity <= MARKUP_TABLE[i + 1].qty) {
      const ratio = (quantity - MARKUP_TABLE[i].qty) / (MARKUP_TABLE[i + 1].qty - MARKUP_TABLE[i].qty);
      return MARKUP_TABLE[i].markup - ratio * (MARKUP_TABLE[i].markup - MARKUP_TABLE[i + 1].markup);
    }
  }
  return MARKUP_TABLE[0].markup;
}

export function getMarkupTable() {
  return MARKUP_TABLE;
}

export function computeDefaultConfig() {
  return {
    monthly_fixed_costs: 1500,
    working_days_per_month: 25,
    hours_per_day: 8,
    num_printers: 20,
    farm_efficiency: 0.8,
    printer_cost: 1500,
    printer_lifespan_years: 4,
    maintenance_cost_per_hour: 0.1,
    power_consumption_kw: 0.2,
    energy_cost_per_kwh: 0.3,
    monthly_gross_salary: 5600,
    monthly_work_hours: 160,
    fail_rate: 0.07,
  };
}

export function computeDerivedCosts(config) {
  const totalMonthlyHours = config.working_days_per_month * config.hours_per_day * config.num_printers * config.farm_efficiency;
  const fixedCostPerHour = config.monthly_fixed_costs / totalMonthlyHours;
  
  const depreciationPerHour = config.printer_cost / (config.printer_lifespan_years * 12 * config.working_days_per_month * config.hours_per_day);
  const energyCostPerHour = config.power_consumption_kw * config.energy_cost_per_kwh;
  
  const totalMachineCostPerHour = fixedCostPerHour + depreciationPerHour + config.maintenance_cost_per_hour + energyCostPerHour;
  const machineCostPerMinute = totalMachineCostPerHour / 60;
  
  const laborCostPerHour = config.monthly_gross_salary / config.monthly_work_hours;
  const laborCostPerMinute = laborCostPerHour / 60;
  
  return {
    fixedCostPerHour,
    depreciationPerHour,
    energyCostPerHour,
    totalMachineCostPerHour,
    machineCostPerMinute,
    laborCostPerHour,
    laborCostPerMinute,
  };
}

/**
 * Calcola i grammi totali usati per ogni codice materiale su tutte le righe del preventivo.
 * @param {Array} lines - righe del preventivo
 * @returns {Object} { [material_code]: totalGrams }
 */
export function computeMaterialTotals(lines) {
  const totals = {};
  for (const line of lines) {
    if (!line.part_name) continue;
    const qty = line.quantity || 1;
    if (line.sub_materials && line.sub_materials.length > 0) {
      for (const sm of line.sub_materials) {
        if (!sm.material_code) continue;
        totals[sm.material_code] = (totals[sm.material_code] || 0) + (sm.weight_g || 0) * qty;
      }
    } else if (line.material_code) {
      totals[line.material_code] = (totals[line.material_code] || 0) + (line.weight_g || 0) * qty;
    }
  }
  return totals;
}

/**
 * Restituisce il prezzo al grammo corretto per un materiale,
 * scegliendo lo scaglione in base al totale grammi usati nel preventivo.
 * Se il materiale non ha price_tiers, usa price_per_gram di default.
 * @param {Object} material
 * @param {number} totalGramsInQuote - grammi totali di questo materiale nel preventivo
 */
export function getPricePerGram(material, totalGramsInQuote = 0) {
  if (!material) return 0;
  const tiers = material.price_tiers;
  if (!tiers || tiers.length === 0) return material.price_per_gram || 0;

  const spoolWeight = material.spool_weight || 1000;
  const totalSpools = totalGramsInQuote / spoolWeight;

  // Ordina scaglioni per min_spools crescente
  const sorted = [...tiers].sort((a, b) => (a.min_spools || 0) - (b.min_spools || 0));

  // Prendi l'ultimo scaglione applicabile (il più alto con min_spools <= totalSpools)
  let best = sorted[0];
  for (const tier of sorted) {
    if (totalSpools >= (tier.min_spools || 0)) {
      best = tier;
    }
  }
  return best.price_per_gram || material.price_per_gram || 0;
}

export function calculateLinePrice(line, material, config, allMaterials, materialTotals = {}) {
  const derived = computeDerivedCosts(config);

  // Calcolo costo materiale: supporta multi-materiale (sub_materials) o singolo materiale
  let materialCost = 0;
  let totalWeight = 0;
  if (line.sub_materials && line.sub_materials.length > 0) {
    for (const sm of line.sub_materials) {
      const mat = allMaterials?.find(m => m.code === sm.material_code);
      const w = sm.weight_g * 1.05;
      const ppg = getPricePerGram(mat, materialTotals[sm.material_code] || 0);
      materialCost += w * ppg;
      totalWeight += sm.weight_g;
    }
  } else {
    totalWeight = line.weight_g;
    const weightWithWaste = totalWeight * 1.05;
    const ppg = getPricePerGram(material, materialTotals[line.material_code] || 0);
    materialCost = weightWithWaste * ppg;
  }

  const machineCost = line.print_time_min * derived.machineCostPerMinute;
  const laborCost = line.labor_time_min * derived.laborCostPerMinute;
  
  const productionCost = materialCost + machineCost + laborCost;
  const costWithFailRate = productionCost * (1 + config.fail_rate);
  
  const markup = getMarkup(line.quantity);
  const netPrice = costWithFailRate * markup * line.quantity;
  const pricePerUnit = netPrice / line.quantity;
  
  const discountFactor = line.partner_discount ? 0.85 : 1;
  const basePrice = line.manual_price || netPrice;
  const finalPrice = basePrice * discountFactor;

  return {
    weightWithWaste: totalWeight * 1.05,
    materialCostPerGram: material?.price_per_gram || 0,
    materialCost,
    machineCost,
    laborCost,
    productionCost,
    costWithFailRate,
    markup,
    netPrice,
    pricePerUnit,
    useManualPrice: !!line.manual_price,
    finalPrice,
    finalPricePerUnit: finalPrice / (line.quantity || 1),
  };
}