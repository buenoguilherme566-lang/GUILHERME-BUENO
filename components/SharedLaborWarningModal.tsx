import React, { useState, useEffect } from 'react';
import { AlertTriangle, Wrench, Check, X, ShieldAlert, Sparkles, Percent, DollarSign } from 'lucide-react';
import { LaborItem } from '../types';

export interface SharedLaborWarningData {
  isOpen: boolean;
  targetOSId?: string; // Se for em uma OS aberta ou em criação
  newLaborCandidate: {
    description: string;
    pricingType?: 'hourly' | 'fixed';
    hours: number;
    minutes?: number;
    valuePerHour: number;
    fixedValue?: number;
    section?: string;
    sourceTemplateId?: string;
  };
  relatedLaborInOS: LaborItem;
  availableLaborsInOS?: LaborItem[];
  reason: string; // Ex: "Mesma repartição/região mecânica (Freio / Rodas)"
  discountType: 'percentage' | 'fixed';
  discountPercentage: number;
  discountValue: number;
  sharedReason: string;
  pendingPartToLink?: any; // Peça que originou este vínculo automático na OS
}

interface Props {
  data: SharedLaborWarningData | null;
  onConfirmWithDiscount: (result: {
    discountPercentage: number;
    discountValue: number;
    finalTotal: number;
    sharedReason: string;
    linkedToId: string;
  }) => void;
  onConfirmWithoutDiscount: () => void;
  onLinkPartOnly?: () => void;
  onCancel: () => void;
}

export const SharedLaborWarningModal: React.FC<Props> = ({
  data,
  onConfirmWithDiscount,
  onConfirmWithoutDiscount,
  onLinkPartOnly,
  onCancel
}) => {
  const getCandidateGross = (d: SharedLaborWarningData | null) => {
    if (!d) return 0;
    if (d.newLaborCandidate.pricingType === 'fixed') {
      return Number(d.newLaborCandidate.fixedValue) || 0;
    }
    const h = Number(d.newLaborCandidate.hours) || 0;
    const m = Number(d.newLaborCandidate.minutes) || 0;
    const vph = Number(d.newLaborCandidate.valuePerHour) || 0;
    return Number(((h + (m / 60)) * vph).toFixed(2));
  };

  const grossTotal = getCandidateGross(data);

  const [selectedRelatedLaborId, setSelectedRelatedLaborId] = useState<string>(data?.relatedLaborInOS?.id || '');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(data?.discountType || 'percentage');
  const [discountPct, setDiscountPct] = useState<number>(data?.discountPercentage ?? 50);
  const [discountFixedVal, setDiscountFixedVal] = useState<number>(
    data && data.discountValue > 0 ? data.discountValue : (grossTotal * (data?.discountPercentage ?? 50)) / 100
  );
  const [justification, setJustification] = useState<string>(
    data?.sharedReason ||
    (data?.relatedLaborInOS
      ? `Metade do serviço (desmontagem e acesso à região) já foi executado na M.O. "${data.relatedLaborInOS.description}"`
      : '')
  );

  useEffect(() => {
    if (data && data.isOpen) {
      setSelectedRelatedLaborId(data.relatedLaborInOS.id);
      setDiscountType(data.discountType || 'percentage');
      setDiscountPct(data.discountPercentage ?? 50);
      const gross = getCandidateGross(data);
      setDiscountFixedVal(
        data.discountValue > 0 ? data.discountValue : (gross * (data.discountPercentage ?? 50)) / 100
      );
      setJustification(
        data.sharedReason ||
        `Metade do serviço (desmontagem e acesso à região) já foi executado na M.O. "${data.relatedLaborInOS.description}"`
      );
    }
  }, [data]);

  if (!data || !data.isOpen) return null;

  const availableLabors = data.availableLaborsInOS && data.availableLaborsInOS.length > 0
    ? data.availableLaborsInOS
    : [data.relatedLaborInOS];

  const selectedRelatedLabor = availableLabors.find(l => l.id === selectedRelatedLaborId) || data.relatedLaborInOS;

  // Recalculate discount amounts
  let calculatedDiscountValue = 0;
  let calculatedDiscountPct = 0;

  if (discountType === 'percentage') {
    calculatedDiscountPct = Math.min(100, Math.max(0, discountPct));
    calculatedDiscountValue = (grossTotal * calculatedDiscountPct) / 100;
  } else {
    calculatedDiscountValue = Math.min(grossTotal, Math.max(0, discountFixedVal));
    calculatedDiscountPct = grossTotal > 0 ? Math.round((calculatedDiscountValue / grossTotal) * 100) : 0;
  }

  const finalBilledTotal = Math.max(0, grossTotal - calculatedDiscountValue);

  const handleApplyDiscount = () => {
    onConfirmWithDiscount({
      discountPercentage: calculatedDiscountPct,
      discountValue: calculatedDiscountValue,
      finalTotal: finalBilledTotal,
      sharedReason: justification.trim() || `M.O. Compartilhada com "${selectedRelatedLabor.description}"`,
      linkedToId: selectedRelatedLabor.id
    });
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[500] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border-2 border-amber-500/50 rounded-3xl sm:rounded-[2.5rem] w-full max-w-2xl shadow-[0_20px_70px_rgba(245,158,11,0.25)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header Warning Banner */}
        <div className="p-6 bg-gradient-to-r from-amber-500/25 via-amber-500/10 to-zinc-900 border-b border-amber-500/30 flex items-start gap-4">
          <div className="p-3.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/40 shrink-0">
            <AlertTriangle size={28} className="animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/30 text-amber-300 text-[9px] font-black uppercase tracking-wider border border-amber-500/40">
                Configuração de M.O. Compartilhada
              </span>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                {data.reason}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight italic mt-1.5">
              Escolha a Mão de Obra da O.S. para Compartilhar!
            </h3>
            <p className="text-zinc-300 text-xs mt-1 leading-relaxed">
              Selecione abaixo com qual mão de obra já existente nesta O.S. (<strong className="text-amber-400 font-black">"{selectedRelatedLabor.description}"</strong>) você deseja vincular o compartilhamento e defina o desconto.
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* Peça Lançada na OS (se originado por lançamento de peça) */}
          {data.pendingPartToLink && (
            <div className="p-4 bg-zinc-950 border border-green-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-500/20 text-green-400 rounded-xl">
                  <Wrench size={18} />
                </div>
                <div>
                  <span className="text-[8px] font-black uppercase text-green-400 tracking-wider block">
                    Peça Lançada na O.S. (Vínculo Automático de M.O.)
                  </span>
                  <h4 className="text-white font-black text-xs uppercase italic mt-0.5">
                    {data.pendingPartToLink.name}
                  </h4>
                  <p className="text-[9px] text-zinc-400 font-mono">
                    Part Number: <span className="text-zinc-200 font-bold">{data.pendingPartToLink.partNumber}</span> • Qtd: {data.pendingPartToLink.quantity} • R$ {(data.pendingPartToLink.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-[8px] font-black uppercase tracking-wider shrink-0">
                Peça & Mão de Obra
              </span>
            </div>
          )}

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1st Labor (Selectable from OS) */}
            <div className="p-4 bg-zinc-950 border border-amber-500/40 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black uppercase text-amber-400 tracking-wider">
                  1ª Mão de Obra (Escolha qual M.O. da O.S. compartilhar)
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[8px] font-black uppercase">
                  Serviço Base
                </span>
              </div>
              <select
                value={selectedRelatedLabor.id}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedRelatedLaborId(nextId);
                  const found = availableLabors.find(l => l.id === nextId);
                  if (found) {
                    setJustification(
                      `Metade do serviço (desmontagem e acesso à região) já foi executado na M.O. "${found.description}"`
                    );
                  }
                }}
                className="w-full bg-black border border-amber-500/50 focus:border-amber-400 p-2.5 rounded-xl text-white font-black text-xs uppercase outline-none cursor-pointer"
              >
                {availableLabors.map(l => {
                  const lGross = l.pricingType === 'fixed'
                    ? (l.fixedValue || l.originalTotal || 0)
                    : (((l.hours || 0) + ((l.minutes || 0) / 60)) * (l.valuePerHour || 0));
                  return (
                    <option key={l.id} value={l.id}>
                      🛠️ {l.description.toUpperCase()} — R$ {lGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-zinc-400 uppercase font-bold">
                {selectedRelatedLabor.section || 'Região Oficina'} • {selectedRelatedLabor.pricingType === 'fixed' ? `Valor Fixo` : `${selectedRelatedLabor.hours}h x R$ ${selectedRelatedLabor.valuePerHour}`}
              </p>
              <div className="pt-2 border-t border-zinc-900 flex justify-between items-center text-xs">
                <span className="text-zinc-500 uppercase text-[9px] font-bold">Cobrança Integral:</span>
                <span className="text-green-400 font-mono font-black">
                  R$ {(selectedRelatedLabor.pricingType === 'fixed' ? (selectedRelatedLabor.fixedValue || selectedRelatedLabor.originalTotal || 0) : ((selectedRelatedLabor.hours + ((selectedRelatedLabor.minutes || 0) / 60)) * selectedRelatedLabor.valuePerHour)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* 2nd Labor (New Candidate) */}
            <div className="p-4 bg-amber-500/5 border border-amber-500/30 rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black uppercase text-amber-500 tracking-wider">
                  2ª Mão de Obra (Novo Serviço Compartilhado)
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px] font-black uppercase">
                  Aproveitamento
                </span>
              </div>
              <h4 className="text-white font-black text-sm uppercase italic">
                {data.newLaborCandidate.description}
              </h4>
              <p className="text-[10px] text-zinc-400 uppercase font-bold">
                {data.newLaborCandidate.section || 'Mesma Região'} • {data.newLaborCandidate.hours}h x R$ {data.newLaborCandidate.valuePerHour}
              </p>
              <div className="pt-2 border-t border-amber-500/20 flex justify-between items-center text-xs">
                <span className="text-zinc-400 uppercase text-[9px] font-bold">Valor Original Bruto:</span>
                <span className="text-zinc-300 font-mono font-black">
                  R$ {grossTotal.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          </div>

          {/* Explanatory Context Note */}
          <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-2xl text-xs text-zinc-300 leading-relaxed space-y-1.5">
            <p className="font-black text-amber-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <Wrench size={14} /> Regra de Aproveitamento Técnico de Desmontagem:
            </p>
            <p className="text-zinc-300 text-[11px] leading-normal">
              Como o mecânico já realizou a desmontagem inicial (ex: retirada de rodas/pneus, proteções ou pinças) para o 1º serviço, o acesso para o 2º serviço já está liberado. Cadastre o desconto que será aplicado no valor da 2ª mão de obra:
            </p>
          </div>

          {/* Discount Configuration Controls */}
          <div className="p-5 bg-black border border-zinc-800 rounded-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase text-zinc-200 tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-400" /> Cadastre o Desconto da 2ª Mão de Obra:
              </span>
              <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDiscountType('percentage')}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1 ${
                    discountType === 'percentage' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Percent size={11} /> Porcentagem (%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('fixed')}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1 ${
                    discountType === 'fixed' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <DollarSign size={11} /> Valor Fixo (R$)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {discountType === 'percentage' ? (
                <div>
                  <label className="text-[9px] font-bold uppercase text-zinc-500 block mb-1.5">
                    Porcentagem de Desconto:
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-black text-sm outline-none focus:border-amber-500 pr-10"
                    />
                    <span className="absolute right-3.5 top-3.5 text-zinc-500 font-black text-xs">%</span>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {[30, 40, 50, 60, 70].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPct(pct)}
                        className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all ${
                          discountPct === pct ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[9px] font-bold uppercase text-zinc-500 block mb-1.5">
                    Valor do Desconto em R$:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3.5 text-zinc-500 font-black text-xs">R$</span>
                    <input
                      type="number"
                      min="0"
                      max={grossTotal}
                      step="10"
                      value={discountFixedVal}
                      onChange={(e) => setDiscountFixedVal(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-black text-sm outline-none focus:border-amber-500 pl-10"
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Live Calculation Card */}
              <div className="p-3.5 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500 uppercase text-[9px] font-bold">Valor Integral:</span>
                  <span className="text-zinc-400 font-mono">R$ {grossTotal.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between text-xs text-amber-400">
                  <span className="uppercase text-[9px] font-bold">(-) Desconto ({calculatedDiscountPct}%):</span>
                  <span className="font-mono font-bold">- R$ {calculatedDiscountValue.toLocaleString('pt-BR')}</span>
                </div>
                <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-sm">
                  <span className="text-white uppercase text-[10px] font-black">(=) Valor Final a Faturar:</span>
                  <span className="text-green-400 font-mono font-black text-base">
                    R$ {finalBilledTotal.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Justification note for shop foreman / finance */}
            <div>
              <label className="text-[9px] font-bold uppercase text-zinc-400 block mb-1.5">
                Justificativa / Observação Técnica (Impressa no Relatório/PDF da O.S.):
              </label>
              <input
                type="text"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex: Metade do serviço (desmontagem) já realizada no primeiro serviço"
                className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white text-xs outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="p-6 bg-zinc-950 border-t border-zinc-800 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleApplyDiscount}
            className="flex-1 py-4 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[10px] tracking-wider rounded-2xl shadow-[0_0_25px_rgba(34,197,94,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Check size={16} strokeWidth={3} />
            Aplicar Desconto e Adicionar à O.S. (R$ {finalBilledTotal.toLocaleString('pt-BR')})
          </button>

          <button
            type="button"
            onClick={onConfirmWithoutDiscount}
            className="py-4 px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-black uppercase text-[10px] tracking-wider rounded-2xl active:scale-95 transition-all"
            title="Adicionar pelo valor integral sem aplicar desconto"
          >
            Cobrar Valor Integral (R$ {grossTotal.toLocaleString('pt-BR')})
          </button>

          {data.pendingPartToLink && onLinkPartOnly && (
            <button
              type="button"
              onClick={onLinkPartOnly}
              className="py-4 px-5 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/30 font-black uppercase text-[10px] tracking-wider rounded-2xl active:scale-95 transition-all"
              title="Vincular apenas a peça na OS sem adicionar a mão de obra"
            >
              Vincular Apenas a Peça (Sem M.O.)
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="py-4 px-5 bg-transparent border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white font-black uppercase text-[10px] tracking-wider rounded-2xl transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharedLaborWarningModal;
