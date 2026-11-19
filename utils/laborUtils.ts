import { LaborItem, LaborTemplate, VehicleSection } from '../types';

export const getLaborOriginalValue = (labor: LaborItem): number => {
  if (labor.originalTotal !== undefined && labor.originalTotal > 0) return labor.originalTotal;
  if (labor.pricingType === 'fixed' && labor.fixedValue !== undefined && labor.fixedValue > 0) {
    return labor.fixedValue;
  }
  const h = Number(labor.hours) || 0;
  const m = Number(labor.minutes) || 0;
  const vph = Number(labor.valuePerHour) || 0;
  const totalHours = h + (m / 60);
  const effectiveHours = totalHours > 0 ? totalHours : (vph > 0 ? 1 : 0);
  return Number((effectiveHours * vph).toFixed(2));
};

export const getLaborFinalValue = (labor: LaborItem): number => {
  const original = getLaborOriginalValue(labor);
  if (labor.finalTotal !== undefined && (labor.finalTotal > 0 || labor.discountPercentage === 100)) {
    return labor.finalTotal;
  }
  if (labor.discountValue && labor.discountValue > 0) {
    return Math.max(0, Number((original - labor.discountValue).toFixed(2)));
  }
  if (labor.discountPercentage && labor.discountPercentage > 0) {
    return Math.max(0, Number((original - (original * labor.discountPercentage / 100)).toFixed(2)));
  }
  return original;
};

export const getLaborDiscountAmount = (labor: LaborItem): number => {
  const original = getLaborOriginalValue(labor);
  const finalVal = getLaborFinalValue(labor);
  return Math.max(0, original - finalVal);
};

export const computeLaborGross = (params: {
  pricingType?: 'hourly' | 'fixed';
  hours?: number;
  defaultHours?: number;
  minutes?: number;
  valuePerHour?: number;
  defaultValuePerHour?: number;
  fixedValue?: number;
  originalTotal?: number;
}): number => {
  if (!params) return 0;

  const rawH = params.hours !== undefined ? Number(params.hours) : Number(params.defaultHours);
  const h = !isNaN(rawH) && rawH >= 0 ? rawH : 0;
  const m = Number(params.minutes) || 0;
  const rawVph = params.valuePerHour !== undefined ? Number(params.valuePerHour) : Number(params.defaultValuePerHour);
  const vph = !isNaN(rawVph) && rawVph >= 0 ? rawVph : 0;
  const fixed = Number(params.fixedValue) || 0;

  if (params.pricingType === 'fixed') {
    const resolvedFixed = fixed > 0 ? fixed : (Number(params.originalTotal) || vph || 0);
    return Number(resolvedFixed.toFixed(2));
  }

  // Caso tenha valor fixo preenchido mas horas e minutos zerados
  if (h === 0 && m === 0 && fixed > 0 && vph === 0) {
    return Number(fixed.toFixed(2));
  }

  const totalH = h + (m / 60);
  // Se horas e minutos forem 0 mas houver valor/hora configurado, assume 1h base para nunca zerar o valor configurado
  const effectiveHours = totalH > 0 ? totalH : (vph > 0 ? 1 : 0);
  return Number((effectiveHours * vph).toFixed(2));
};

export interface RelatedLaborCheckResult {
  relatedLabor: LaborItem;
  reason: string;
  suggestedDiscountPercentage: number;
  suggestedDiscountValue: number;
}

/**
 * Detects if a newly added labor candidate is related to any existing labor in the OS:
 * 1. Catalog template link (linkedTemplateId)
 * 2. Shared vehicle section / compartment
 * 3. Proximity of mechanical subsystem / keywords (e.g., freio, disco, cubo, roda, pastilha)
 * IMPORTANT: If candidate is charged by difficulty/fixed price (pricingType === 'fixed'),
 * auto-linking is disabled to honor workshop specific pricing without bundling.
 */
export const checkLaborRelation = (
  candidate: {
    description: string;
    section?: string;
    templateId?: string;
    pricingType?: 'hourly' | 'fixed';
    hours: number;
    minutes?: number;
    valuePerHour: number;
    fixedValue?: number;
  },
  existingList: LaborItem[],
  templates: LaborTemplate[]
): RelatedLaborCheckResult | null => {
  if (!existingList || existingList.length === 0) return null;
  // Serviços cobrados por dificuldade / preço fixo são 100% independentes e não devem ser vinculados automaticamente
  if (candidate.pricingType === 'fixed') return null;

  const candGross = computeLaborGross(candidate);

  // Vínculo explícito configurado no catálogo (linkedTemplateId)
  if (candidate.templateId) {
    const candidateTemplate = templates.find(t => t.id === candidate.templateId);
    if (candidateTemplate?.linkedTemplateId) {
      const targetLinkedTemplate = templates.find(t => t.id === candidateTemplate.linkedTemplateId);
      const matchedLabor = existingList.find(l => {
        if (!targetLinkedTemplate) return false;
        return l.description.toLowerCase() === targetLinkedTemplate.description.toLowerCase();
      });

      if (matchedLabor) {
        const discountPct = candidateTemplate.discountPercentage ?? 50;
        return {
          relatedLabor: matchedLabor,
          reason: `Vínculo pré-configurado no catálogo com "${matchedLabor.description}"`,
          suggestedDiscountPercentage: discountPct,
          suggestedDiscountValue: candidateTemplate.discountValue || (candGross * discountPct) / 100
        };
      }
    }
  }

  return null;
};

/**
 * Localiza de forma infalível o Modelo de Mão de Obra vinculado a uma peça:
 * 1. Pelo vínculo direto no item: item.laborTemplateId
 * 2. Pelo array linkedItemIds do modelo (compatível com IDs numéricos, strings e JSON parseado)
 * 3. Pelo Part Number da peça registrado nas amarras do modelo
 */
export const findLaborTemplateForPart = (
  item: { id?: string; partNumber?: string; name?: string; laborTemplateId?: string } | null | undefined,
  templates: LaborTemplate[]
): LaborTemplate | null => {
  if (!item || !templates || templates.length === 0) return null;

  const itemIdStr = String(item.id || '').trim();
  const partNumberStr = String(item.partNumber || '').trim().toLowerCase();
  const laborTempId = String(item.laborTemplateId || '').trim();

  for (const t of templates) {
    // 1. Vínculo direto no item (laborTemplateId)
    if (laborTempId && (String(t.id).trim() === laborTempId)) {
      return t;
    }

    // 2. Normalizar linkedItemIds (compatível com array de strings, números ou string JSON serializada)
    let ids: string[] = [];
    if (Array.isArray(t.linkedItemIds)) {
      ids = t.linkedItemIds.map(v => String(v).trim());
    } else if (typeof t.linkedItemIds === 'string' && (t.linkedItemIds as string).trim().length > 0) {
      try {
        const parsed = JSON.parse(t.linkedItemIds);
        if (Array.isArray(parsed)) {
          ids = parsed.map(v => String(v).trim());
        } else {
          ids = [String(t.linkedItemIds).trim()];
        }
      } catch {
        ids = [String(t.linkedItemIds).trim()];
      }
    }

    // Comparação por ID do item
    if (itemIdStr && ids.some(id => id.toLowerCase() === itemIdStr.toLowerCase())) {
      return t;
    }

    // Comparação por Part Number do item
    if (partNumberStr && ids.some(id => id.toLowerCase() === partNumberStr)) {
      return t;
    }
  }

  return null;
};
