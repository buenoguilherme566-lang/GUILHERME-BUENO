import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, Download, Search, Filter, Calendar, 
  ArrowDownLeft, ArrowUpRight, Package, User, Wrench, 
  Shield, RefreshCw, X, Tag, FileText, CheckCircle2, ChevronRight
} from 'lucide-react';
import { Transaction, InventoryItem, ServiceOrder, TransactionType, MovementDestination } from '../types';

interface StockMovementsAuditProps {
  transactions: Transaction[];
  items: InventoryItem[];
  isAdmin: boolean;
  onSelectOS?: (os: ServiceOrder) => void;
  serviceOrders?: ServiceOrder[];
  onRefresh?: () => void;
  isSyncing?: boolean;
}

export const StockMovementsAudit: React.FC<StockMovementsAuditProps> = ({
  transactions,
  items,
  isAdmin,
  onSelectOS,
  serviceOrders = [],
  onRefresh,
  isSyncing = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [destinationFilter, setDestinationFilter] = useState<'ALL' | 'OS' | 'INTERNAL' | 'SUPPLIER'>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS' | 'MONTH'>('ALL');

  // Filtragem dos registros
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return transactions.filter(t => {
      // Filtro por Tipo
      if (typeFilter === 'IN' && t.type !== TransactionType.IN) return false;
      if (typeFilter === 'OUT' && t.type !== TransactionType.OUT) return false;

      // Filtro por Destinação
      if (destinationFilter === 'OS') {
        if (t.destination !== MovementDestination.OS && !t.osNumber) return false;
      } else if (destinationFilter === 'INTERNAL') {
        if (t.type === TransactionType.OUT && t.destination === MovementDestination.OS) return false;
        if (t.type === TransactionType.IN && t.recipientName?.toUpperCase().includes('FORNECEDOR')) return false;
      } else if (destinationFilter === 'SUPPLIER') {
        if (t.type !== TransactionType.IN || !t.recipientName?.toUpperCase().includes('FORNECEDOR')) return false;
      }

      // Filtro por Período
      const txTime = new Date(t.date).getTime();
      if (periodFilter === 'TODAY' && txTime < startOfToday) return false;
      if (periodFilter === '7DAYS' && txTime < sevenDaysAgo) return false;
      if (periodFilter === '30DAYS' && txTime < thirtyDaysAgo) return false;
      if (periodFilter === 'MONTH' && txTime < startOfMonth) return false;

      // Filtro por Termo de Busca
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchedItem = items.find(i => i.id === t.itemId);
        const name = (t.itemName || matchedItem?.name || '').toLowerCase();
        const partNumber = (t.partNumber || matchedItem?.partNumber || '').toLowerCase();
        const category = (matchedItem?.category || '').toLowerCase();
        const osNum = (t.osNumber || '').toLowerCase();
        const recipient = (t.recipientName || '').toLowerCase();
        const author = (t.userName || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();

        return (
          name.includes(query) ||
          partNumber.includes(query) ||
          category.includes(query) ||
          osNum.includes(query) ||
          recipient.includes(query) ||
          author.includes(query) ||
          notes.includes(query)
        );
      }

      return true;
    });
  }, [transactions, items, typeFilter, destinationFilter, periodFilter, searchTerm]);

  const roundQty = (n: number): number => Math.round((Number(n) || 0) * 10000) / 10000;
  const formatQty = (n: number): string =>
    roundQty(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  // Estatísticas e Métricas da Auditoria
  const auditMetrics = useMemo(() => {
    let totalInQty = 0;
    let totalInValue = 0;
    let totalOutQty = 0;
    let totalOutValue = 0;
    let osCount = 0;
    let internalCount = 0;

    filteredTransactions.forEach(t => {
      const item = items.find(i => i.id === t.itemId);
      const unitVal = t.unitValue !== undefined ? Number(t.unitValue) : (Number(item?.value) || 0);
      const qty = roundQty(Math.abs(Number(t.quantity) || 0));
      const val = Math.round(unitVal * qty * 100) / 100;

      if (t.type === TransactionType.IN) {
        totalInQty = roundQty(totalInQty + qty);
        totalInValue = Math.round((totalInValue + val) * 100) / 100;
      } else {
        totalOutQty = roundQty(totalOutQty + qty);
        totalOutValue = Math.round((totalOutValue + val) * 100) / 100;
        if (t.destination === MovementDestination.OS || t.osNumber) {
          osCount++;
        } else {
          internalCount++;
        }
      }
    });

    return {
      totalCount: filteredTransactions.length,
      totalInQty,
      totalInValue,
      totalOutQty,
      totalOutValue,
      osCount,
      internalCount,
      netValue: Math.round((totalInValue - totalOutValue) * 100) / 100
    };
  }, [filteredTransactions, items]);

  // Exportação para Planilha CSV compatível com Excel
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      return;
    }

    const headers = [
      'ID Movimento',
      'Data e Hora',
      'Tipo de Movimentação',
      'Peça / Insumo',
      'Part Number (REF)',
      'Categoria',
      'Quantidade (UN)',
      'Valor Unitário (R$)',
      'Valor Total (R$)',
      'Destino / Finalidade',
      'Nº Ordem de Serviço (OS)',
      'Destinatário / Mecânico',
      'Responsável pelo Lançamento',
      'Observações / NF'
    ];

    const rows = filteredTransactions.map(t => {
      const item = items.find(i => i.id === t.itemId);
      const category = item?.category || 'Geral';
      const partNumber = t.partNumber || item?.partNumber || 'S/ REF';
      const dateFormatted = new Date(t.date).toLocaleString('pt-BR');
      const typeLabel = t.type === TransactionType.IN ? 'ENTRADA' : 'SAÍDA';
      const unitVal = t.unitValue !== undefined ? Number(t.unitValue) : (Number(item?.value) || 0);
      const cleanQty = roundQty(Math.abs(Number(t.quantity) || 0));
      const totalVal = Math.round(unitVal * cleanQty * 100) / 100;

      let destinationText = '';
      if (t.type === TransactionType.IN) {
        destinationText = t.recipientName?.toUpperCase().includes('FORNECEDOR')
          ? t.recipientName
          : 'Entrada em Estoque Físico';
      } else {
        destinationText = (t.destination === MovementDestination.OS || t.osNumber)
          ? `Ordem de Serviço #${t.osNumber || 'S/N'}`
          : 'Consumo Interno / Uso Oficina';
      }

      return [
        t.id,
        dateFormatted,
        typeLabel,
        `"${(t.itemName || item?.name || '').replace(/"/g, '""')}"`,
        `"${partNumber.replace(/"/g, '""')}"`,
        `"${category.replace(/"/g, '""')}"`,
        String(t.type === TransactionType.IN ? cleanQty : -cleanQty).replace('.', ','),
        unitVal.toFixed(2).replace('.', ','),
        totalVal.toFixed(2).replace('.', ','),
        `"${destinationText.replace(/"/g, '""')}"`,
        `"${(t.osNumber || '').replace(/"/g, '""')}"`,
        `"${(t.recipientName || '').replace(/"/g, '""')}"`,
        `"${(t.userName || '').replace(/"/g, '""')}"`,
        `"${(t.notes || '').replace(/"/g, '""')}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_movimentacoes_estoque_hps_${dateStr}_${timeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-12 rounded-[3rem] text-center space-y-6 max-w-2xl mx-auto shadow-2xl animate-in fade-in">
        <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20">
          <Shield size={36} />
        </div>
        <div>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Acesso Restrito a Administradores e Estoquistas</h3>
          <p className="text-zinc-400 text-xs mt-3 leading-relaxed">
            O módulo de auditoria de movimentações e extração de planilhas fiscais é restrito a perfis com permissão de Estoquista ou Administrador da HPS Control.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-zinc-800 pb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-500 text-[9px] font-black uppercase tracking-widest rounded-lg italic">
              Auditoria de Estoque Oficial
            </span>
            <span className="px-3 py-1 bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest rounded-lg italic">
              Admin & Estoquista
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tighter text-white mt-2">
            Movimentações de Estoque & Auditoria
          </h2>
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider italic mt-1">
            Controle analítico de entradas, saídas de peças, insumos e destinação para prestação de contas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isSyncing}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50"
              title="Atualizar dados do servidor"
            >
              <RefreshCw size={15} className={isSyncing ? 'animate-spin text-green-500' : ''} />
              <span>{isSyncing ? 'Sincronizando...' : 'Atualizar'}</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-3 bg-green-500 hover:bg-green-400 text-black px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-wider shadow-glow active:scale-95 transition-all"
            title="Baixar planilha compatível com Microsoft Excel e Google Sheets"
          >
            <FileSpreadsheet size={18} strokeWidth={2.5} />
            <span>Gerar Planilha para Auditoria (.CSV / Excel)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards de Auditoria */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Movimentações */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest italic">Registros Filtrados</p>
              <FileText size={16} className="text-zinc-600" />
            </div>
            <p className="text-3xl sm:text-4xl font-black text-white">{auditMetrics.totalCount}</p>
          </div>
          <p className="text-[8px] text-zinc-500 font-black uppercase tracking-wider mt-3">
            De um total de {transactions.length} movimentações no sistema
          </p>
        </div>

        {/* Total Entradas */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[9px] text-green-500 font-black uppercase tracking-widest italic flex items-center gap-1">
                <ArrowDownLeft size={14} /> Entradas de Peças
              </p>
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-green-400">+{formatQty(auditMetrics.totalInQty)} <span className="text-xs uppercase opacity-40 font-bold">UN</span></p>
          </div>
          <p className="text-[9px] text-green-500/80 font-black uppercase tracking-wider mt-3">
            R$ {auditMetrics.totalInValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} adicionados
          </p>
        </div>

        {/* Total Saídas */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[9px] text-red-500 font-black uppercase tracking-widest italic flex items-center gap-1">
                <ArrowUpRight size={14} /> Saídas de Peças
              </p>
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-red-400">-{formatQty(auditMetrics.totalOutQty)} <span className="text-xs uppercase opacity-40 font-bold">UN</span></p>
          </div>
          <p className="text-[9px] text-red-500/80 font-black uppercase tracking-wider mt-3">
            R$ {auditMetrics.totalOutValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} baixados
          </p>
        </div>

        {/* Destinação Predominante */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest italic">Destinação das Saídas</p>
              <Wrench size={16} className="text-zinc-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">{auditMetrics.osCount}</span>
              <span className="text-[10px] font-black uppercase text-green-500 italic">O.S.</span>
              <span className="text-zinc-600 text-xs">|</span>
              <span className="text-2xl sm:text-3xl font-black text-white">{auditMetrics.internalCount}</span>
              <span className="text-[10px] font-black uppercase text-zinc-400 italic">Oficina</span>
            </div>
          </div>
          <p className="text-[8px] text-zinc-500 font-black uppercase tracking-wider mt-3">
            Rastreabilidade de destino 100% gravada
          </p>
        </div>
      </div>

      {/* Painel de Filtros Avançados */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-[2.5rem] space-y-6 shadow-xl">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Campo de Busca Livre */}
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-green-500 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Pesquisar por Peça, Part Number, Nº da O.S., Técnico, Responsável ou Notas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-black border border-zinc-800 pl-14 pr-12 py-4 rounded-2xl text-xs font-bold text-white outline-none focus:border-green-500/50 transition-all placeholder:text-zinc-600"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filtro de Período */}
          <div className="flex items-center gap-2 bg-black border border-zinc-800 p-1.5 rounded-2xl overflow-x-auto">
            <Calendar size={14} className="text-zinc-600 ml-3 shrink-0 hidden sm:block" />
            <button
              onClick={() => setPeriodFilter('ALL')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${periodFilter === 'ALL' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white'}`}
            >
              Todo Histórico
            </button>
            <button
              onClick={() => setPeriodFilter('TODAY')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${periodFilter === 'TODAY' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white'}`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriodFilter('7DAYS')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${periodFilter === '7DAYS' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white'}`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setPeriodFilter('30DAYS')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${periodFilter === '30DAYS' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white'}`}
            >
              30 Dias
            </button>
            <button
              onClick={() => setPeriodFilter('MONTH')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${periodFilter === 'MONTH' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white'}`}
            >
              Mês Atual
            </button>
          </div>
        </div>

        {/* Filtros em Chips: Tipo e Destinação */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-800/80">
          {/* Tipo de Movimentação */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-zinc-500 italic mr-1">Tipo:</span>
            <button
              onClick={() => setTypeFilter('ALL')}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${typeFilter === 'ALL' ? 'bg-white text-black border-white' : 'bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
            >
              Todas ({transactions.length})
            </button>
            <button
              onClick={() => setTypeFilter('IN')}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${typeFilter === 'IN' ? 'bg-green-500 text-black border-green-500 shadow-glow' : 'bg-black text-green-500/70 border-zinc-800 hover:border-green-500/30'}`}
            >
              <ArrowDownLeft size={12} strokeWidth={3} />
              Entradas ({transactions.filter(t => t.type === TransactionType.IN).length})
            </button>
            <button
              onClick={() => setTypeFilter('OUT')}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${typeFilter === 'OUT' ? 'bg-red-500 text-white border-red-500 shadow-glow' : 'bg-black text-red-500/70 border-zinc-800 hover:border-red-500/30'}`}
            >
              <ArrowUpRight size={12} strokeWidth={3} />
              Saídas ({transactions.filter(t => t.type === TransactionType.OUT).length})
            </button>
          </div>

          {/* Destinação */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-zinc-500 italic mr-1">Destinação:</span>
            <button
              onClick={() => setDestinationFilter('ALL')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${destinationFilter === 'ALL' ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-black text-zinc-500 border-zinc-800 hover:text-white'}`}
            >
              Todos os Destinos
            </button>
            <button
              onClick={() => setDestinationFilter('OS')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${destinationFilter === 'OS' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-black text-zinc-500 border-zinc-800 hover:text-white'}`}
            >
              Ordens de Serviço (O.S.)
            </button>
            <button
              onClick={() => setDestinationFilter('INTERNAL')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${destinationFilter === 'INTERNAL' ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-black text-zinc-500 border-zinc-800 hover:text-white'}`}
            >
              Uso Oficina / Interno
            </button>
            <button
              onClick={() => setDestinationFilter('SUPPLIER')}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${destinationFilter === 'SUPPLIER' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-black text-zinc-500 border-zinc-800 hover:text-white'}`}
            >
              Fornecedor / Recompra
            </button>

            {(typeFilter !== 'ALL' || destinationFilter !== 'ALL' || periodFilter !== 'ALL' || searchTerm) && (
              <button
                onClick={() => {
                  setTypeFilter('ALL');
                  setDestinationFilter('ALL');
                  setPeriodFilter('ALL');
                  setSearchTerm('');
                }}
                className="ml-2 px-3 py-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                title="Limpar todos os filtros"
              >
                <X size={12} /> Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Movimentações e Auditoria */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-[3rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-black text-zinc-500 font-black uppercase tracking-wider">
              <tr>
                <th className="p-6">Data / Horário</th>
                <th className="p-6 text-center">Tipo</th>
                <th className="p-6">Peça / Insumo</th>
                <th className="p-6 text-center">Quantidade</th>
                <th className="p-6 text-right">Valores</th>
                <th className="p-6">Destino / Finalidade</th>
                <th className="p-6">Destinatário / Mecânico</th>
                <th className="p-6">Responsável</th>
                <th className="p-6">Observações / NF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-zinc-600 font-black uppercase italic text-xs">
                    Nenhuma movimentação localizada com os filtros selecionados
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(t => {
                  const item = items.find(i => i.id === t.itemId);
                  const isEntry = t.type === TransactionType.IN;
                  const unitVal = t.unitValue !== undefined ? Number(t.unitValue) : (Number(item?.value) || 0);
                  const cleanRowQty = roundQty(Math.abs(Number(t.quantity) || 0));
                  const totalVal = Math.round(unitVal * cleanRowQty * 100) / 100;
                  const partNumber = t.partNumber || item?.partNumber || 'S/ REF';
                  const category = item?.category;

                  const isOS = t.destination === MovementDestination.OS || Boolean(t.osNumber);
                  const linkedOS = isOS && t.osNumber ? serviceOrders.find(o => o.osNumber === t.osNumber) : undefined;

                  return (
                    <tr key={t.id} className="hover:bg-white/[0.03] transition-colors group">
                      {/* Data / Horário */}
                      <td className="p-6 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-white font-black">
                            {new Date(t.date).toLocaleDateString('pt-BR')}
                          </span>
                          <span className="text-[9px] text-zinc-500 font-bold mt-0.5">
                            {new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="p-6 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider ${
                            isEntry
                              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                              : 'bg-red-500/10 border border-red-500/30 text-red-400'
                          }`}
                        >
                          {isEntry ? <ArrowDownLeft size={12} strokeWidth={3} /> : <ArrowUpRight size={12} strokeWidth={3} />}
                          {isEntry ? 'ENTRADA' : 'SAÍDA'}
                        </span>
                      </td>

                      {/* Peça / Insumo */}
                      <td className="p-6 min-w-[200px]">
                        <div className="flex flex-col">
                          <span className="font-black uppercase text-white italic tracking-tight group-hover:text-green-400 transition-colors">
                            {t.itemName || item?.name || 'Peça Desconhecida'}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-[9px] text-zinc-400 font-bold bg-black px-2 py-0.5 rounded border border-zinc-800">
                              PN: {partNumber}
                            </span>
                            {category && (
                              <span className="text-[8px] font-black uppercase text-zinc-500 italic">
                                {category}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Quantidade */}
                      <td className="p-6 text-center whitespace-nowrap">
                        <span
                          className={`text-lg font-black ${
                            isEntry ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {isEntry ? `+${formatQty(cleanRowQty)}` : `-${formatQty(cleanRowQty)}`}
                        </span>
                        <span className="text-[8px] uppercase font-bold text-zinc-600 ml-1">{(item?.unit || 'UN').toUpperCase()}</span>
                      </td>

                      {/* Valores */}
                      <td className="p-6 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span className="text-white font-black">
                            R$ {totalVal.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-zinc-500 font-bold">
                            Unit: R$ {unitVal.toFixed(2)}
                          </span>
                        </div>
                      </td>

                      {/* Destino / Finalidade */}
                      <td className="p-6 min-w-[160px]">
                        {isEntry ? (
                          <div className="flex flex-col">
                            <span className="px-3 py-1 bg-green-500/5 border border-green-500/20 text-green-400 rounded-xl text-[9px] font-black uppercase tracking-wider w-fit">
                              {t.recipientName?.toUpperCase().includes('FORNECEDOR') ? 'Entrada / Recompra' : 'Estoque Físico'}
                            </span>
                            {t.recipientName && (
                              <span className="text-[9px] text-zinc-500 font-bold mt-1 uppercase italic">
                                {t.recipientName}
                              </span>
                            )}
                          </div>
                        ) : isOS ? (
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-black border border-green-500/30 text-green-400 rounded-xl text-[9px] font-black uppercase tracking-wider shadow-sm">
                                Ordem de Serviço #{t.osNumber}
                              </span>
                              {linkedOS && onSelectOS && (
                                <button
                                  onClick={() => onSelectOS(linkedOS)}
                                  className="p-1 text-zinc-500 hover:text-white transition-colors"
                                  title="Abrir detalhes desta O.S."
                                >
                                  <ChevronRight size={14} />
                                </button>
                              )}
                            </div>
                            {linkedOS?.customerName && (
                              <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider">
                                Cli: {linkedOS.customerName}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-3 py-1 bg-black border border-zinc-800 text-zinc-400 rounded-xl text-[9px] font-black uppercase tracking-wider">
                            Consumo Oficina / Uso Interno
                          </span>
                        )}
                      </td>

                      {/* Destinatário / Mecânico */}
                      <td className="p-6 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-zinc-300 font-bold uppercase italic">
                          <User size={12} className="text-zinc-600 shrink-0" />
                          <span>{t.recipientName || 'Geral HPS'}</span>
                        </div>
                      </td>

                      {/* Responsável pelo Lançamento */}
                      <td className="p-6 whitespace-nowrap">
                        <span className="text-zinc-400 font-bold uppercase text-[10px]">
                          {t.userName || 'Sistema'}
                        </span>
                      </td>

                      {/* Observações / NF */}
                      <td className="p-6 max-w-[220px]">
                        <span className="text-zinc-400 text-[10px] font-medium italic line-clamp-2" title={t.notes || ''}>
                          {t.notes || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="p-6 bg-black/80 border-t border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] font-black uppercase tracking-wider text-zinc-500">
          <div>
            Mostrando <span className="text-white">{filteredTransactions.length}</span> de <span className="text-white">{transactions.length}</span> movimentações registradas
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 text-green-500 hover:text-green-400 transition-colors"
            >
              <Download size={14} /> Baixar dados em CSV para Auditoria
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockMovementsAudit;
