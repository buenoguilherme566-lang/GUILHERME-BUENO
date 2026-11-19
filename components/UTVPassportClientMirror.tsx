import React, { useState } from 'react';
import { UTVPassport, InventoryItem, Tenant } from '../types';
import {
  ShieldCheck, Flag, Gauge, Calendar, Wrench, CheckCircle2,
  AlertTriangle, Clock, Printer, Download, Share2, Check,
  RefreshCw, Award, MapPin, FileText, Sparkles, X, ExternalLink, Lock, LogOut, KeyRound, Car
} from 'lucide-react';

interface UTVPassportClientMirrorProps {
  passport: UTVPassport;
  tenant: Tenant;
  items?: InventoryItem[];
  isPublicStandalone?: boolean;
  onClose?: () => void;
  onRefreshRealtime?: () => Promise<void>;
  clientCredentials?: {
    username?: string;
    password?: string;
    clientName?: string;
  };
  isClientLockedSession?: boolean;
  onLogoutClient?: () => void;
  clientPassportsList?: UTVPassport[];
  onSelectClientPassport?: (passport: UTVPassport) => void;
}

const formatSafeDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const parsed = dateStr.includes('T') ? new Date(dateStr) : new Date(`${dateStr}T12:00:00`);
  return isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString('pt-BR');
};

export const getCarStatusBadge = (status: UTVPassport['carStatus']) => {
  switch (status) {
    case 'READY':
      return { label: 'PRONTO PARA COMPETIÇÃO / PISTA', color: 'bg-green-500 text-black border-green-400', dot: 'bg-black' };
    case 'IN_TRIAGE':
      return { label: 'EM TRIAGEM TÉCNICA NA OFICINA', color: 'bg-amber-500 text-black border-amber-400', dot: 'bg-black animate-ping' };
    case 'IN_MAINTENANCE':
      return { label: 'EM MANUTENÇÃO / PREPARAÇÃO', color: 'bg-blue-500 text-white border-blue-400', dot: 'bg-white animate-pulse' };
    case 'AWAITING_PARTS':
      return { label: 'AGUARDANDO PEÇAS DE REPOSIÇÃO', color: 'bg-red-500 text-white border-red-400', dot: 'bg-white animate-pulse' };
    case 'RACING':
      return { label: 'EM COMPETIÇÃO / PROVA ATIVA', color: 'bg-purple-500 text-white border-purple-400', dot: 'bg-white animate-ping' };
    default:
      return { label: 'REGISTRADO', color: 'bg-zinc-800 text-zinc-300 border-zinc-700', dot: 'bg-zinc-400' };
  }
};

export const UTVPassportClientMirror: React.FC<UTVPassportClientMirrorProps> = ({
  passport,
  tenant,
  isPublicStandalone = false,
  onClose,
  onRefreshRealtime,
  clientCredentials,
  isClientLockedSession = false,
  onLogoutClient,
  clientPassportsList = [],
  onSelectClientPassport
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const clientMirrorUrl = `${window.location.origin}${window.location.pathname}?utv_passport=${encodeURIComponent(passport.id)}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(clientMirrorUrl)}`;

  const completedRaces = (passport.competitions || [])
    .filter(c => c.status === 'COMPLETED')
    .sort((a, b) => b.date.localeCompare(a.date));
  const upcomingRaces = (passport.competitions || [])
    .filter(c => c.status === 'UPCOMING' || c.status === 'IN_PREP')
    .sort((a, b) => a.date.localeCompare(b.date));

  const lastRace = completedRaces[0] || null;
  const nextRace = upcomingRaces[0] || null;
  const totalCompetitionKm = (passport.competitions || [])
    .filter(c => c.status === 'COMPLETED')
    .reduce((acc, c) => acc + (Number(c.distanceKm) || 0), 0);

  const handleCopyClientLink = () => {
    navigator.clipboard.writeText(clientMirrorUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleCopyLinkWithCredentials = () => {
    const loginStr = clientCredentials?.username || 'Não configurado (cadastre na aba Clientes)';
    const passStr = clientCredentials?.password || 'Não configurada';
    const message = [
      `🏁 *${tenant.name} — Passaporte Oficial UTV (Espelho do Cliente)*`,
      `Olá *${passport.customerName}*, acompanhe em tempo real a preparação e revisão do seu UTV *${passport.vehicleNumber ? `${passport.vehicleNumber} • ` : ''}${passport.vehicleModel}*:`,
      ``,
      `🔗 *Link do Espelho:* ${clientMirrorUrl}`,
      `👤 *Seu Login:* ${loginStr}`,
      `🔑 *Sua Senha:* ${passStr}`,
      ``,
      `_Acesso exclusivo de visualização em tempo real._`
    ].join('\n');

    navigator.clipboard.writeText(message);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 3500);
  };

  const handleRefresh = async () => {
    if (!onRefreshRealtime) return;
    setIsRefreshing(true);
    try {
      await onRefreshRealtime();
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('utv-passport-client-printable');
    if (!element) return;
    setIsGeneratingPdf(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf: any = html2pdfModule.default || html2pdfModule;
      const cleanVehicle = (passport.vehicleNumber || passport.vehicleModel || 'UTV')
        .replace(/[^a-zA-Z0-9_-]/g, '_');

      const opt = {
        margin: [8, 8, 8, 8] as [number, number, number, number],
        filename: `Passaporte_UTV_Cliente_${cleanVehicle}_${passport.currentKm}km.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#09090b' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('Erro ao gerar PDF do Passaporte UTV:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const statusBadge = getCarStatusBadge(passport.carStatus);

  return (
    <div className={`${isPublicStandalone ? 'min-h-screen bg-zinc-950 p-3 sm:p-8' : 'fixed inset-0 bg-black/95 z-[420] overflow-y-auto p-3 sm:p-6 backdrop-blur-xl'}`}>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Banner de Segurança quando o Cliente está logado na sessão travada */}
        {isClientLockedSession && (
          <div className="print-hidden bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 sm:px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
                <Lock size={16} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  ACESSO AUTENTICADO DO CLIENTE • AMBIENTE TRAVADO (SOMENTE LEITURA)
                </p>
                <p className="text-[11px] text-zinc-300 font-medium">
                  Logado como <strong className="text-white">{passport.customerName}</strong> — Você está visualizando exclusivamente o espelho oficial do seu UTV.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {clientPassportsList.length > 1 && onSelectClientPassport && (
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5">
                  <Car size={13} className="text-green-400 shrink-0" />
                  <select
                    value={passport.id}
                    onChange={(e) => {
                      const found = clientPassportsList.find(p => p.id === e.target.value);
                      if (found) onSelectClientPassport(found);
                    }}
                    className="bg-transparent text-[10px] font-black uppercase text-white outline-none cursor-pointer"
                  >
                    {clientPassportsList.map(p => (
                      <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                        {p.vehicleNumber ? `${p.vehicleNumber} • ` : ''}{p.vehicleModel}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {onLogoutClient && (
                <button
                  type="button"
                  onClick={onLogoutClient}
                  className="px-3.5 py-2 bg-red-500/15 hover:bg-red-500 hover:text-white text-red-400 border border-red-500/30 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shrink-0"
                >
                  <LogOut size={13} />
                  <span>Sair da Conta</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Barra Superior de Ações (Não sai na impressão) */}
        <div className="print-hidden bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 sticky top-2 z-30 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500/15 border border-green-500/30 rounded-xl text-green-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-green-400">
                  PASSAPORTE UTV — ESPELHO DO CLIENTE
                </span>
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[8px] font-black uppercase border border-zinc-700">
                  Somente Visualização • Tempo Real
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Acompanhamento transparente de telemetria de revisão, histórico de provas e próximas manutenções
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefreshRealtime && (
              <button
                type="button"
                onClick={handleRefresh}
                className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all active:scale-95 border border-zinc-700"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-green-400' : ''} />
                <span>{isRefreshing ? 'Atualizando...' : 'Atualizar Tempo Real'}</span>
              </button>
            )}

            {!isClientLockedSession && (
              <>
                <button
                  type="button"
                  onClick={handleCopyClientLink}
                  className="px-3.5 py-2.5 bg-blue-500/20 hover:bg-blue-500 hover:text-black text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all active:scale-95"
                  title="Copiar apenas a URL do link do espelho"
                >
                  {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
                  <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLinkWithCredentials}
                  className="px-3.5 py-2.5 bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-400 border border-amber-500/40 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all active:scale-95"
                  title="Copiar mensagem completa para WhatsApp com Link + Login e Senha do Cliente"
                >
                  {copiedCredentials ? <Check size={13} /> : <KeyRound size={13} />}
                  <span>{copiedCredentials ? 'Link + Login Copiados!' : 'Enviar Link + Login/Senha'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className="px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-glow transition-all active:scale-95 disabled:opacity-50"
            >
              <Download size={13} />
              <span>{isGeneratingPdf ? 'Gerando PDF...' : 'Extrair PDF Cliente'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2.5 bg-zinc-800 hover:bg-white hover:text-black text-zinc-300 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            {onClose && !isClientLockedSession && (
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 rounded-xl transition-colors"
                title="Fechar espelho"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Cartão de Credenciais do Cliente (Visível apenas para a Oficina para facilitar envio) */}
        {!isClientLockedSession && clientCredentials && (
          <div className="print-hidden bg-zinc-900/80 border border-amber-500/30 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl">
                <KeyRound size={16} />
              </div>
              <div className="text-xs">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                  CREDENCIAIS DE ACESSO DO CLIENTE AO ESPELHO (LOGIN TRAVADO)
                </span>
                {clientCredentials.username ? (
                  <p className="text-zinc-300 font-medium mt-0.5">
                    Login: <strong className="text-white font-mono bg-zinc-800 px-2 py-0.5 rounded">{clientCredentials.username}</strong>
                    <span className="mx-2 text-zinc-600">•</span>
                    Senha: <strong className="text-white font-mono bg-zinc-800 px-2 py-0.5 rounded">{clientCredentials.password || '•••'}</strong>
                  </p>
                ) : (
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Este cliente ainda não possui Login/Senha configurados. Acesse a aba <strong className="text-white">Clientes & Frota</strong> para definir o Login e Senha dele.
                  </p>
                )}
              </div>
            </div>
            {clientCredentials.username && (
              <button
                type="button"
                onClick={handleCopyLinkWithCredentials}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase rounded-lg transition-all shrink-0"
              >
                {copiedCredentials ? 'Copiado para WhatsApp!' : 'Copiar Convite c/ Login e Senha'}
              </button>
            )}
          </div>
        )}

        {/* DOCUMENTO OFICIAL DO PASSAPORTE UTV - CLIENTE */}
        <div
          id="utv-passport-client-printable"
          className="bg-zinc-950 border-2 border-zinc-800 rounded-3xl p-6 sm:p-10 space-y-8 shadow-2xl text-zinc-100"
        >
          {/* Cabeçalho Institucional + Status em Tempo Real */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-zinc-800">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1 bg-green-500 text-black font-black text-[10px] uppercase tracking-widest rounded-lg italic">
                  PASSAPORTE OFICIAL UTV
                </span>
                <span className="text-xs font-mono text-zinc-400 font-bold">
                  ID: {passport.qrCode}
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tighter text-white">
                {passport.vehicleNumber ? `${passport.vehicleNumber} • ` : ''}{passport.vehicleModel}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-bold uppercase">
                <span>👤 PILOTO / CLIENTE: <strong className="text-white">{passport.customerName}</strong></span>
                {passport.chassisOrPlate && (
                  <>
                    <span>•</span>
                    <span>🏷️ CHASSI/PLACA: <strong className="text-zinc-200 font-mono">{passport.chassisOrPlate}</strong></span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                {tenant.name} • {tenant.subtitle || 'Centro Técnico Especializado BRP & Preparação de Competição'}
              </p>
            </div>

            <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800">
              <div className="space-y-1.5 text-right">
                <span className="text-[8px] font-black uppercase text-zinc-500 block tracking-widest">
                  SITUAÇÃO EM TEMPO REAL
                </span>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase border ${statusBadge.color}`}>
                  <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                  <span>{statusBadge.label}</span>
                </div>
                <div className="pt-1">
                  <span className="text-[9px] text-zinc-400 font-mono block">
                    Hodômetro Atual: <strong className="text-green-400 text-sm font-black">{(Number(passport.currentKm) || 0).toLocaleString('pt-BR')} KM</strong>
                  </span>
                  <span className="text-[8px] text-zinc-500 block">
                    Atualizado em: {new Date(passport.updatedAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
              <div className="bg-white p-2 rounded-xl shrink-0">
                <img src={qrImageUrl} alt="QR Code Passaporte UTV" className="w-20 h-20 object-contain" />
              </div>
            </div>
          </div>

          {/* Cards de Resumo de Competição & Hodômetro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[9px] font-black uppercase tracking-wider">KM Atual do UTV</span>
                <Gauge size={16} className="text-green-400" />
              </div>
              <p className="text-2xl font-black font-mono text-white">
                {(Number(passport.currentKm) || 0).toLocaleString('pt-BR')} <span className="text-xs text-green-400">KM</span>
              </p>
              <span className="text-[9px] text-zinc-500 block">
                Registrado na última leitura técnica
              </span>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[9px] font-black uppercase tracking-wider">KM Total em Provas</span>
                <Award size={16} className="text-amber-400" />
              </div>
              <p className="text-2xl font-black font-mono text-amber-400">
                {totalCompetitionKm.toLocaleString('pt-BR')} <span className="text-xs">KM</span>
              </p>
              <span className="text-[9px] text-zinc-500 block">
                {completedRaces.length} prova(s) concluída(s) no histórico
              </span>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[9px] font-black uppercase tracking-wider">Última Prova Disputada</span>
                <CheckCircle2 size={16} className="text-blue-400" />
              </div>
              {lastRace ? (
                <>
                  <p className="text-xs font-black uppercase text-white truncate" title={lastRace.name}>
                    {lastRace.name}
                  </p>
                  <span className="text-[10px] font-mono text-blue-400 font-bold block">
                    {lastRace.distanceKm} KM • {formatSafeDate(lastRace.date)}
                  </span>
                </>
              ) : (
                <p className="text-xs text-zinc-500 italic pt-1">Nenhuma prova anterior registrada</p>
              )}
            </div>

            <div className="bg-gradient-to-br from-green-950/40 to-zinc-900 border border-green-500/40 p-4 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-green-400">
                <span className="text-[9px] font-black uppercase tracking-wider">Próxima Competição</span>
                <Flag size={16} />
              </div>
              {nextRace ? (
                <>
                  <p className="text-xs font-black uppercase text-white truncate" title={nextRace.name}>
                    {nextRace.name}
                  </p>
                  <span className="text-[10px] font-mono text-green-400 font-bold block">
                    Previsto: {nextRace.distanceKm} KM • {formatSafeDate(nextRace.date)}
                  </span>
                </>
              ) : (
                <p className="text-xs text-zinc-500 italic pt-1">A definir próxima etapa</p>
              )}
            </div>
          </div>

          {/* Relatório Técnico: O que foi feito na última manutenção & O que será feito para a próxima competição */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Wrench size={16} className="text-blue-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">
                    O Que Foi Feito na Última Manutenção
                  </h3>
                </div>
                {passport.lastMaintenanceDate && (
                  <span className="text-[9px] font-mono text-zinc-400 bg-black px-2.5 py-1 rounded-lg border border-zinc-800">
                    📅 {formatSafeDate(passport.lastMaintenanceDate)}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                {passport.lastMaintenanceSummary || 'Nenhum registro detalhado informado para a última manutenção.'}
              </p>
            </div>

            <div className="bg-zinc-900/90 border border-green-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-green-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-green-400">
                    Plano para a Próxima Competição / Manutenção Atual
                  </h3>
                </div>
                <span className="text-[9px] font-black uppercase text-green-400 bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20">
                  Checklist de Preparação
                </span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                {passport.nextCompetitionPlan || 'Aguardando definição do plano de revisão para a próxima etapa.'}
              </p>
            </div>
          </div>

          {/* Controle de Vida Útil por KM (Peças, Óleos e Fluidos) */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-wider text-white flex items-center gap-2">
                  <Gauge size={18} className="text-green-400" />
                  <span>Mapa de Vida Útil de Peças, Óleos e Fluidos por KM</span>
                </h3>
                <p className="text-[10px] text-zinc-400">
                  Cálculo automático de desgaste baseado no KM da última troca + limite preventivo estipulado pela engenharia da equipe
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                Referência de Cálculo: <strong className="text-white">{passport.currentKm} KM</strong>
              </span>
            </div>

            {(passport.maintenanceItems || []).length === 0 ? (
              <div className="p-8 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl text-center text-xs text-zinc-500 italic">
                Nenhum componente ou fluido vinculado ao controle de KM deste UTV até o momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {passport.maintenanceItems.map(item => {
                  const nextKm = (Number(item.lastChangeKm) || 0) + (Number(item.intervalKm) || 0);
                  const kmUsedSinceChange = Math.max(0, passport.currentKm - (Number(item.lastChangeKm) || 0));
                  const kmRemaining = nextKm - passport.currentKm;
                  const wearPercent = item.intervalKm > 0
                    ? Math.min(100, Math.max(0, Math.round((kmUsedSinceChange / item.intervalKm) * 100)))
                    : 100;

                  const isExpired = passport.currentKm >= nextKm;
                  const willExpireInNextRace = !isExpired && nextRace && (passport.currentKm + nextRace.distanceKm >= nextKm);
                  const isWarning = !isExpired && (kmRemaining <= Math.max(50, item.intervalKm * 0.15) || willExpireInNextRace);

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isExpired
                          ? 'bg-red-950/20 border-red-500/50'
                          : isWarning
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : 'bg-zinc-900/70 border-zinc-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-black border border-zinc-700 text-zinc-300">
                              {item.category === 'OLEO' ? '🛢️ ÓLEO' : item.category === 'FLUIDO' ? '💧 FLUIDO' : item.category === 'REVISAO' ? '🔧 REVISÃO' : '⚙️ PEÇA'}
                            </span>
                            <h4 className="text-xs sm:text-sm font-black uppercase text-white">
                              {item.name}
                            </h4>
                            {item.partNumber && (
                              <span className="text-[9px] font-mono text-zinc-400">
                                (PN: {item.partNumber})
                              </span>
                            )}
                            <span className="text-[9px] font-mono text-green-400 font-bold">
                              • Qtd: {item.requiredQty} {item.unit || 'un'}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="text-[10px] text-zinc-400 italic">{item.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isExpired ? (
                            <span className="px-3 py-1 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm">
                              <AlertTriangle size={12} />
                              <span>SUBSTITUIÇÃO NECESSÁRIA ({Math.abs(kmRemaining)} KM ACIMA DO LIMITE)</span>
                            </span>
                          ) : isWarning ? (
                            <span className="px-3 py-1 bg-amber-500 text-black rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5">
                              <Clock size={12} />
                              <span>
                                {willExpireInNextRace
                                  ? `TROCAR P/ PRÓXIMA PROVA (RESTAM ${kmRemaining} KM)`
                                  : `ATENÇÃO • RESTAM ${kmRemaining} KM`}
                              </span>
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5">
                              <CheckCircle2 size={12} />
                              <span>EM DIA • RESTAM {kmRemaining} KM</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Fórmula de KM e Barra de Vida Útil */}
                      <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center text-[10px] font-mono">
                        <div className="bg-black/60 px-3 py-1.5 rounded-xl border border-zinc-800/80">
                          <span className="text-zinc-500 block text-[8px] uppercase font-sans font-bold">Última Troca</span>
                          <strong className="text-zinc-200">{item.lastChangeKm} KM</strong>
                        </div>
                        <div className="bg-black/60 px-3 py-1.5 rounded-xl border border-zinc-800/80">
                          <span className="text-zinc-500 block text-[8px] uppercase font-sans font-bold">+ Intervalo Limite</span>
                          <strong className="text-blue-400">+ {item.intervalKm} KM</strong>
                        </div>
                        <div className="bg-black/60 px-3 py-1.5 rounded-xl border border-zinc-800/80">
                          <span className="text-zinc-500 block text-[8px] uppercase font-sans font-bold">= Próxima Troca</span>
                          <strong className={isExpired ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400'}>
                            {nextKm} KM
                          </strong>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-zinc-400 font-sans font-bold uppercase">Desgaste Atual</span>
                            <span className="font-bold text-white">{wearPercent}%</span>
                          </div>
                          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                isExpired ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${wearPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Histórico e Calendário de Competições do UTV */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-black uppercase italic tracking-wider text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Flag size={17} className="text-amber-400" />
              <span>Histórico e Calendário de Competições Vinculadas ({passport.competitions?.length || 0})</span>
            </h3>

            {(passport.competitions || []).length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Nenhuma competição ou etapa vinculada a este UTV.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {passport.competitions.map(comp => (
                  <div
                    key={comp.id}
                    className={`p-4 rounded-2xl border ${
                      comp.status === 'UPCOMING' || comp.status === 'IN_PREP'
                        ? 'bg-green-950/15 border-green-500/40'
                        : 'bg-zinc-900/60 border-zinc-800'
                    } space-y-1.5`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                        comp.status === 'COMPLETED'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-green-500 text-black'
                      }`}>
                        {comp.status === 'COMPLETED' ? '🏁 PROVA DISPUTADA' : '🚀 PRÓXIMA COMPETIÇÃO'}
                      </span>
                      <span className="text-xs font-mono font-black text-amber-400">
                        {comp.distanceKm} KM
                      </span>
                    </div>
                    <h4 className="text-xs font-black uppercase text-white">{comp.name}</h4>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {formatSafeDate(comp.date)}
                      </span>
                      {comp.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />
                          {comp.location}
                        </span>
                      )}
                    </div>
                    {comp.resultOrNotes && (
                      <p className="text-[10px] text-zinc-300 pt-1 border-t border-zinc-800/70">
                        {comp.resultOrNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rodapé de Autenticidade */}
          <div className="pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[9px] text-zinc-500 font-bold uppercase">
            <div>
              <span>DOCUMENTO OFICIAL DE TELEMETRIA E MANUTENÇÃO PREVENTIVA • {tenant.name}</span>
            </div>
            <div className="font-mono text-zinc-400">
              QR CODE EXCLUSIVO DO VEÍCULO: {passport.qrCode}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UTVPassportClientMirror;
