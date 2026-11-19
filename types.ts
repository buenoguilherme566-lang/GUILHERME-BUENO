
export enum UserRole {
  STOCKIST = 'STOCKIST', 
  MECHANIC = 'MECHANIC',
  CLIENT = 'CLIENT'
}

export enum ItemCategory {
  FREIOS = 'Freios',
  MOTOR = 'Motor',
  TRANSMISSAO = 'Transmissão e câmbio',
  RODAS = 'Rodas e pneus',
  INSUMOS = 'Insumos',
  ELETRICA = 'Elétrica e eletrônicos'
}

export interface User {
  id: string;
  username: string;
  password?: string;
  email?: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  tenantId?: string;
  clientId?: string; // Vinculado quando role === UserRole.CLIENT (acesso restrito ao Espelho do Cliente)
  allowedPassportId?: string; // Se o cliente acessou via link específico do espelho (?utv_passport=...)
}

export interface ItemPurchase {
  id: string;
  date: string;
  quantity: number;
  unitCost: number;
  supplier?: string;
  invoiceNumber?: string;
  notes?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  partNumber: string;
  value: number;
  quantity: number;
  minQuantity: number;
  category: ItemCategory;
  boxNumber: string; // Identificação física (Caixa 01, Gaveta B, etc)
  entryDate: string;
  linkedQRCode?: string;
  description?: string;
  imageUrl?: string;
  observations?: string;
  sectionId?: string; // Link to VehicleSection
  laborTemplateId?: string; // Link to LaborTemplate
  purchaseHistory?: ItemPurchase[];
  unit?: string; // Unidade de medida (un, litro, ml, par, kit, etc.)
  tenantId?: string;
}

export enum TransactionType {
  IN = 'IN',
  OUT = 'OUT'
}

export enum MovementDestination {
  OS = 'OS',
  INTERNAL = 'INTERNAL'
}

export enum OSStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface VehicleSection {
  id: string;
  name: string; // e.g., "Sistema de Frenagem"
  components: string[]; // e.g., ["Pinça", "Disco", "Flexível"]
  tenantId?: string;
}

export interface LaborTemplate {
  id: string;
  description: string;
  pricingType?: 'hourly' | 'fixed'; // 'hourly' = por tempo/minutos, 'fixed' = por dificuldade/fixo
  defaultHours: number;
  minutes?: number; // Minutos trabalhados adicionais ou fração de hora
  defaultValuePerHour: number;
  fixedValue?: number; // Preço fixo/por dificuldade (sem somar taxa horária)
  sectionId?: string; // Link to VehicleSection (opcional)
  linkedTemplateId?: string; // Link opcional para outro modelo de mão de obra (M.O. compartilhada)
  discountPercentage?: number; // Porcentagem de desconto (ex: 50% por padrão na M.O. compartilhada)
  discountValue?: number; // Valor de desconto fixo em R$
  sharedNotes?: string; // Justificativa padrão da M.O. compartilhada
  tenantId?: string;
  linkedItemIds?: string[]; // IDs das peças vinculadas a este modelo de mão de obra (sem limite de peças)
}

export interface LaborItem {
  id: string;
  description: string;
  pricingType?: 'hourly' | 'fixed'; // 'hourly' = por tempo/minutos, 'fixed' = por dificuldade/fixo
  hours: number;
  minutes?: number; // Minutos trabalhados
  valuePerHour: number;
  fixedValue?: number; // Preço fixo/por dificuldade (sem somar taxa horária)
  section?: string; // e.g., "Roda Dianteira Esquerda", "Motor", etc.
  linkedToId?: string; // ID da outra Mão de Obra vinculada nesta OS
  isShared?: boolean; // Flag indicando mão de obra compartilhada
  discountPercentage?: number; // Desconto em % aplicado (ex: 50%)
  discountValue?: number; // Desconto em R$ aplicado
  originalTotal?: number; // Valor original bruto
  finalTotal?: number; // Valor final cobrado com desconto
  sharedReason?: string; // Justificativa do compartilhamento/desconto para o Chefe de Oficina e Financeiro
  linkedPartIds?: string[]; // IDs das peças da OS vinculadas a este serviço
}

export interface OSPart {
  itemId: string;
  name: string;
  partNumber: string;
  quantity: number;
  unitValue: number;
  unit?: string;
  measureMode?: 'standard' | 'ml';
  mlQuantity?: number;
  totalValue?: number;
  linkedLaborId?: string; // ID da mão de obra associada a esta peça na OS
  linkedLaborDescription?: string; // Descrição da mão de obra vinculada
  stockDeducted?: boolean; // Indica se esta peça específica já teve baixa no estoque físico
}

export interface ClientVehicle {
  id: string;
  model: string;
  plate: string;
  year?: string;
}

export interface TenantAddress {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface TenantPrintSettings {
  warrantyTerms?: string;
  footerMessage?: string;
  primaryColor?: string;
  showLogo?: boolean;
}

export interface Tenant {
  id: string;
  name: string; // Nome Fantasia
  corporateName?: string; // Razão Social
  cnpj?: string;
  phone?: string;
  email?: string;
  subtitle?: string; // ex: "BRP Especialista • Centro Técnico de Oficina & Preparação"
  address?: TenantAddress;
  logoUrl?: string;
  printSettings?: TenantPrintSettings;
  plan?: 'trial' | 'starter' | 'pro' | 'enterprise';
  status?: 'active' | 'suspended';
  createdAt?: string;
  defaultHourlyRate?: number; // Valor cobrado por hora da oficina (editável para reajustes)
}

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  role: 'OWNER' | 'MANAGER' | 'STOCKIST' | 'MECHANIC';
  isActive: boolean;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
  username?: string; // Login exclusivo do cliente para visualizar o Espelho do UTV
  password?: string; // Senha exclusiva do cliente para visualizar o Espelho do UTV
  isAccessActive?: boolean; // Permite ativar/desativar o login do cliente ao Espelho
  vehicles: ClientVehicle[];
  createdAt: string;
  tenantId?: string;
}

export interface ServiceOrder {
  id: string;
  osNumber: string;
  customerName: string;
  vehicleModel: string;
  status: OSStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string; // Data e hora exata da finalização da OS para fins de auditoria
  completedBy?: string; // Responsável pelo encerramento/finalização da OS
  laborItems: LaborItem[];
  parts: OSPart[];
  observations?: string;
  notes?: string;
  stockDeducted?: boolean; // Indica se a saída de estoque já foi efetuada para esta OS
  clientId?: string; // ID do cliente vinculado, se houver
  vehicleId?: string; // ID do veículo do cliente selecionado, se houver
  mechanicId?: string; // ID do mecânico vinculado do sistema
  mechanicName?: string; // Nome do mecânico vinculado do sistema
  passportId?: string; // ID do Passaporte UTV vinculado a esta OS
  tenantId?: string;
}

export interface UTVMaintenanceItem {
  id: string;
  itemId?: string; // Vínculo com peça/óleo/fluido do estoque (para verificar saldo em tempo real)
  partNumber?: string;
  name: string; // Ex: "Semi-eixo Dianteiro", "Óleo Motor XPS 5W40", "Fluido de Freio Racing"
  category: 'PECA' | 'OLEO' | 'FLUIDO' | 'REVISAO';
  requiredQty: number; // Quantidade necessária na troca (ex: 1 un, 3.3 L)
  unit?: string;
  lastChangeKm: number; // KM da última troca (ex: 10 ou 1000)
  intervalKm: number; // Intervalo definido pelo administrador (ex: 500 ou 1000)
  nextChangeKm: number; // Calculado automaticamente: lastChangeKm + intervalKm
  lastChangeDate?: string;
  notes?: string;
}

export interface UTVCompetition {
  id: string;
  name: string; // Nome da prova / etapa (ex: "Rally dos Sertões - Etapa 1", "Baja Jalapão")
  date: string; // Data da competição
  distanceKm: number; // Quilometragem total da prova / etapa
  status: 'COMPLETED' | 'UPCOMING' | 'IN_PREP'; // Já disputou / Próxima / Em preparação
  location?: string;
  resultOrNotes?: string; // O que ocorreu / resultado / anotações da prova
}

export interface UTVTriageRequest {
  id: string;
  mechanicId: string;
  mechanicName: string;
  reportedKm: number;
  maintenanceDate: string;
  notes?: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'COMPLETED';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  linkedOSId?: string;
  linkedOSNumber?: string;
  criticalItemsSnapshot?: string[]; // Resumo de itens que atingiram KM limite no momento da leitura
  missingStockSnapshot?: string[]; // Resumo de peças sem saldo em estoque no momento da leitura
}

export interface UTVPassport {
  id: string;
  qrCode: string; // Código QR único e exclusivo por UTV (ex: "UTV-PASS-9F8A2B")
  vehicleNumber?: string; // Numeral de competição (ex: "#104", "#27")
  vehicleModel: string; // Ex: "Can-Am Maverick R X rs 2026"
  chassisOrPlate?: string; // Chassi ou Placa
  clientId?: string;
  vehicleId?: string;
  customerName: string; // Nome do Cliente / Piloto / Equipe
  currentKm: number; // KM Atual do UTV (atualizado pelo mecânico na triagem ou pelo admin)
  lastMaintenanceSummary: string; // O que foi feito na última manutenção
  lastMaintenanceDate?: string;
  nextCompetitionPlan: string; // O que deverá ser feito para a próxima competição
  carStatus: 'READY' | 'IN_TRIAGE' | 'IN_MAINTENANCE' | 'RACING' | 'AWAITING_PARTS';
  maintenanceItems: UTVMaintenanceItem[]; // Peças, óleos e fluidos monitorados por KM
  competitions: UTVCompetition[]; // Histórico e calendário de competições vinculadas
  triageHistory: UTVTriageRequest[]; // Solicitações de triagem/liberação iniciadas pelo mecânico
  activeTriage?: UTVTriageRequest | null; // Triagem atual pendente de aprovação pelo chefe de oficina
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

export interface Transaction {
  id: string;
  itemId: string;
  itemName: string;
  // Added partNumber to track component reference in history logs
  partNumber?: string;
  userId: string;
  userName: string;
  type: TransactionType;
  quantity: number;
  date: string;
  recipientName: string;
  notes?: string;
  unitValue?: number;
  destination?: MovementDestination;
  osNumber?: string;
  tenantId?: string;
}


