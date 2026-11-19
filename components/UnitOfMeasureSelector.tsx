import React, { useState, useEffect } from 'react';
import { 
  Droplet, 
  Shield, 
  Boxes, 
  Wrench, 
  Scale, 
  Ruler, 
  Check, 
  Sparkles, 
  SlidersHorizontal 
} from 'lucide-react';

export interface UnitOption {
  label: string;
  value: string;
  badge: string;
  example: string;
  allowDecimal?: boolean;
}

export interface UnitFilterCategory {
  id: string;
  name: string;
  shortName: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
  units: UnitOption[];
}

export const UNIT_CATEGORIES: UnitFilterCategory[] = [
  {
    id: 'fluids',
    name: 'Óleos e Fluidos',
    shortName: 'Óleos & Fluidos',
    icon: Droplet,
    description: 'Óleo de motor, fluido de freio, arrefecimento, diferenciais',
    units: [
      { label: 'Litro', value: 'L', badge: 'L', example: 'Ex: 1L, 2.5L de óleo motor XPS', allowDecimal: true },
      { label: 'Mililitro', value: 'ml', badge: 'ml', example: 'Ex: 250ml de aditivo / fluido', allowDecimal: true },
      { label: 'Galão', value: 'galão', badge: 'gal', example: 'Ex: 1 galão (3.78L)', allowDecimal: true },
      { label: 'Frasco / Garrafa', value: 'frasco', badge: 'fr', example: 'Ex: 1 frasco de líquido arrefecimento', allowDecimal: false }
    ]
  },
  {
    id: 'bodywork',
    name: 'Para-barro & Carroceria',
    shortName: 'Para-barro & Carroceria',
    icon: Shield,
    description: 'Para-barros, paralamas, retrovisores, carenagens e protetores',
    units: [
      { label: 'Par', value: 'par', badge: 'par', example: 'Ex: 1 par de para-barros dianteiros', allowDecimal: false },
      { label: 'Unidade', value: 'un', badge: 'un', example: 'Ex: 1 para-barro avulso (Lado Direito)', allowDecimal: false },
      { label: 'Jogo Completo', value: 'jogo', badge: 'jg', example: 'Ex: Jogo completo dianteiro + traseiro', allowDecimal: false },
      { label: 'Kit de Instalação', value: 'kit', badge: 'kit', example: 'Ex: Kit de para-barro com presilhas', allowDecimal: false }
    ]
  },
  {
    id: 'general',
    name: 'Peças & Mecânica Geral',
    shortName: 'Peças Gerais',
    icon: Wrench,
    description: 'Filtros, velas, correias, bombas, pastilhas de freio, buchas',
    units: [
      { label: 'Unidade', value: 'un', badge: 'un', example: 'Ex: 1 filtro de óleo, 1 correia', allowDecimal: false },
      { label: 'Peça', value: 'pç', badge: 'pç', example: 'Ex: 1 peça avulsa', allowDecimal: false },
      { label: 'Kit de Reparo', value: 'kit', badge: 'kit', example: 'Ex: Kit reparo bomba d\'água', allowDecimal: false },
      { label: 'Conjunto', value: 'conjunto', badge: 'conj', example: 'Ex: Conjunto montado', allowDecimal: false },
      { label: 'Caixa', value: 'caixa', badge: 'cx', example: 'Ex: Caixa fechada', allowDecimal: false }
    ]
  },
  {
    id: 'lines_hardware',
    name: 'Mangueiras, Fios & Fixadores',
    shortName: 'Mangueiras & Fios',
    icon: Ruler,
    description: 'Mangueiras de combustível, chicotes, fitas, rebites, abraçadeiras',
    units: [
      { label: 'Metro', value: 'metro', badge: 'm', example: 'Ex: 1.5 metros de mangueira', allowDecimal: true },
      { label: 'Centímetro', value: 'cm', badge: 'cm', example: 'Ex: 50 cm de tubo', allowDecimal: true },
      { label: 'Rolo', value: 'rolo', badge: 'rl', example: 'Ex: 1 rolo fita ou fiação', allowDecimal: false },
      { label: 'Unidade', value: 'un', badge: 'un', example: 'Ex: 1 abraçadeira / parafuso', allowDecimal: false },
      { label: 'Cento', value: 'cento', badge: 'cto', example: 'Ex: 1 cento de presilhas', allowDecimal: false },
      { label: 'Pacote', value: 'pacote', badge: 'pct', example: 'Ex: Pacote com 10 fixadores', allowDecimal: false }
    ]
  },
  {
    id: 'weight_grease',
    name: 'Graxas, Pastas & Pesagem',
    shortName: 'Graxas & Químicos',
    icon: Scale,
    description: 'Graxa sintética, silicone de junta, travas químicas, massas',
    units: [
      { label: 'Quilograma', value: 'kg', badge: 'kg', example: 'Ex: 1kg ou 0.5kg de graxa', allowDecimal: true },
      { label: 'Grama', value: 'g', badge: 'g', example: 'Ex: 100g de pasta lubrificante', allowDecimal: true },
      { label: 'Tubo / Bisnaga', value: 'bisnaga', badge: 'tb', example: 'Ex: 1 bisnaga silicone / cola', allowDecimal: false },
      { label: 'Lata / Pote', value: 'lata', badge: 'lt', example: 'Ex: 1 pote de graxa náutica', allowDecimal: false }
    ]
  }
];

interface UnitOfMeasureSelectorProps {
  value: string;
  onChange: (unit: string) => void;
  itemNameHint?: string;
  className?: string;
}

export const UnitOfMeasureSelector: React.FC<UnitOfMeasureSelectorProps> = ({
  value,
  onChange,
  itemNameHint = '',
  className = ''
}) => {
  // Estado para o filtro de categoria selecionado
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState('');

  // Sugestão automática inteligente baseada no nome do item digitado
  useEffect(() => {
    if (!itemNameHint) return;
    const lower = itemNameHint.toLowerCase();
    
    // Se o usuário digitou palavras chave de óleos/fluidos
    if (lower.includes('óleo') || lower.includes('oleo') || lower.includes('fluido') || lower.includes('arrefecimento') || lower.includes('aditivo') || lower.includes('xps') || lower.includes('lubrificante') || lower.includes('dot 4') || lower.includes('líquido')) {
      setActiveCategoryFilter('fluids');
    } 
    // Se o usuário digitou palavras de carroceria / para-barro
    else if (lower.includes('para-barro') || lower.includes('parabarro') || lower.includes('para barro') || lower.includes('paralama') || lower.includes('retrovisor') || lower.includes('carenagem') || lower.includes('spoiler') || lower.includes('defletor')) {
      setActiveCategoryFilter('bodywork');
    }
    // Se mangueira ou fio
    else if (lower.includes('mangueira') || lower.includes('cabo') || lower.includes('chicote') || lower.includes('fio') || lower.includes('tubo')) {
      setActiveCategoryFilter('lines_hardware');
    }
    // Se graxa ou pasta
    else if (lower.includes('graxa') || lower.includes('silicone') || lower.includes('pasta') || lower.includes('cola') || lower.includes('trava')) {
      setActiveCategoryFilter('weight_grease');
    }
  }, [itemNameHint]);

  // Checa se o valor atual é uma das unidades pré-definidas
  const allPredefinedUnits = UNIT_CATEGORIES.flatMap(cat => cat.units);
  const isPredefined = allPredefinedUnits.some(u => u.value.toLowerCase() === (value || '').toLowerCase());

  useEffect(() => {
    if (value && !isPredefined) {
      setIsCustomMode(true);
      setCustomUnitInput(value);
    }
  }, [value, isPredefined]);

  // Lista de unidades a exibir conforme o filtro de categoria
  const displayedUnits = activeCategoryFilter === 'all'
    ? allPredefinedUnits.filter((u, index, self) => index === self.findIndex(t => t.value === u.value))
    : UNIT_CATEGORIES.find(c => c.id === activeCategoryFilter)?.units || allPredefinedUnits;

  const currentUnitInfo = allPredefinedUnits.find(u => u.value.toLowerCase() === (value || 'un').toLowerCase());

  return (
    <div className={`space-y-3 bg-black/40 border border-zinc-800 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-inner ${className}`}>
      {/* Header com título e indicação da unidade ativa */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-green-500" />
          <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest italic">
            Filtro e Seleção da Unidade de Medida
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">Unidade Ativa:</span>
          <span className="px-2.5 py-0.5 bg-green-500 text-black font-black text-[10px] uppercase rounded-full shadow-glow">
            {value || 'un'}
          </span>
        </div>
      </div>

      {/* FILTRO DE CATEGORIAS (Óleos e Fluidos, Para-barro, etc.) */}
      <div className="space-y-1.5">
        <p className="text-[8px] font-black uppercase text-zinc-500 tracking-wider px-1">
          Filtrar tipo de componente / aplicação:
        </p>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => { setActiveCategoryFilter('all'); setIsCustomMode(false); }}
            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeCategoryFilter === 'all' && !isCustomMode
                ? 'bg-zinc-800 text-green-400 border border-green-500/40 shadow-glow'
                : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-500 border border-zinc-900'
            }`}
          >
            <Boxes size={12} />
            Todas as Unidades
          </button>

          {UNIT_CATEGORIES.map(category => {
            const Icon = category.icon;
            const isSelected = activeCategoryFilter === category.id && !isCustomMode;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => { setActiveCategoryFilter(category.id); setIsCustomMode(false); }}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 ${
                  isSelected
                    ? 'bg-green-500 text-black border border-green-400 shadow-glow font-black'
                    : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                }`}
                title={category.description}
              >
                <Icon size={12} className={isSelected ? 'text-black' : 'text-green-500'} />
                {category.shortName}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsCustomMode(true)}
            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              isCustomMode
                ? 'bg-green-500 text-black border border-green-400 shadow-glow font-black'
                : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-500 border border-zinc-900'
            }`}
          >
            <Sparkles size={12} />
            Outra / Personalizada
          </button>
        </div>
      </div>

      {/* MODO PERSONALIZADO (DIGITAÇÃO LIVRE) */}
      {isCustomMode ? (
        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl space-y-2 animate-in fade-in duration-200">
          <p className="text-[8px] font-black uppercase text-green-500 tracking-wider">
            Digite a sigla ou nome da unidade personalizada:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ex: tambor, rolo 50m, fardo, kit duplo..."
              className="flex-1 bg-black border border-zinc-700 px-3 py-2 rounded-xl text-white text-xs font-black uppercase outline-none focus:border-green-500"
              value={customUnitInput}
              onChange={e => {
                const val = e.target.value;
                setCustomUnitInput(val);
                onChange(val || 'un');
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (customUnitInput.trim()) {
                  onChange(customUnitInput.trim());
                }
              }}
              className="px-4 py-2 bg-green-500 text-black rounded-xl text-[10px] font-black uppercase active:scale-95 transition-all shadow-glow"
            >
              Confirmar
            </button>
          </div>
        </div>
      ) : (
        /* BOTÕES DAS UNIDADES DO FILTRO ATIVO */
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {displayedUnits.map(unitOption => {
              const isSelected = (value || 'un').toLowerCase() === unitOption.value.toLowerCase();
              return (
                <button
                  key={unitOption.value}
                  type="button"
                  onClick={() => {
                    onChange(unitOption.value);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between active:scale-95 ${
                    isSelected
                      ? 'bg-green-500/10 border-green-500 shadow-glow text-white'
                      : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-900 hover:border-zinc-800 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase font-mono ${
                      isSelected ? 'bg-green-500 text-black' : 'bg-zinc-900 text-zinc-400'
                    }`}>
                      {unitOption.badge}
                    </span>
                    {isSelected && <Check size={12} className="text-green-500" />}
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-tight text-white">
                    {unitOption.label}
                  </p>
                  <p className="text-[8px] text-zinc-500 font-bold truncate mt-0.5">
                    {unitOption.example}
                  </p>
                </button>
              );
            })}
          </div>

          {/* DICA DE EXEMPLO DA UNIDADE ESCOLHIDA */}
          {currentUnitInfo && (
            <p className="text-[8px] text-zinc-500 italic px-1 font-bold">
              💡 {currentUnitInfo.example} — Estoque e baixas serão controlados nesta unidade de medida.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
