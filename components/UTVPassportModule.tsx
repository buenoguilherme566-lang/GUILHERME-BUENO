import React, { useState, useMemo } from 'react';
import {
  UTVPassport, UTVMaintenanceItem, UTVCompetition, UTVTriageRequest,
  InventoryItem, Client, User, UserRole, Tenant
} from '../types';
import UTVPassportClientMirror, { getCarStatusBadge } from './UTVPassportClientMirror';
import {
  Flag, Gauge, QrCode, Wrench, Plus, Trash2, Edit3, CheckCircle2,
  AlertTriangle, ShieldAlert, Lock, Unlock, Calendar, Package,
  Search, Printer, Share2, Eye, ArrowRight, Sparkles, Clock,
  Award, MapPin, X, Check, BellRing, FileText, RefreshCw
} from 'lucide-react';

interface UTVPassportModuleProps {
  passports: UTVPassport[];
  items: InventoryItem[];
  clients: Client[];
  currentUser: User | null;
  currentTenant: Tenant;
  onSavePassport: (passport: UTVPassport) => Promise<void>;
  onDeletePassport: (id: string) => Promise<void>;
  onApproveTriageAndCreateOS: (passport: UTVPassport, triage: UTVTriageRequest) => Promise<void>;
  onOpenScannerForPassport: () => void;
  selectedPassport: UTVPassport | null;
  setSelectedPassport: (p: UTVPassport | null) => void;
  showAlert: (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
}

const generateUniquePassportQR = (vehicleNum?: string) => {
  const cleanNum = (vehicleNum || 'UTV').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  const timePart = Date.now().toString(36).slice(-3).toUpperCase();
  return `UTV-PASS-${cleanNum}-${randomPart}${timePart}`;
};

const formatSafeDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const parsed = dateStr.includes('T') ? new Date(dateStr) : new Date(`${dateStr}T12:00:00`);
  return isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString('pt-BR');
};

export const UTVPassportModule: React.FC<UTVPassportModuleProps> = ({
  passports,
  items,
  clients,
  currentUser,
  currentTenant,
  onSavePassport,
  onDeletePassport,
  onApproveTriageAndCreateOS,
  onOpenScannerForPassport,
  selectedPassport,
  setSelectedPassport,
  showAlert
}) => {
  const isAdmin = currentUser?.role === UserRole.STOCKIST || currentUser?.username === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingPassport, setEditingPassport] = useState<UTVPassport | null>(null);
  const [clientMirrorPassport, setClientMirrorPassport] = useState<UTVPassport | null>(null);
  const [qrLabelPassport, setQrLabelPassport] = useState<UTVPassport | null>(null);

  // Estado da Triagem do Mecânico dentro do Passaporte aberto
  const [triageKmInput, setTriageKmInput] = useState<number>(0);
  const [triageDateInput, setTriageDateInput] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [triageNotesInput, setTriageNotesInput] = useState<string>('');

  // Estado do Formulário de Criação/Edição do Passaporte (Exclusivo Admin)
  const [formState, setFormState] = useState<{
    vehicleNumber: string;
    vehicleModel: string;
    chassisOrPlate: string;
    clientId: string;
    vehicleId: string;
    customerName: string;
    currentKm: number;
    lastMaintenanceSummary: string;
    lastMaintenanceDate: string;
    nextCompetitionPlan: string;
    carStatus: UTVPassport['carStatus'];
    qrCode: string;
    maintenanceItems: UTVMaintenanceItem[];
    competitions: UTVCompetition[];
  }>({
    vehicleNumber: '',
    vehicleModel: '',
    chassisOrPlate: '',
    clientId: '',
    vehicleId: '',
    customerName: '',
    currentKm: 0,
    lastMaintenanceSummary: '',
    lastMaintenanceDate: new Date().toISOString().split('T')[0],
    nextCompetitionPlan: '',
    carStatus: 'READY',
    qrCode: '',
    maintenanceItems: [],
    competitions: []
  });

  // Sub-formulário de adição de Peça/Óleo/Fluido no cadastro do Passaporte
  const [newMaintItem, setNewMaintItem] = useState<{
    itemId: string;
    name: string;
    partNumber: string;
    category: UTVMaintenanceItem['category'];
    requiredQty: number;
    unit: string;
    lastChangeKm: number;
    intervalKm: number;
    notes: string;
  }>({
    itemId: '',
    name: '',
    partNumber: '',
    category: 'PECA',
    requiredQty: 1,
    unit: 'un',
    lastChangeKm: 0,
    intervalKm: 500,
    notes: ''
  });
  const [partSearchInForm, setPartSearchInForm] = useState('');

  // Sub-formulário de adição de Competição/Prova no cadastro do Passaporte
  const [newComp, setNewComp] = useState<{
    name: string;
    date: string;
    distanceKm: number;
    status: UTVCompetition['status'];
    location: string;
    resultOrNotes: string;
  }>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    distanceKm: 500,
    status: 'UPCOMING',
    location: '',
    resultOrNotes: ''
  });

  // Sincroniza KM de triagem ao abrir um passaporte
  const handleOpenPassportDetail = (p: UTVPassport) => {
    setSelectedPassport(p);
    setTriageKmInput(p.currentKm || 0);
    setTriageDateInput(new Date().toISOString().split('T')[0]);
    setTriageNotesInput('');
  };

  // Verifica disponibilidade em estoque para um item de manutenção do passaporte
  const checkItemStock = (maintItem: UTVMaintenanceItem) => {
    const matched = items.find(
      i =>
        (maintItem.itemId && i.id === maintItem.itemId) ||
        (maintItem.partNumber && i.partNumber && i.partNumber.trim().toLowerCase() === maintItem.partNumber.trim().toLowerCase()) ||
        (i.name.trim().toLowerCase() === maintItem.name.trim().toLowerCase())
    );
    if (!matched) {
      return {
        foundInCatalog: false,
        availableQty: 0,
        unit: maintItem.unit || 'un',
        hasEnoughStock: false,
        itemRecord: null
      };
    }
    const availableQty = Number(matched.quantity) || 0;
    const reqQty = Number(maintItem.requiredQty) || 1;
    return {
      foundInCatalog: true,
      availableQty,
      unit: matched.unit || maintItem.unit || 'un',
      hasEnoughStock: availableQty >= reqQty,
      itemRecord: matched
    };
  };

  // Passaportes com Triagem Pendente de Aprovação pelo Chefe de Oficina
  const pendingTriages = useMemo(() => {
    return passports.filter(p => p.activeTriage && p.activeTriage.status === 'PENDING_APPROVAL');
  }, [passports]);

  const filteredPassports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return passports;
    return passports.filter(
      p =>
        (p.vehicleModel || '').toLowerCase().includes(q) ||
        (p.vehicleNumber || '').toLowerCase().includes(q) ||
        (p.customerName || '').toLowerCase().includes(q) ||
        (p.qrCode || '').toLowerCase().includes(q) ||
        (p.chassisOrPlate || '').toLowerCase().includes(q)
    );
  }, [passports, searchTerm]);

  // Abrir modal para Criar Novo Passaporte UTV (Somente Admin)
  const handleStartCreatePassport = () => {
    if (!isAdmin) {
      showAlert('Acesso Restrito', 'Somente Administradores / Chefes de Oficina podem criar ou alterar configurações de Passaportes UTV.', 'error');
      return;
    }
    setEditingPassport(null);
    setFormState({
      vehicleNumber: '#101',
      vehicleModel: '',
      chassisOrPlate: '',
      clientId: '',
      vehicleId: '',
      customerName: '',
      currentKm: 0,
      lastMaintenanceSummary: '',
      lastMaintenanceDate: new Date().toISOString().split('T')[0],
      nextCompetitionPlan: '',
      carStatus: 'READY',
      qrCode: generateUniquePassportQR('101'),
      maintenanceItems: [],
      competitions: []
    });
    setIsFormModalOpen(true);
  };

  // Abrir modal para Editar Passaporte UTV existente (Somente Admin)
  const handleStartEditPassport = (p: UTVPassport) => {
    if (!isAdmin) {
      showAlert('Acesso Restrito', 'O campo de alteração e cálculo de KM é travado para Administradores.', 'error');
      return;
    }
    setEditingPassport(p);
    setFormState({
      vehicleNumber: p.vehicleNumber || '',
      vehicleModel: p.vehicleModel || '',
      chassisOrPlate: p.chassisOrPlate || '',
      clientId: p.clientId || '',
      vehicleId: p.vehicleId || '',
      customerName: p.customerName || '',
      currentKm: p.currentKm || 0,
      lastMaintenanceSummary: p.lastMaintenanceSummary || '',
      lastMaintenanceDate: p.lastMaintenanceDate
        ? (p.lastMaintenanceDate.includes('T') ? p.lastMaintenanceDate.split('T')[0] : p.lastMaintenanceDate)
        : new Date().toISOString().split('T')[0],
      nextCompetitionPlan: p.nextCompetitionPlan || '',
      carStatus: p.carStatus || 'READY',
      qrCode: p.qrCode || generateUniquePassportQR(p.vehicleNumber),
      maintenanceItems: [...(p.maintenanceItems || [])],
      competitions: [...(p.competitions || [])]
    });
    setIsFormModalOpen(true);
  };

  const handleAddMaintItemToForm = () => {
    if (!newMaintItem.name.trim()) {
      showAlert('Aviso', 'Selecione uma peça/fluido do estoque ou informe o nome do componente.', 'info');
      return;
    }
    const lastKm = Number(newMaintItem.lastChangeKm) || 0;
    const interval = Number(newMaintItem.intervalKm) || 0;
    if (interval <= 0) {
      showAlert('Aviso', 'Informe o intervalo de KM para a próxima troca (ex: 500 km ou 1000 km).', 'info');
      return;
    }
    const itemToAdd: UTVMaintenanceItem = {
      id: 'pm_' + Math.random().toString(36).substring(2, 9),
      itemId: newMaintItem.itemId || undefined,
      name: newMaintItem.name.trim(),
      partNumber: newMaintItem.partNumber.trim() || undefined,
      category: newMaintItem.category,
      requiredQty: Number(newMaintItem.requiredQty) || 1,
      unit: newMaintItem.unit || 'un',
      lastChangeKm: lastKm,
      intervalKm: interval,
      nextChangeKm: lastKm + interval,
      lastChangeDate: new Date().toISOString().split('T')[0],
      notes: newMaintItem.notes.trim() || undefined
    };

    setFormState(prev => ({
      ...prev,
      maintenanceItems: [...prev.maintenanceItems, itemToAdd]
    }));

    setNewMaintItem({
      itemId: '',
      name: '',
      partNumber: '',
      category: 'PECA',
      requiredQty: 1,
      unit: 'un',
      lastChangeKm: formState.currentKm || 0,
      intervalKm: 500,
      notes: ''
    });
    setPartSearchInForm('');
  };

  const handleUpdateMaintItemInForm = (id: string, field: 'lastChangeKm' | 'intervalKm' | 'requiredQty', value: number) => {
    setFormState(prev => ({
      ...prev,
      maintenanceItems: prev.maintenanceItems.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        updated.nextChangeKm = (Number(updated.lastChangeKm) || 0) + (Number(updated.intervalKm) || 0);
        return updated;
      })
    }));
  };

  const handleAddCompetitionToForm = () => {
    if (!newComp.name.trim()) {
      showAlert('Aviso', 'Informe o nome da competição ou etapa.', 'info');
      return;
    }
    const compToAdd: UTVCompetition = {
      id: 'comp_' + Math.random().toString(36).substring(2, 9),
      name: newComp.name.trim(),
      date: newComp.date || new Date().toISOString().split('T')[0],
      distanceKm: Number(newComp.distanceKm) || 0,
      status: newComp.status,
      location: newComp.location.trim() || undefined,
      resultOrNotes: newComp.resultOrNotes.trim() || undefined
    };
    setFormState(prev => ({
      ...prev,
      competitions: [...prev.competitions, compToAdd]
    }));
    setNewComp({
      name: '',
      date: new Date().toISOString().split('T')[0],
      distanceKm: 500,
      status: 'UPCOMING',
      location: '',
      resultOrNotes: ''
    });
  };

  const handleSavePassportForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!formState.vehicleModel.trim() || !formState.customerName.trim()) {
      showAlert('Campos Obrigatórios', 'Preencha o Modelo do UTV e o Nome do Cliente/Piloto.', 'error');
      return;
    }

    const now = new Date().toISOString();
    const passportToSave: UTVPassport = {
      id: editingPassport ? editingPassport.id : 'passport_' + Math.random().toString(36).substring(2, 9),
      qrCode: formState.qrCode || generateUniquePassportQR(formState.vehicleNumber),
      vehicleNumber: formState.vehicleNumber.trim() || undefined,
      vehicleModel: formState.vehicleModel.trim(),
      chassisOrPlate: formState.chassisOrPlate.trim() || undefined,
      clientId: formState.clientId || undefined,
      vehicleId: formState.vehicleId || undefined,
      customerName: formState.customerName.trim(),
      currentKm: Number(formState.currentKm) || 0,
      lastMaintenanceSummary: formState.lastMaintenanceSummary.trim(),
      lastMaintenanceDate: formState.lastMaintenanceDate || undefined,
      nextCompetitionPlan: formState.nextCompetitionPlan.trim(),
      carStatus: formState.carStatus,
      maintenanceItems: formState.maintenanceItems.map(m => ({
        ...m,
        nextChangeKm: (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0)
      })),
      competitions: formState.competitions,
      triageHistory: editingPassport?.triageHistory || [],
      activeTriage: editingPassport?.activeTriage || null,
      createdAt: editingPassport ? editingPassport.createdAt : now,
      updatedAt: now,
      tenantId: currentTenant.id
    };

    await onSavePassport(passportToSave);
    setIsFormModalOpen(false);
    if (selectedPassport?.id === passportToSave.id) {
      setSelectedPassport(passportToSave);
      setTriageKmInput(passportToSave.currentKm);
    }
  };

  // Ação do Mecânico: Registrar KM Atual + Data da Manutenção e Pedir Liberação ao Chefe de Equipe
  const handleMechanicSubmitTriage = async () => {
    if (!selectedPassport) return;
    const reportedKm = Number(triageKmInput);
    if (isNaN(reportedKm) || reportedKm < 0) {
      showAlert('KM Inválido', 'Informe o KM atual válido do UTV.', 'error');
      return;
    }

    // Identifica quais peças/fluidos atingiram o KM de troca e quais estão sem estoque
    const criticalItems: string[] = [];
    const missingStockItems: string[] = [];

    (selectedPassport.maintenanceItems || []).forEach(m => {
      const nextKm = (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0);
      const isDue = reportedKm >= nextKm || (nextKm - reportedKm <= Math.max(50, m.intervalKm * 0.15));
      if (isDue) {
        criticalItems.push(`${m.name} (Limite: ${nextKm} KM | Atual: ${reportedKm} KM)`);
        const st = checkItemStock(m);
        if (!st.hasEnoughStock) {
          missingStockItems.push(`${m.name} (Disp: ${st.availableQty} ${st.unit} / Nec: ${m.requiredQty} ${st.unit})`);
        }
      }
    });

    const newTriage: UTVTriageRequest = {
      id: 'triage_' + Math.random().toString(36).substring(2, 9),
      mechanicId: currentUser?.id || 'mech',
      mechanicName: currentUser?.name || 'Mecânico Responsável',
      reportedKm,
      maintenanceDate: triageDateInput || new Date().toISOString().split('T')[0],
      notes: triageNotesInput.trim() || undefined,
      status: 'PENDING_APPROVAL',
      createdAt: new Date().toISOString(),
      criticalItemsSnapshot: criticalItems,
      missingStockSnapshot: missingStockItems
    };

    const updatedPassport: UTVPassport = {
      ...selectedPassport,
      currentKm: reportedKm,
      carStatus: missingStockItems.length > 0 ? 'AWAITING_PARTS' : 'IN_TRIAGE',
      activeTriage: newTriage,
      triageHistory: [newTriage, ...(selectedPassport.triageHistory || [])],
      updatedAt: new Date().toISOString()
    };

    await onSavePassport(updatedPassport);
    setSelectedPassport(updatedPassport);
    showAlert(
      'Triagem Enviada ao Chefe de Oficina!',
      `KM atual (${reportedKm} KM) registrado! O Administrador / Chefe de Equipe foi notificado que ${currentUser?.name || 'o mecânico'} iniciou a triagem do UTV ${selectedPassport.vehicleNumber || selectedPassport.vehicleModel} e aguarda liberação da O.S.`,
      'success'
    );
  };

  // Ação do Admin: Confirmar que uma peça do passaporte foi trocada agora (reseta lastChangeKm = currentKm)
  const handleAdminResetPartKm = async (passport: UTVPassport, itemId: string) => {
    if (!isAdmin) return;
    const updatedItems = passport.maintenanceItems.map(m => {
      if (m.id !== itemId) return m;
      const newLastKm = passport.currentKm;
      return {
        ...m,
        lastChangeKm: newLastKm,
        nextChangeKm: newLastKm + (Number(m.intervalKm) || 0),
        lastChangeDate: new Date().toISOString().split('T')[0]
      };
    });
    const updatedPassport: UTVPassport = {
      ...passport,
      maintenanceItems: updatedItems,
      updatedAt: new Date().toISOString()
    };
    await onSavePassport(updatedPassport);
    setSelectedPassport(updatedPassport);
    showAlert('Troca Registrada no Passaporte', `O KM da última troca foi atualizado para ${passport.currentKm} KM e o próximo limite foi recalculado automaticamente!`, 'success');
  };

  // Ação do Admin: Apenas aprovar início da manutenção sem criar nova OS
  const handleApproveTriageOnly = async (passport: UTVPassport) => {
    if (!isAdmin || !passport.activeTriage) return;
    const approvedTriage: UTVTriageRequest = {
      ...passport.activeTriage,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvedBy: currentUser?.name || 'Chefe de Oficina'
    };
    const updatedPassport: UTVPassport = {
      ...passport,
      carStatus: 'IN_MAINTENANCE',
      activeTriage: approvedTriage,
      triageHistory: (passport.triageHistory || []).map(t => t.id === approvedTriage.id ? approvedTriage : t),
      updatedAt: new Date().toISOString()
    };
    await onSavePassport(updatedPassport);
    if (selectedPassport?.id === passport.id) {
      setSelectedPassport(updatedPassport);
    }
    showAlert('Manutenção Liberada!', `Início de manutenção autorizado para o mecânico ${approvedTriage.mechanicName} no UTV ${passport.vehicleNumber || passport.vehicleModel}.`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* 1. BANNER DE ALERTAS DE TRIAGEM INICIADA PELOS MECÂNICOS (Destaque para o Chefe de Oficina / Admin) */}
      {pendingTriages.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/60 via-zinc-900 to-zinc-950 border-2 border-amber-500 rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.2)] animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500 text-black rounded-2xl animate-bounce">
                <BellRing size={22} />
              </div>
              <div>
                <span className="px-2.5 py-0.5 bg-amber-500 text-black font-black text-[9px] uppercase rounded-md tracking-wider">
                  ⚠️ AVISO AO CHEFE DE OFICINA / ADMINISTRADOR ({pendingTriages.length})
                </span>
                <h3 className="text-base sm:text-lg font-black uppercase italic text-white mt-0.5">
                  Mecânico Aguardando Liberação para Iniciar Manutenção & Abertura de O.S.
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {pendingTriages.map(p => {
              const triage = p.activeTriage!;
              return (
                <div key={p.id} className="bg-black/80 border border-amber-500/40 rounded-2xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase text-amber-400">
                        👷 MECÂNICO: {triage.mechanicName}
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-xs font-black uppercase text-white">
                        🏁 VEÍCULO: {p.vehicleNumber ? `${p.vehicleNumber} - ` : ''}{p.vehicleModel} (Cliente: {p.customerName})
                      </span>
                      <span className="px-2.5 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-[10px] font-mono font-black">
                        KM Lido na Triagem: {triage.reportedKm} KM
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        📅 Data: {formatSafeDate(triage.maintenanceDate)}
                      </span>
                    </div>

                    {triage.notes && (
                      <p className="text-xs text-zinc-300 italic">
                        💬 Relato do Mecânico: "{triage.notes}"
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {(triage.criticalItemsSnapshot || []).length > 0 && (
                        <span className="px-2.5 py-1 bg-red-500/15 border border-red-500/30 text-red-400 rounded-lg text-[9px] font-black uppercase">
                          🔧 {triage.criticalItemsSnapshot!.length} item(ns) atingiram o KM de troca
                        </span>
                      )}
                      {(triage.missingStockSnapshot || []).length > 0 && (
                        <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-[9px] font-black uppercase">
                          🚨 {triage.missingStockSnapshot!.length} peça(s) SEM SALDO EM ESTOQUE (Providenciar!)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenPassportDetail(p)}
                      className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-[9px] font-black uppercase transition-all"
                    >
                      Ver Triagem Completa
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApproveTriageOnly(p)}
                          className="px-3.5 py-2.5 bg-blue-500/20 hover:bg-blue-500 hover:text-black text-blue-400 border border-blue-500/30 rounded-xl text-[9px] font-black uppercase transition-all"
                        >
                          ✅ Autorizar Manutenção
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveTriageAndCreateOS(p, triage)}
                          className="px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[9px] font-black uppercase shadow-glow transition-all flex items-center gap-1.5"
                        >
                          <Check size={14} />
                          <span>Aprovar & Abrir O.S. Automaticamente</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. BARRA DE CONTROLE DO PASSAPORTE UTV (Leitor QR Code, Pesquisa e Criação) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 bg-green-500 text-black font-black text-[9px] uppercase rounded-lg tracking-wider">
              🏁 TELEMETRIA & TRIAGEM DE OFICINA
            </span>
            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border ${
              isAdmin
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}>
              {isAdmin ? <Unlock size={11} /> : <Lock size={11} />}
              <span>{isAdmin ? 'Acesso Administrador (Edição de KMs Liberada)' : 'Acesso Mecânico (Cálculo Travado • Leitura & KM Atual)'}</span>
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-white">
            Passaporte UTV — Controle de Competições, Peças & KM Limite
          </h3>
          <p className="text-[11px] text-zinc-400">
            Leia o QR Code individual do UTV para abrir sua ficha de provas, verificar peças em estoque e calcular trocas pelo KM atual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenScannerForPassport}
            className="px-5 py-3.5 bg-zinc-950 hover:bg-zinc-800 text-green-400 border-2 border-green-500/50 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 shadow-lg"
          >
            <QrCode size={18} />
            <span>Ler QR Code do UTV</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleStartCreatePassport}
              className="px-6 py-3.5 bg-green-500 hover:bg-green-400 text-black rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-glow transition-all active:scale-95"
            >
              <Plus size={16} />
              <span>Novo Passaporte UTV</span>
            </button>
          )}
        </div>
      </div>

      {/* Campo de Busca Rápida de Passaportes */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="PESQUISAR PASSAPORTE POR NUMERAL (#104), MODELO DO UTV, PILOTO/CLIENTE OU QR CODE..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 pl-12 pr-10 py-3.5 rounded-2xl text-white font-bold text-xs uppercase outline-none focus:border-green-500 transition-colors"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* 3. GRID DE PASSAPORTES UTV CADASTRADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPassports.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-zinc-900/40 border-2 border-dashed border-zinc-800 rounded-3xl space-y-3">
            <Flag size={36} className="mx-auto text-zinc-700" />
            <p className="text-xs font-black uppercase text-zinc-500 italic">
              Nenhum Passaporte UTV encontrado
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={handleStartCreatePassport}
                className="px-5 py-2.5 bg-green-500 text-black rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-2"
              >
                <Plus size={14} /> Criar Primeiro Passaporte UTV
              </button>
            )}
          </div>
        ) : (
          filteredPassports.map(p => {
            const badge = getCarStatusBadge(p.carStatus);
            const completedRaces = (p.competitions || []).filter(c => c.status === 'COMPLETED');
            const upcomingRace = (p.competitions || []).find(c => c.status === 'UPCOMING' || c.status === 'IN_PREP');
            const totalRaceKm = completedRaces.reduce((acc, c) => acc + (Number(c.distanceKm) || 0), 0);

            // Contabiliza itens vencidos e sem estoque
            let expiredCount = 0;
            let missingStockCount = 0;
            (p.maintenanceItems || []).forEach(m => {
              const nextKm = (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0);
              if (p.currentKm >= nextKm) {
                expiredCount++;
              }
              const st = checkItemStock(m);
              if (!st.hasEnoughStock && p.currentKm >= nextKm - 100) {
                missingStockCount++;
              }
            });

            return (
              <div
                key={p.id}
                onClick={() => handleOpenPassportDetail(p)}
                className="bg-zinc-900 border border-zinc-800 hover:border-green-500/40 rounded-3xl p-6 space-y-5 shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${badge.color}`}>
                      {badge.label}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-zinc-400 bg-black px-2.5 py-1 rounded-lg border border-zinc-800">
                      {p.qrCode}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      {p.vehicleNumber && (
                        <span className="px-2.5 py-0.5 bg-green-500 text-black font-black text-xs rounded-lg italic">
                          {p.vehicleNumber}
                        </span>
                      )}
                      <h4 className="text-lg font-black uppercase italic text-white leading-tight truncate">
                        {p.vehicleModel}
                      </h4>
                    </div>
                    <p className="text-[11px] font-bold uppercase text-zinc-400 mt-1">
                      👤 Piloto/Cliente: <span className="text-white">{p.customerName}</span>
                    </p>
                  </div>

                  {/* Resumo de Hodômetro e Provas */}
                  <div className="grid grid-cols-2 gap-2.5 bg-black/60 p-3.5 rounded-2xl border border-zinc-800/80">
                    <div>
                      <span className="text-[8px] font-black uppercase text-zinc-500 block">KM Atual do UTV</span>
                      <span className="text-base font-black font-mono text-green-400">
                        {p.currentKm.toLocaleString('pt-BR')} KM
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] font-black uppercase text-zinc-500 block">KM Total Provas</span>
                      <span className="text-base font-black font-mono text-amber-400">
                        {totalRaceKm.toLocaleString('pt-BR')} KM
                      </span>
                    </div>
                  </div>

                  {upcomingRace && (
                    <div className="p-3 bg-green-950/20 border border-green-500/30 rounded-xl space-y-0.5">
                      <span className="text-[8px] font-black uppercase text-green-400 flex items-center gap-1">
                        <Flag size={10} /> Próxima Competição:
                      </span>
                      <p className="text-[11px] font-black uppercase text-white truncate">
                        {upcomingRace.name} ({upcomingRace.distanceKm} KM)
                      </p>
                    </div>
                  )}

                  {/* Alertas rápidos de peças vencidas / estoque */}
                  <div className="flex flex-wrap gap-1.5">
                    {expiredCount > 0 ? (
                      <span className="px-2.5 py-1 bg-red-500/15 border border-red-500/30 text-red-400 rounded-lg text-[9px] font-black uppercase">
                        🔴 {expiredCount} Troca(s) Vencida(s) por KM
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-[9px] font-black uppercase">
                        🟢 Revisões de KM em dia
                      </span>
                    )}

                    {missingStockCount > 0 && (
                      <span className="px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-lg text-[9px] font-black uppercase">
                        ⚠️ {missingStockCount} Peça(s) Sem Estoque
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões de Ação do Card */}
                <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setClientMirrorPassport(p);
                      }}
                      className="px-3 py-2 bg-blue-500/15 hover:bg-blue-500 hover:text-black text-blue-400 border border-blue-500/30 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all"
                      title="Abrir Espelho PASSAPORTE UTV - CLIENTE (PDF / Link Tempo Real)"
                    >
                      <Eye size={12} />
                      <span>Espelho Cliente</span>
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setQrLabelPassport(p);
                      }}
                      className="px-3 py-2 bg-zinc-800 hover:bg-white hover:text-black text-zinc-300 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all"
                      title="Exibir e Imprimir QR Code Individual deste UTV"
                    >
                      <QrCode size={12} />
                      <span>QR Code</span>
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleStartEditPassport(p);
                        }}
                        className="p-2 bg-zinc-800 hover:bg-green-500 hover:text-black text-zinc-300 rounded-xl transition-all"
                        title="Editar Passaporte e Limites de KM"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onDeletePassport(p.id);
                        }}
                        className="p-2 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 rounded-xl transition-all"
                        title="Excluir Passaporte"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. MODAL DETALHADO DO PASSAPORTE UTV (ABERTO AO LER O QR CODE OU CLICAR NO CARD) */}
      {selectedPassport && (
        <div className="fixed inset-0 bg-black/95 z-[380] overflow-y-auto p-3 sm:p-6 backdrop-blur-xl animate-in fade-in">
          <div className="max-w-5xl mx-auto bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl my-4">
            {/* Topo do Passaporte Aberto */}
            <div className="p-5 sm:p-7 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 bg-green-500 text-black font-black text-[9px] uppercase rounded-lg">
                    🏁 PASSAPORTE DO UTV
                  </span>
                  <span className="text-xs font-mono font-bold text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                    QR: {selectedPassport.qrCode}
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${getCarStatusBadge(selectedPassport.carStatus).color}`}>
                    {getCarStatusBadge(selectedPassport.carStatus).label}
                  </span>
                </div>
                <h2 className="text-xl sm:text-3xl font-black uppercase italic text-white tracking-tighter">
                  {selectedPassport.vehicleNumber ? `${selectedPassport.vehicleNumber} • ` : ''}{selectedPassport.vehicleModel}
                </h2>
                <p className="text-xs font-bold uppercase text-zinc-400">
                  Piloto / Cliente: <strong className="text-white">{selectedPassport.customerName}</strong>
                  {selectedPassport.chassisOrPlate ? ` • Chassi/Placa: ${selectedPassport.chassisOrPlate}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setClientMirrorPassport(selectedPassport)}
                  className="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-black font-black text-[10px] uppercase rounded-xl flex items-center gap-1.5 shadow-lg transition-all"
                >
                  <Eye size={14} />
                  <span>Passaporte UTV - Cliente (PDF / Link)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQrLabelPassport(selectedPassport)}
                  className="px-3.5 py-2.5 bg-zinc-800 hover:bg-white hover:text-black text-zinc-200 font-black text-[10px] uppercase rounded-xl flex items-center gap-1.5 transition-all"
                >
                  <QrCode size={14} />
                  <span>Etiqueta QR</span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleStartEditPassport(selectedPassport)}
                    className="px-3.5 py-2.5 bg-green-500/20 hover:bg-green-500 hover:text-black text-green-400 border border-green-500/40 font-black text-[10px] uppercase rounded-xl flex items-center gap-1.5 transition-all"
                  >
                    <Edit3 size={14} />
                    <span>Configurar KMs / Editar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedPassport(null)}
                  className="p-2.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-8 space-y-8">
              {/* PAINEL DE TRIAGEM DO MECÂNICO (PREENCHER KM ATUAL + DATA E PEDIR LIBERAÇÃO AO CHEFE DE EQUIPE) */}
              <div className="bg-gradient-to-r from-green-950/40 via-zinc-950 to-zinc-950 border-2 border-green-500/60 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-green-500 text-black font-black text-[9px] uppercase rounded-md">
                        🛠️ TRIAGEM DE CHEGADA NA OFICINA
                      </span>
                      {!isAdmin && (
                        <span className="px-2.5 py-0.5 bg-zinc-800 text-amber-400 border border-amber-500/30 font-black text-[9px] uppercase rounded-md flex items-center gap-1">
                          <Lock size={10} /> Regras de Cálculo Travadas para Administrador
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-black uppercase italic text-white">
                      Informe o KM Atual do UTV para Calcular Manutenções e Pedir Liberação
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Ao digitar o KM atual abaixo, o sistema cruza automaticamente com os limites configurados e verifica o estoque de cada peça.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-green-400 tracking-wider block">
                      1. KM Atual do UTV (Hodômetro) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={triageKmInput}
                        onChange={e => setTriageKmInput(parseFloat(e.target.value) || 0)}
                        className="w-full bg-black border-2 border-green-500/60 p-3.5 pr-12 rounded-2xl text-white font-mono font-black text-base outline-none focus:border-green-400"
                        placeholder="Ex: 1520"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-black text-green-400">
                        KM
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-zinc-300 tracking-wider block">
                      2. Data da Manutenção / Triagem *
                    </label>
                    <input
                      type="date"
                      value={triageDateInput}
                      onChange={e => setTriageDateInput(e.target.value)}
                      className="w-full bg-black border border-zinc-700 p-3.5 rounded-2xl text-white font-mono font-bold text-xs outline-none focus:border-green-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-zinc-300 tracking-wider block">
                      3. Observações da Triagem (Opcional)
                    </label>
                    <input
                      type="text"
                      value={triageNotesInput}
                      onChange={e => setTriageNotesInput(e.target.value)}
                      placeholder="Ex: Folga na balança, ruído no CVT..."
                      className="w-full bg-black border border-zinc-700 p-3.5 rounded-2xl text-white font-bold text-xs outline-none focus:border-green-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="text-[10px] text-zinc-400">
                    Responsável pela leitura: <strong className="text-white uppercase">{currentUser?.name || 'Mecânico'}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleMechanicSubmitTriage}
                    className="px-6 py-4 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-xs rounded-2xl shadow-glow transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <BellRing size={16} />
                    <span>Atualizar KM Atual & Pedir Liberação ao Chefe de Equipe</span>
                  </button>
                </div>
              </div>

              {/* RESUMO DE COMPETIÇÕES E ÚLTIMAS MANUTENÇÕES */}
              {(() => {
                const completedRaces = (selectedPassport.competitions || [])
                  .filter(c => c.status === 'COMPLETED')
                  .sort((a, b) => b.date.localeCompare(a.date));
                const upcomingRaces = (selectedPassport.competitions || [])
                  .filter(c => c.status === 'UPCOMING' || c.status === 'IN_PREP')
                  .sort((a, b) => a.date.localeCompare(b.date));
                const lastRace = completedRaces[0] || null;
                const nextRace = upcomingRaces[0] || null;
                const totalKmProvas = completedRaces.reduce((acc, c) => acc + (Number(c.distanceKm) || 0), 0);

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl space-y-1">
                        <span className="text-[9px] font-black uppercase text-zinc-500 block">
                          Última Prova Disputada
                        </span>
                        {lastRace ? (
                          <>
                            <p className="text-xs font-black uppercase text-white">{lastRace.name}</p>
                            <span className="text-[10px] font-mono text-blue-400 font-bold block">
                              {lastRace.distanceKm} KM • {formatSafeDate(lastRace.date)}
                            </span>
                          </>
                        ) : (
                          <p className="text-xs text-zinc-500 italic">Nenhuma prova anterior registrada</p>
                        )}
                      </div>

                      <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl space-y-1">
                        <span className="text-[9px] font-black uppercase text-zinc-500 block">
                          KM Total Acumulado em Provas
                        </span>
                        <p className="text-2xl font-black font-mono text-amber-400">
                          {totalKmProvas.toLocaleString('pt-BR')} KM
                        </p>
                        <span className="text-[9px] text-zinc-500 block">
                          Soma de {completedRaces.length} etapa(s) concluída(s)
                        </span>
                      </div>

                      <div className="bg-zinc-950 border border-green-500/30 p-4 rounded-2xl space-y-1">
                        <span className="text-[9px] font-black uppercase text-green-400 block">
                          Próxima Competição Vinculada
                        </span>
                        {nextRace ? (
                          <>
                            <p className="text-xs font-black uppercase text-white">{nextRace.name}</p>
                            <span className="text-[10px] font-mono text-green-400 font-bold block">
                              Percurso: {nextRace.distanceKm} KM • {formatSafeDate(nextRace.date)}
                            </span>
                          </>
                        ) : (
                          <p className="text-xs text-zinc-500 italic">Nenhuma próxima prova agendada</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-blue-400 flex items-center gap-1.5">
                            <Wrench size={14} /> O Que Foi Feito na Última Manutenção
                          </span>
                          {selectedPassport.lastMaintenanceDate && (
                            <span className="text-[9px] font-mono text-zinc-400">
                              {formatSafeDate(selectedPassport.lastMaintenanceDate)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                          {selectedPassport.lastMaintenanceSummary || 'Sem histórico anterior detalhado.'}
                        </p>
                      </div>

                      <div className="bg-zinc-950 border border-green-500/30 p-5 rounded-2xl space-y-2">
                        <span className="text-[10px] font-black uppercase text-green-400 flex items-center gap-1.5">
                          <Sparkles size={14} /> O Que Deverá Ser Feito para a Próxima Competição
                        </span>
                        <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                          {selectedPassport.nextCompetitionPlan || 'Sem observações cadastradas para a próxima competição.'}
                        </p>
                      </div>
                    </div>

                    {/* RELAÇÃO DE PEÇAS, ÓLEOS E FLUIDOS POR KM LIMITE + STATUS DO ESTOQUE EM TEMPO REAL */}
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                        <div>
                          <h3 className="text-base font-black uppercase italic text-white flex items-center gap-2">
                            <Gauge size={18} className="text-green-400" />
                            <span>Relação de Peças, Óleos e Fluidos (Cálculo de KM Limite & Estoque em Tempo Real)</span>
                          </h3>
                          <p className="text-[10px] text-zinc-400">
                            Simulando com KM Atual: <strong className="text-green-400 font-mono">{triageKmInput} KM</strong> • Indica automaticamente o que precisa de troca e se há saldo no estoque da oficina.
                          </p>
                        </div>
                        {!isAdmin && (
                          <span className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-xl text-[9px] font-black uppercase text-zinc-400 flex items-center gap-1.5">
                            <Lock size={12} className="text-amber-400" />
                            <span>Limites de KM travados pelo Administrador</span>
                          </span>
                        )}
                      </div>

                      {(selectedPassport.maintenanceItems || []).length === 0 ? (
                        <div className="p-8 bg-zinc-950 border border-dashed border-zinc-800 rounded-2xl text-center text-xs text-zinc-500 italic">
                          Nenhuma peça ou fluido configurado neste passaporte ainda.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedPassport.maintenanceItems.map(item => {
                            const nextKm = (Number(item.lastChangeKm) || 0) + (Number(item.intervalKm) || 0);
                            const activeKm = Number(triageKmInput) || 0;
                            const kmRemaining = nextKm - activeKm;
                            const isExpired = activeKm >= nextKm;
                            const willExpireInNextRace = !isExpired && nextRace && (activeKm + nextRace.distanceKm >= nextKm);
                            const isWarning = !isExpired && (kmRemaining <= Math.max(50, item.intervalKm * 0.15) || willExpireInNextRace);

                            const stockInfo = checkItemStock(item);

                            return (
                              <div
                                key={item.id}
                                className={`p-4 sm:p-5 rounded-2xl border-2 transition-all ${
                                  isExpired
                                    ? 'bg-red-950/25 border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                                    : isWarning
                                    ? 'bg-amber-950/20 border-amber-500/50'
                                    : 'bg-zinc-950 border-zinc-800'
                                }`}
                              >
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[8px] font-black uppercase text-zinc-300">
                                        {item.category === 'OLEO' ? '🛢️ ÓLEO' : item.category === 'FLUIDO' ? '💧 FLUIDO' : item.category === 'REVISAO' ? '🔧 REVISÃO' : '⚙️ PEÇA'}
                                      </span>
                                      <h4 className="text-sm font-black uppercase text-white">
                                        {item.name}
                                      </h4>
                                      {item.partNumber && (
                                        <span className="text-[10px] font-mono text-zinc-400">
                                          (PN: {item.partNumber})
                                        </span>
                                      )}
                                      <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-[9px] font-mono font-bold">
                                        Qtd Nec: {item.requiredQty} {item.unit || 'un'}
                                      </span>
                                    </div>

                                    {/* STATUS DE DISPONIBILIDADE EM ESTOQUE EM TEMPO REAL */}
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      {stockInfo.hasEnoughStock ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/15 border border-green-500/40 text-green-400 rounded-xl text-[9px] font-black uppercase">
                                          <CheckCircle2 size={12} />
                                          <span>
                                            EM ESTOQUE DISPONÍVEL (Saldo: {stockInfo.availableQty} {stockInfo.unit} • Necessário: {item.requiredQty} {item.unit || 'un'})
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase animate-pulse shadow-sm">
                                          <AlertTriangle size={12} />
                                          <span>
                                            ⚠️ SEM SALDO SUFICIENTE EM ESTOQUE! (Disponível: {stockInfo.availableQty} {stockInfo.unit} / Necessário: {item.requiredQty} {item.unit || 'un'}) — AVISAR CHEFE DE OFICINA!
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Diagnóstico de Troca por KM */}
                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    {isExpired ? (
                                      <div className="px-3.5 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-lg">
                                        <AlertTriangle size={14} />
                                        <span>TROCAR AGORA! (Vencido há {Math.abs(kmRemaining)} KM)</span>
                                      </div>
                                    ) : isWarning ? (
                                      <div className="px-3.5 py-2 bg-amber-500 text-black rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5">
                                        <Clock size={14} />
                                        <span>
                                          {willExpireInNextRace
                                            ? `TROCAR P/ PRÓXIMA PROVA! (Restam ${kmRemaining} KM, prova tem ${nextRace?.distanceKm} KM)`
                                            : `ATENÇÃO: Troca Próxima (Restam ${kmRemaining} KM)`}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="px-3.5 py-2 bg-green-500/15 text-green-400 border border-green-500/30 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5">
                                        <CheckCircle2 size={14} />
                                        <span>OK • Restam {kmRemaining} KM</span>
                                      </div>
                                    )}

                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleAdminResetPartKm(selectedPassport, item.id)}
                                        className="px-3 py-2 bg-zinc-800 hover:bg-green-500 hover:text-black text-zinc-200 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1"
                                        title="Confirmar que esta peça foi trocada no KM atual e recalcular próxima troca"
                                      >
                                        <RefreshCw size={12} />
                                        <span>Confirmar Troca ({selectedPassport.currentKm} KM)</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Demonstrativo da Soma: Última Troca + Intervalo = Próxima Troca */}
                                <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                                  <div className="bg-black/70 p-2.5 rounded-xl border border-zinc-800">
                                    <span className="text-[8px] font-sans font-black uppercase text-zinc-500 block">
                                      KM Última Troca
                                    </span>
                                    <strong className="text-white text-xs">{item.lastChangeKm} KM</strong>
                                  </div>
                                  <div className="bg-black/70 p-2.5 rounded-xl border border-zinc-800">
                                    <span className="text-[8px] font-sans font-black uppercase text-zinc-500 block">
                                      + Soma Intervalo Limite
                                    </span>
                                    <strong className="text-blue-400 text-xs">+ {item.intervalKm} KM</strong>
                                  </div>
                                  <div className="bg-black/70 p-2.5 rounded-xl border border-zinc-800">
                                    <span className="text-[8px] font-sans font-black uppercase text-zinc-500 block">
                                      = KM da Próxima Troca
                                    </span>
                                    <strong className={`text-xs ${isExpired ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400'}`}>
                                      {nextKm} KM
                                    </strong>
                                  </div>
                                  <div className="bg-black/70 p-2.5 rounded-xl border border-zinc-800">
                                    <span className="text-[8px] font-sans font-black uppercase text-zinc-500 block">
                                      KM Atual Informado
                                    </span>
                                    <strong className="text-zinc-200 text-xs">{activeKm} KM</strong>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE CADASTRO / EDIÇÃO DO PASSAPORTE UTV (EXCLUSIVO PARA ADMINISTRADORES) */}
      {isFormModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/95 z-[400] overflow-y-auto p-3 sm:p-6 backdrop-blur-xl animate-in fade-in">
          <div className="max-w-4xl mx-auto bg-zinc-900 border-2 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl my-4">
            <div className="p-6 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between sticky top-0 z-20">
              <div>
                <span className="px-2.5 py-0.5 bg-green-500 text-black font-black text-[9px] uppercase rounded-md">
                  🔒 EXCLUSIVO ADMINISTRADOR / CHEFE DE OFICINA
                </span>
                <h3 className="text-xl sm:text-2xl font-black uppercase italic text-white mt-1">
                  {editingPassport ? `Editar Passaporte UTV (${editingPassport.vehicleModel})` : 'Cadastrar Novo Passaporte UTV'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePassportForm} className="p-6 sm:p-8 space-y-8">
              {/* Bloco 1: Identificação do UTV & Vínculo de Cliente + QR Code Único */}
              <div className="bg-black/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <h4 className="text-xs font-black uppercase text-green-400 tracking-wider flex items-center gap-2">
                    <QrCode size={15} /> 1. Identificação do UTV & QR Code Individual Exclusivo
                  </h4>
                  <span className="font-mono text-[10px] text-zinc-300 bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-700">
                    QR Gerado: <strong className="text-green-400">{formState.qrCode}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Vincular Cliente Cadastrado (Opcional)
                    </label>
                    <select
                      value={formState.clientId}
                      onChange={e => {
                        const cid = e.target.value;
                        const cli = clients.find(c => c.id === cid);
                        if (cli) {
                          const firstVeh = cli.vehicles?.[0];
                          setFormState(prev => ({
                            ...prev,
                            clientId: cid,
                            customerName: cli.name,
                            vehicleId: firstVeh ? firstVeh.id : prev.vehicleId,
                            vehicleModel: firstVeh ? firstVeh.model : prev.vehicleModel,
                            chassisOrPlate: firstVeh?.plate || prev.chassisOrPlate
                          }));
                        } else {
                          setFormState(prev => ({ ...prev, clientId: '', vehicleId: '' }));
                        }
                      }}
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-bold text-xs uppercase outline-none focus:border-green-500"
                    >
                      <option value="">-- SELECIONAR CLIENTE OU DIGITAR ABAIXO --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Nome do Cliente / Piloto / Equipe *
                    </label>
                    <input
                      required
                      type="text"
                      value={formState.customerName}
                      onChange={e => setFormState(prev => ({ ...prev, customerName: e.target.value }))}
                      placeholder="EX: GUILHERME BUENO / EQUIPE HPS RACING"
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Numeral do UTV
                    </label>
                    <input
                      type="text"
                      value={formState.vehicleNumber}
                      onChange={e => setFormState(prev => ({ ...prev, vehicleNumber: e.target.value }))}
                      placeholder="EX: #104"
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-green-400 font-mono font-black text-xs uppercase outline-none focus:border-green-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Modelo do UTV *
                    </label>
                    <input
                      required
                      type="text"
                      value={formState.vehicleModel}
                      onChange={e => setFormState(prev => ({ ...prev, vehicleModel: e.target.value }))}
                      placeholder="EX: CAN-AM MAVERICK R X RS / MAVERICK X3 TURBO RR"
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Chassi / Placa / Série
                    </label>
                    <input
                      type="text"
                      value={formState.chassisOrPlate}
                      onChange={e => setFormState(prev => ({ ...prev, chassisOrPlate: e.target.value }))}
                      placeholder="EX: BRA-2026"
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-mono font-bold text-xs uppercase outline-none focus:border-green-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      KM Atual do UTV (Hodômetro Inicial) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formState.currentKm}
                      onChange={e => setFormState(prev => ({ ...prev, currentKm: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-green-400 font-mono font-black text-sm outline-none focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Situação Atual do UTV na Oficina / Pista
                    </label>
                    <select
                      value={formState.carStatus}
                      onChange={e => setFormState(prev => ({ ...prev, carStatus: e.target.value as any }))}
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500"
                    >
                      <option value="READY">🟢 PRONTO PARA COMPETIÇÃO / PISTA</option>
                      <option value="IN_TRIAGE">🟡 EM TRIAGEM TÉCNICA NA OFICINA</option>
                      <option value="IN_MAINTENANCE">🔵 EM MANUTENÇÃO / PREPARAÇÃO</option>
                      <option value="AWAITING_PARTS">🔴 AGUARDANDO PEÇAS DE REPOSIÇÃO</option>
                      <option value="RACING">🟣 EM COMPETIÇÃO / PROVA ATIVA</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Bloco 2: O que foi feito na última manutenção & O que deverá ser feito para a próxima competição */}
              <div className="bg-black/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-black uppercase text-green-400 tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <Wrench size={15} /> 2. Histórico da Última Manutenção & Plano para a Próxima Competição
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase text-zinc-300">
                        O Que Foi Feito na Última Manutenção
                      </label>
                      <input
                        type="date"
                        value={formState.lastMaintenanceDate}
                        onChange={e => setFormState(prev => ({ ...prev, lastMaintenanceDate: e.target.value }))}
                        className="bg-zinc-900 border border-zinc-700 px-2.5 py-1 rounded-lg text-[10px] text-white font-mono"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={formState.lastMaintenanceSummary}
                      onChange={e => setFormState(prev => ({ ...prev, lastMaintenanceSummary: e.target.value }))}
                      placeholder="Descreva tudo o que foi revisado ou substituído na última manutenção..."
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white text-xs outline-none focus:border-green-500 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-green-400 block">
                      O Que Deverá Ser Feito para a Próxima Competição
                    </label>
                    <textarea
                      rows={3}
                      value={formState.nextCompetitionPlan}
                      onChange={e => setFormState(prev => ({ ...prev, nextCompetitionPlan: e.target.value }))}
                      placeholder="Descreva o checklist e preparações previstas para a próxima corrida..."
                      className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white text-xs outline-none focus:border-green-500 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Bloco 3: Vinculação de Peças, Óleos e Fluidos com Soma Automática de KM Limite */}
              <div className="bg-black/50 border-2 border-green-500/30 rounded-2xl p-5 space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h4 className="text-xs font-black uppercase text-green-400 tracking-wider flex items-center gap-2">
                    <Gauge size={16} /> 3. Peças, Óleos e Fluidos Monitorados por KM (Última Troca + Intervalo = Próxima Troca)
                  </h4>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Vincule peças do estoque e defina o KM da última troca + o intervalo desejado (ex: Última troca 1000 + 1000 = 2000 km). Você pode alterar esses valores futuramente quando desejar.
                  </p>
                </div>

                {/* Caixa de inclusão de peça/óleo/fluido */}
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Filtrar / Buscar Peça ou Fluido no Estoque
                      </label>
                      <input
                        type="text"
                        value={partSearchInForm}
                        onChange={e => setPartSearchInForm(e.target.value)}
                        placeholder="🔍 Digite nome ou Part Number..."
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-bold uppercase outline-none focus:border-green-500"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-green-400 block mb-1">
                        Selecionar Item Cadastrado no Estoque
                      </label>
                      <select
                        value={newMaintItem.itemId}
                        onChange={e => {
                          const id = e.target.value;
                          const found = items.find(i => i.id === id);
                          if (found) {
                            const lower = found.name.toLowerCase();
                            const cat: UTVMaintenanceItem['category'] =
                              lower.includes('óleo') || lower.includes('oleo') || lower.includes('xps')
                                ? 'OLEO'
                                : lower.includes('fluido') || lower.includes('dot')
                                ? 'FLUIDO'
                                : 'PECA';
                            setNewMaintItem(prev => ({
                              ...prev,
                              itemId: found.id,
                              name: found.name,
                              partNumber: found.partNumber || '',
                              unit: found.unit || 'un',
                              category: cat
                            }));
                          } else {
                            setNewMaintItem(prev => ({ ...prev, itemId: '' }));
                          }
                        }}
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-black uppercase outline-none focus:border-green-500"
                      >
                        <option value="">-- SELECIONAR DO ESTOQUE (OU DIGITAR ABAIXO) --</option>
                        {items
                          .filter(i => {
                            if (!partSearchInForm.trim()) return true;
                            const q = partSearchInForm.toLowerCase();
                            return i.name.toLowerCase().includes(q) || (i.partNumber || '').toLowerCase().includes(q);
                          })
                          .map(i => (
                            <option key={i.id} value={i.id}>
                              {i.name.toUpperCase()} (PN: {i.partNumber || 'S/N'}) • Estoque: {i.quantity} {i.unit || 'un'}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Nome da Peça / Óleo / Fluido *
                      </label>
                      <input
                        type="text"
                        value={newMaintItem.name}
                        onChange={e => setNewMaintItem(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Ex: Semi-eixo Dianteiro / Óleo Motor XPS"
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-bold uppercase outline-none focus:border-green-500"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Tipo / Categoria
                      </label>
                      <select
                        value={newMaintItem.category}
                        onChange={e => setNewMaintItem(prev => ({ ...prev, category: e.target.value as any }))}
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-black uppercase outline-none"
                      >
                        <option value="PECA">⚙️ PEÇA MECÂNICA</option>
                        <option value="OLEO">🛢️ ÓLEO LUBRIFICANTE</option>
                        <option value="FLUIDO">💧 FLUIDO / ADITIVO</option>
                        <option value="REVISAO">🔧 REVISÃO / COMPONENTE</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Qtd p/ Troca ({newMaintItem.unit})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        value={newMaintItem.requiredQty}
                        onChange={e => setNewMaintItem(prev => ({ ...prev, requiredQty: parseFloat(e.target.value) || 1 }))}
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white font-mono font-black text-xs outline-none"
                      />
                    </div>
                  </div>

                  {/* Campos de Cálculo Automático: KM Última Troca + Intervalo = KM Próxima Troca */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-black/80 p-3.5 rounded-xl border border-green-500/30">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        KM da Última Troca (Ex: 10 ou 1000)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={newMaintItem.lastChangeKm}
                        onChange={e => setNewMaintItem(prev => ({ ...prev, lastChangeKm: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 p-2.5 rounded-xl text-white font-mono font-black text-sm outline-none focus:border-green-500"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-blue-400 block mb-1">
                        + Intervalo p/ Próxima Troca (Ex: 500)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={newMaintItem.intervalKm}
                        onChange={e => setNewMaintItem(prev => ({ ...prev, intervalKm: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-zinc-900 border border-blue-500/50 p-2.5 rounded-xl text-blue-400 font-mono font-black text-sm outline-none focus:border-blue-400"
                      />
                    </div>

                    <div className="flex flex-col justify-center bg-green-500/10 border border-green-500/30 rounded-xl px-3.5 py-2">
                      <span className="text-[8px] font-black uppercase text-green-400">
                        = Resultado Automático (Próxima Troca)
                      </span>
                      <span className="text-lg font-mono font-black text-white">
                        {(Number(newMaintItem.lastChangeKm) || 0) + (Number(newMaintItem.intervalKm) || 0)} KM
                      </span>
                      <span className="text-[8px] font-mono text-zinc-400">
                        ({Number(newMaintItem.lastChangeKm) || 0} + {Number(newMaintItem.intervalKm) || 0} = {(Number(newMaintItem.lastChangeKm) || 0) + (Number(newMaintItem.intervalKm) || 0)} km)
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddMaintItemToForm}
                      className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black font-black text-[10px] uppercase rounded-xl flex items-center gap-1.5 shadow-glow"
                    >
                      <Plus size={14} />
                      <span>Vincular Peça / Fluido ao Passaporte</span>
                    </button>
                  </div>
                </div>

                {/* Lista de Peças já vinculadas ao Passaporte (Editáveis pelo Admin) */}
                {formState.maintenanceItems.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-zinc-400 block">
                      Itens Vinculados neste Passaporte ({formState.maintenanceItems.length}) — Você pode editar os KMs diretamente abaixo:
                    </span>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {formState.maintenanceItems.map(m => {
                        const calcNext = (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0);
                        return (
                          <div key={m.id} className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-black rounded text-zinc-400">
                                  {m.category}
                                </span>
                                <span className="text-xs font-black uppercase text-white truncate">
                                  {m.name}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-zinc-400">
                                Soma: {m.lastChangeKm} km + {m.intervalKm} km = <strong className="text-green-400">{calcNext} KM</strong>
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div>
                                <span className="text-[7px] uppercase font-black text-zinc-500 block">Última Troca</span>
                                <input
                                  type="number"
                                  value={m.lastChangeKm}
                                  onChange={e => handleUpdateMaintItemInForm(m.id, 'lastChangeKm', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-black border border-zinc-700 px-2 py-1 rounded-lg text-xs font-mono font-bold text-white"
                                />
                              </div>
                              <div>
                                <span className="text-[7px] uppercase font-black text-blue-400 block">+ Intervalo KM</span>
                                <input
                                  type="number"
                                  value={m.intervalKm}
                                  onChange={e => handleUpdateMaintItemInForm(m.id, 'intervalKm', parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-black border border-blue-500/40 px-2 py-1 rounded-lg text-xs font-mono font-bold text-blue-400"
                                />
                              </div>
                              <div className="bg-black px-2.5 py-1 rounded-lg border border-zinc-800">
                                <span className="text-[7px] uppercase font-black text-zinc-500 block">= Próxima</span>
                                <span className="text-xs font-mono font-black text-green-400">{calcNext} KM</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFormState(prev => ({
                                  ...prev,
                                  maintenanceItems: prev.maintenanceItems.filter(x => x.id !== m.id)
                                }))}
                                className="p-2 text-red-400 hover:bg-red-500/15 rounded-lg"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Bloco 4: Vínculo de Competições / Etapas (Datas e Quilometragem de cada prova) */}
              <div className="bg-black/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <Flag size={15} /> 4. Competições e Etapas Vinculadas (Datas e KM de Cada Prova)
                </h4>

                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Nome da Competição / Etapa
                      </label>
                      <input
                        type="text"
                        value={newComp.name}
                        onChange={e => setNewComp(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Ex: Rally dos Sertões - Etapa 1 / Baja Jalapão"
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-bold uppercase outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Data da Prova
                      </label>
                      <input
                        type="date"
                        value={newComp.date}
                        onChange={e => setNewComp(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-amber-400 block mb-1">
                        Quilometragem da Prova (KM)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={newComp.distanceKm}
                        onChange={e => setNewComp(prev => ({ ...prev, distanceKm: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-black border border-amber-500/40 p-2.5 rounded-xl text-amber-400 font-mono font-black text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Status da Prova
                      </label>
                      <select
                        value={newComp.status}
                        onChange={e => setNewComp(prev => ({ ...prev, status: e.target.value as any }))}
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-black uppercase outline-none"
                      >
                        <option value="UPCOMING">🚀 PRÓXIMA COMPETIÇÃO (VAI DISPUTAR)</option>
                        <option value="COMPLETED">🏁 JÁ DISPUTOU (CONCLUÍDA)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Local / Cidade
                      </label>
                      <input
                        type="text"
                        value={newComp.location}
                        onChange={e => setNewComp(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="Ex: Tocantins / Barretos - SP"
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs font-bold uppercase outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                        Observações / Resultado
                      </label>
                      <input
                        type="text"
                        value={newComp.resultOrNotes}
                        onChange={e => setNewComp(prev => ({ ...prev, resultOrNotes: e.target.value }))}
                        placeholder="Ex: P1 Geral / Terreno de pedra..."
                        className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddCompetitionToForm}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase rounded-xl flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      <span>Adicionar Competição / Etapa</span>
                    </button>
                  </div>
                </div>

                {formState.competitions.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {formState.competitions.map(c => (
                      <div key={c.id} className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                              c.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500 text-black'
                            }`}>
                              {c.status === 'COMPLETED' ? 'DISPUTADA' : 'PRÓXIMA PROVA'}
                            </span>
                            <span className="text-xs font-black uppercase text-white">{c.name}</span>
                            <span className="text-xs font-mono font-black text-amber-400">{c.distanceKm} KM</span>
                          </div>
                          <span className="text-[9px] text-zinc-400">
                            Data: {formatSafeDate(c.date)} {c.location ? `• ${c.location}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormState(prev => ({
                            ...prev,
                            competitions: prev.competitions.filter(x => x.id !== c.id)
                          }))}
                          className="p-2 text-red-400 hover:bg-red-500/15 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-6 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-black uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-8 py-3.5 bg-green-500 hover:bg-green-400 text-black rounded-2xl text-xs font-black uppercase shadow-glow"
                >
                  Salvar Passaporte UTV
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL ESPELHO "PASSAPORTE UTV - CLIENTE" */}
      {clientMirrorPassport && (() => {
        const ownerClient = clients.find(
          c => c.id === clientMirrorPassport.clientId || c.name.trim().toLowerCase() === clientMirrorPassport.customerName.trim().toLowerCase()
        );
        return (
          <UTVPassportClientMirror
            passport={clientMirrorPassport}
            tenant={currentTenant}
            items={items}
            clientCredentials={ownerClient ? { username: ownerClient.username, password: ownerClient.password, clientName: ownerClient.name } : undefined}
            onClose={() => setClientMirrorPassport(null)}
          />
        );
      })()}

      {/* 7. MODAL DE ETIQUETA QR CODE EXCLUSIVA DO UTV PARA IMPRESSÃO E FIXAÇÃO NO CARRO */}
      {qrLabelPassport && (
        <div className="fixed inset-0 bg-black/90 z-[430] flex items-center justify-center p-4 backdrop-blur-xl">
          <div className="bg-zinc-900 border-2 border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-5 text-center shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-black uppercase text-green-400">
                🏷️ Etiqueta QR Code Individual do UTV
              </span>
              <button
                type="button"
                onClick={() => setQrLabelPassport(null)}
                className="p-2 bg-zinc-800 text-zinc-400 rounded-xl"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-white text-black p-6 rounded-2xl space-y-3 mx-auto border-4 border-green-500">
              <div className="text-[10px] font-black uppercase tracking-widest bg-black text-green-400 py-1 px-3 rounded-md inline-block">
                PASSAPORTE OFICIAL UTV • {currentTenant.name}
              </div>
              <h4 className="text-lg font-black uppercase leading-tight">
                {qrLabelPassport.vehicleNumber ? `${qrLabelPassport.vehicleNumber} • ` : ''}{qrLabelPassport.vehicleModel}
              </h4>
              <p className="text-xs font-bold uppercase text-zinc-700">
                Piloto/Cliente: {qrLabelPassport.customerName}
              </p>
              <div className="flex justify-center py-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrLabelPassport.qrCode)}`}
                  alt={qrLabelPassport.qrCode}
                  className="w-44 h-44 object-contain"
                />
              </div>
              <p className="font-mono font-black text-xs tracking-wider bg-zinc-100 py-1.5 px-3 rounded border border-zinc-300">
                {qrLabelPassport.qrCode}
              </p>
              <p className="text-[9px] font-bold uppercase text-zinc-500">
                Escaneie no sistema HPS Control para abrir a Triagem e Passaporte do UTV
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-green-500 hover:bg-green-400 text-black font-black text-xs uppercase rounded-xl flex items-center justify-center gap-2 shadow-glow"
              >
                <Printer size={15} />
                <span>Imprimir Etiqueta QR</span>
              </button>
              <button
                type="button"
                onClick={() => setQrLabelPassport(null)}
                className="px-5 py-3 bg-zinc-800 text-white font-black text-xs uppercase rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UTVPassportModule;
