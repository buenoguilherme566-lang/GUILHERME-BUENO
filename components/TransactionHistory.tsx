import React from 'react';
import { Transaction, TransactionType, MovementDestination } from '../types';
import { ArrowUpRight, ArrowDownLeft, Clock, Wrench, UserCircle, Factory, Hash, Tag } from 'lucide-react';

const parsePtBrNumber = (str?: string): number => {
  if (!str) return 0;
  const normalized = str.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(normalized);
  return isNaN(val) ? 0 : val;
};

export interface TransactionFinancialSummary {
  qty: number;
  grossUnit: number;
  netUnit: number;
  grossTotal: number;
  discount: number;
  discountPct: number;
  netTotal: number;
  hasDiscount: boolean;
}

export const getTransactionFinancials = (
  t: Transaction,
  fallbackItemValue = 0
): TransactionFinancialSummary => {
  const qty = Math.round(Math.abs(Number(t.quantity) || 0) * 10000) / 10000;
  const storedUnit = t.unitValue !== undefined ? Number(t.unitValue) : (Number(fallbackItemValue) || 0);

  let discount = Math.max(0, Number(t.discountValue) || 0);
  let discountPct = Math.max(0, Number(t.discountPercentage) || 0);
  let grossTotal = 0;
  let netTotal = 0;

  if (discount > 0) {
    if (t.originalUnitValue !== undefined && Number(t.originalUnitValue) > 0) {
      const origUnit = Number(t.originalUnitValue);
      grossTotal = Math.round(origUnit * qty * 100) / 100;
      netTotal = Math.max(0, Math.round((grossTotal - discount) * 100) / 100);
    } else {
      netTotal = Math.round(storedUnit * qty * 100) / 100;
      grossTotal = Math.round((netTotal + discount) * 100) / 100;
    }
    if (discountPct <= 0 && grossTotal > 0) {
      discountPct = Math.round((discount / grossTotal) * 1000) / 10;
    }
  } else if (t.notes) {
    const match = t.notes.match(
      /\[Desc\.\s*Peça:\s*-R\$\s*([\d.,]+)(?:\s*\(([\d.,]+)%\))?\s*\|\s*De R\$\s*([\d.,]+)\s*por R\$\s*([\d.,]+)/i
    );
    if (match) {
      discount = parsePtBrNumber(match[1]);
      discountPct = parsePtBrNumber(match[2]);
      grossTotal = parsePtBrNumber(match[3]);
      netTotal = parsePtBrNumber(match[4]);
      if (discountPct <= 0 && grossTotal > 0 && discount > 0) {
        discountPct = Math.round((discount / grossTotal) * 1000) / 10;
      }
    }
  }

  if (discount <= 0) {
    netTotal = Math.round(storedUnit * qty * 100) / 100;
    grossTotal = netTotal;
  }

  const grossUnit = qty > 0 ? Math.round((grossTotal / qty) * 10000) / 10000 : storedUnit;
  const netUnit = qty > 0 ? Math.round((netTotal / qty) * 10000) / 10000 : storedUnit;

  return {
    qty,
    grossUnit,
    netUnit,
    grossTotal,
    discount,
    discountPct,
    netTotal,
    hasDiscount: discount > 0
  };
};

interface TransactionHistoryProps {
  transactions: Transaction[];
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions }) => {
  return (
    <div className="bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-zinc-800 overflow-hidden">
      <div className="p-6 border-b border-zinc-800 bg-zinc-950/30">
        <h3 className="font-black flex items-center gap-2 text-zinc-500 uppercase text-[9px] tracking-[0.15em] italic">
          <Clock size={16} className="text-green-500" />
          Log Operacional HPS
        </h3>
      </div>
      <div className="divide-y divide-zinc-800 max-h-[600px] overflow-y-auto custom-scrollbar no-scrollbar">
        {transactions.length === 0 ? (
          <div className="p-16 text-center text-zinc-700 font-black text-[9px] uppercase tracking-widest italic opacity-50">Sem registros no banco</div>
        ) : (
          transactions.map((t) => {
            const fin = getTransactionFinancials(t);
            return (
              <div key={t.id} className="p-6 hover:bg-zinc-800/10 transition-colors group">
                <div className="flex justify-between items-center mb-3">
                  <span className={`text-[7px] font-black px-2 py-1 rounded-md flex items-center gap-1.5 ${
                    t.type === TransactionType.IN 
                    ? 'bg-green-500 text-black' 
                    : 'bg-zinc-200 text-black'
                  }`}>
                    {t.type === TransactionType.IN ? <ArrowDownLeft size={10} strokeWidth={3} /> : <ArrowUpRight size={10} strokeWidth={3} />}
                    {t.type === TransactionType.IN ? 'ENTRADA' : 'BAIXA'}
                  </span>
                  <span className="text-[7px] font-black text-zinc-600 uppercase">
                    {new Date(t.date).toLocaleDateString('pt-BR')} {new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-sm uppercase italic truncate leading-tight">{t.itemName}</p>
                    
                    {fin.hasDiscount && (
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase">
                          <Tag size={9} /> Desc: -R$ {fin.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({fin.discountPct}%)
                        </span>
                        <span className="text-[8px] font-mono text-zinc-500">
                          <span className="line-through mr-1">R$ {fin.grossTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          → <strong className="text-zinc-200">R$ {fin.netTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                      <p className="text-[7px] text-zinc-500 flex items-center gap-1 font-black uppercase tracking-wider">
                        <UserCircle size={10} className="text-green-500" /> Autor: {t.userName}
                      </p>
                      {t.type === TransactionType.OUT && (
                        <>
                          <p className="text-[7px] text-zinc-500 flex items-center gap-1 font-black uppercase tracking-wider">
                            <Wrench size={10} className="text-green-500" /> Técnico: {t.recipientName}
                          </p>
                          <p className="text-[7px] text-green-500 flex items-center gap-1 font-black uppercase tracking-wider">
                            {t.destination === MovementDestination.OS ? <Hash size={10} /> : <Factory size={10} />}
                            Destino: {t.destination === MovementDestination.OS ? `OS #${t.osNumber}` : 'Consumo Interno'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-black ${t.type === TransactionType.IN ? 'text-green-500' : 'text-zinc-100'}`}>
                      {t.type === TransactionType.IN ? '+' : '-'}{fin.qty.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} <span className="text-[8px] text-zinc-600">UN</span>
                    </p>
                    {fin.netTotal > 0 && (
                      <p className="text-[9px] font-mono font-bold text-zinc-400">
                        R$ {fin.netTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          }).reverse()
        )}
      </div>
    </div>
  );
};

export default TransactionHistory;
