
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Package, Search, QrCode, LogOut, TrendingUp, History, UserPlus,
  UserCircle, AlertTriangle, Printer, X, Check,
  ChevronRight, Smartphone, Info, Layers, BarChart3, 
  Sparkles, Users, Trash2, ExternalLink, Filter, Calendar, CheckCircle2,
  Wrench, Key, Shield, Settings, Sliders, LayoutGrid,
  Pencil, Upload, Image, DollarSign, Clock, FileText, CheckSquare, Eye,
  FileSpreadsheet, Download, ArrowDownLeft, ArrowUpRight, Tag,
  Building2, Store, ChevronDown, Building, Globe, MapPin, Phone, Mail,
  Copy, Database, Zap, Flag, RotateCcw, ShieldCheck
} from 'lucide-react';
import { 
  User, UserRole, InventoryItem, Transaction, TransactionType, MovementDestination, 
  ItemCategory, ServiceOrder, OSStatus, LaborItem, OSPart, VehicleSection, 
  LaborTemplate, Client, ClientVehicle, ItemPurchase, Tenant, TenantPrintSettings, TenantAddress,
  UTVPassport, UTVTriageRequest
} from './types';
import QRScanner from './components/QRScanner';
import TransactionHistory from './components/TransactionHistory';
import StockMovementsAudit from './components/StockMovementsAudit';
import PartsSearchFilter, { SearchFieldType } from './components/PartsSearchFilter';
import { UnitOfMeasureSelector } from './components/UnitOfMeasureSelector';
import SharedLaborWarningModal, { SharedLaborWarningData } from './components/SharedLaborWarningModal';
import OSPrintDocument, { getLaborFinalValue, getLaborDiscountAmount, getLaborOriginalValue, getPartFinalValue } from './components/OSPrintDocument';
import UTVPassportModule from './components/UTVPassportModule';
import UTVPassportClientMirror from './components/UTVPassportClientMirror';
import { checkLaborRelation, computeLaborGross, findLaborTemplateForPart } from './utils/laborUtils';
import { GoogleGenAI, Type } from "@google/genai";
import { supabaseService } from './services/supabaseService';
import { 
  idbGet, 
  idbSet, 
  safeSetItem, 
  safeGetItem, 
  cleanupLegacyStorage, 
  compressImage 
} from './services/storageService';
import { Cloud, CloudOff, RefreshCw, Droplet } from 'lucide-react';
import { 
  DEFAULT_USERS, 
  DEFAULT_SECTIONS, 
  DEFAULT_LABOR_TEMPLATES, 
  DEFAULT_ITEMS, 
  DEFAULT_CLIENTS, 
  DEFAULT_SERVICE_ORDERS, 
  DEFAULT_HISTORY,
  DEFAULT_TENANTS,
  DEFAULT_TENANT_ID,
  DEFAULT_UTV_PASSPORTS
} from './utils/seedData';

const CATEGORIES = Object.values(ItemCategory);
const DB_KEY = "HPS_PRO_DATA_V12";

const VEHICLE_SECTIONS = [
  "Motor", "Transmissão", "Suspensão Dianteira", "Suspensão Traseira", 
  "Freio Dianteiro", "Freio Traseiro", "Roda Dianteira Esquerda", 
  "Roda Dianteira Direita", "Roda Traseira Esquerda", "Roda Traseira Direita",
  "Elétrica", "Arrefecimento", "Chassi/Estrutura"
];

type ActiveTab = 'dashboard' | 'inventory' | 'service_orders' | 'clients' | 'history' | 'analytics' | 'labels' | 'users' | 'config';

const HPSLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => (
  <div className="flex flex-col items-center select-none">
    <div className="text-green-500 font-black italic tracking-tighter text-2xl flex items-center gap-1">
      <Smartphone size={size === 'lg' ? 32 : 24} /> HPS <span className="text-white">CONTROL</span>
    </div>
  </div>
);

const App: React.FC = () => {
  // --- DATABASE STATE ---
  const [users, setUsers] = useState<User[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [vehicleSections, setVehicleSections] = useState<VehicleSection[]>([]);
  const [laborTemplates, setLaborTemplates] = useState<LaborTemplate[]>([]);
  const [utvPassports, setUtvPassports] = useState<UTVPassport[]>(DEFAULT_UTV_PASSPORTS);
  const [selectedPassport, setSelectedPassport] = useState<UTVPassport | null>(null);
  const [osSubTab, setOsSubTab] = useState<'orders' | 'passports'>('orders');
  const [clientMirrorPassport, setClientMirrorPassport] = useState<UTVPassport | null>(null);
  const [publicClientPassportId, setPublicClientPassportId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('utv_passport');
    }
    return null;
  });
  const [dbLoaded, setDbLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  // --- UI STATE ---
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<SearchFieldType>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'search' | 'bind' | 'validate' | 'passport'>('search');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedOS, setSelectedOS] = useState<ServiceOrder | null>(null);
  const [showOSDocumentPreview, setShowOSDocumentPreview] = useState(false);
  const [sharedLaborWarning, setSharedLaborWarning] = useState<SharedLaborWarningData | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // --- CLIENTS STATE ---
  const [clients, setClients] = useState<Client[]>([]);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [copiedClientMirrorId, setCopiedClientMirrorId] = useState<string | null>(null);
  const [selectedClientLockedPassportId, setSelectedClientLockedPassportId] = useState<string | null>(null);
  const [clientFormData, setClientFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    username: '',
    password: '',
    isAccessActive: true
  });
  const [tempVehicles, setTempVehicles] = useState<ClientVehicle[]>([]);
  const [vehicleInput, setVehicleInput] = useState({
    model: '',
    plate: '',
    year: ''
  });
  const [editClientVehicleInput, setEditClientVehicleInput] = useState({
    model: '',
    plate: '',
    year: ''
  });

  // --- FORM STATES ---
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemHistoryFilter, setItemHistoryFilter] = useState<'all' | 'in' | 'out'>('all');
  const [isAddingOS, setIsAddingOS] = useState(false);
  const [osFormData, setOsFormData] = useState({
    customerName: '', vehicleModel: '', observations: '', laborTemplateId: '', clientId: '', vehicleId: '', mechanicId: '', passportId: ''
  });
  const [osLaborList, setOsLaborList] = useState<LaborItem[]>([]);
  const [osInitialPartsList, setOsInitialPartsList] = useState<OSPart[]>([]);
  const [selectedLaborTemplateToAdd, setSelectedLaborTemplateToAdd] = useState('');
  const [isAddingCustomLabor, setIsAddingCustomLabor] = useState(false);
  const [customLaborInput, setCustomLaborInput] = useState({ 
    description: '', 
    pricingType: 'hourly' as 'hourly' | 'fixed',
    hours: 1, 
    minutes: 0,
    valuePerHour: 150, 
    fixedValue: 150,
    section: '',
    linkedToId: '',
    isShared: false,
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountPercentage: 50,
    discountValue: 0,
    sharedReason: ''
  });
  const [isAddingQuickVehicle, setIsAddingQuickVehicle] = useState(false);
  const [quickVehicleInput, setQuickVehicleInput] = useState({ model: '', plate: '', year: '' });

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userFormData, setUserFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.MECHANIC as UserRole,
    email: ''
  });
  const [laborFormData, setLaborFormData] = useState({
    description: '', 
    pricingType: 'hourly' as 'hourly' | 'fixed',
    hours: 1, 
    minutes: 0,
    valuePerHour: 150, 
    fixedValue: 150,
    section: '', 
    linkedToId: '',
    isShared: false,
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountPercentage: 50,
    discountValue: 0,
    sharedReason: ''
  });
  const [osPartFormData, setOsPartFormData] = useState({
    itemId: '', 
    quantity: 1,
    measureMode: 'standard' as 'standard' | 'ml',
    mlQuantity: 500
  });
  const [osPartSearchTerm, setOsPartSearchTerm] = useState('');
  const [editingOSPartIdx, setEditingOSPartIdx] = useState<number | null>(null);
  const [editingOSPartQtyInput, setEditingOSPartQtyInput] = useState<string>('');
  const [editingOSPartMode, setEditingOSPartMode] = useState<'standard' | 'ml'>('standard');
  const [formData, setFormData] = useState({
    name: '', partNumber: '', value: 0, quantity: 0, minQuantity: 1, 
    category: '' as any, boxNumber: '', linkedQRCode: '', imageUrl: '', observations: '',
    sectionId: '', laborTemplateId: '', unit: 'un'
  });

  const [sectionFormData, setSectionFormData] = useState({ name: '', components: '' });
  const [laborTemplateFormData, setLaborTemplateFormData] = useState({ 
    description: '', 
    pricingType: 'hourly' as 'hourly' | 'fixed',
    defaultHours: 1, 
    minutes: 0,
    defaultValuePerHour: 150, 
    fixedValue: 150,
    sectionId: '',
    linkedTemplateId: '',
    discountPercentage: 50,
    discountValue: 0,
    discountType: 'percentage' as 'percentage' | 'fixed',
    sharedNotes: '',
    linkedItemIds: [] as string[] // Peças amarradas a este modelo de mão de obra (sem limite)
  });
  const [editingLaborTemplate, setEditingLaborTemplate] = useState<LaborTemplate | null>(null);
  const [isSharedLinkActive, setIsSharedLinkActive] = useState(false);
  const [laborTemplatePartSearch, setLaborTemplatePartSearch] = useState('');
  const [laborCatalogSearchTerm, setLaborCatalogSearchTerm] = useState('');
  const [autoCreateLaborOnPartLink, setAutoCreateLaborOnPartLink] = useState(true);
  const [isQuickBindingCatalogInOS, setIsQuickBindingCatalogInOS] = useState(false);
  const [quickBindModeInOS, setQuickBindModeInOS] = useState<'os_existing' | 'existing' | 'new'>('os_existing');
  const [quickBindTemplateId, setQuickBindTemplateId] = useState('');
  const [osPartTargetLaborId, setOsPartTargetLaborId] = useState<string>('');
  const [osPartSharedLaborId, setOsPartSharedLaborId] = useState<string>('');
  const [osPartSharedDiscountType, setOsPartSharedDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [osPartSharedDiscountPct, setOsPartSharedDiscountPct] = useState<number>(50);
  const [osPartSharedDiscountVal, setOsPartSharedDiscountVal] = useState<number>(0);
  const [osPartSharedReason, setOsPartSharedReason] = useState<string>('');
  const [managingPartsForLaborId, setManagingPartsForLaborId] = useState<string | null>(null);
  const [showStockDeductOptionsInOS, setShowStockDeductOptionsInOS] = useState(false);
  const [quickNewTemplateForm, setQuickNewTemplateForm] = useState({
    description: '',
    pricingType: 'hourly' as 'hourly' | 'fixed',
    defaultHours: 1,
    minutes: 0,
    defaultValuePerHour: 150,
    fixedValue: 150,
    sectionId: ''
  });

  const [movementModal, setMovementModal] = useState<{ isOpen: boolean; itemId: string | null; type: TransactionType }>({
    isOpen: false, itemId: null, type: TransactionType.OUT
  });
  const [movementQty, setMovementQty] = useState(1);
  const [movementUnitValue, setMovementUnitValue] = useState<number | ''>('');
  const [movementNotes, setMovementNotes] = useState('');
  const [updateItemPriceWithCost, setUpdateItemPriceWithCost] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [destination, setDestination] = useState<MovementDestination>(MovementDestination.OS);
  const [osNumber, setOsNumber] = useState('');

  const [editingItemValue, setEditingItemValue] = useState<string | null>(null);

  // --- RECOMPRA & OBSERVATIONS STATES ---
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);
  const [purchaseFormData, setPurchaseFormData] = useState({
    quantity: 1,
    unitCost: 0,
    supplier: '',
    invoiceNumber: '',
    notes: '',
    updateItemValue: false
  });
  const [isEditingItemObs, setIsEditingItemObs] = useState(false);
  const [tempObs, setTempObs] = useState('');

  // --- MULTI-TENANCY STATE (SAAS MULTI-OFICINA) ---
  const [tenants, setTenants] = useState<Tenant[]>(DEFAULT_TENANTS);
  const [currentTenant, setCurrentTenant] = useState<Tenant>(DEFAULT_TENANTS[0]);
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isAddingTenant, setIsAddingTenant] = useState(false);
  const [newTenantInput, setNewTenantInput] = useState({
    name: '',
    corporateName: '',
    cnpj: '',
    phone: '',
    email: '',
    subtitle: 'Centro Técnico Especializado & Preparação',
    city: '',
    state: ''
  });
  const [companySettingsForm, setCompanySettingsForm] = useState({
    name: DEFAULT_TENANTS[0].name,
    corporateName: DEFAULT_TENANTS[0].corporateName || '',
    cnpj: DEFAULT_TENANTS[0].cnpj || '',
    phone: DEFAULT_TENANTS[0].phone || '',
    email: DEFAULT_TENANTS[0].email || '',
    subtitle: DEFAULT_TENANTS[0].subtitle || '',
    defaultHourlyRate: DEFAULT_TENANTS[0].defaultHourlyRate || 150,
    street: DEFAULT_TENANTS[0].address?.street || '',
    number: DEFAULT_TENANTS[0].address?.number || '',
    neighborhood: DEFAULT_TENANTS[0].address?.neighborhood || '',
    city: DEFAULT_TENANTS[0].address?.city || '',
    state: DEFAULT_TENANTS[0].address?.state || '',
    zip: DEFAULT_TENANTS[0].address?.zip || '',
    warrantyTerms: DEFAULT_TENANTS[0].printSettings?.warrantyTerms || '',
    footerMessage: DEFAULT_TENANTS[0].printSettings?.footerMessage || '',
    logoUrl: DEFAULT_TENANTS[0].logoUrl || ''
  });

  // --- STATE FOR DYNAMIC TECHNICAL GROUPS & CONFIG ---
  const [categories, setCategories] = useState<string[]>([]);
  const [configSubTab, setConfigSubTab] = useState<'company' | 'sectors' | 'labor' | 'groups'>('company');
  const [editingCategory, setEditingCategory] = useState<{ original: string; current: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [labelSearchTerm, setLabelSearchTerm] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [isGeneratingLabelsPdf, setIsGeneratingLabelsPdf] = useState(false);
  const [osPartition, setOsPartition] = useState<'open' | 'archived' | 'all'>('open');
  const [osSearchQuery, setOsSearchQuery] = useState("");
  const [osSearchField, setOsSearchField] = useState<'all' | 'customer' | 'osNumber'>('all');
  const [osDetailLaborSearch, setOsDetailLaborSearch] = useState("");
  const [osCreateLaborSearch, setOsCreateLaborSearch] = useState("");
  const [isEditingOSHeader, setIsEditingOSHeader] = useState(false);
  const [osHeaderEditData, setOsHeaderEditData] = useState({
    customerName: '',
    vehicleModel: '',
    mechanicId: '',
    observations: ''
  });

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    isOpen: false, title: '', message: '', type: 'info'
  });
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel?: () => void }>({
    isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {}
  });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setConfirmConfig({ 
      isOpen: true, 
      title, 
      message, 
      onConfirm,
      onCancel: () => {
        if (onCancel) onCancel();
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // --- PERSISTENCE ENGINE ---
  // --- PERSISTENCE ENGINE (MULTI-TENANT CAPABLE) ---
  // Load DB once on mount
  useEffect(() => {
    const loadData = async () => {
      setIsSyncing(true);
      try {
        // Limpa versões antigas e duplicatas do localStorage para evitar QuotaExceededError
        cleanupLegacyStorage();

        const rawCats = safeGetItem("HPS_CATEGORIES_V12");
        if (rawCats) {
          try {
            setCategories(JSON.parse(rawCats));
          } catch {
            setCategories(Object.values(ItemCategory));
          }
        } else {
          setCategories(Object.values(ItemCategory));
        }

        // 1. Carregar lista de Oficinas (Tenants)
        let loadedTenants: Tenant[] = DEFAULT_TENANTS;
        if (supabaseService.isAvailable()) {
          try {
            const sbTenants = await supabaseService.getTenants();
            if (sbTenants && sbTenants.length > 0) {
              loadedTenants = sbTenants;
            }
          } catch (e) {
            console.warn("Aviso ao carregar tenants do Supabase:", e);
          }
        }

        // Tenta IndexedDB primeiro para tenants, depois localStorage
        const idbTenants = await idbGet<Tenant[]>("HPS_TENANTS_V12");
        if (Array.isArray(idbTenants) && idbTenants.length > 0) {
          const map = new Map<string, Tenant>();
          loadedTenants.forEach(t => map.set(t.id, t));
          idbTenants.forEach(t => map.set(t.id, t));
          loadedTenants = Array.from(map.values());
        } else {
          const savedTenantsRaw = safeGetItem("HPS_TENANTS_V12");
          if (savedTenantsRaw) {
            try {
              const parsedTenants: Tenant[] = JSON.parse(savedTenantsRaw);
              if (Array.isArray(parsedTenants) && parsedTenants.length > 0) {
                const map = new Map<string, Tenant>();
                loadedTenants.forEach(t => map.set(t.id, t));
                parsedTenants.forEach(t => map.set(t.id, t));
                loadedTenants = Array.from(map.values());
                idbSet("HPS_TENANTS_V12", loadedTenants);
              }
            } catch {}
          }
        }
        setTenants(loadedTenants);

        const activeTenantId = safeGetItem("HPS_ACTIVE_TENANT_ID") || DEFAULT_TENANT_ID;
        const activeTenant = loadedTenants.find(t => t.id === activeTenantId) || loadedTenants[0];
        setCurrentTenant(activeTenant);

        // 2. Carregar dados da oficina ativa
        const tenantStorageKey = `${DB_KEY}_${activeTenant.id}`;

        const getLocalTenantData = async (key: string, isDefault: boolean) => {
          try {
            const idbData = await idbGet<any>(key);
            if (idbData && typeof idbData === 'object') {
              return idbData;
            }
          } catch {}

          const raw = safeGetItem(key) || (isDefault ? safeGetItem(DB_KEY) : null);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              idbSet(key, parsed);
              return parsed;
            } catch {
              return null;
            }
          }
          return null;
        };

        if (supabaseService.isAvailable()) {
          const fetchWithFallback = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
            try {
              return await promise;
            } catch (err) {
              console.error("Erro ao buscar dados do Supabase:", err);
              return fallback;
            }
          };

          const sbUsers = await fetchWithFallback(supabaseService.getUsers(activeTenant.id), []);
          const sbItems = await fetchWithFallback(supabaseService.getItems(activeTenant.id), []);
          const sbHistory = await fetchWithFallback(supabaseService.getHistory(activeTenant.id), []);
          const sbOrders = await fetchWithFallback(supabaseService.getServiceOrders(activeTenant.id), []);
          const sbSections = await fetchWithFallback(supabaseService.getVehicleSections(activeTenant.id), []);
          const sbTemplates = await fetchWithFallback(supabaseService.getLaborTemplates(activeTenant.id), []);
          const sbClients = await fetchWithFallback(supabaseService.getClients(activeTenant.id), []);
          const sbPassports = await fetchWithFallback(supabaseService.getUTVPassports(activeTenant.id), []);

          if (sbUsers.length || sbItems.length || sbHistory.length || sbOrders.length || sbSections.length || sbTemplates.length || sbClients.length || sbPassports.length) {
            let finalUsers = [...sbUsers];
            const fallbackKeys = [tenantStorageKey, DB_KEY, "HPS_PRO_DATA_V12", "HPS_PRO_DATA_V11", "HPS_USERS"];
            for (const key of fallbackKeys) {
              const rawData = safeGetItem(key);
              if (rawData) {
                try {
                  const parsed = JSON.parse(rawData);
                  const candidateList: User[] = Array.isArray(parsed) ? parsed : (parsed.users || []);
                  if (candidateList && candidateList.length > 0) {
                    if (finalUsers.length === 0) {
                      finalUsers = candidateList;
                    } else {
                      const existingUsernames = new Set(finalUsers.map(u => (u.username || '').toLowerCase()));
                      const existingIds = new Set(finalUsers.map(u => u.id));
                      for (const u of candidateList) {
                        if (!existingIds.has(u.id) && !existingUsernames.has((u.username || '').toLowerCase())) {
                          finalUsers.push(u);
                        }
                      }
                    }
                  }
                } catch {}
              }
            }
            if (finalUsers.length === 0) finalUsers = DEFAULT_USERS;
            setUsers(finalUsers);

            const localDb = await getLocalTenantData(tenantStorageKey, activeTenant.id === DEFAULT_TENANT_ID);
            
            // Mescla templates do Supabase preservando linkedItemIds e valores do cache local caso colunas novas do Supabase não tenham retornado
            const baseTemplates = sbTemplates.length > 0 ? sbTemplates : (localDb?.laborTemplates && localDb.laborTemplates.length > 0 ? localDb.laborTemplates : DEFAULT_LABOR_TEMPLATES);
            const resolvedTemplates = baseTemplates.map(t => {
              const localT = localDb?.laborTemplates?.find((lt: LaborTemplate) => lt.id === t.id);
              const tLinks = Array.isArray(t.linkedItemIds) 
                ? t.linkedItemIds 
                : (typeof t.linkedItemIds === 'string' ? (() => { try { return JSON.parse(t.linkedItemIds); } catch { return []; } })() : []);
              const lLinks = Array.isArray(localT?.linkedItemIds) ? localT.linkedItemIds : [];
              const mergedLinks = Array.from(new Set([...tLinks, ...lLinks]));
              const resolvedPricingType = t.pricingType || localT?.pricingType || 'hourly';
              const resolvedMinutes = t.minutes !== undefined ? Number(t.minutes) : (localT?.minutes !== undefined ? Number(localT.minutes) : 0);
              const rawHours = Number(t.defaultHours) > 0 ? Number(t.defaultHours) : (Number(localT?.defaultHours) > 0 ? Number(localT?.defaultHours) : 0);
              const resolvedHours = resolvedPricingType === 'fixed' ? (rawHours || 1) : ((rawHours === 0 && resolvedMinutes === 0) ? 1 : rawHours);
              const resolvedRate = Number(t.defaultValuePerHour) > 0
                ? Number(t.defaultValuePerHour)
                : (Number(localT?.defaultValuePerHour) > 0 ? Number(localT?.defaultValuePerHour) : (activeTenant.defaultHourlyRate || 150));
              const resolvedFixed = Number(t.fixedValue) > 0
                ? Number(t.fixedValue)
                : (Number(localT?.fixedValue) > 0 ? Number(localT?.fixedValue) : (resolvedPricingType === 'fixed' ? resolvedRate : undefined));

              return {
                ...t,
                pricingType: resolvedPricingType,
                defaultHours: resolvedHours,
                minutes: resolvedMinutes,
                defaultValuePerHour: resolvedRate,
                fixedValue: resolvedFixed,
                linkedItemIds: mergedLinks
              };
            });

            // Mescla itens preservando laborTemplateId
            const baseItems = sbItems.length > 0 ? sbItems : (localDb?.items && localDb.items.length > 0 ? localDb.items : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []));
            const resolvedItems = baseItems.map(item => {
              const localI = localDb?.items?.find((li: InventoryItem) => li.id === item.id);
              const matchingTemplate = resolvedTemplates.find(t => 
                (t.linkedItemIds || []).includes(item.id) || 
                (item.partNumber && (t.linkedItemIds || []).includes(item.partNumber))
              );
              return {
                ...item,
                laborTemplateId: item.laborTemplateId || localI?.laborTemplateId || matchingTemplate?.id
              };
            });

            const baseOrders = sbOrders.length > 0 ? sbOrders : (localDb?.serviceOrders && localDb.serviceOrders.length > 0 ? localDb.serviceOrders : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []));
            const resolvedOrders = baseOrders.map((ord: ServiceOrder) => {
              const localOrd = localDb?.serviceOrders?.find((lo: ServiceOrder) => lo.id === ord.id);
              return {
                ...ord,
                completedAt: ord.completedAt || localOrd?.completedAt,
                completedBy: ord.completedBy || localOrd?.completedBy,
                passportId: ord.passportId || localOrd?.passportId,
                mechanicId: ord.mechanicId || localOrd?.mechanicId,
                mechanicName: ord.mechanicName || localOrd?.mechanicName,
                clientId: ord.clientId || localOrd?.clientId,
                vehicleId: ord.vehicleId || localOrd?.vehicleId,
                stockDeducted: ord.stockDeducted ?? localOrd?.stockDeducted ?? false
              };
            });

            setLaborTemplates(resolvedTemplates);
            setItems(resolvedItems);
            setHistory(sbHistory.length > 0 ? sbHistory : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []));
            setServiceOrders(resolvedOrders);
            setVehicleSections(sbSections.length > 0 ? sbSections : DEFAULT_SECTIONS);
            setClients(sbClients.length > 0 ? sbClients : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []));
            setUtvPassports(sbPassports.length > 0 ? sbPassports : (localDb?.utvPassports && localDb.utvPassports.length > 0 ? localDb.utvPassports : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : [])));
            setSyncError(null);
          } else {
            // Fallback para IndexedDB / localStorage
            const db = await getLocalTenantData(tenantStorageKey, activeTenant.id === DEFAULT_TENANT_ID);
            if (db) {
              setUsers(db.users && db.users.length > 0 ? db.users : DEFAULT_USERS);
              setItems(db.items && db.items.length > 0 ? db.items : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []));
              setHistory(db.history && db.history.length > 0 ? db.history : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []));
              setServiceOrders(db.serviceOrders && db.serviceOrders.length > 0 ? db.serviceOrders : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []));
              setVehicleSections(db.vehicleSections && db.vehicleSections.length > 0 ? db.vehicleSections : DEFAULT_SECTIONS);
              setLaborTemplates(db.laborTemplates && db.laborTemplates.length > 0 ? db.laborTemplates : DEFAULT_LABOR_TEMPLATES);
              setClients(db.clients && db.clients.length > 0 ? db.clients : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []));
              setUtvPassports(db.utvPassports && db.utvPassports.length > 0 ? db.utvPassports : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : []));
            } else {
              setUsers(DEFAULT_USERS);
              setItems(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []);
              setHistory(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []);
              setServiceOrders(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []);
              setVehicleSections(DEFAULT_SECTIONS);
              setLaborTemplates(DEFAULT_LABOR_TEMPLATES);
              setClients(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []);
              setUtvPassports(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : []);
            }
          }
        } else {
          // Supabase não configurado, usa dados locais particionados
          const db = await getLocalTenantData(tenantStorageKey, activeTenant.id === DEFAULT_TENANT_ID);
          if (db) {
            setUsers(db.users && db.users.length > 0 ? db.users : DEFAULT_USERS);
            setItems(db.items && db.items.length > 0 ? db.items : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []));
            setHistory(db.history && db.history.length > 0 ? db.history : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []));
            setServiceOrders(db.serviceOrders && db.serviceOrders.length > 0 ? db.serviceOrders : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []));
            setVehicleSections(db.vehicleSections && db.vehicleSections.length > 0 ? db.vehicleSections : DEFAULT_SECTIONS);
            setLaborTemplates(db.laborTemplates && db.laborTemplates.length > 0 ? db.laborTemplates : DEFAULT_LABOR_TEMPLATES);
            setClients(db.clients && db.clients.length > 0 ? db.clients : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []));
            setUtvPassports(db.utvPassports && db.utvPassports.length > 0 ? db.utvPassports : (activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : []));
          } else {
            setUsers(DEFAULT_USERS);
            setItems(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []);
            setHistory(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []);
            setServiceOrders(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []);
            setVehicleSections(DEFAULT_SECTIONS);
            setLaborTemplates(DEFAULT_LABOR_TEMPLATES);
            setClients(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []);
            setUtvPassports(activeTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : []);
          }
          setSyncError("Supabase não configurado. Usando modo local multi-tenant.");
        }
      } catch (e: any) {
        console.error("Erro ao carregar dados, usando local", e);
        setSyncError("Erro de conexão com Supabase. Usando dados locais.");
      } finally {
        setIsSyncing(false);
        setDbLoaded(true);
      }
    };

    loadData();
  }, []);

  // Sincroniza formulário de dados da oficina com a oficina ativa
  useEffect(() => {
    if (currentTenant) {
      setCompanySettingsForm({
        name: currentTenant.name || '',
        corporateName: currentTenant.corporateName || '',
        cnpj: currentTenant.cnpj || '',
        phone: currentTenant.phone || '',
        email: currentTenant.email || '',
        subtitle: currentTenant.subtitle || '',
        defaultHourlyRate: currentTenant.defaultHourlyRate || 150,
        street: currentTenant.address?.street || '',
        number: currentTenant.address?.number || '',
        neighborhood: currentTenant.address?.neighborhood || '',
        city: currentTenant.address?.city || '',
        state: currentTenant.address?.state || '',
        zip: currentTenant.address?.zip || '',
        warrantyTerms: currentTenant.printSettings?.warrantyTerms || '',
        footerMessage: currentTenant.printSettings?.footerMessage || '',
        logoUrl: currentTenant.logoUrl || ''
      });
    }
  }, [currentTenant]);

  // Salva no banco de dados local particionado por oficina
  useEffect(() => {
    if (!dbLoaded || !currentTenant) return;
    
    const db = { users, items, history, serviceOrders, vehicleSections, laborTemplates, clients, utvPassports };
    
    // 1. Salva no IndexedDB nativo (armazenamento robusto sem restrição de 5MB)
    idbSet(`${DB_KEY}_${currentTenant.id}`, db);
    idbSet("HPS_TENANTS_V12", tenants);

    // 2. Salva no localStorage com tratamento resiliente contra QuotaExceededError
    safeSetItem(`${DB_KEY}_${currentTenant.id}`, JSON.stringify(db));
    safeSetItem("HPS_TENANTS_V12", JSON.stringify(tenants));
    safeSetItem("HPS_ACTIVE_TENANT_ID", currentTenant.id);

    if (categories.length > 0) {
      safeSetItem("HPS_CATEGORIES_V12", JSON.stringify(categories));
    }
  }, [users, items, history, serviceOrders, vehicleSections, laborTemplates, categories, clients, utvPassports, tenants, currentTenant, dbLoaded]);

  // Alternar de oficina ativa
  const handleSwitchTenant = async (targetTenant: Tenant) => {
    setCurrentTenant(targetTenant);
    safeSetItem("HPS_ACTIVE_TENANT_ID", targetTenant.id);
    setIsTenantDropdownOpen(false);

    const tenantKey = `${DB_KEY}_${targetTenant.id}`;
    let localDb = await idbGet<any>(tenantKey);
    if (!localDb) {
      const rawData = safeGetItem(tenantKey) || (targetTenant.id === DEFAULT_TENANT_ID ? safeGetItem(DB_KEY) : null);
      if (rawData) {
        try {
          localDb = JSON.parse(rawData);
          idbSet(tenantKey, localDb);
        } catch {}
      }
    }
    
    if (localDb) {
      setItems(localDb.items || (targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []));
      setHistory(localDb.history || (targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []));
      setServiceOrders(localDb.serviceOrders || (targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []));
      setVehicleSections(localDb.vehicleSections || DEFAULT_SECTIONS);
      setLaborTemplates(localDb.laborTemplates || DEFAULT_LABOR_TEMPLATES);
      setClients(localDb.clients || (targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []));
      setUtvPassports(localDb.utvPassports || (targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : []));
    } else {
      setItems(targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_ITEMS : []);
      setHistory(targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_HISTORY : []);
      setServiceOrders(targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_SERVICE_ORDERS : []);
      setVehicleSections(DEFAULT_SECTIONS);
      setLaborTemplates(DEFAULT_LABOR_TEMPLATES);
      setClients(targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_CLIENTS : []);
      setUtvPassports(targetTenant.id === DEFAULT_TENANT_ID ? DEFAULT_UTV_PASSPORTS : []);
    }

    if (supabaseService.isAvailable()) {
      Promise.all([
        supabaseService.getItems(targetTenant.id),
        supabaseService.getHistory(targetTenant.id),
        supabaseService.getServiceOrders(targetTenant.id),
        supabaseService.getVehicleSections(targetTenant.id),
        supabaseService.getLaborTemplates(targetTenant.id),
        supabaseService.getClients(targetTenant.id),
        supabaseService.getUTVPassports(targetTenant.id)
      ]).then(([sbItems, sbHistory, sbOrders, sbSections, sbTemplates, sbClients, sbPassports]) => {
        if (sbItems.length) setItems(sbItems);
        if (sbHistory.length) setHistory(sbHistory);
        if (sbOrders.length) setServiceOrders(sbOrders);
        if (sbSections.length) setVehicleSections(sbSections);
        if (sbTemplates.length) setLaborTemplates(sbTemplates);
        if (sbClients.length) setClients(sbClients);
        if (sbPassports.length) setUtvPassports(sbPassports);
      }).catch(err => {
        console.warn("Aviso ao carregar dados da oficina no Supabase:", err);
      });
    }

    showAlert("Ambiente Alterado", `Você agora está gerenciando a oficina: ${targetTenant.name}`, "info");
  };

  // Cadastrar nova oficina (Self-onboarding SaaS)
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantInput.name.trim()) {
      showAlert("Campo Obrigatório", "Por favor, informe o nome da nova oficina.", "error");
      return;
    }

    const newId = `tenant_${Date.now()}`;
    const newTenant: Tenant = {
      id: newId,
      name: newTenantInput.name.trim(),
      corporateName: newTenantInput.corporateName.trim() || undefined,
      cnpj: newTenantInput.cnpj.trim() || undefined,
      phone: newTenantInput.phone.trim() || undefined,
      email: newTenantInput.email.trim() || undefined,
      subtitle: newTenantInput.subtitle.trim() || 'Centro Técnico Especializado & Preparação',
      address: {
        city: newTenantInput.city.trim() || undefined,
        state: newTenantInput.state.trim() || undefined
      },
      printSettings: {
        warrantyTerms: 'Garantia de 90 dias para serviços executados e peças conforme Art. 26 do Código de Defesa do Consumidor (CDC).',
        footerMessage: 'Agradecemos a confiança! Documento emitido para prestação de contas.',
        primaryColor: '#22c55e',
        showLogo: true
      },
      plan: 'pro',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const updatedTenants = [...tenants, newTenant];
    setTenants(updatedTenants);
    idbSet("HPS_TENANTS_V12", updatedTenants);
    safeSetItem("HPS_TENANTS_V12", JSON.stringify(updatedTenants));

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveTenant(newTenant);
      } catch (e: any) {
        console.warn("Aviso ao salvar nova oficina no Supabase:", e);
      }
    }

    handleSwitchTenant(newTenant);
    setIsAddingTenant(false);
    setNewTenantInput({
      name: '',
      corporateName: '',
      cnpj: '',
      phone: '',
      email: '',
      subtitle: 'Centro Técnico Especializado & Preparação',
      city: '',
      state: ''
    });
    showAlert("Nova Oficina Criada!", `A oficina "${newTenant.name}" foi cadastrada e ativada com sucesso!`, "success");
  };

  // Salvar configurações e identidade visual da oficina ativa
  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companySettingsForm.name.trim()) {
      showAlert("Campo Obrigatório", "O nome da oficina não pode ficar vazio.", "error");
      return;
    }

    const updatedTenant: Tenant = {
      ...currentTenant,
      name: companySettingsForm.name.trim(),
      corporateName: companySettingsForm.corporateName.trim() || undefined,
      cnpj: companySettingsForm.cnpj.trim() || undefined,
      phone: companySettingsForm.phone.trim() || undefined,
      email: companySettingsForm.email.trim() || undefined,
      subtitle: companySettingsForm.subtitle.trim() || undefined,
      address: {
        street: companySettingsForm.street.trim() || undefined,
        number: companySettingsForm.number.trim() || undefined,
        neighborhood: companySettingsForm.neighborhood.trim() || undefined,
        city: companySettingsForm.city.trim() || undefined,
        state: companySettingsForm.state.trim() || undefined,
        zip: companySettingsForm.zip.trim() || undefined,
      },
      logoUrl: companySettingsForm.logoUrl.trim() || undefined,
      defaultHourlyRate: Number(companySettingsForm.defaultHourlyRate) || 150,
      printSettings: {
        ...currentTenant.printSettings,
        warrantyTerms: companySettingsForm.warrantyTerms.trim() || undefined,
        footerMessage: companySettingsForm.footerMessage.trim() || undefined,
      }
    };

    setCurrentTenant(updatedTenant);
    setTenants(prev => prev.map(t => t.id === updatedTenant.id ? updatedTenant : t));
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveTenant(updatedTenant);
      } catch (err: any) {
        console.warn("Aviso ao salvar oficina no Supabase:", err);
      }
    }

    showAlert("Dados Atualizados", "As informações da oficina, valor da hora e personalização da folha A4 foram salvas com sucesso!", "success");
  };

  // Reajuste rápido do valor cobrado por hora da oficina
  const handleQuickUpdateHourlyRate = async (newRate: number) => {
    const validRate = Number(newRate) || 150;
    if (validRate <= 0) {
      showAlert("Valor Inválido", "Por favor, informe um valor por hora válido.", "error");
      return;
    }
    const updatedTenant: Tenant = {
      ...currentTenant,
      defaultHourlyRate: validRate
    };
    setCurrentTenant(updatedTenant);
    setTenants(prev => prev.map(t => t.id === updatedTenant.id ? updatedTenant : t));
    setCompanySettingsForm(prev => ({ ...prev, defaultHourlyRate: validRate }));
    setCustomLaborInput(prev => ({ ...prev, valuePerHour: validRate }));
    setLaborFormData(prev => ({ ...prev, valuePerHour: validRate }));
    setLaborTemplateFormData(prev => ({ ...prev, defaultValuePerHour: validRate }));

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveTenant(updatedTenant);
      } catch (err: any) {
        console.warn("Aviso ao salvar taxa horária no Supabase:", err);
      }
    }
    showAlert(
      "Reajuste Salvo", 
      `O valor cobrado por hora da sua oficina foi reajustado para R$ ${validRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h com sucesso!`, 
      "success"
    );
  };

  // Exportar backup completo dos dados da oficina ativa (JSON)
  const handleExportTenantData = () => {
    try {
      const dataToExport = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        tenant: currentTenant,
        users: users.filter(u => !u.tenantId || u.tenantId === currentTenant.id),
        items: items.filter(i => !i.tenantId || i.tenantId === currentTenant.id),
        history: history.filter(h => !h.tenantId || h.tenantId === currentTenant.id),
        serviceOrders: serviceOrders.filter(o => !o.tenantId || o.tenantId === currentTenant.id),
        clients: clients.filter(c => !c.tenantId || c.tenantId === currentTenant.id),
        vehicleSections: vehicleSections.filter(s => !s.tenantId || s.tenantId === currentTenant.id),
        laborTemplates: laborTemplates.filter(t => !t.tenantId || t.tenantId === currentTenant.id)
      };

      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = currentTenant.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      a.href = url;
      a.download = `backup_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showAlert("Backup Gerado", `Backup da oficina "${currentTenant.name}" baixado com sucesso em formato JSON!`, "success");
    } catch (e: any) {
      showAlert("Erro na Exportação", `Não foi possível exportar os dados: ${e.message}`, "error");
    }
  };

  // Importar backup JSON para a oficina ativa
  const handleImportTenantData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error("Arquivo de backup inválido.");
        }

        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const taggedItems = parsed.items.map((i: any) => ({ ...i, tenantId: currentTenant.id }));
          setItems(taggedItems);
        }
        if (Array.isArray(parsed.history) && parsed.history.length > 0) {
          const taggedHistory = parsed.history.map((h: any) => ({ ...h, tenantId: currentTenant.id }));
          setHistory(taggedHistory);
        }
        if (Array.isArray(parsed.serviceOrders) && parsed.serviceOrders.length > 0) {
          const taggedOrders = parsed.serviceOrders.map((o: any) => ({ ...o, tenantId: currentTenant.id }));
          setServiceOrders(taggedOrders);
        }
        if (Array.isArray(parsed.clients) && parsed.clients.length > 0) {
          const taggedClients = parsed.clients.map((c: any) => ({ ...c, tenantId: currentTenant.id }));
          setClients(taggedClients);
        }
        if (Array.isArray(parsed.vehicleSections) && parsed.vehicleSections.length > 0) {
          setVehicleSections(parsed.vehicleSections.map((s: any) => ({ ...s, tenantId: currentTenant.id })));
        }
        if (Array.isArray(parsed.laborTemplates) && parsed.laborTemplates.length > 0) {
          setLaborTemplates(parsed.laborTemplates.map((t: any) => ({ ...t, tenantId: currentTenant.id })));
        }

        showAlert("Importação Concluída", `Dados importados com sucesso para a oficina "${currentTenant.name}"!`, "success");
      } catch (err: any) {
        showAlert("Erro de Importação", `Falha ao processar arquivo: ${err.message}`, "error");
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const syncToSupabase = async () => {
    if (!supabaseService.isAvailable()) {
      showAlert("Configuração Necessária", "Supabase não está configurado. Configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.", "info");
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      // Garantir que todos os itens salvos tenham o tenantId da oficina ativa
      const scopedItems = items.map(i => ({ ...i, tenantId: i.tenantId || currentTenant.id }));
      const scopedHistory = history.map(h => ({ ...h, tenantId: h.tenantId || currentTenant.id }));
      const scopedOrders = serviceOrders.map(o => ({ ...o, tenantId: o.tenantId || currentTenant.id }));
      const scopedSections = vehicleSections.map(s => ({ ...s, tenantId: s.tenantId || currentTenant.id }));
      const scopedTemplates = laborTemplates.map(l => ({ ...l, tenantId: l.tenantId || currentTenant.id }));
      const scopedClients = clients.map(c => ({ ...c, tenantId: c.tenantId || currentTenant.id }));
      const scopedPassports = utvPassports.map(p => ({ ...p, tenantId: p.tenantId || currentTenant.id }));

      const tasks = [
        { name: 'users', label: 'Usuários', action: () => supabaseService.saveUser(users) },
        { name: 'items', label: 'Peças & Estoque', action: () => supabaseService.saveItem(scopedItems) },
        { name: 'history', label: 'Movimentações', action: () => supabaseService.saveTransaction(scopedHistory) },
        { name: 'service_orders', label: 'Ordens de Serviço', action: () => supabaseService.saveServiceOrder(scopedOrders) },
        { name: 'vehicle_sections', label: 'Setores do Veículo', action: () => supabaseService.saveVehicleSection(scopedSections) },
        { name: 'labor_templates', label: 'Modelos de Mão de Obra', action: () => supabaseService.saveLaborTemplate(scopedTemplates) },
        { name: 'clients', label: 'Clientes', action: () => supabaseService.saveClient(scopedClients) },
        { name: 'utv_passports', label: 'Passaporte UTV', action: () => supabaseService.saveUTVPassport(scopedPassports) },
        { name: 'tenants', label: 'Oficinas', action: () => supabaseService.saveTenant(currentTenant) },
      ];

      await Promise.allSettled(tasks.map(t => t.action()));

      const tableErrors = supabaseService.getTableErrors();
      const missingTables = supabaseService.getMissingTables();
      const pendingKeys = Array.from(new Set([...Object.keys(tableErrors), ...missingTables]));

      if (pendingKeys.length > 0) {
        const errorLabels = pendingKeys.map(k => {
          const found = tasks.find(t => t.name === k);
          const label = found ? found.label : k;
          let reason = tableErrors[k] || 'tabela não encontrada';
          if (reason.includes('invalid input syntax for type integer')) {
            reason = 'coluna quantidade no Supabase é INTEGER; execute o Script SQL para atualizar para NUMERIC e aceitar decimais (3.3)';
          }
          return `${label} (${reason})`;
        }).join('\n• ');

        setSyncError(`Aviso: ${pendingKeys.length} tabela(s) com pendência no Supabase.`);
        showAlert(
          "Sincronização Realizada com Sucesso",
          `Os dados disponíveis foram sincronizados no seu Supabase!\n\nPendência detectada em:\n• ${errorLabels}\n\nPara resolver em 1 clique:\n1. Clique no botão "Script SQL Supabase" na barra de status\n2. Copie o script completo e execute no SQL Editor do seu painel Supabase.`,
          "info"
        );
      } else {
        setSyncError(null);
        showAlert("Sucesso", `Sincronização completa de todas as tabelas e dados da oficina "${currentTenant.name}" no Supabase!`, "success");
      }
    } catch (e: any) {
      console.error("Erro ao sincronizar com Supabase", e);
      setSyncError(`Erro: ${e.message || "Falha na sincronização"}`);
      showAlert("Erro na Sincronização", e.message || "Verifique as tabelas no Supabase", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- AUTH STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const cleanUsername = loginForm.username.trim().toLowerCase();
      const rawPassword = loginForm.password.trim();

      // 1. Verificar primeiro se é um Login de CLIENTE (Acesso Travado ao Espelho do Cliente)
      let matchedClient: Client | null = clients.find(
        c => c.username && c.username.trim().toLowerCase() === cleanUsername && c.password === rawPassword
      ) || null;

      if (!matchedClient) {
        // Fallback para clientes padrão de demonstração caso o estado local antigo ainda não tinha username
        const defaultMatched = DEFAULT_CLIENTS.find(
          c => c.username && c.username.trim().toLowerCase() === cleanUsername && c.password === rawPassword
        );
        if (defaultMatched) {
          matchedClient = defaultMatched;
          setClients(prev => prev.map(c => c.id === defaultMatched.id ? { ...c, username: defaultMatched.username, password: defaultMatched.password, isAccessActive: true } : c));
        }
      }

      if (!matchedClient && supabaseService.isAvailable()) {
        try {
          matchedClient = await supabaseService.authenticateClient(cleanUsername, rawPassword);
        } catch (err) {
          console.warn("Aviso ao consultar login de cliente no Supabase:", err);
        }
      }

      if (matchedClient) {
        if (matchedClient.isAccessActive === false) {
          showAlert(
            "Acesso Bloqueado",
            "O seu acesso ao Espelho do Cliente foi temporariamente desativado pela oficina. Entre em contato com a administração.",
            "error"
          );
          return;
        }

        // Registrar log de auditoria de acesso ao Espelho no Supabase
        if (supabaseService.isAvailable()) {
          supabaseService.logClientMirrorAccess({
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
            clientId: matchedClient.id,
            clientName: matchedClient.name,
            passportId: publicClientPassportId || undefined,
            accessedAt: new Date().toISOString(),
            tenantId: matchedClient.tenantId || currentTenant.id
          });
        }

        const clientUser: User = {
          id: matchedClient.id,
          username: matchedClient.username || cleanUsername,
          name: matchedClient.name,
          role: UserRole.CLIENT,
          clientId: matchedClient.id,
          allowedPassportId: publicClientPassportId || undefined,
          tenantId: matchedClient.tenantId || currentTenant.id
        };
        setCurrentUser(clientUser);
        setIsLoggedIn(true);
        return;
      }

      // 2. Caso não seja cliente, autenticar como Funcionário / Equipe da Oficina
      let user: User | null = null;
      if (supabaseService.isAvailable()) {
        try {
          user = await supabaseService.login(loginForm.username, loginForm.password);
        } catch (error) {
          console.error("Erro na chamada RPC do Supabase:", error);
        }
      }
      
      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
      } else {
        const found = users.find(u => u.username.toLowerCase() === cleanUsername && (
          u.password === loginForm.password || 
          (!u.password && (loginForm.password === '123' || loginForm.password === 'admin'))
        ));

        if (found) {
          setCurrentUser(found);
          setIsLoggedIn(true);
        } else if ((cleanUsername === 'admin' && loginForm.password === 'admin') || (cleanUsername === 'carlos' && (loginForm.password === '123' || loginForm.password === '123456'))) {
          const matched = users.find(u => u.username.toLowerCase() === cleanUsername) || 
                          (cleanUsername === 'admin' ? DEFAULT_USERS[0] : DEFAULT_USERS[1]);
          if (!users.some(u => u.id === matched.id)) {
            setUsers(prev => [matched, ...prev]);
          }
          setCurrentUser(matched);
          setIsLoggedIn(true);
        } else {
          showAlert(
            "Login Inválido",
            publicClientPassportId
              ? "Login ou senha de cliente incorretos. Utilize as credenciais enviadas pela oficina (Dica de teste: guilherme / 123)."
              : "Usuário ou senha incorretos. Dica de teste: admin / admin, carlos / 123 ou cliente: guilherme / 123",
            "error"
          );
        }
      }
    } catch (error: any) {
      console.error("Erro inesperado no login:", error);
      const msg = error?.message || "Erro de conexão.";
      showAlert("Erro no Login", `Erro ao processar login: ${msg}. Tente novamente.`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSelectedClientLockedPassportId(null);
    setActiveTab('dashboard');
  };

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substr(2, 9);
  };

  const isAdmin = currentUser?.role === UserRole.STOCKIST || currentUser?.username === 'admin';

  // --- USER MGMT (MASTER) ---
  const handleRefreshUsers = async (showNotification = true) => {
    if (!supabaseService.isAvailable()) {
      if (showNotification) showAlert("Aviso", "Supabase não está configurado. Verifique as credenciais no arquivo .env.", "info");
      return;
    }
    setIsSyncing(true);
    try {
      const fetched = await supabaseService.getUsers();
      if (fetched && fetched.length > 0) {
        setUsers(prev => {
          const map = new Map<string, User>();
          prev.forEach(u => map.set(u.id, u));
          fetched.forEach(u => map.set(u.id, u));
          return Array.from(map.values());
        });
        if (showNotification) showAlert("Equipe Sincronizada", `${fetched.length} funcionário(s) carregado(s) do Supabase com sucesso!`, "success");
      } else {
        if (showNotification) showAlert("Aviso", "Nenhum funcionário adicional foi retornado pelo Supabase.", "info");
      }
    } catch (err: any) {
      console.error("Erro ao sincronizar funcionários do Supabase:", err);
      if (showNotification) showAlert("Erro", `Não foi possível carregar os funcionários do Supabase: ${err.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && supabaseService.isAvailable()) {
      supabaseService.getUsers().then(fetched => {
        if (fetched && fetched.length > 0) {
          setUsers(prev => {
            const map = new Map<string, User>();
            prev.forEach(u => map.set(u.id, u));
            fetched.forEach(u => map.set(u.id, u));
            return Array.from(map.values());
          });
        }
      }).catch(err => {
        console.warn("Aviso ao auto-carregar funcionários do Supabase:", err);
      });
    }
  }, [activeTab]);

  const deleteUser = async (id: string) => {
    showConfirm(
      "Confirmar Exclusão",
      "Esta ação apagará o acesso deste funcionário permanentemente. Confirmar?",
      async () => {
        setUsers(prev => prev.filter(u => u.id !== id));
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteUser(id);
          } catch (err) {
            console.error("Erro ao deletar usuário no Supabase", err);
          }
        }
      }
    );
  };

  const resetPassword = async (id: string) => {
    const newPass = prompt("Digite a nova senha para este usuário:");
    if (newPass) {
      const user = users.find(u => u.id === id);
      if (!user) return;
      
      const updatedUser = { ...user, password: newPass };
      setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      
      if (supabaseService.isAvailable()) {
        try {
          await supabaseService.saveUser(updatedUser);
        } catch (err) {
          console.error("Erro ao resetar senha no Supabase", err);
        }
      }
      showAlert("Sucesso", "Senha redefinida com sucesso.", "success");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name.trim() || !userFormData.username.trim() || !userFormData.password.trim()) {
      showAlert("Erro", "Nome completo, ID de usuário e senha inicial são obrigatórios.", "error");
      return;
    }

    const cleanUsername = userFormData.username.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      showAlert("Erro", "Este ID de usuário de login já existe no sistema.", "error");
      return;
    }

    const newUser: User = {
      id: generateId(),
      name: userFormData.name.trim(),
      username: cleanUsername,
      password: userFormData.password,
      role: userFormData.role,
      email: userFormData.email.trim() || undefined,
      tenantId: currentTenant.id
    };

    setUsers(prev => [...prev, newUser]);
    setIsAddingUser(false);
    setUserFormData({
      name: '',
      username: '',
      password: '',
      role: UserRole.MECHANIC,
      email: ''
    });

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveUser(newUser);
        showAlert("Sucesso", "Funcionário registrado e sincronizado com o Supabase!", "success");
      } catch (err: any) {
        console.error("Erro ao salvar funcionário no Supabase", err);
        showAlert("Sucesso Local", `Funcionário cadastrado localmente. Erro de sincronização: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", "Funcionário cadastrado com sucesso localmente!", "success");
    }
  };

  // --- SERVICE ORDER ACTIONS ---
  const handleAddLaborToOSCreation = (templateId: string) => {
    const template = laborTemplates.find(t => t.id === templateId);
    if (!template) return;
    const sectionName = vehicleSections.find(s => s.id === template.sectionId)?.name;
    const isFixed = template.pricingType === 'fixed';
    const gross = computeLaborGross({
      pricingType: template.pricingType,
      hours: template.defaultHours,
      minutes: template.minutes,
      valuePerHour: template.defaultValuePerHour,
      fixedValue: template.fixedValue
    });

    // Check if related to any labor already in osLaborList (apenas para serviços cobrados por tempo)
    const relation = !isFixed ? checkLaborRelation({
      description: template.description,
      section: sectionName,
      templateId: template.id,
      pricingType: template.pricingType,
      hours: template.defaultHours,
      minutes: template.minutes,
      valuePerHour: template.defaultValuePerHour,
      fixedValue: template.fixedValue
    }, osLaborList, laborTemplates) : null;

    if (relation && osLaborList.length > 0) {
      setSharedLaborWarning({
        isOpen: true,
        targetOSId: undefined, // undefined = OS Creation
        newLaborCandidate: {
          description: template.description,
          pricingType: template.pricingType,
          hours: template.defaultHours,
          minutes: template.minutes,
          valuePerHour: template.defaultValuePerHour,
          fixedValue: template.fixedValue,
          section: sectionName,
          sourceTemplateId: template.id
        },
        relatedLaborInOS: relation.relatedLabor,
        availableLaborsInOS: osLaborList,
        reason: relation.reason,
        discountType: 'percentage',
        discountPercentage: template.discountPercentage ?? relation.suggestedDiscountPercentage,
        discountValue: template.discountValue || relation.suggestedDiscountValue,
        sharedReason: template.sharedNotes || `Metade do serviço (desmontagem/acesso à região) já foi executado na M.O. "${relation.relatedLabor.description}"`
      });
      setSelectedLaborTemplateToAdd('');
      return;
    }

    // Direct addition if no relation detected
    const discPct = template.discountPercentage || 0;
    const discVal = template.discountValue || (isFixed ? 0 : (gross * discPct) / 100);
    const finalVal = Math.max(0, gross - discVal);

    const newLabor: LaborItem = {
      id: generateId(),
      description: template.description,
      pricingType: template.pricingType || 'hourly',
      hours: template.defaultHours,
      minutes: template.minutes || 0,
      valuePerHour: template.defaultValuePerHour,
      fixedValue: template.fixedValue,
      section: sectionName,
      linkedToId: template.linkedTemplateId ? (osLaborList.find(l => {
        const targetT = laborTemplates.find(t => t.id === template.linkedTemplateId);
        return targetT && l.description.toLowerCase() === targetT.description.toLowerCase();
      })?.id) : undefined,
      isShared: Boolean(template.linkedTemplateId || (template.discountPercentage && template.discountPercentage > 0)),
      discountPercentage: template.discountPercentage,
      discountValue: template.discountValue,
      originalTotal: gross,
      finalTotal: finalVal,
      sharedReason: template.sharedNotes
    };
    setOsLaborList(prev => [...prev, newLabor]);
    setSelectedLaborTemplateToAdd('');
  };

  const handleAddCustomLaborToOSCreation = () => {
    if (!customLaborInput.description.trim()) {
      showAlert("Aviso", "A descrição do serviço é obrigatória.", "error");
      return;
    }

    const isFixed = customLaborInput.pricingType === 'fixed';
    const gross = computeLaborGross({
      pricingType: customLaborInput.pricingType,
      hours: customLaborInput.hours,
      minutes: customLaborInput.minutes,
      valuePerHour: customLaborInput.valuePerHour,
      fixedValue: customLaborInput.fixedValue
    });

    if (gross <= 0) {
      showAlert("Valor Obrigatório", "Por favor, informe as horas/minutos trabalhados ou o valor fixo cobrado por este serviço.", "error");
      return;
    }

    // Se o usuário optou manualmente por mão de obra compartilhada (apenas para cobrança por tempo):
    if (customLaborInput.isShared && customLaborInput.linkedToId && !isFixed) {
      let discVal = 0;
      let discPct = 0;
      if (customLaborInput.discountType === 'percentage') {
        discPct = Number(customLaborInput.discountPercentage) || 50;
        discVal = (gross * discPct) / 100;
      } else {
        discVal = Number(customLaborInput.discountValue) || 0;
        discPct = gross > 0 ? Math.round((discVal / gross) * 100) : 0;
      }
      const linkedLabor = osLaborList.find(l => l.id === customLaborInput.linkedToId);

      const newLabor: LaborItem = {
        id: generateId(),
        description: customLaborInput.description.trim(),
        pricingType: customLaborInput.pricingType,
        hours: Number(customLaborInput.hours) || 0,
        minutes: Number(customLaborInput.minutes) || 0,
        valuePerHour: Number(customLaborInput.valuePerHour) || currentTenant.defaultHourlyRate || 150,
        fixedValue: undefined,
        section: customLaborInput.section.trim() || undefined,
        linkedToId: customLaborInput.linkedToId,
        isShared: true,
        discountPercentage: discPct,
        discountValue: discVal,
        originalTotal: gross,
        finalTotal: Math.max(0, gross - discVal),
        sharedReason: customLaborInput.sharedReason.trim() || (linkedLabor ? `Metade do serviço executado na M.O. "${linkedLabor.description}" (desmontagem aproveitada)` : 'Mão de obra compartilhada')
      };
      setOsLaborList(prev => [...prev, newLabor]);
      setCustomLaborInput({
        description: '', pricingType: 'hourly', hours: 1, minutes: 0, valuePerHour: currentTenant.defaultHourlyRate || 150, fixedValue: 150, section: '',
        linkedToId: '', isShared: false, discountType: 'percentage', discountPercentage: 50, discountValue: 0, sharedReason: ''
      });
      setIsAddingCustomLabor(false);
      return;
    }

    // Auto-detecta vínculo com serviços existentes apenas se for por tempo (não vincula serviços por dificuldade)
    const relation = !isFixed ? checkLaborRelation({
      description: customLaborInput.description.trim(),
      section: customLaborInput.section.trim() || undefined,
      pricingType: customLaborInput.pricingType,
      hours: Number(customLaborInput.hours) || 0,
      minutes: Number(customLaborInput.minutes) || 0,
      valuePerHour: Number(customLaborInput.valuePerHour) || currentTenant.defaultHourlyRate || 150,
      fixedValue: Number(customLaborInput.fixedValue) || 0
    }, osLaborList, laborTemplates) : null;

    if (relation && osLaborList.length > 0) {
      setSharedLaborWarning({
        isOpen: true,
        targetOSId: undefined,
        newLaborCandidate: {
          description: customLaborInput.description.trim(),
          pricingType: customLaborInput.pricingType,
          hours: Number(customLaborInput.hours) || 0,
          minutes: Number(customLaborInput.minutes) || 0,
          valuePerHour: Number(customLaborInput.valuePerHour) || currentTenant.defaultHourlyRate || 150,
          fixedValue: Number(customLaborInput.fixedValue) || 0,
          section: customLaborInput.section.trim() || undefined
        },
        relatedLaborInOS: relation.relatedLabor,
        availableLaborsInOS: osLaborList,
        reason: relation.reason,
        discountType: 'percentage',
        discountPercentage: 50,
        discountValue: (gross * 50) / 100,
        sharedReason: `Metade do serviço (desmontagem e acesso à região) já foi executado na M.O. "${relation.relatedLabor.description}"`
      });
      setCustomLaborInput({
        description: '', pricingType: 'hourly', hours: 1, minutes: 0, valuePerHour: currentTenant.defaultHourlyRate || 150, fixedValue: 150, section: '',
        linkedToId: '', isShared: false, discountType: 'percentage', discountPercentage: 50, discountValue: 0, sharedReason: ''
      });
      setIsAddingCustomLabor(false);
      return;
    }

    // Inclusão direta (por tempo ou por dificuldade/preço fixo sem somar taxa horária)
    const newLabor: LaborItem = {
      id: generateId(),
      description: customLaborInput.description.trim(),
      pricingType: customLaborInput.pricingType,
      hours: isFixed ? 0 : (Number(customLaborInput.hours) || 0),
      minutes: isFixed ? 0 : (Number(customLaborInput.minutes) || 0),
      valuePerHour: Number(customLaborInput.valuePerHour) || currentTenant.defaultHourlyRate || 150,
      fixedValue: isFixed ? gross : undefined,
      section: customLaborInput.section.trim() || undefined,
      originalTotal: gross,
      finalTotal: gross
    };
    setOsLaborList(prev => [...prev, newLabor]);
    setCustomLaborInput({
      description: '', pricingType: 'hourly', hours: 1, minutes: 0, valuePerHour: currentTenant.defaultHourlyRate || 150, fixedValue: 150, section: '',
      linkedToId: '', isShared: false, discountType: 'percentage', discountPercentage: 50, discountValue: 0, sharedReason: ''
    });
    setIsAddingCustomLabor(false);
  };

  const handleConfirmSharedLaborWarning = async (result: {
    discountPercentage: number;
    discountValue: number;
    finalTotal: number;
    sharedReason: string;
    linkedToId: string;
  }) => {
    if (!sharedLaborWarning) return;
    const { newLaborCandidate, targetOSId, pendingPartToLink } = sharedLaborWarning;
    const gross = computeLaborGross(newLaborCandidate);

    const newLaborId = generateId();
    const newLabor: LaborItem = {
      id: newLaborId,
      description: newLaborCandidate.description,
      pricingType: newLaborCandidate.pricingType || 'hourly',
      hours: newLaborCandidate.hours || 0,
      minutes: newLaborCandidate.minutes || 0,
      valuePerHour: newLaborCandidate.valuePerHour,
      fixedValue: newLaborCandidate.fixedValue,
      section: newLaborCandidate.section,
      linkedToId: result.linkedToId,
      isShared: true,
      discountPercentage: result.discountPercentage,
      discountValue: result.discountValue,
      originalTotal: gross,
      finalTotal: result.finalTotal,
      sharedReason: result.sharedReason,
      linkedPartIds: pendingPartToLink ? [pendingPartToLink.itemId] : undefined
    };

    if (targetOSId) {
      const os = serviceOrders.find(o => o.id === targetOSId);
      if (os) {
        let updatedParts = os.parts.map(p => ({
          ...p,
          stockDeducted: p.stockDeducted ?? Boolean(os.stockDeducted)
        }));
        if (pendingPartToLink) {
          const partWithLaborLink: OSPart = {
            ...pendingPartToLink,
            linkedLaborId: newLaborId,
            linkedLaborDescription: newLabor.description,
            stockDeducted: false
          };
          updatedParts.push(partWithLaborLink);
        }

        const updatedOS = {
          ...os,
          parts: updatedParts,
          laborItems: [...os.laborItems, newLabor],
          stockDeducted: pendingPartToLink ? false : os.stockDeducted,
          updatedAt: new Date().toISOString()
        };
        setServiceOrders(prev => prev.map(o => o.id === targetOSId ? updatedOS : o));
        if (selectedOS?.id === targetOSId) {
          setSelectedOS(updatedOS);
        }
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveServiceOrder(updatedOS);
          } catch (err) {
            console.error("Erro ao salvar serviço na OS no Supabase", err);
          }
        }
        showAlert(
          "M.O. Compartilhada Adicionada", 
          pendingPartToLink 
            ? `Peça "${pendingPartToLink.name}" vinculada e Serviço "${newLabor.description}" adicionado com ${result.discountPercentage}% de desconto compartilhado!` 
            : `Serviço "${newLabor.description}" adicionado com ${result.discountPercentage}% de desconto compartilhado!`, 
          "success"
        );
      }
    } else {
      setOsLaborList(prev => [...prev, newLabor]);
      showAlert("M.O. Compartilhada Adicionada", `Serviço "${newLabor.description}" adicionado com ${result.discountPercentage}% de desconto compartilhado!`, "success");
    }

    setSharedLaborWarning(null);
  };

  const handleConfirmSharedLaborWithoutDiscount = async () => {
    if (!sharedLaborWarning) return;
    const { newLaborCandidate, targetOSId, pendingPartToLink } = sharedLaborWarning;
    const gross = computeLaborGross(newLaborCandidate);

    const newLaborId = generateId();
    const newLabor: LaborItem = {
      id: newLaborId,
      description: newLaborCandidate.description,
      pricingType: newLaborCandidate.pricingType || 'hourly',
      hours: newLaborCandidate.hours || 0,
      minutes: newLaborCandidate.minutes || 0,
      valuePerHour: newLaborCandidate.valuePerHour,
      fixedValue: newLaborCandidate.fixedValue,
      section: newLaborCandidate.section,
      originalTotal: gross,
      finalTotal: gross,
      isShared: false,
      linkedPartIds: pendingPartToLink ? [pendingPartToLink.itemId] : undefined
    };

    if (targetOSId) {
      const os = serviceOrders.find(o => o.id === targetOSId);
      if (os) {
        let updatedParts = os.parts.map(p => ({
          ...p,
          stockDeducted: p.stockDeducted ?? Boolean(os.stockDeducted)
        }));
        if (pendingPartToLink) {
          const partWithLaborLink: OSPart = {
            ...pendingPartToLink,
            linkedLaborId: newLaborId,
            linkedLaborDescription: newLabor.description,
            stockDeducted: false
          };
          updatedParts.push(partWithLaborLink);
        }

        const updatedOS = {
          ...os,
          parts: updatedParts,
          laborItems: [...os.laborItems, newLabor],
          stockDeducted: pendingPartToLink ? false : os.stockDeducted,
          updatedAt: new Date().toISOString()
        };
        setServiceOrders(prev => prev.map(o => o.id === targetOSId ? updatedOS : o));
        if (selectedOS?.id === targetOSId) {
          setSelectedOS(updatedOS);
        }
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveServiceOrder(updatedOS);
          } catch (err) {
            console.error("Erro ao salvar serviço na OS no Supabase", err);
          }
        }
        showAlert(
          "Sucesso",
          pendingPartToLink 
            ? `Peça "${pendingPartToLink.name}" vinculada e Serviço "${newLabor.description}" adicionado com valor integral na O.S.!` 
            : `Serviço "${newLabor.description}" adicionado com valor integral na O.S.!`,
          "success"
        );
      }
    } else {
      setOsLaborList(prev => [...prev, newLabor]);
    }

    setSharedLaborWarning(null);
  };

  const handleConfirmSharedLaborLinkPartOnly = async () => {
    if (!sharedLaborWarning || !sharedLaborWarning.pendingPartToLink || !sharedLaborWarning.targetOSId) {
      setSharedLaborWarning(null);
      return;
    }
    const os = serviceOrders.find(o => o.id === sharedLaborWarning.targetOSId);
    if (os) {
      const existingPartsWithStatus = os.parts.map(p => ({
        ...p,
        stockDeducted: p.stockDeducted ?? Boolean(os.stockDeducted)
      }));
      const updatedOS = {
        ...os,
        parts: [...existingPartsWithStatus, { ...sharedLaborWarning.pendingPartToLink, stockDeducted: false }],
        stockDeducted: false,
        updatedAt: new Date().toISOString()
      };
      setServiceOrders(prev => prev.map(o => o.id === os.id ? updatedOS : o));
      if (selectedOS?.id === os.id) setSelectedOS(updatedOS);
      if (supabaseService.isAvailable()) {
        supabaseService.saveServiceOrder(updatedOS).catch(err => console.error("Erro ao salvar OS", err));
      }
      showAlert("Peça Vinculada", `Peça "${sharedLaborWarning.pendingPartToLink.name}" vinculada à O.S. (sem criação de mão de obra).`, "success");
    }
    setSharedLaborWarning(null);
  };

  const handleRemoveLaborFromOSCreation = (laborId: string) => {
    setOsLaborList(prev => prev.filter(l => l.id !== laborId));
  };

  const handleQuickAddVehicleToClient = async (clientId: string) => {
    if (!quickVehicleInput.model.trim()) {
      showAlert("Aviso", "O modelo do veículo é obrigatório.", "error");
      return;
    }
    const targetClient = clients.find(c => c.id === clientId);
    if (!targetClient) return;

    const newVeh: ClientVehicle = {
      id: generateId(),
      model: quickVehicleInput.model.trim(),
      plate: quickVehicleInput.plate.trim(),
      year: quickVehicleInput.year.trim()
    };

    const updatedClient = {
      ...targetClient,
      vehicles: [...targetClient.vehicles, newVeh]
    };

    setClients(prev => prev.map(c => c.id === clientId ? updatedClient : c));
    setOsFormData(prev => ({
      ...prev,
      vehicleId: newVeh.id,
      vehicleModel: `${newVeh.model.toUpperCase()} ${newVeh.plate ? `(PLACA: ${newVeh.plate.toUpperCase()})` : ''}`
    }));
    setQuickVehicleInput({ model: '', plate: '', year: '' });
    setIsAddingQuickVehicle(false);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveClient(updatedClient);
      } catch (err) {
        console.error("Erro ao salvar novo veículo no cliente no Supabase", err);
      }
    }
    showAlert("Veículo Vinculado", `Veículo "${newVeh.model}" cadastrado e vinculado à O.S.!`, "success");
  };

  const handleAddOS = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalLaborItems: LaborItem[] = [...osLaborList];
    if (finalLaborItems.length === 0 && osFormData.laborTemplateId) {
      const selectedTemplate = laborTemplates.find(t => t.id === osFormData.laborTemplateId);
      if (selectedTemplate) {
        finalLaborItems.push({
          id: generateId(),
          description: selectedTemplate.description,
          hours: selectedTemplate.defaultHours,
          valuePerHour: selectedTemplate.defaultValuePerHour,
          section: vehicleSections.find(s => s.id === selectedTemplate.sectionId)?.name
        });
      }
    }

    if (finalLaborItems.length === 0) {
      showAlert("Mão de Obra Obrigatória", "Por favor, selecione ou adicione pelo menos uma mão de obra para abrir a O.S.", "error");
      return;
    }

    const selectedMechanic = users.find(u => u.id === osFormData.mechanicId);

    const tenantOrders = serviceOrders.filter(o => !o.tenantId || o.tenantId === currentTenant.id);
    const nextNumber = tenantOrders.length + 1;

    const newOS: ServiceOrder = {
      id: generateId(),
      osNumber: nextNumber.toString().padStart(4, '0'),
      customerName: osFormData.customerName.trim(),
      vehicleModel: osFormData.vehicleModel.trim(),
      status: OSStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      laborItems: finalLaborItems,
      parts: [...osInitialPartsList],
      observations: osFormData.observations.trim() || undefined,
      stockDeducted: false,
      clientId: osFormData.clientId || undefined,
      vehicleId: osFormData.vehicleId || undefined,
      mechanicId: osFormData.mechanicId || undefined,
      mechanicName: selectedMechanic ? selectedMechanic.name : undefined,
      passportId: osFormData.passportId || undefined,
      tenantId: currentTenant.id
    };

    setServiceOrders(prev => [newOS, ...prev]);
    setIsAddingOS(false);
    setOsFormData({ customerName: '', vehicleModel: '', observations: '', laborTemplateId: '', clientId: '', vehicleId: '', mechanicId: '', passportId: '' });
    setOsLaborList([]);
    setOsInitialPartsList([]);
    setIsAddingCustomLabor(false);
    setIsAddingQuickVehicle(false);
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveServiceOrder(newOS);
        showAlert("Sucesso", `Ordem de Serviço #${newOS.osNumber} aberta e sincronizada com sucesso!`, "success");
      } catch (err: any) {
        console.error("Erro ao salvar OS no Supabase", err);
        showAlert("Sucesso Local", `O.S. #${newOS.osNumber} aberta localmente. Erro no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", `Ordem de Serviço #${newOS.osNumber} aberta com sucesso!`, "success");
    }
  };

  // --- UTV PASSPORT ACTIONS ---
  const handleSaveUTVPassport = async (passport: UTVPassport) => {
    const scoped: UTVPassport = {
      ...passport,
      tenantId: passport.tenantId || currentTenant.id,
      updatedAt: new Date().toISOString()
    };
    setUtvPassports(prev => {
      const exists = prev.some(p => p.id === scoped.id);
      if (exists) {
        return prev.map(p => p.id === scoped.id ? scoped : p);
      }
      return [scoped, ...prev];
    });
    if (selectedPassport?.id === scoped.id) {
      setSelectedPassport(scoped);
    }

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveUTVPassport(scoped);
      } catch (err) {
        console.warn("Aviso ao salvar Passaporte UTV no Supabase:", err);
      }
    }
  };

  const handleDeleteUTVPassport = (id: string) => {
    showConfirm(
      "Excluir Passaporte UTV",
      "Deseja realmente remover este Passaporte UTV permanentemente?",
      async () => {
        setUtvPassports(prev => prev.filter(p => p.id !== id));
        if (selectedPassport?.id === id) setSelectedPassport(null);
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteUTVPassport(id);
          } catch (err) {
            console.warn("Erro ao excluir Passaporte UTV no Supabase:", err);
          }
        }
        showAlert("Passaporte Excluído", "O Passaporte UTV foi removido com sucesso.", "success");
      }
    );
  };

  const handleApproveTriageAndCreateOS = async (passport: UTVPassport, triage: UTVTriageRequest) => {
    // 1. Coleta peças vencidas ou próximas da troca para este KM reportado
    const reportedKm = triage.reportedKm || passport.currentKm || 0;
    const dueItems = (passport.maintenanceItems || []).filter(m => {
      const nextKm = (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0);
      return (nextKm - reportedKm) <= 100;
    });

    const partsToInclude: OSPart[] = [];
    const laborToInclude: LaborItem[] = [];

    for (const m of dueItems) {
      const stockItem = items.find(i =>
        (m.itemId && i.id === m.itemId) ||
        (m.partNumber && i.partNumber.trim().toUpperCase() === m.partNumber.trim().toUpperCase())
      );

      const newLaborId = generateId();
      const matchedTemplate = stockItem ? findLaborTemplateForPart(stockItem, laborTemplates) : undefined;

      if (matchedTemplate) {
        const gross = computeLaborGross(matchedTemplate);
        const sectionName = vehicleSections.find(s => s.id === matchedTemplate.sectionId)?.name;
        laborToInclude.push({
          id: newLaborId,
          description: matchedTemplate.description,
          pricingType: matchedTemplate.pricingType || 'hourly',
          hours: matchedTemplate.defaultHours || 1,
          minutes: matchedTemplate.minutes || 0,
          valuePerHour: matchedTemplate.defaultValuePerHour || currentTenant.defaultHourlyRate || 150,
          fixedValue: matchedTemplate.fixedValue,
          section: sectionName,
          originalTotal: gross,
          finalTotal: gross,
          linkedPartIds: stockItem ? [stockItem.id] : undefined
        });
      }

      partsToInclude.push({
        itemId: stockItem?.id || m.itemId || generateId(),
        name: stockItem?.name || m.name,
        partNumber: stockItem?.partNumber || m.partNumber || 'S/PN',
        quantity: Number(m.requiredQty) || 1,
        unitValue: stockItem?.value || 0,
        unit: stockItem?.unit || m.unit || 'un',
        linkedLaborId: matchedTemplate ? newLaborId : undefined,
        linkedLaborDescription: matchedTemplate?.description
      });
    }

    if (laborToInclude.length === 0) {
      const rate = currentTenant.defaultHourlyRate || 150;
      laborToInclude.push({
        id: generateId(),
        description: `REVISÃO & PREPARAÇÃO PASSAPORTE UTV (${passport.vehicleNumber || passport.vehicleModel})`,
        pricingType: 'hourly',
        hours: 2,
        minutes: 0,
        valuePerHour: rate,
        section: 'Revisão de Competição',
        originalTotal: rate * 2,
        finalTotal: rate * 2
      });
    }

    const tenantOrders = serviceOrders.filter(o => !o.tenantId || o.tenantId === currentTenant.id);
    const nextNumber = (tenantOrders.length + 1).toString().padStart(4, '0');
    const nextComp = (passport.competitions || []).find(c => c.status === 'UPCOMING' || c.status === 'IN_PREP');

    const newOS: ServiceOrder = {
      id: generateId(),
      osNumber: nextNumber,
      customerName: passport.customerName,
      vehicleModel: `${passport.vehicleNumber ? `${passport.vehicleNumber} - ` : ''}${passport.vehicleModel}`,
      status: OSStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      laborItems: laborToInclude,
      parts: partsToInclude,
      observations: `[PASSAPORTE UTV • QR: ${passport.qrCode}] KM Atual: ${reportedKm} km | Próxima Prova: ${nextComp?.name || 'A definir'} | Plano: ${passport.nextCompetitionPlan || ''}${triage.notes ? ` | Obs Mecânico (${triage.mechanicName}): ${triage.notes}` : ''}`,
      stockDeducted: false,
      clientId: passport.clientId,
      vehicleId: passport.vehicleId,
      mechanicId: triage.mechanicId,
      mechanicName: triage.mechanicName,
      passportId: passport.id,
      tenantId: currentTenant.id
    };

    const approvedTriage: UTVTriageRequest = {
      ...triage,
      status: 'APPROVED',
      approvedBy: currentUser?.name || 'Chefe de Oficina',
      approvedAt: new Date().toISOString(),
      linkedOSId: newOS.id,
      linkedOSNumber: newOS.osNumber
    };

    const updatedPassport: UTVPassport = {
      ...passport,
      currentKm: reportedKm,
      carStatus: 'IN_MAINTENANCE',
      activeTriage: approvedTriage,
      triageHistory: (passport.triageHistory || []).map(t => t.id === triage.id ? approvedTriage : t),
      updatedAt: new Date().toISOString()
    };

    await handleSaveUTVPassport(updatedPassport);
    setServiceOrders(prev => [newOS, ...prev]);
    if (supabaseService.isAvailable()) {
      supabaseService.saveServiceOrder(newOS).catch(err => console.warn("Erro ao salvar OS no Supabase:", err));
    }

    setSelectedPassport(null);
    setActiveTab('service_orders');
    setOsSubTab('orders');
    setSelectedOS(newOS);

    showAlert(
      "Manutenção Autorizada & O.S. Aberta!",
      `Triagem do mecânico ${triage.mechanicName} aprovada! A O.S. #${newOS.osNumber} foi aberta automaticamente com ${partsToInclude.length} item(ns) previstos no Passaporte UTV.`,
      "success"
    );
  };

  const handleDeleteLaborFromOS = async (osId: string, laborId: string) => {
    showConfirm(
      "Excluir Serviço da O.S.",
      "Deseja realmente remover este serviço da Ordem de Serviço?",
      async () => {
        const os = serviceOrders.find(o => o.id === osId);
        if (!os) return;
        const removedIds = new Set(
          os.laborItems.filter(l => l.id === laborId || l.linkedToId === laborId).map(l => l.id)
        );
        const updatedLaborItems = os.laborItems.filter(l => !removedIds.has(l.id));
        const updatedParts = os.parts.map(p =>
          p.linkedLaborId && removedIds.has(p.linkedLaborId)
            ? { ...p, linkedLaborId: undefined, linkedLaborDescription: undefined }
            : p
        );
        const updatedOS = {
          ...os,
          laborItems: updatedLaborItems,
          parts: updatedParts,
          updatedAt: new Date().toISOString()
        };
        setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
        if (selectedOS?.id === osId) {
          setSelectedOS(updatedOS);
        }
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveServiceOrder(updatedOS);
            showAlert("Sucesso", "Serviço removido com sucesso da O.S.!", "success");
          } catch (err: any) {
            console.error("Erro ao atualizar O.S. no Supabase", err);
          }
        } else {
          showAlert("Sucesso", "Serviço removido com sucesso.", "success");
        }
      }
    );
  };

  const handleLinkLaunchedPartToOSLabor = async (osId: string, partIndex: number, laborId: string) => {
    const os = serviceOrders.find(o => o.id === osId);
    if (!os) return;
    const targetPart = os.parts[partIndex];
    if (!targetPart) return;

    const targetLabor = laborId ? os.laborItems.find(l => l.id === laborId) : undefined;

    const updatedParts = os.parts.map((p, idx) => {
      if (idx !== partIndex) return p;
      return {
        ...p,
        linkedLaborId: targetLabor ? targetLabor.id : undefined,
        linkedLaborDescription: targetLabor ? targetLabor.description : undefined
      };
    });

    // Sincroniza linkedPartIds em cada LaborItem da OS com base nas peças vinculadas
    const updatedLaborItems = os.laborItems.map(l => {
      const partIdsForThisLabor = Array.from(
        new Set(
          updatedParts
            .filter(p => p.linkedLaborId === l.id || (!p.linkedLaborId && p.linkedLaborDescription && p.linkedLaborDescription.toLowerCase() === l.description.toLowerCase()))
            .map(p => p.itemId)
        )
      );
      return {
        ...l,
        linkedPartIds: partIdsForThisLabor
      };
    });

    const updatedOS: ServiceOrder = {
      ...os,
      parts: updatedParts,
      laborItems: updatedLaborItems,
      updatedAt: new Date().toISOString()
    };

    setServiceOrders(prev => prev.map(o => (o.id === osId ? updatedOS : o)));
    if (selectedOS?.id === osId) {
      setSelectedOS(updatedOS);
    }

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveServiceOrder(updatedOS);
      } catch (err) {
        console.error("Erro ao vincular peça à M.O. da O.S. no Supabase:", err);
      }
    }
  };

  const handleUpdatePartQuantityInOS = async (
    osId: string,
    partIndex: number,
    newVal: number,
    mode: 'standard' | 'ml' = 'standard'
  ) => {
    const os = serviceOrders.find(o => o.id === osId);
    if (!os) return;
    const targetPart = os.parts[partIndex];
    if (!targetPart) return;

    if (isNaN(newVal) || newVal <= 0) {
      showAlert("Quantidade Inválida", "Informe uma quantidade maior que zero para o item.", "error");
      return;
    }

    const oldQty = Number(targetPart.quantity) || 0;
    const oldMl = targetPart.mlQuantity;
    const isMlMode = mode === 'ml' || (!mode && Boolean(targetPart.mlQuantity));

    let calculatedQty: number;
    let calculatedTotalValue: number;
    let updatedMlQuantity: number | undefined = undefined;

    if (isMlMode) {
      updatedMlQuantity = newVal;
      calculatedQty = Math.round((newVal / 1000) * 10000) / 10000;
      calculatedTotalValue = Math.round(((targetPart.unitValue / 1000) * newVal) * 100) / 100;
    } else {
      calculatedQty = Math.round(newVal * 10000) / 10000;
      calculatedTotalValue = Math.round((calculatedQty * targetPart.unitValue) * 100) / 100;
    }

    if (calculatedQty === oldQty && updatedMlQuantity === oldMl) {
      setEditingOSPartIdx(null);
      return;
    }

    const updatedPart: OSPart = {
      ...targetPart,
      quantity: calculatedQty,
      measureMode: isMlMode ? 'ml' : 'standard',
      mlQuantity: isMlMode ? updatedMlQuantity : undefined,
      totalValue: calculatedTotalValue
    };

    const updatedParts = os.parts.map((p, idx) => (idx === partIndex ? updatedPart : p));
    const updatedOS: ServiceOrder = {
      ...os,
      parts: updatedParts,
      updatedAt: new Date().toISOString()
    };

    // Se a OS já teve baixa de estoque efetuada, ajusta automaticamente a diferença no estoque físico
    const matchedItem = items.find(i => i.id === targetPart.itemId);
    const diffQty = Math.round((calculatedQty - oldQty) * 10000) / 10000;
    let updatedStockItem: InventoryItem | null = null;
    let adjustmentTx: Transaction | null = null;

    if (os.stockDeducted && matchedItem && diffQty !== 0) {
      const newStockBalance = Math.max(0, Math.round((matchedItem.quantity - diffQty) * 10000) / 10000);
      updatedStockItem = {
        ...matchedItem,
        quantity: newStockBalance
      };
      adjustmentTx = {
        id: generateId(),
        itemId: matchedItem.id,
        itemName: matchedItem.name,
        partNumber: matchedItem.partNumber,
        userId: currentUser?.id || 'user_admin',
        userName: currentUser?.name || 'Administrador HPS',
        type: diffQty > 0 ? TransactionType.OUT : TransactionType.IN,
        quantity: Math.abs(diffQty),
        unitValue: targetPart.unitValue,
        date: new Date().toISOString(),
        recipientName: os.mechanicName || os.customerName || `O.S. #${os.osNumber}`,
        destination: MovementDestination.OS,
        osNumber: os.osNumber,
        notes: `Ajuste de quantidade na O.S. #${os.osNumber}: alterado de ${oldMl ? `${oldMl} ml (${oldQty} L)` : `${oldQty} ${targetPart.unit || 'un'}`} para ${isMlMode ? `${updatedMlQuantity} ml (${calculatedQty} L)` : `${calculatedQty} ${targetPart.unit || 'un'}`}`,
        tenantId: currentTenant.id
      };

      setItems(prev => prev.map(i => (i.id === matchedItem.id ? updatedStockItem! : i)));
      setHistory(prev => [adjustmentTx!, ...prev]);
    }

    setServiceOrders(prev => prev.map(o => (o.id === osId ? updatedOS : o)));
    if (selectedOS?.id === osId) {
      setSelectedOS(updatedOS);
    }
    setEditingOSPartIdx(null);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveServiceOrder(updatedOS);
        if (updatedStockItem) {
          await supabaseService.saveItem(updatedStockItem);
        }
        if (adjustmentTx) {
          await supabaseService.saveTransaction(adjustmentTx);
        }
      } catch (err) {
        console.error("Erro ao sincronizar alteração de quantidade da peça na OS com o Supabase:", err);
      }
    }

    const oldLabel = oldMl ? `${oldMl} ml` : `${oldQty} ${targetPart.unit || matchedItem?.unit || 'un'}`;
    const newLabel = isMlMode ? `${updatedMlQuantity} ml` : `${calculatedQty} ${targetPart.unit || matchedItem?.unit || 'un'}`;

    showAlert(
      "Quantidade Atualizada",
      `A quantidade do item "${targetPart.name}" na O.S. #${os.osNumber} foi alterada de ${oldLabel} para ${newLabel} (Novo subtotal: R$ ${calculatedTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})${os.stockDeducted && matchedItem ? `. O saldo do estoque foi reconciliado automaticamente.` : '.'}`,
      "success"
    );
  };

  const handleDeletePartFromOS = async (osId: string, partIndex: number) => {
    showConfirm(
      "Remover Peça da O.S.",
      "Deseja desvincular esta peça da Ordem de Serviço?",
      async () => {
        const os = (selectedOS && selectedOS.id === osId) ? selectedOS : serviceOrders.find(o => o.id === osId);
        if (!os) return;
        const removedPart = os.parts[partIndex];
        const updatedParts = os.parts.filter((_, idx) => idx !== partIndex);

        // Se a peça removida já tinha sido baixada do estoque, devolve a quantidade ao saldo físico
        const wasPartDeducted = Boolean(removedPart && (removedPart.stockDeducted || (os.stockDeducted && removedPart.stockDeducted !== false)));
        let returnedItem: InventoryItem | null = null;
        let returnTx: Transaction | null = null;

        if (wasPartDeducted && removedPart) {
          const matchedItem = items.find(i =>
            i.id === removedPart.itemId ||
            (removedPart.partNumber && i.partNumber && i.partNumber.trim().toUpperCase() === removedPart.partNumber.trim().toUpperCase())
          );
          if (matchedItem) {
            const newQty = Math.round((matchedItem.quantity + (removedPart.quantity || 0)) * 1000) / 1000;
            returnedItem = { ...matchedItem, quantity: newQty };
            returnTx = {
              id: generateId(),
              itemId: matchedItem.id,
              itemName: matchedItem.name,
              partNumber: matchedItem.partNumber,
              userId: currentUser?.id || 'user_admin',
              userName: currentUser?.name || 'Administrador HPS',
              type: TransactionType.IN,
              quantity: removedPart.quantity,
              unitValue: removedPart.unitValue,
              date: new Date().toISOString(),
              recipientName: os.mechanicName || os.customerName || `O.S. #${os.osNumber}`,
              destination: MovementDestination.OS,
              osNumber: os.osNumber,
              notes: `Estorno automático de estoque por remoção da peça "${removedPart.name}" da O.S. #${os.osNumber}`,
              tenantId: currentTenant.id
            };
            setItems(prev => prev.map(i => i.id === matchedItem.id ? returnedItem! : i));
            setHistory(prev => [returnTx!, ...prev]);
          }
        }

        const allRemainingDeducted = updatedParts.length > 0 && updatedParts.every(p => p.stockDeducted ?? Boolean(os.stockDeducted));

        const updatedOS = {
          ...os,
          parts: updatedParts,
          stockDeducted: allRemainingDeducted,
          updatedAt: new Date().toISOString()
        };
        setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
        if (selectedOS?.id === osId) {
          setSelectedOS(updatedOS);
        }
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveServiceOrder(updatedOS);
            if (returnedItem) await supabaseService.saveItem(returnedItem);
            if (returnTx) await supabaseService.saveTransaction(returnTx);
          } catch (err: any) {
            console.error("Erro ao atualizar O.S. no Supabase", err);
          }
        }
        showAlert("Sucesso", wasPartDeducted ? "Peça removida da O.S. e saldo devolvido ao estoque!" : "Peça removida da O.S.!", "success");
      }
    );
  };

  const deleteOS = async (osId: string) => {
    showConfirm(
      "Confirmar Exclusão de O.S.",
      "Deseja realmente excluir esta Ordem de Serviço permanentemente?",
      async () => {
        setServiceOrders(prev => prev.filter(os => os.id !== osId));
        if (selectedOS?.id === osId) {
          setSelectedOS(null);
        }
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteServiceOrder(osId);
            showAlert("Sucesso", "Ordem de Serviço excluída com sucesso!", "success");
          } catch (err: any) {
            console.error("Erro ao deletar OS no Supabase", err);
            showAlert("Erro", `Não foi possível excluir no Supabase: ${err.message}`, "error");
          }
        } else {
          showAlert("Sucesso", "Ordem de Serviço excluída com sucesso.", "success");
        }
      }
    );
  };

  // --- CLIENT ACTIONS ---
  const generateSlugCredentials = (fullName: string) => {
    const clean = fullName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const baseUser = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : (parts[0] || 'cliente');
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    return { username: baseUser, password: randomPin };
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientFormData.name.trim()) {
      showAlert("Erro", "O nome do cliente é obrigatório.", "error");
      return;
    }

    const cleanUser = clientFormData.username.trim().toLowerCase();
    if (cleanUser) {
      const duplicateInClients = clients.some(c => c.username && c.username.trim().toLowerCase() === cleanUser);
      const duplicateInUsers = users.some(u => u.username.trim().toLowerCase() === cleanUser);
      if (duplicateInClients || duplicateInUsers) {
        showAlert("Login Indisponível", `O login "${cleanUser}" já está sendo utilizado por outro cliente ou funcionário. Escolha outro login.`, "error");
        return;
      }
      if (!clientFormData.password.trim()) {
        showAlert("Senha Obrigatória", "Ao definir um Login de acesso para o cliente, informe também uma Senha.", "error");
        return;
      }
    }

    const newClientId = generateId();
    const newClient: Client = {
      id: newClientId,
      name: clientFormData.name.trim(),
      cpf: clientFormData.cpf.trim(),
      phone: clientFormData.phone.trim() || undefined,
      email: clientFormData.email.trim() || undefined,
      username: cleanUser || undefined,
      password: clientFormData.password.trim() || undefined,
      isAccessActive: clientFormData.isAccessActive,
      vehicles: tempVehicles,
      createdAt: new Date().toISOString(),
      tenantId: currentTenant.id
    };

    // Se o cliente ainda não tiver um Passaporte UTV e tiver veículo cadastrado, cria automaticamente um Passaporte UTV espelho
    let createdPassport: UTVPassport | null = null;
    if (tempVehicles.length > 0) {
      const firstVeh = tempVehicles[0];
      const randomQr = `HPS-UTV-${Math.floor(100 + Math.random() * 900)}`;
      createdPassport = {
        id: `utv_pass_${newClientId}`,
        qrCode: randomQr,
        vehicleNumber: firstVeh.plate || `#${Math.floor(10 + Math.random() * 89)}`,
        vehicleModel: firstVeh.model,
        chassisOrPlate: firstVeh.plate || '',
        clientId: newClient.id,
        vehicleId: firstVeh.id,
        customerName: newClient.name,
        currentKm: 0,
        lastMaintenanceSummary: 'Cadastro inicial do veículo na plataforma HPS Control.',
        lastMaintenanceDate: new Date().toISOString().split('T')[0],
        nextCompetitionPlan: 'Aguardando definição do plano de revisão.',
        carStatus: 'READY',
        maintenanceItems: [],
        competitions: [],
        triageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenantId: currentTenant.id
      };
      setUtvPassports(prev => [createdPassport!, ...prev]);
    }

    setClients(prev => [newClient, ...prev]);
    setIsAddingClient(false);
    setClientFormData({ name: '', cpf: '', phone: '', email: '', username: '', password: '', isAccessActive: true });
    setTempVehicles([]);
    setVehicleInput({ model: '', plate: '', year: '' });
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveClient(newClient);
        if (createdPassport) {
          await supabaseService.saveUTVPassport(createdPassport);
        }
        showAlert("Sucesso", "Cliente e credenciais do Espelho cadastrados e sincronizados com o Supabase!", "success");
      } catch (err: any) {
        console.error("Erro ao salvar cliente no Supabase:", err);
        showAlert("Sucesso Local", `Cliente cadastrado localmente. Erro ao salvar no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", "Cliente e credenciais do Espelho cadastrados com sucesso!", "success");
    }
  };

  const handleStartEditClient = (client: Client) => {
    setEditingClient({
      ...client,
      isAccessActive: client.isAccessActive !== false,
      vehicles: [...client.vehicles]
    });
    setEditClientVehicleInput({ model: '', plate: '', year: '' });
  };

  const handleSaveEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    if (!editingClient.name.trim()) {
      showAlert("Erro", "O nome do cliente é obrigatório.", "error");
      return;
    }

    const cleanUser = (editingClient.username || '').trim().toLowerCase();
    if (cleanUser) {
      const duplicateInClients = clients.some(
        c => c.id !== editingClient.id && c.username && c.username.trim().toLowerCase() === cleanUser
      );
      const duplicateInUsers = users.some(u => u.username.trim().toLowerCase() === cleanUser);
      if (duplicateInClients || duplicateInUsers) {
        showAlert("Login Indisponível", `O login "${cleanUser}" já está em uso. Escolha outro login para este cliente.`, "error");
        return;
      }
      if (!(editingClient.password || '').trim()) {
        showAlert("Senha Obrigatória", "Informe uma senha para o Login do cliente.", "error");
        return;
      }
    }

    const updatedClient: Client = {
      ...editingClient,
      name: editingClient.name.trim(),
      cpf: editingClient.cpf.trim(),
      phone: editingClient.phone?.trim() || undefined,
      email: editingClient.email?.trim() || undefined,
      username: cleanUser || undefined,
      password: editingClient.password?.trim() || undefined,
      isAccessActive: editingClient.isAccessActive !== false
    };

    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    setEditingClient(null);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveClient(updatedClient);
        showAlert("Sucesso", "Cadastro e credenciais de acesso do cliente atualizados no Supabase!", "success");
      } catch (err: any) {
        console.error("Erro ao atualizar cliente no Supabase", err);
        showAlert("Sucesso Local", `Cliente atualizado localmente. Erro no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", "Cadastro e credenciais do cliente atualizados com sucesso!", "success");
    }
  };

  const handleToggleClientAccess = async (client: Client) => {
    const updatedClient: Client = {
      ...client,
      isAccessActive: client.isAccessActive === false ? true : false
    };
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveClient(updatedClient);
      } catch {}
    }
  };

  const handleAddVehicleToEditingClient = () => {
    if (!editingClient) return;
    if (!editClientVehicleInput.model.trim()) {
      showAlert("Aviso", "O modelo do veículo é obrigatório.", "error");
      return;
    }
    const newVeh: ClientVehicle = {
      id: generateId(),
      model: editClientVehicleInput.model.trim(),
      plate: editClientVehicleInput.plate.trim(),
      year: editClientVehicleInput.year.trim()
    };
    setEditingClient({
      ...editingClient,
      vehicles: [...editingClient.vehicles, newVeh]
    });
    setEditClientVehicleInput({ model: '', plate: '', year: '' });
  };

  const handleRemoveVehicleFromEditingClient = (vehicleId: string) => {
    if (!editingClient) return;
    setEditingClient({
      ...editingClient,
      vehicles: editingClient.vehicles.filter(v => v.id !== vehicleId)
    });
  };

  const handleDeleteClient = (clientId: string) => {
    showConfirm(
      "Confirmar Exclusão",
      "Deseja realmente remover este cliente?",
      async () => {
        setClients(prev => prev.filter(c => c.id !== clientId));
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteClient(clientId);
            showAlert("Sucesso", "Cliente removido e sincronizado com o Supabase.", "success");
          } catch (err: any) {
            console.error("Erro ao deletar cliente no Supabase:", err);
            showAlert("Erro", `Não foi possível remover do Supabase: ${err.message}`, "error");
          }
        } else {
          showAlert("Sucesso", "Cliente removido com sucesso.", "success");
        }
      }
    );
  };

  const handleAddVehicleToTemp = () => {
    if (!vehicleInput.model.trim()) {
      showAlert("Aviso", "O modelo do veículo é obrigatório.", "error");
      return;
    }
    const newVeh: ClientVehicle = {
      id: generateId(),
      model: vehicleInput.model,
      plate: vehicleInput.plate,
      year: vehicleInput.year
    };
    setTempVehicles(prev => [...prev, newVeh]);
    setVehicleInput({ model: '', plate: '', year: '' });
  };

  const handleRemoveVehicleFromTemp = (id: string) => {
    setTempVehicles(prev => prev.filter(v => v.id !== id));
  };

  const handleAddLaborToOS = async (osId: string) => {
    if (!laborFormData.description.trim()) {
      showAlert("Aviso", "A descrição do serviço é obrigatória.", "error");
      return;
    }

    const os = serviceOrders.find(o => o.id === osId);
    if (!os) return;

    const isFixed = laborFormData.pricingType === 'fixed';
    const gross = computeLaborGross({
      pricingType: laborFormData.pricingType,
      hours: laborFormData.hours,
      minutes: laborFormData.minutes,
      valuePerHour: laborFormData.valuePerHour,
      fixedValue: laborFormData.fixedValue
    });

    if (gross <= 0) {
      showAlert("Valor Obrigatório", "Por favor, informe as horas/minutos trabalhados ou o valor fixo cobrado por este serviço.", "error");
      return;
    }

    // If user explicitly checked isShared with linkedToId (apenas serviços cobrados por tempo):
    if (laborFormData.isShared && laborFormData.linkedToId && !isFixed) {
      let discVal = 0;
      let discPct = 0;
      if (laborFormData.discountType === 'percentage') {
        discPct = Number(laborFormData.discountPercentage) || 50;
        discVal = (gross * discPct) / 100;
      } else {
        discVal = Number(laborFormData.discountValue) || 0;
        discPct = gross > 0 ? Math.round((discVal / gross) * 100) : 0;
      }
      const linkedLabor = os.laborItems.find(l => l.id === laborFormData.linkedToId);

      const newLabor: LaborItem = {
        id: generateId(),
        description: laborFormData.description.trim(),
        pricingType: laborFormData.pricingType,
        hours: Number(laborFormData.hours) || 0,
        minutes: Number(laborFormData.minutes) || 0,
        valuePerHour: Number(laborFormData.valuePerHour) || currentTenant.defaultHourlyRate || 150,
        fixedValue: undefined,
        section: laborFormData.section.trim() || undefined,
        linkedToId: laborFormData.linkedToId,
        isShared: true,
        discountPercentage: discPct,
        discountValue: discVal,
        originalTotal: gross,
        finalTotal: Math.max(0, gross - discVal),
        sharedReason: laborFormData.sharedReason.trim() || (linkedLabor ? `Metade do serviço executado na M.O. "${linkedLabor.description}" (desmontagem aproveitada)` : 'Mão de obra compartilhada')
      };

      const updatedOS = { 
        ...os, 
        laborItems: [...os.laborItems, newLabor], 
        updatedAt: new Date().toISOString() 
      };
      
      setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
      if (selectedOS?.id === osId) {
        setSelectedOS(updatedOS);
      }
      setLaborFormData({
        description: '', pricingType: 'hourly', hours: 1, minutes: 0, valuePerHour: currentTenant.defaultHourlyRate || 150, fixedValue: 150, section: '',
        linkedToId: '', isShared: false, discountType: 'percentage', discountPercentage: 50, discountValue: 0, sharedReason: ''
      });
      
      if (supabaseService.isAvailable()) {
        try {
          await supabaseService.saveServiceOrder(updatedOS);
        } catch (err) {
          console.error("Erro ao salvar serviço na OS no Supabase", err);
        }
      }
      showAlert("Sucesso", "Mão de obra compartilhada adicionada com desconto à O.S.!", "success");
      return;
    }

    // Check relation with existing labor in this OS (apenas se for serviço por tempo)
    const matchedTemplate = laborTemplates.find(t => t.description.toLowerCase() === laborFormData.description.trim().toLowerCase());
    const relation = !isFixed ? checkLaborRelation({
      description: laborFormData.description.trim(),
      section: laborFormData.section.trim() || undefined,
      templateId: matchedTemplate?.id,
      pricingType: laborFormData.pricingType,
      hours: Number(laborFormData.hours) || 0,
      minutes: Number(laborFormData.minutes) || 0,
      valuePerHour: Number(laborFormData.valuePerHour) || currentTenant.defaultHourlyRate || 150,
      fixedValue: Number(laborFormData.fixedValue) || 0
    }, os.laborItems, laborTemplates) : null;

    if (relation && os.laborItems.length > 0) {
      const discPct = matchedTemplate?.discountPercentage ?? relation.suggestedDiscountPercentage;
      const discVal = matchedTemplate?.discountValue || (gross * discPct) / 100;
      setSharedLaborWarning({
        isOpen: true,
        targetOSId: osId,
        newLaborCandidate: {
          description: laborFormData.description.trim(),
          pricingType: laborFormData.pricingType,
          hours: Number(laborFormData.hours) || 0,
          minutes: Number(laborFormData.minutes) || 0,
          valuePerHour: Number(laborFormData.valuePerHour) || currentTenant.defaultHourlyRate || 150,
          fixedValue: Number(laborFormData.fixedValue) || 0,
          section: laborFormData.section.trim() || undefined,
          sourceTemplateId: matchedTemplate?.id
        },
        relatedLaborInOS: relation.relatedLabor,
        availableLaborsInOS: os.laborItems,
        reason: relation.reason,
        discountType: matchedTemplate?.discountValue ? 'fixed' : 'percentage',
        discountPercentage: discPct,
        discountValue: discVal,
        sharedReason: matchedTemplate?.sharedNotes || `Metade do serviço (desmontagem e acesso à região) já foi executado na M.O. "${relation.relatedLabor.description}"`
      });
      setLaborFormData({
        description: '', pricingType: 'hourly', hours: 1, minutes: 0, valuePerHour: currentTenant.defaultHourlyRate || 150, fixedValue: 150, section: '',
        linkedToId: '', isShared: false, discountType: 'percentage', discountPercentage: 50, discountValue: 0, sharedReason: ''
      });
      return;
    }

    // Direct addition (por tempo ou por dificuldade/preço fixo sem somar taxa horária)
    const newLabor: LaborItem = {
      id: generateId(),
      description: laborFormData.description.trim(),
      pricingType: laborFormData.pricingType,
      hours: isFixed ? 0 : (Number(laborFormData.hours) || 0),
      minutes: isFixed ? 0 : (Number(laborFormData.minutes) || 0),
      valuePerHour: Number(laborFormData.valuePerHour) || currentTenant.defaultHourlyRate || 150,
      fixedValue: isFixed ? gross : undefined,
      section: laborFormData.section.trim() || undefined,
      originalTotal: gross,
      finalTotal: gross,
      isShared: false
    };
    
    const updatedOS = { 
      ...os, 
      laborItems: [...os.laborItems, newLabor], 
      updatedAt: new Date().toISOString() 
    };
    
    setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
    if (selectedOS?.id === osId) {
      setSelectedOS(updatedOS);
    }
    setLaborFormData({
      description: '', pricingType: 'hourly', hours: 1, minutes: 0, valuePerHour: currentTenant.defaultHourlyRate || 150, fixedValue: 150, section: '',
      linkedToId: '', isShared: false, discountType: 'percentage', discountPercentage: 50, discountValue: 0, sharedReason: ''
    });
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveServiceOrder(updatedOS);
      } catch (err) {
        console.error("Erro ao salvar serviço na OS no Supabase", err);
      }
    }
    showAlert("Sucesso", "Serviço adicionado à Ordem de Serviço!", "success");
  };

  const handleAddPartToOS = async (osId: string) => {
    const item = items.find(i => i.id === osPartFormData.itemId);
    if (!item) {
      showAlert("Aviso", "Por favor, selecione uma peça para vincular.", "info");
      return;
    }

    const os = serviceOrders.find(o => o.id === osId);
    if (!os) return;

    const isMl = osPartFormData.measureMode === 'ml';
    let calculatedQty: number;
    let calculatedTotalValue: number;
    let mlValue: number | undefined = undefined;

    if (isMl) {
      const ml = osPartFormData.mlQuantity;
      if (!ml || ml <= 0) {
        showAlert("Aviso", "Informe a quantidade em ML utilizada.", "error");
        return;
      }
      mlValue = ml;
      // Cálculo proporcional: se o item estiver cadastrado por litro (1 L = 1000 ML)
      // Divisão automática do valor do litro pelo ML utilizado:
      // Fração em litros para baixa do estoque: ml / 1000
      calculatedQty = Math.round((ml / 1000) * 10000) / 10000;
      // Valor total na OS: (valor_litro / 1000) * ml
      calculatedTotalValue = Math.round(((item.value / 1000) * ml) * 100) / 100;
    } else {
      const qty = osPartFormData.quantity;
      if (!qty || qty <= 0) {
        showAlert("Aviso", "Informe a quantidade a ser vinculada.", "error");
        return;
      }
      calculatedQty = qty;
      calculatedTotalValue = Math.round((qty * item.value) * 100) / 100;
    }

    // Check if we have enough quantity. If they don't, we show an informational alert
    // but WE STILL ALLOW linking! The part will display "Aguardando Reposição" in the UI.
    if (item.quantity < calculatedQty) {
      const requestedDesc = isMl 
        ? `${mlValue} ml (${calculatedQty} L)` 
        : `${calculatedQty} ${(item.unit || 'UN').toUpperCase()}`;
      showAlert(
        "Aguardando Reposição", 
        `O item "${item.name}" não possui saldo suficiente em estoque (${item.quantity} ${item.unit || 'UN'}). A peça foi vinculada à O.S. (${requestedDesc}) com observação de saldo para reposição ou chegada.`, 
        "info"
      );
    }

    // Preserva o status de baixa das peças que já estavam na O.S., e marca a nova peça como pendente de baixa (stockDeducted: false)
    const existingPartsNormalized = os.parts.map(p => ({
      ...p,
      stockDeducted: p.stockDeducted ?? Boolean(os.stockDeducted)
    }));

    let updatedOS: ServiceOrder = {
      ...os,
      parts: existingPartsNormalized,
      stockDeducted: false
    };

    const newPartCandidate: OSPart = {
      itemId: item.id,
      name: item.name,
      partNumber: item.partNumber,
      quantity: calculatedQty,
      unitValue: item.value,
      unit: item.unit || 'un',
      measureMode: isMl ? 'ml' : 'standard',
      mlQuantity: mlValue,
      totalValue: calculatedTotalValue,
      stockDeducted: false
    };
    
    const finalize = (osToUpdate: ServiceOrder, customSuccessMsg?: string) => {
      setServiceOrders(prev => prev.map(o => o.id === osId ? osToUpdate : o));
      if (selectedOS && selectedOS.id === osId) {
        setSelectedOS(osToUpdate);
      }
      setOsPartFormData({ itemId: '', quantity: 1, measureMode: 'standard', mlQuantity: 500 });
      setOsPartSearchTerm('');
      setOsPartTargetLaborId('');
      setOsPartSharedLaborId('');
      setOsPartSharedDiscountPct(50);
      setOsPartSharedDiscountVal(0);
      setOsPartSharedReason('');
      setIsQuickBindingCatalogInOS(false);

      if (supabaseService.isAvailable()) {
        supabaseService.saveServiceOrder(osToUpdate).catch(err => console.error("Erro ao sincronizar peças da OS no Supabase", err));
      }
      showAlert(
        "Sucesso", 
        customSuccessMsg || (
          isMl
            ? `Óleo vinculado com sucesso! (${mlValue} ml calculados proporcionalmente: R$ ${calculatedTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
            : "Peça vinculada à Ordem de Serviço com sucesso!"
        ),
        "success"
      );
    };

    // 1. PRIORIDADE: Se o usuário selecionou vincular esta peça a uma Mão de Obra JÁ EXISTENTE nesta O.S.
    if (osPartTargetLaborId) {
      const existingOSLabor = os.laborItems.find(l => l.id === osPartTargetLaborId);
      if (existingOSLabor) {
        const partLinkedToExistingLabor: OSPart = {
          ...newPartCandidate,
          linkedLaborId: existingOSLabor.id,
          linkedLaborDescription: existingOSLabor.description
        };

        const updatedLaborItems = os.laborItems.map(l => {
          if (l.id !== existingOSLabor.id) return l;
          const nextLinkedPartIds = Array.from(new Set([...(l.linkedPartIds || []), item.id]));
          return {
            ...l,
            linkedPartIds: nextLinkedPartIds
          };
        });

        const osWithPartLinkedToExistingLabor: ServiceOrder = {
          ...updatedOS,
          parts: [...updatedOS.parts, partLinkedToExistingLabor],
          laborItems: updatedLaborItems,
          stockDeducted: false,
          updatedAt: new Date().toISOString()
        };

        finalize(
          osWithPartLinkedToExistingLabor,
          `Peça "${item.name}" vinculada diretamente à Mão de Obra já existente nesta O.S.: "${existingOSLabor.description}"!`
        );
        return;
      }
    }

    // 2. Smart Logic: Busca se esta peça está amarrada a algum Modelo de Mão de Obra no Catálogo
    const matchedTemplate = findLaborTemplateForPart(item, laborTemplates);

    if (matchedTemplate && autoCreateLaborOnPartLink) {
      const section = vehicleSections.find(s => s.id === matchedTemplate.sectionId);
      const sectionName = section?.name || '';
      const gross = computeLaborGross(matchedTemplate);
      const newLaborId = generateId();

      // Verifica se já existem mãos de obra na O.S. E se o usuário escolheu compartilhar com alguma delas
      const chosenSharedLabor = os.laborItems.length > 0 && osPartSharedLaborId && matchedTemplate.pricingType !== 'fixed'
        ? os.laborItems.find(l => l.id === osPartSharedLaborId)
        : undefined;

      if (chosenSharedLabor) {
        let discPct = 0;
        let discVal = 0;
        if (osPartSharedDiscountType === 'percentage') {
          discPct = Math.min(100, Math.max(0, Number(osPartSharedDiscountPct) || 0));
          discVal = Number(((gross * discPct) / 100).toFixed(2));
        } else {
          discVal = Math.min(gross, Math.max(0, Number(osPartSharedDiscountVal) || 0));
          discPct = gross > 0 ? Math.round((discVal / gross) * 100) : 0;
        }
        const finalNet = Math.max(0, Number((gross - discVal).toFixed(2)));

        const newSharedLabor: LaborItem = {
          id: newLaborId,
          description: matchedTemplate.description,
          pricingType: matchedTemplate.pricingType || 'hourly',
          hours: matchedTemplate.defaultHours || 0,
          minutes: matchedTemplate.minutes || 0,
          valuePerHour: matchedTemplate.defaultValuePerHour || currentTenant.defaultHourlyRate || 150,
          fixedValue: matchedTemplate.fixedValue,
          section: sectionName || undefined,
          linkedToId: chosenSharedLabor.id,
          isShared: true,
          discountPercentage: discPct,
          discountValue: discVal,
          originalTotal: gross,
          finalTotal: finalNet,
          sharedReason: osPartSharedReason.trim() || `M.O. Compartilhada vinculada à peça "${item.name}" (aproveitamento da desmontagem de "${chosenSharedLabor.description}")`,
          linkedPartIds: [item.id]
        };

        const partWithLaborLink: OSPart = {
          ...newPartCandidate,
          linkedLaborId: newLaborId,
          linkedLaborDescription: matchedTemplate.description,
          stockDeducted: false
        };

        const osWithSharedLabor: ServiceOrder = {
          ...updatedOS,
          parts: [...updatedOS.parts, partWithLaborLink],
          laborItems: [...updatedOS.laborItems, newSharedLabor],
          stockDeducted: false,
          updatedAt: new Date().toISOString()
        };

        finalize(
          osWithSharedLabor,
          `Peça "${item.name}" vinculada e Mão de Obra Compartilhada "${matchedTemplate.description}" (compartilhada com "${chosenSharedLabor.description}", ${discPct}% OFF = R$ ${finalNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) criada na O.S.!`
        );
        return;
      }

      // Caso o usuário não tenha selecionado Mão de Obra Compartilhada (ou a O.S. ainda não possua mão de obra):
      // Cria a mão de obra integral vinculada à peça
      const newLabor: LaborItem = {
        id: newLaborId,
        description: matchedTemplate.description,
        pricingType: matchedTemplate.pricingType || 'hourly',
        hours: matchedTemplate.pricingType === 'fixed' ? 0 : (matchedTemplate.defaultHours || 0),
        minutes: matchedTemplate.pricingType === 'fixed' ? 0 : (matchedTemplate.minutes || 0),
        valuePerHour: matchedTemplate.defaultValuePerHour || currentTenant.defaultHourlyRate || 150,
        fixedValue: matchedTemplate.pricingType === 'fixed' ? gross : undefined,
        section: sectionName || undefined,
        originalTotal: gross,
        finalTotal: gross,
        isShared: false,
        linkedPartIds: [item.id]
      };

      const partWithLaborLink: OSPart = {
        ...newPartCandidate,
        linkedLaborId: newLaborId,
        linkedLaborDescription: matchedTemplate.description,
        stockDeducted: false
      };

      const osWithPartAndLabor: ServiceOrder = {
        ...updatedOS,
        parts: [...updatedOS.parts, partWithLaborLink],
        laborItems: [...updatedOS.laborItems, newLabor],
        stockDeducted: false,
        updatedAt: new Date().toISOString()
      };

      finalize(
        osWithPartAndLabor,
        `Peça "${item.name}" vinculada e Mão de Obra "${matchedTemplate.description}" (R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) criada na O.S. com sucesso!`
      );
      return;
    }

    // Se a peça não possui mão de obra amarrada ou o usuário desmarcou o vínculo automático:
    const osWithPartOnly: ServiceOrder = {
      ...updatedOS,
      parts: [...updatedOS.parts, newPartCandidate],
      stockDeducted: false,
      updatedAt: new Date().toISOString()
    };
    finalize(osWithPartOnly);
  };

  const handleDeductStockForOS = async (osId: string, forceAllParts = false) => {
    const os = (selectedOS && selectedOS.id === osId) ? selectedOS : serviceOrders.find(o => o.id === osId);
    if (!os) return;
    if (os.parts.length === 0) {
      showAlert("Aviso", "Esta O.S. não possui peças vinculadas para dar baixa no estoque.", "info");
      return;
    }

    const hasSomeExplicitlyDeducted = os.parts.some(p => p.stockDeducted === true);
    const partsToDeduct = forceAllParts
      ? os.parts
      : hasSomeExplicitlyDeducted
      ? os.parts.filter(p => !p.stockDeducted)
      : os.parts;

    if (partsToDeduct.length === 0 && !forceAllParts) {
      // Se todas já constavam como baixadas mas o usuário clicou para reprocessar, pergunta se deseja confirmar
      setShowStockDeductOptionsInOS(true);
      return;
    }

    const effectiveParts = partsToDeduct.length > 0 ? partsToDeduct : os.parts;
    const partNamesSummary = effectiveParts
      .map(p => `• ${p.name} (${p.mlQuantity ? `${p.mlQuantity} ml` : `${p.quantity} ${p.unit || 'un'}`})`)
      .join('\n');

    showConfirm(
      "Confirmar Baixa no Estoque",
      `Deseja efetivar agora a saída física de ${effectiveParts.length} item(ns) desta O.S. #${os.osNumber} no estoque?\n\n${partNamesSummary}`,
      async () => {
        let itemsLowStock: string[] = [];
        const changedItemIds = new Set<string>();

        const doesPartMatchItem = (p: OSPart, item: InventoryItem) => {
          if (p.itemId === item.id) return true;
          const directMatchExists = items.some(i => i.id === p.itemId);
          if (!directMatchExists) {
            if (p.partNumber && item.partNumber && p.partNumber.trim().toUpperCase() === item.partNumber.trim().toUpperCase()) {
              return true;
            }
            if (p.name && item.name && p.name.trim().toUpperCase() === item.name.trim().toUpperCase()) {
              return true;
            }
          }
          return false;
        };

        const updatedItems = items.map(item => {
          const matchingParts = effectiveParts.filter(p => doesPartMatchItem(p, item));
          if (matchingParts.length > 0) {
            const totalDeduction = matchingParts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
            const finalQty = Math.max(0, Math.round((item.quantity - totalDeduction) * 1000) / 1000);
            changedItemIds.add(item.id);
            if (finalQty <= item.minQuantity) {
              itemsLowStock.push(`${item.name} (Novo Saldo: ${finalQty} ${item.unit || 'un'})`);
            }
            return { ...item, quantity: finalQty };
          }
          return item;
        });

        const newTransactions: Transaction[] = effectiveParts.map(p => ({
          id: generateId(),
          itemId: p.itemId,
          itemName: p.name,
          partNumber: p.partNumber,
          userId: currentUser?.id || 'user_admin',
          userName: currentUser?.name || 'Administrador HPS',
          type: TransactionType.OUT,
          quantity: p.quantity,
          unitValue: p.unitValue,
          date: new Date().toISOString(),
          recipientName: os.mechanicName || os.customerName || ('O.S. #' + os.osNumber),
          destination: MovementDestination.OS,
          osNumber: os.osNumber,
          notes: p.mlQuantity 
            ? `Baixa fracionada de ${p.mlQuantity} ml (${p.quantity} L) de óleo/fluido para O.S. #${os.osNumber} (Cliente: ${os.customerName || 'N/D'})`
            : `Baixa de peças para O.S. #${os.osNumber} (Cliente: ${os.customerName || 'N/D'})`,
          tenantId: currentTenant.id
        }));

        const updatedPartsWithFlag = os.parts.map(p => ({
          ...p,
          stockDeducted: true
        }));

        const updatedOS: ServiceOrder = {
          ...os,
          parts: updatedPartsWithFlag,
          stockDeducted: true,
          updatedAt: new Date().toISOString()
        };

        setItems(updatedItems);
        setHistory(prev => [...newTransactions, ...prev]);
        setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
        setSelectedOS(updatedOS);
        setShowStockDeductOptionsInOS(false);

        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveServiceOrder(updatedOS);
            await Promise.all(newTransactions.map(tx => supabaseService.saveTransaction(tx)));
            const itemsToSave = updatedItems.filter(item => changedItemIds.has(item.id));
            if (itemsToSave.length > 0) {
              await Promise.all(itemsToSave.map(item => supabaseService.saveItem(item)));
            }
          } catch (err) {
            console.error("Erro ao sincronizar baixa no Supabase", err);
          }
        }

        if (itemsLowStock.length > 0) {
          showAlert(
            "Baixa Efetuada com Alerta de Estoque", 
            `Baixa de ${effectiveParts.length} item(ns) efetuada com sucesso! ATENÇÃO: As seguintes peças atingiram o saldo mínimo:\n` + itemsLowStock.join('\n'), 
            "info"
          );
        } else {
          showAlert("Baixa Efetuada no Estoque", `Baixa física de ${effectiveParts.length} item(ns) da O.S. #${os.osNumber} efetuada com sucesso no estoque!`, "success");
        }
      }
    );
  };

  const handleRevertStockForOS = async (osId: string) => {
    const os = (selectedOS && selectedOS.id === osId) ? selectedOS : serviceOrders.find(o => o.id === osId);
    if (!os) return;

    showConfirm(
      "Estornar / Reabrir Baixa de Estoque",
      `Deseja estornar a baixa da O.S. #${os.osNumber}, devolvendo as quantidades das peças ao estoque físico e liberando o botão para nova baixa?`,
      async () => {
        const changedItemIds = new Set<string>();
        const updatedItems = items.map(item => {
          const matchingParts = os.parts.filter(p =>
            p.itemId === item.id ||
            (p.partNumber && item.partNumber && p.partNumber.trim().toUpperCase() === item.partNumber.trim().toUpperCase())
          );
          if (matchingParts.length > 0) {
            const totalReturn = matchingParts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
            const finalQty = Math.round((item.quantity + totalReturn) * 1000) / 1000;
            changedItemIds.add(item.id);
            return { ...item, quantity: finalQty };
          }
          return item;
        });

        const returnTransactions: Transaction[] = os.parts.map(p => ({
          id: generateId(),
          itemId: p.itemId,
          itemName: p.name,
          partNumber: p.partNumber,
          userId: currentUser?.id || 'user_admin',
          userName: currentUser?.name || 'Administrador HPS',
          type: TransactionType.IN,
          quantity: p.quantity,
          unitValue: p.unitValue,
          date: new Date().toISOString(),
          recipientName: os.mechanicName || os.customerName || ('O.S. #' + os.osNumber),
          destination: MovementDestination.OS,
          osNumber: os.osNumber,
          notes: `Estorno de baixa de estoque da O.S. #${os.osNumber}`,
          tenantId: currentTenant.id
        }));

        const updatedPartsReset = os.parts.map(p => ({
          ...p,
          stockDeducted: false
        }));

        const updatedOS: ServiceOrder = {
          ...os,
          parts: updatedPartsReset,
          stockDeducted: false,
          updatedAt: new Date().toISOString()
        };

        setItems(updatedItems);
        setHistory(prev => [...returnTransactions, ...prev]);
        setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
        setSelectedOS(updatedOS);
        setShowStockDeductOptionsInOS(false);

        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveServiceOrder(updatedOS);
            await Promise.all(returnTransactions.map(tx => supabaseService.saveTransaction(tx)));
            const itemsToSave = updatedItems.filter(item => changedItemIds.has(item.id));
            if (itemsToSave.length > 0) {
              await Promise.all(itemsToSave.map(item => supabaseService.saveItem(item)));
            }
          } catch (err) {
            console.error("Erro ao sincronizar estorno de baixa no Supabase", err);
          }
        }

        showAlert("Baixa Reaberta", `As peças da O.S. #${os.osNumber} foram devolvidas ao estoque e a baixa foi reaberta!`, "success");
      }
    );
  };

  const updateOSStatus = async (osId: string, status: OSStatus) => {
    const os = (selectedOS && selectedOS.id === osId) ? selectedOS : serviceOrders.find(o => o.id === osId);
    if (!os) return;
    
    const nowIso = new Date().toISOString();
    const isCompleting = status === OSStatus.COMPLETED;
    const updatedOS: ServiceOrder = {
      ...os,
      status,
      updatedAt: nowIso,
      completedAt: isCompleting ? (os.completedAt || nowIso) : undefined,
      completedBy: isCompleting ? (os.completedBy || currentUser?.name || 'Administrador HPS') : undefined
    };
    setServiceOrders(prev => prev.map(o => o.id === osId ? updatedOS : o));
    if (selectedOS?.id === osId) {
      setSelectedOS(updatedOS);
    }
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveServiceOrder(updatedOS);
      } catch (err) {
        console.error("Erro ao atualizar status da OS no Supabase", err);
      }
    }

    if (isCompleting) {
      const fDate = new Date(updatedOS.completedAt!).toLocaleDateString('pt-BR');
      const fTime = new Date(updatedOS.completedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      showAlert(
        "O.S. Finalizada e Arquivada",
        `A O.S. #${os.osNumber} (${os.customerName}) foi finalizada em ${fDate} às ${fTime} e arquivada na repartição de O.S. Finalizadas. Ela continua desbloqueada caso precise de alterações futuras.`,
        "success"
      );
    } else if (os.status === OSStatus.COMPLETED && status === OSStatus.OPEN) {
      showAlert(
        "O.S. Reaberta (Status OPEN)",
        `A O.S. #${os.osNumber} (${os.customerName}) retornou para a tela principal de O.S. Abertas (OPEN).`,
        "info"
      );
    }
  };

  const handleStartEditOSHeader = (os: ServiceOrder) => {
    setOsHeaderEditData({
      customerName: os.customerName || '',
      vehicleModel: os.vehicleModel || '',
      mechanicId: os.mechanicId || '',
      observations: os.observations || ''
    });
    setIsEditingOSHeader(true);
  };

  const handleSaveOSHeaderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOS) return;
    if (!osHeaderEditData.customerName.trim() || !osHeaderEditData.vehicleModel.trim()) {
      showAlert("Campos Obrigatórios", "Informe o Nome do Cliente e o Modelo do Veículo.", "error");
      return;
    }

    const matchedMech = users.find(u => u.id === osHeaderEditData.mechanicId);
    const updatedOS: ServiceOrder = {
      ...selectedOS,
      customerName: osHeaderEditData.customerName.trim(),
      vehicleModel: osHeaderEditData.vehicleModel.trim(),
      mechanicId: osHeaderEditData.mechanicId || undefined,
      mechanicName: matchedMech ? matchedMech.name : (osHeaderEditData.mechanicId ? selectedOS.mechanicName : undefined),
      observations: osHeaderEditData.observations.trim() || undefined,
      updatedAt: new Date().toISOString()
    };

    setServiceOrders(prev => prev.map(o => o.id === updatedOS.id ? updatedOS : o));
    setSelectedOS(updatedOS);
    setIsEditingOSHeader(false);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveServiceOrder(updatedOS);
      } catch (err) {
        console.error("Erro ao salvar alterações do cabeçalho da OS no Supabase:", err);
      }
    }

    showAlert(
      "O.S. Atualizada",
      `Os dados da O.S. #${updatedOS.osNumber} foram atualizados com sucesso${updatedOS.status === OSStatus.COMPLETED ? ' (alteração em O.S. finalizada registrada)' : ''}!`,
      "success"
    );
  };

  const handleSaveEditedLaborTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLaborTemplate) return;
    const updated = {
      ...editingLaborTemplate,
      defaultHours: Number(editingLaborTemplate.defaultHours) || 0,
      defaultValuePerHour: Number(editingLaborTemplate.defaultValuePerHour) || 0
    };
    setLaborTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
    setEditingLaborTemplate(null);
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveLaborTemplate(updated);
        showAlert("Sucesso", "Mão de obra atualizada com sucesso no Supabase!", "success");
      } catch (err: any) {
        console.error("Erro ao atualizar mão de obra no Supabase", err);
      }
    } else {
      showAlert("Sucesso", "Mão de obra atualizada localmente!", "success");
    }
  };

  // --- CONFIG ACTIONS ---
  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const newSection: VehicleSection = {
      id: Math.random().toString(36).substr(2, 9),
      name: sectionFormData.name,
      components: sectionFormData.components.split(',').map(c => c.trim()).filter(c => c),
      tenantId: currentTenant.id
    };
    setVehicleSections(prev => [...prev, newSection]);
    setSectionFormData({ name: '', components: '' });
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveVehicleSection(newSection);
      } catch (err) {
        console.error("Erro ao salvar repartição no Supabase", err);
      }
    }
  };

  const handleDeleteSection = async (id: string) => {
    showConfirm(
      "Confirmar Exclusão",
      "Excluir esta repartição?",
      async () => {
        setVehicleSections(prev => prev.filter(s => s.id !== id));
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteVehicleSection(id);
          } catch (err) {
            console.error("Erro ao deletar repartição no Supabase", err);
          }
        }
      }
    );
  };

  const handleAddLaborTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!laborTemplateFormData.description.trim()) {
      showAlert("Aviso", "A descrição do serviço é obrigatória.", "error");
      return;
    }

    const isFixed = laborTemplateFormData.pricingType === 'fixed';
    const rawHours = Number(laborTemplateFormData.defaultHours) || 0;
    const rawMinutes = Number(laborTemplateFormData.minutes) || 0;
    const rawRate = Number(laborTemplateFormData.defaultValuePerHour) || currentTenant.defaultHourlyRate || 150;
    const rawFixed = Number(laborTemplateFormData.fixedValue) || 0;

    // Se for por tempo e horas + minutos estiverem zerados, assume 1h base para não zerar o valor configurado.
    // Se for por dificuldade (fixo), também preenche defaultHours=1 e defaultValuePerHour=fixedValue para compatibilidade com bancos que não tenham a coluna fixedValue.
    const defaultHours = isFixed ? 1 : ((rawHours === 0 && rawMinutes === 0) ? 1 : rawHours);
    const minutes = isFixed ? 0 : rawMinutes;
    const fixedValue = isFixed ? (rawFixed > 0 ? rawFixed : rawRate) : undefined;
    const defaultValuePerHour = isFixed ? (fixedValue || rawRate) : rawRate;
    
    // Se o vínculo opcional não estiver ativo ou não houver template selecionado, garantir que fique undefined (100% independente)
    const hasLink = !isFixed && isSharedLinkActive && Boolean(laborTemplateFormData.linkedTemplateId.trim());
    const linkedItemIds = laborTemplateFormData.linkedItemIds || [];

    if (editingLaborTemplate) {
      const updatedTemplate: LaborTemplate = {
        ...editingLaborTemplate,
        description: laborTemplateFormData.description.trim(),
        pricingType: laborTemplateFormData.pricingType || 'hourly',
        defaultHours,
        minutes,
        defaultValuePerHour,
        fixedValue,
        sectionId: laborTemplateFormData.sectionId.trim() || undefined,
        linkedTemplateId: hasLink ? laborTemplateFormData.linkedTemplateId.trim() : undefined,
        discountPercentage: hasLink ? (Number(laborTemplateFormData.discountPercentage) || 50) : undefined,
        discountValue: hasLink && laborTemplateFormData.discountValue ? Number(laborTemplateFormData.discountValue) : undefined,
        sharedNotes: hasLink ? (laborTemplateFormData.sharedNotes.trim() || 'Aproveitamento de desmontagem/acesso prévio na mesma região') : undefined,
        linkedItemIds
      };

      setLaborTemplates(prev => prev.map(t => t.id === editingLaborTemplate.id ? updatedTemplate : t));

      // Sincronização bidirecional: atualiza laborTemplateId nos itens vinculados e desvincula os removidos
      const targetId = editingLaborTemplate.id;
      const updatedItems = items.map(it => {
        const isLinked = linkedItemIds.includes(it.id) || (it.partNumber && linkedItemIds.includes(it.partNumber));
        if (isLinked) {
          return { ...it, laborTemplateId: targetId };
        }
        if (it.laborTemplateId === targetId && !isLinked) {
          return { ...it, laborTemplateId: undefined };
        }
        return it;
      });
      setItems(updatedItems);

      setEditingLaborTemplate(null);
      setIsSharedLinkActive(false);
      setLaborTemplateFormData({ 
        description: '', 
        pricingType: 'hourly',
        defaultHours: 1, 
        minutes: 0,
        defaultValuePerHour: currentTenant.defaultHourlyRate || 150, 
        fixedValue: 150,
        sectionId: '',
        linkedTemplateId: '',
        discountPercentage: 50,
        discountValue: 0,
        discountType: 'percentage',
        sharedNotes: '',
        linkedItemIds: []
      });

      if (supabaseService.isAvailable()) {
        try {
          await supabaseService.saveLaborTemplate(updatedTemplate);
          const changedItems = updatedItems.filter(it => 
            linkedItemIds.includes(it.id) || it.laborTemplateId === targetId
          );
          if (changedItems.length > 0) {
            await supabaseService.saveItem(changedItems);
          }
        } catch (err) {
          console.error("Erro ao atualizar mão de obra no Supabase", err);
        }
      }
      showAlert("Sucesso", "Mão de obra atualizada no catálogo com as peças amarradas!", "success");
      return;
    }

    const newTemplateId = Math.random().toString(36).substr(2, 9);
    const newTemplate: LaborTemplate = {
      id: newTemplateId,
      description: laborTemplateFormData.description.trim(),
      pricingType: laborTemplateFormData.pricingType || 'hourly',
      defaultHours,
      minutes,
      defaultValuePerHour,
      fixedValue,
      sectionId: laborTemplateFormData.sectionId.trim() || undefined,
      linkedTemplateId: hasLink ? laborTemplateFormData.linkedTemplateId.trim() : undefined,
      discountPercentage: hasLink ? (Number(laborTemplateFormData.discountPercentage) || 50) : undefined,
      discountValue: hasLink && laborTemplateFormData.discountValue ? Number(laborTemplateFormData.discountValue) : undefined,
      sharedNotes: hasLink ? (laborTemplateFormData.sharedNotes.trim() || 'Aproveitamento de desmontagem/acesso prévio na mesma região') : undefined,
      tenantId: currentTenant.id,
      linkedItemIds
    };

    setLaborTemplates(prev => [...prev, newTemplate]);

    // Sincronização bidirecional: atualiza laborTemplateId nos itens amarrados
    const updatedItems = items.map(it => {
      const isLinked = linkedItemIds.includes(it.id) || (it.partNumber && linkedItemIds.includes(it.partNumber));
      if (isLinked) {
        return { ...it, laborTemplateId: newTemplateId };
      }
      return it;
    });
    setItems(updatedItems);

    setIsSharedLinkActive(false);
    setLaborTemplateFormData({ 
      description: '', 
      pricingType: 'hourly',
      defaultHours: 1, 
      minutes: 0,
      defaultValuePerHour: currentTenant.defaultHourlyRate || 150, 
      fixedValue: 150,
      sectionId: '',
      linkedTemplateId: '',
      discountPercentage: 50,
      discountValue: 0,
      discountType: 'percentage',
      sharedNotes: '',
      linkedItemIds: []
    });
    
    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveLaborTemplate(newTemplate);
        const changedItems = updatedItems.filter(it => linkedItemIds.includes(it.id));
        if (changedItems.length > 0) {
          await supabaseService.saveItem(changedItems);
        }
      } catch (err) {
        console.error("Erro ao salvar mão de obra no Supabase", err);
      }
    }
    showAlert("Sucesso", "Mão de obra cadastrada no catálogo com as peças amarradas!", "success");
  };

  const handleTogglePartLinkToLaborTemplate = (itemId: string) => {
    setLaborTemplateFormData(prev => {
      const currentList = prev.linkedItemIds || [];
      const exists = currentList.includes(itemId);
      return {
        ...prev,
        linkedItemIds: exists ? currentList.filter(id => id !== itemId) : [...currentList, itemId]
      };
    });
  };

  const handleQuickBindPartToExistingTemplate = async (item: InventoryItem, templateId: string) => {
    const targetTemplate = laborTemplates.find(t => t.id === templateId);
    if (!targetTemplate) {
      showAlert("Aviso", "Selecione uma mão de obra do catálogo para amarrar esta peça.", "error");
      return;
    }

    const updatedLinkedIds = Array.from(new Set([...(targetTemplate.linkedItemIds || []), item.id]));
    const updatedTemplate: LaborTemplate = {
      ...targetTemplate,
      linkedItemIds: updatedLinkedIds
    };

    const updatedItem: InventoryItem = {
      ...item,
      laborTemplateId: targetTemplate.id
    };

    // Remove o item de outros templates caso estivesse vinculado anteriormente
    setLaborTemplates(prev => prev.map(t => {
      if (t.id === targetTemplate.id) return updatedTemplate;
      if (t.linkedItemIds?.includes(item.id)) {
        return { ...t, linkedItemIds: t.linkedItemIds.filter(id => id !== item.id) };
      }
      return t;
    }));
    setItems(prev => prev.map(it => it.id === item.id ? updatedItem : it));
    setIsQuickBindingCatalogInOS(false);
    setQuickBindTemplateId('');
    setAutoCreateLaborOnPartLink(true);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveLaborTemplate(updatedTemplate);
        await supabaseService.saveItem(updatedItem);
      } catch (err) {
        console.error("Erro ao vincular peça à mão de obra no Supabase", err);
      }
    }

    showAlert("Vínculo Criado no Catálogo", `A peça "${item.name}" agora está amarrada à mão de obra "${targetTemplate.description}"!`, "success");
  };

  const handleQuickCreateAndBindLaborTemplateInOS = async (item: InventoryItem) => {
    if (!quickNewTemplateForm.description.trim()) {
      showAlert("Aviso", "Informe a descrição da mão de obra para cadastrar e amarrar.", "error");
      return;
    }

    const isFixed = quickNewTemplateForm.pricingType === 'fixed';
    const rawHours = Number(quickNewTemplateForm.defaultHours) || 0;
    const rawMinutes = Number(quickNewTemplateForm.minutes) || 0;
    const rawRate = Number(quickNewTemplateForm.defaultValuePerHour) || currentTenant.defaultHourlyRate || 150;
    const rawFixed = Number(quickNewTemplateForm.fixedValue) || 0;
    const resolvedFixed = isFixed ? (rawFixed > 0 ? rawFixed : rawRate) : undefined;
    const newTemplateId = Math.random().toString(36).substr(2, 9);
    const newTemplate: LaborTemplate = {
      id: newTemplateId,
      description: quickNewTemplateForm.description.trim(),
      pricingType: quickNewTemplateForm.pricingType,
      defaultHours: isFixed ? 1 : ((rawHours === 0 && rawMinutes === 0) ? 1 : rawHours),
      minutes: isFixed ? 0 : rawMinutes,
      defaultValuePerHour: isFixed ? (resolvedFixed || rawRate) : rawRate,
      fixedValue: resolvedFixed,
      sectionId: quickNewTemplateForm.sectionId.trim() || undefined,
      tenantId: currentTenant.id,
      linkedItemIds: [item.id]
    };

    const updatedItem: InventoryItem = {
      ...item,
      laborTemplateId: newTemplateId
    };

    setLaborTemplates(prev => [...prev, newTemplate]);
    setItems(prev => prev.map(it => it.id === item.id ? updatedItem : it));
    setIsQuickBindingCatalogInOS(false);
    setAutoCreateLaborOnPartLink(true);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveLaborTemplate(newTemplate);
        await supabaseService.saveItem(updatedItem);
      } catch (err) {
        console.error("Erro ao criar mão de obra e amarrar peça no Supabase", err);
      }
    }

    showAlert("Cadastrado e Vinculado", `Mão de obra "${newTemplate.description}" criada no catálogo e amarrada à peça "${item.name}"!`, "success");
  };

  const handleStartEditLaborTemplate = (t: LaborTemplate) => {
    setEditingLaborTemplate(t);
    const hasLink = Boolean(t.linkedTemplateId);
    setIsSharedLinkActive(hasLink);
    // Combina linkedItemIds explícitos + itens que tenham laborTemplateId igual ao template
    const legacyLinked = items.filter(i => i.laborTemplateId === t.id).map(i => i.id);
    const mergedItemIds = Array.from(new Set([...(t.linkedItemIds || []), ...legacyLinked]));
    const computedGross = computeLaborGross(t);
    const rawH = Number(t.defaultHours) || 0;
    const rawM = Number(t.minutes) || 0;
    const effectiveHours = (rawH === 0 && rawM === 0) ? 1 : rawH;
    const effectiveRate = Number(t.defaultValuePerHour) > 0
      ? Number(t.defaultValuePerHour)
      : (Number(t.fixedValue) > 0 ? Number(t.fixedValue) : (currentTenant.defaultHourlyRate || 150));
    const effectiveFixed = Number(t.fixedValue) > 0
      ? Number(t.fixedValue)
      : (computedGross > 0 ? computedGross : effectiveRate);

    setLaborTemplateFormData({
      description: t.description,
      pricingType: t.pricingType || 'hourly',
      defaultHours: effectiveHours,
      minutes: rawM,
      defaultValuePerHour: effectiveRate,
      fixedValue: effectiveFixed,
      sectionId: t.sectionId || '',
      linkedTemplateId: t.linkedTemplateId || '',
      discountPercentage: t.discountPercentage || 50,
      discountValue: t.discountValue || 0,
      discountType: t.discountValue ? 'fixed' : 'percentage',
      sharedNotes: t.sharedNotes || '',
      linkedItemIds: mergedItemIds
    });
  };

  const handleCancelEditLaborTemplate = () => {
    setEditingLaborTemplate(null);
    setIsSharedLinkActive(false);
    setLaborTemplateFormData({
      description: '',
      pricingType: 'hourly',
      defaultHours: 1,
      minutes: 0,
      defaultValuePerHour: currentTenant.defaultHourlyRate || 150,
      fixedValue: 150,
      sectionId: '',
      linkedTemplateId: '',
      discountPercentage: 50,
      discountValue: 0,
      discountType: 'percentage',
      sharedNotes: '',
      linkedItemIds: []
    });
  };

  const handleDeleteLaborTemplate = async (id: string) => {
    showConfirm(
      "Confirmar Exclusão",
      "Excluir este modelo de mão de obra?",
      async () => {
        setLaborTemplates(prev => prev.filter(t => t.id !== id));
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteLaborTemplate(id);
          } catch (err) {
            console.error("Erro ao deletar mão de obra no Supabase", err);
          }
        }
      }
    );
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const cleanName = newCategoryName.trim();
    if (categories.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
      showAlert("Grupo Já Existente", "Este grupo técnico já está cadastrado.", "error");
      return;
    }
    const updated = [...categories, cleanName];
    setCategories(updated);
    safeSetItem("HPS_CATEGORIES_V12", JSON.stringify(updated));
    setNewCategoryName("");
    showAlert("Grupo Criado", `Grupo técnico "${cleanName}" criado com sucesso!`, "success");
  };

  const handleDeleteCategory = (catName: string) => {
    showConfirm(
      "Excluir Grupo Técnico",
      `Tem certeza que deseja excluir o grupo "${catName}"? Os itens desse grupo não serão excluídos, mas perderão a associação com o grupo.`,
      () => {
        const updated = categories.filter(c => c !== catName);
        setCategories(updated);
        safeSetItem("HPS_CATEGORIES_V12", JSON.stringify(updated));
        showAlert("Grupo Excluído", "Grupo técnico excluído com sucesso.", "success");
      }
    );
  };

  const handleUpdateCategory = (originalName: string, newName: string) => {
    const cleanNewName = newName.trim();
    if (!cleanNewName) return;
    if (cleanNewName === originalName) {
      setEditingCategory(null);
      return;
    }
    if (categories.some(c => c.toLowerCase() === cleanNewName.toLowerCase() && c !== originalName)) {
      showAlert("Grupo Já Existente", "Já existe outro grupo técnico com este nome.", "error");
      return;
    }

    const updated = categories.map(c => c === originalName ? cleanNewName : c);
    setCategories(updated);
    safeSetItem("HPS_CATEGORIES_V12", JSON.stringify(updated));

    // Update category of all items in memory
    const updatedItems = items.map(item => {
      if (item.category === originalName as any) {
        return { ...item, category: cleanNewName as any };
      }
      return item;
    });
    setItems(updatedItems);

    setEditingCategory(null);
    showAlert("Grupo Atualizado", "Nome do grupo técnico atualizado!", "success");
  };

  // --- AI ACTIONS ---
  const fetchBRPData = async () => {
    if (!formData.partNumber) return;
    setIsAiLoading(true);
    try {
      const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
      if (!apiKey) {
        showAlert("Aviso", "Identificação automática offline: digite a descrição da peça manualmente.", "info");
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Identifique a peça BRP para o Part Number: ${formData.partNumber}. Forneça nome comercial curto e categoria.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: { type: Type.STRING, enum: CATEGORIES }
            },
            required: ["name", "category"]
          }
        }
      });
      const data = JSON.parse(response.text || '{}');
      setFormData(prev => ({ ...prev, name: data.name || prev.name, category: data.category as any || prev.category }));
    } catch (e) { 
      console.error(e); 
      showAlert("Aviso", "Não foi possível consultar automaticamente o Part Number.", "info");
    } finally { 
      setIsAiLoading(false); 
    }
  };

  // --- ITEM ACTIONS ---
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: InventoryItem = { 
      id: generateId(), 
      ...formData, 
      unit: formData.unit || 'un',
      entryDate: new Date().toISOString(),
      tenantId: currentTenant.id
    };
    const newTx: Transaction = { 
      id: generateId(), 
      itemId: newItem.id, 
      itemName: newItem.name, 
      partNumber: newItem.partNumber, 
      userId: currentUser?.id || 'user_admin', 
      userName: currentUser?.name || 'Administrador HPS', 
      type: TransactionType.IN, 
      quantity: newItem.quantity, 
      unitValue: newItem.value,
      date: new Date().toISOString(), 
      recipientName: 'ESTOQUE INICIAL',
      destination: MovementDestination.INTERNAL,
      notes: 'Cadastro inicial de componente no sistema',
      tenantId: currentTenant.id
    };
    
    setItems(prev => [newItem, ...prev]);
    setHistory(prev => [newTx, ...prev]);
    setIsAddingItem(false);
    setFormData({ 
      name: '', partNumber: '', value: 0, quantity: 0, minQuantity: 1, 
      category: '' as any, boxNumber: '', linkedQRCode: '', imageUrl: '', observations: '',
      sectionId: '', laborTemplateId: '', unit: 'un'
    });

    if (newItem.laborTemplateId) {
      setLaborTemplates(prev => prev.map(t => {
        if (t.id === newItem.laborTemplateId) {
          const links = Array.isArray(t.linkedItemIds) ? t.linkedItemIds : [];
          const updatedT = {
            ...t,
            linkedItemIds: links.includes(newItem.id) ? links : [...links, newItem.id]
          };
          if (supabaseService.isAvailable()) {
            supabaseService.saveLaborTemplate(updatedT).catch(() => {});
          }
          return updatedT;
        }
        return t;
      }));
    }

    if (supabaseService.isAvailable()) {
      try {
        await Promise.all([
          supabaseService.saveItem(newItem),
          supabaseService.saveTransaction(newTx)
        ]);
      } catch (err) {
        console.error("Erro ao salvar item no Supabase", err);
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    showConfirm(
      "Confirmar Exclusão",
      "Deseja realmente excluir este item do inventário? Esta ação é irreversível.",
      async () => {
        setItems(prev => prev.filter(i => i.id !== id));
        setSelectedItem(null);
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.deleteItem(id);
          } catch (err) {
            console.error("Erro ao deletar item no Supabase", err);
          }
        }
      }
    );
  };

  const handleUpdateItemQRCode = async (itemId: string, newCode: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updatedItem = { ...item, linkedQRCode: newCode };
    setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    setSelectedItem(updatedItem);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveItem(updatedItem);
        showAlert("Sucesso", "Código de barras/QR Code atualizado no banco de dados.", "success");
      } catch (err) {
        console.error("Erro ao atualizar QR Code no Supabase", err);
        showAlert("Erro", "Não foi possível sincronizar o novo código com o servidor.", "error");
      }
    } else {
      showAlert("Sucesso Local", "Código atualizado com sucesso localmente.", "success");
    }
  };

  const handleUpdateItemValue = async (itemId: string, newValue: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updatedItem = { ...item, value: newValue };
    setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    setSelectedItem(updatedItem);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveItem(updatedItem);
        showAlert("Sucesso", "Valor da peça atualizado no banco de dados.", "success");
      } catch (err) {
        console.error("Erro ao atualizar o valor no Supabase", err);
        showAlert("Erro", "Não foi possível sincronizar o novo valor com o servidor.", "error");
      }
    } else {
      showAlert("Sucesso Local", "Valor da peça atualizado com sucesso localmente.", "success");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'new' | 'edit' | 'detail') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Comprime a imagem automaticamente para < 60KB, mantendo nitidez e prevenindo estouro de cota de storage
      const result = await compressImage(file, 800, 800, 0.75);
      if (target === 'new') {
        setFormData(prev => ({ ...prev, imageUrl: result }));
      } else if (target === 'edit' && editingItem) {
        setEditingItem({ ...editingItem, imageUrl: result });
      } else if (target === 'detail' && selectedItem) {
        handleUpdateItemPhoto(selectedItem.id, result);
      }
    } catch (err) {
      console.error("Erro ao comprimir imagem:", err);
      showAlert("Erro na Imagem", "Não foi possível processar a foto selecionada.", "error");
    }
  };

  const handleUpdateItemPhoto = async (itemId: string, photoUrl: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updatedItem = { ...item, imageUrl: photoUrl.trim() || undefined };
    setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    setSelectedItem(updatedItem);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveItem(updatedItem);
        showAlert("Sucesso", "Foto do item atualizada com sucesso!", "success");
      } catch (err: any) {
        console.error("Erro ao salvar foto no Supabase", err);
        showAlert("Sucesso Local", `Foto atualizada localmente. Erro no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", "Foto atualizada com sucesso!", "success");
    }
  };

  const handleUpdateItemObservations = async (itemId: string, newObs: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const updatedItem = { ...item, observations: newObs.trim() || undefined };
    setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    setSelectedItem(updatedItem);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveItem(updatedItem);
        showAlert("Sucesso", "Observações do item atualizadas com sucesso!", "success");
      } catch (err: any) {
        console.error("Erro ao salvar observações no Supabase", err);
        showAlert("Sucesso Local", `Observações atualizadas localmente. Erro no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", "Observações atualizadas com sucesso!", "success");
    }
  };

  const handleRegisterPurchase = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const qty = Number(purchaseFormData.quantity) || 0;
    if (qty <= 0) {
      showAlert("Aviso", "A quantidade da recompra deve ser maior que zero.", "error");
      return;
    }

    const unitCost = Number(purchaseFormData.unitCost) || 0;
    const newPurchase: ItemPurchase = {
      id: generateId(),
      date: new Date().toISOString(),
      quantity: qty,
      unitCost: unitCost,
      supplier: purchaseFormData.supplier.trim() || undefined,
      invoiceNumber: purchaseFormData.invoiceNumber.trim() || undefined,
      notes: purchaseFormData.notes.trim() || undefined
    };

    const updatedPurchases = [newPurchase, ...(item.purchaseHistory || [])];
    const newQty = Math.round((item.quantity + qty) * 10000) / 10000;
    const newValue = (purchaseFormData.updateItemValue && unitCost > 0)
      ? unitCost
      : item.value;

    const updatedItem: InventoryItem = {
      ...item,
      quantity: newQty,
      value: newValue,
      purchaseHistory: updatedPurchases
    };

    const newTx: Transaction = {
      id: generateId(),
      itemId: item.id,
      itemName: item.name,
      partNumber: item.partNumber,
      userId: currentUser?.id || 'user_admin',
      userName: currentUser?.name || 'Administrador HPS',
      type: TransactionType.IN,
      quantity: qty,
      unitValue: unitCost > 0 ? unitCost : item.value,
      recipientName: purchaseFormData.supplier.trim() ? `FORNECEDOR: ${purchaseFormData.supplier.toUpperCase()}` : 'RECOMPRA DE ESTOQUE',
      notes: purchaseFormData.notes.trim() || (purchaseFormData.invoiceNumber ? `NF: ${purchaseFormData.invoiceNumber}` : 'Entrada por recompra de peça'),
      date: new Date().toISOString(),
      tenantId: currentTenant.id
    };

    setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    setSelectedItem(updatedItem);
    setHistory(prev => [newTx, ...prev]);
    setIsAddingPurchase(false);
    setPurchaseFormData({ quantity: 1, unitCost: 0, supplier: '', invoiceNumber: '', notes: '', updateItemValue: false });

    if (supabaseService.isAvailable()) {
      try {
        await Promise.all([
          supabaseService.saveItem(updatedItem),
          supabaseService.saveTransaction(newTx)
        ]);
        showAlert("Sucesso", `Recompra de ${qty} un registrada com sucesso! Saldo adicionado ao estoque.`, "success");
      } catch (err: any) {
        console.error("Erro ao registrar recompra no Supabase", err);
        showAlert("Sucesso Local", `Recompra registrada localmente. Erro no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", `Recompra de ${qty} un registrada! Novo estoque: ${newQty} un.`, "success");
    }
  };

  const handleDeletePurchase = (itemId: string, purchaseId: string) => {
    showConfirm(
      "Excluir Registro de Recompra",
      "Deseja remover este registro do histórico de recompras desta peça?",
      async () => {
        const item = items.find(i => i.id === itemId);
        if (!item) return;
        const updatedPurchases = (item.purchaseHistory || []).filter(p => p.id !== purchaseId);
        const updatedItem = { ...item, purchaseHistory: updatedPurchases };
        setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
        setSelectedItem(updatedItem);
        if (supabaseService.isAvailable()) {
          try {
            await supabaseService.saveItem(updatedItem);
          } catch (err) {
            console.error("Erro ao salvar exclusão de recompra no Supabase", err);
          }
        }
        showAlert("Sucesso", "Registro de recompra excluído com sucesso!", "success");
      }
    );
  };

  const handleStartEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item, unit: item.unit || 'un' });
  };

  const handleSaveEditedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editingItem.name.trim() || !editingItem.partNumber.trim()) {
      showAlert("Erro", "Nome da peça e Part Number são obrigatórios.", "error");
      return;
    }

    const updatedItem: InventoryItem = {
      ...editingItem,
      name: editingItem.name.trim(),
      partNumber: editingItem.partNumber.trim(),
      value: Number(editingItem.value) || 0,
      quantity: Number(editingItem.quantity) || 0,
      minQuantity: Number(editingItem.minQuantity) || 0,
      unit: editingItem.unit || 'un',
      boxNumber: editingItem.boxNumber.trim(),
      sectionId: editingItem.sectionId || undefined,
      category: editingItem.category,
      laborTemplateId: editingItem.laborTemplateId || undefined,
      linkedQRCode: editingItem.linkedQRCode?.trim() || undefined,
      imageUrl: editingItem.imageUrl?.trim() || undefined,
      observations: editingItem.observations?.trim() || undefined
    };

    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    if (selectedItem?.id === updatedItem.id) {
      setSelectedItem(updatedItem);
    }

    // Atualiza o vínculo bidirecional em laborTemplates
    setLaborTemplates(prev => prev.map(t => {
      const currentLinks = Array.isArray(t.linkedItemIds) ? t.linkedItemIds : [];
      if (updatedItem.laborTemplateId === t.id) {
        if (!currentLinks.includes(updatedItem.id)) {
          const updatedT = { ...t, linkedItemIds: [...currentLinks, updatedItem.id] };
          if (supabaseService.isAvailable()) {
            supabaseService.saveLaborTemplate(updatedT).catch(() => {});
          }
          return updatedT;
        }
      } else {
        if (currentLinks.includes(updatedItem.id)) {
          const updatedT = { ...t, linkedItemIds: currentLinks.filter(id => id !== updatedItem.id) };
          if (supabaseService.isAvailable()) {
            supabaseService.saveLaborTemplate(updatedT).catch(() => {});
          }
          return updatedT;
        }
      }
      return t;
    }));

    setEditingItem(null);

    if (supabaseService.isAvailable()) {
      try {
        await supabaseService.saveItem(updatedItem);
        showAlert("Sucesso", "Cadastro da peça atualizado com sucesso no Supabase!", "success");
      } catch (err: any) {
        console.error("Erro ao salvar edição de item no Supabase", err);
        showAlert("Sucesso Local", `Item atualizado localmente. Erro no Supabase: ${err.message}`, "info");
      }
    } else {
      showAlert("Sucesso", "Cadastro da peça atualizado com sucesso!", "success");
    }
  };

  const processMovement = async (validated: boolean = false) => {
    if (!movementModal.itemId) return;
    const item = items.find(i => i.id === movementModal.itemId);
    if (!item) return;

    if (movementModal.type === TransactionType.OUT && item.linkedQRCode && !validated) {
      setIsScanning(true); setScanMode('validate'); return;
    }

    if (movementModal.type === TransactionType.OUT && item.quantity < movementQty) {
      showAlert("Saldo Insuficiente", "Saldo insuficiente no estoque para esta saída.", "error"); 
      return;
    }

    const costValue = movementUnitValue !== '' ? Number(movementUnitValue) : undefined;
    const finalItemPrice = (movementModal.type === TransactionType.IN && updateItemPriceWithCost && costValue !== undefined && costValue > 0)
      ? costValue
      : item.value;

    const updatedItem: InventoryItem = { 
      ...item, 
      quantity: Math.max(0, Math.round((item.quantity + (movementModal.type === TransactionType.IN ? movementQty : -movementQty)) * 10000) / 10000),
      value: finalItemPrice
    };

    const newTx: Transaction = { 
      id: generateId(), 
      itemId: item.id, 
      itemName: item.name, 
      partNumber: item.partNumber, 
      userId: currentUser?.id || 'user_admin', 
      userName: currentUser?.name || 'Administrador HPS', 
      type: movementModal.type, 
      quantity: movementQty, 
      date: new Date().toISOString(), 
      recipientName: recipient || (movementModal.type === TransactionType.IN ? 'ENTRADA / RECOMPRA' : 'HPS'), 
      destination, 
      osNumber: destination === MovementDestination.OS ? osNumber : undefined,
      unitValue: costValue !== undefined ? costValue : (item.value || undefined),
      notes: movementNotes.trim() || undefined,
      tenantId: currentTenant.id
    };

    setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
    if (selectedItem?.id === item.id) {
      setSelectedItem(updatedItem);
    }
    setHistory(prev => [newTx, ...prev]);
    setMovementModal({ isOpen: false, itemId: null, type: TransactionType.OUT });
    setMovementQty(1);
    setMovementUnitValue('');
    setMovementNotes('');
    setUpdateItemPriceWithCost(false);
    setRecipient('');
    setOsNumber('');

    if (supabaseService.isAvailable()) {
      try {
        await Promise.all([
          supabaseService.saveItem(updatedItem),
          supabaseService.saveTransaction(newTx)
        ]);
      } catch (err) {
        console.error("Erro ao processar movimentação no Supabase", err);
      }
    }
  };

  const handleQRScan = (data: string) => {
    setIsScanning(false);
    const cleanData = (data || '').trim();

    // 1. Verifica se o QR Code lido pertence a um PASSAPORTE DO UTV (código direto ou link ?utv_passport=...)
    let extractedPassportKey = cleanData;
    if (cleanData.includes('utv_passport=')) {
      try {
        const urlObj = new URL(cleanData);
        extractedPassportKey = urlObj.searchParams.get('utv_passport') || cleanData;
      } catch {
        const match = cleanData.match(/utv_passport=([^&]+)/);
        if (match && match[1]) extractedPassportKey = decodeURIComponent(match[1]);
      }
    }

    const foundPassport = utvPassports.find(
      p =>
        p.qrCode.trim().toUpperCase() === extractedPassportKey.trim().toUpperCase() ||
        p.id === extractedPassportKey.trim() ||
        p.qrCode.trim().toUpperCase() === cleanData.toUpperCase()
    );

    if (foundPassport || scanMode === 'passport') {
      if (foundPassport) {
        setActiveTab('service_orders');
        setOsSubTab('passports');
        setSelectedPassport(foundPassport);
        showAlert(
          "Passaporte UTV Identificado!",
          `Abrindo Passaporte do veículo ${foundPassport.vehicleNumber || ''} ${foundPassport.vehicleModel} (${foundPassport.customerName}).`,
          "success"
        );
      } else {
        showAlert(
          "Passaporte Não Encontrado",
          `Nenhum Passaporte UTV localizado para o QR Code "${cleanData}". Verifique a etiqueta do veículo.`,
          "error"
        );
      }
      return;
    }
    
    if (scanMode === 'validate') {
      const item = items.find(i => i.id === movementModal.itemId);
      if (item && item.linkedQRCode === data) {
        processMovement(true);
      } else {
        showAlert("Erro de Validação", "O código lido não corresponde ao item selecionado para saída.", "error");
      }
      return;
    }
    
    if (scanMode === 'bind') {
      if (selectedItem) {
        handleUpdateItemQRCode(selectedItem.id, data);
      } else {
        setFormData(prev => ({ ...prev, linkedQRCode: data }));
        showAlert("Código Vinculado", `Código "${data}" vinculado com sucesso ao novo componente!`, "success");
      }
      return;
    }

    const found = items.find(i => i.linkedQRCode === data || i.partNumber === data);
    if (found) {
      setSelectedItem(found);
      setActiveTab('dashboard');
    } else {
      showAlert("Não Encontrado", "Nenhum item ou Passaporte UTV encontrado com este código.", "error");
    }
  };

  // --- FILTERS & ANALYTICS ---
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter(item => {
      if (selectedCategoryFilter !== 'all' && item.category !== selectedCategoryFilter) {
        return false;
      }
      if (!term) return true;

      switch (searchField) {
        case 'name':
          return (item.name || '').toLowerCase().includes(term);
        case 'category':
          return (item.category || '').toLowerCase().includes(term);
        case 'partNumber':
          return (item.partNumber || '').toLowerCase().includes(term);
        case 'all':
        default:
          return (
            (item.name || '').toLowerCase().includes(term) ||
            (item.partNumber || '').toLowerCase().includes(term) ||
            (item.category || '').toLowerCase().includes(term)
          );
      }
    });
  }, [items, searchTerm, searchField, selectedCategoryFilter]);
  
  const filteredOsPartItems = useMemo(() => {
    const term = osPartSearchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter(i => 
      (i.name || '').toLowerCase().includes(term) || 
      (i.partNumber || '').toLowerCase().includes(term)
    );
  }, [items, osPartSearchTerm]);
  
  const filteredHistory = useMemo(() => history.filter(h => 
    h.type === TransactionType.OUT && 
    (h.itemName.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
     (h.partNumber?.toLowerCase().includes(historySearchTerm.toLowerCase())) ||
     (h.osNumber && h.osNumber.includes(historySearchTerm)))
  ), [history, historySearchTerm]);

  const technicianStats = useMemo(() => {
    const stats: Record<string, number> = {};
    history.filter(h => h.type === TransactionType.OUT).forEach(h => {
      stats[h.recipientName] = Math.round(((stats[h.recipientName] || 0) + (Number(h.quantity) || 0)) * 10000) / 10000;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [history]);

  const filteredLabelItems = useMemo(() => {
    const term = labelSearchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter(item =>
      (item.name || '').toLowerCase().includes(term) ||
      (item.partNumber || '').toLowerCase().includes(term) ||
      (item.boxNumber || '').toLowerCase().includes(term) ||
      (item.category || '').toLowerCase().includes(term) ||
      (item.linkedQRCode || '').toLowerCase().includes(term)
    );
  }, [items, labelSearchTerm]);

  const buildLabelsPrintHtml = (targetItems: InventoryItem[]) => {
    const tenantName = (currentTenant?.name || 'HPS CONTROL').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nowStr = new Date().toLocaleString('pt-BR');
    const cardsHtml = targetItems.map(item => {
      const qrValue = (item.linkedQRCode || item.partNumber || item.id || '').trim();
      const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(qrValue)}`;
      const safeName = (item.name || 'PEÇA S/ NOME').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safePN = (item.partNumber || 'S/ REF').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeBox = (item.boxNumber || 'S/ LOC').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeCat = (item.category || 'GERAL').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeQrText = qrValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return `
        <div class="label-card">
          <div class="label-header">${tenantName} • ${safeCat}</div>
          <div class="label-title">${safeName}</div>
          <div class="label-qr-box">
            <img src="${qrImgUrl}" alt="${safePN}" crossorigin="anonymous" />
          </div>
          <div class="label-pn-caption">PART NUMBER OFICIAL</div>
          <div class="label-pn">${safePN}</div>
          <div class="label-qr-code">QR: ${safeQrText}</div>
          <div class="label-box">${safeBox}</div>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html lang="pt-br">
        <head>
          <meta charset="utf-8" />
          <title>Lote de Etiquetas QR - ${tenantName}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
            }
            .sheet-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #000;
              padding-bottom: 6px;
              margin-bottom: 12px;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
            }
            .labels-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10px;
              width: 100%;
            }
            .label-card {
              border: 1.5px solid #18181b;
              border-radius: 14px;
              padding: 10px 8px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              background: #ffffff;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .label-header {
              font-size: 7.5px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #52525b;
              margin-bottom: 4px;
            }
            .label-title {
              font-size: 10px;
              font-weight: 900;
              text-transform: uppercase;
              font-style: italic;
              line-height: 1.2;
              height: 24px;
              overflow: hidden;
              margin-bottom: 6px;
              color: #000000;
            }
            .label-qr-box {
              width: 104px;
              height: 104px;
              border: 1px solid #e4e4e7;
              border-radius: 10px;
              padding: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 6px;
              background: #ffffff;
            }
            .label-qr-box img {
              width: 94px;
              height: 94px;
              object-fit: contain;
              display: block;
            }
            .label-pn-caption {
              font-size: 7px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: #71717a;
            }
            .label-pn {
              font-size: 12px;
              font-weight: 900;
              letter-spacing: 0.06em;
              color: #000000;
              margin: 1px 0 2px;
            }
            .label-qr-code {
              font-family: monospace;
              font-size: 7.5px;
              font-weight: 700;
              color: #3f3f46;
              margin-bottom: 6px;
            }
            .label-box {
              width: 100%;
              background: #000000 !important;
              color: #ffffff !important;
              font-size: 8.5px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              padding: 5px 4px;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="sheet-header">
            <span>${tenantName} • LOTE DE ETIQUETAS QR CODE OFICIAIS</span>
            <span>TOTAL: ${targetItems.length} ETIQUETA(S) • ${nowStr}</span>
          </div>
          <div class="labels-grid">
            ${cardsHtml}
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintLabelsBatch = (targetItems: InventoryItem[]) => {
    if (!targetItems || targetItems.length === 0) {
      showAlert("Sem Etiquetas", "Não há itens selecionados ou disponíveis para imprimir o lote de etiquetas.", "error");
      return;
    }

    try {
      const existing = document.getElementById('hps-labels-print-iframe');
      if (existing) existing.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'hps-labels-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '10px';
      iframe.style.height = '10px';
      iframe.style.border = '0';
      iframe.style.zIndex = '-1';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (!frameDoc) {
        window.print();
        return;
      }

      frameDoc.open();
      frameDoc.write(buildLabelsPrintHtml(targetItems));
      frameDoc.close();

      const imgs = Array.from(frameDoc.querySelectorAll('img'));
      const waitImages = Promise.all(
        imgs.map(
          img =>
            new Promise<void>(resolve => {
              if (img.complete) {
                resolve();
                return;
              }
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );

      const timeout = new Promise<void>(resolve => setTimeout(resolve, 1400));

      Promise.race([waitImages, timeout]).then(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.warn('Fallback window.print acionado para lote de etiquetas:', err);
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 12000);
        }
      });
    } catch (err) {
      console.error('Erro ao imprimir lote de etiquetas HPS:', err);
      window.print();
    }
  };

  const handleDownloadLabelsPdf = async (targetItems: InventoryItem[]) => {
    if (!targetItems || targetItems.length === 0) {
      showAlert("Sem Etiquetas", "Não há itens disponíveis para gerar o PDF de etiquetas.", "error");
      return;
    }

    setIsGeneratingLabelsPdf(true);
    try {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '194mm';
      container.style.background = '#ffffff';
      container.style.color = '#000000';
      container.style.padding = '6mm';
      container.innerHTML = buildLabelsPrintHtml(targetItems);
      document.body.appendChild(container);

      const imgs = Array.from(container.querySelectorAll('img'));
      await Promise.race([
        Promise.all(
          imgs.map(
            img =>
              new Promise<void>(resolve => {
                if (img.complete) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
          )
        ),
        new Promise<void>(resolve => setTimeout(resolve, 1500))
      ]);

      const winHtml2Pdf = (window as any).html2pdf;
      let html2pdfFn = winHtml2Pdf;
      if (!html2pdfFn) {
        const mod = await import('html2pdf.js');
        html2pdfFn = mod.default || mod;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      await html2pdfFn()
        .set({
          margin: [6, 6, 6, 6],
          filename: `lote_etiquetas_qr_hps_${dateStr}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(container)
        .save();

      document.body.removeChild(container);
    } catch (err) {
      console.error('Erro ao gerar PDF do lote de etiquetas:', err);
      handlePrintLabelsBatch(targetItems);
    } finally {
      setIsGeneratingLabelsPdf(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = userSearchTerm.trim().toLowerCase();
    return users.filter(u => {
      const matchesSearch = !term ||
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.username && u.username.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term));

      const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, userSearchTerm, userRoleFilter]);

  const targetPublicPassportFromUrl = publicClientPassportId
    ? (utvPassports.find(
        p => p.id === publicClientPassportId || p.qrCode.toUpperCase() === publicClientPassportId.toUpperCase()
      ) || DEFAULT_UTV_PASSPORTS.find(
        p => p.id === publicClientPassportId || p.qrCode.toUpperCase() === publicClientPassportId.toUpperCase()
      ) || null)
    : null;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 sm:p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
        <div className="bg-zinc-900/40 backdrop-blur-xl p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] border border-green-500/20 w-full max-w-md text-white shadow-2xl">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="bg-green-600 p-4 sm:p-5 rounded-3xl mb-4 shadow-lg shadow-green-500/30 transform -rotate-3">
              <HPSLogo size="lg" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter italic">HPS <span className="text-green-500">CONTROL</span></h1>
            <p className="text-zinc-400 mt-1.5 font-medium italic uppercase tracking-widest text-[10px] text-center">
              {publicClientPassportId ? 'Portal de Acesso ao Espelho do Cliente' : 'Acesso Restrito ao Sistema'}
            </p>
          </div>

          {publicClientPassportId && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-400 font-black uppercase text-[10px] tracking-wider">
                <ShieldCheck size={16} className="shrink-0" />
                <span>Espelho do Cliente Protegido por Senha</span>
              </div>
              {targetPublicPassportFromUrl ? (
                <p className="text-[11px] text-zinc-200 leading-relaxed">
                  Veículo: <strong className="text-white">{targetPublicPassportFromUrl.vehicleNumber ? `${targetPublicPassportFromUrl.vehicleNumber} • ` : ''}{targetPublicPassportFromUrl.vehicleModel}</strong> ({targetPublicPassportFromUrl.customerName}). Insira seu <strong>Login e Senha de Cliente</strong> enviados pela oficina para visualizar o espelho.
                </p>
              ) : (
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  Insira seu <strong>Login e Senha de Cliente</strong> fornecidos pela oficina para abrir a visualização exclusiva do seu UTV.
                </p>
              )}
            </div>
          )}
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1 italic">
                {publicClientPassportId ? 'Login do Cliente' : 'Usuário ou Login de Cliente'}
              </label>
              <input 
                type="text" 
                className="w-full px-5 py-4 bg-zinc-800/50 border border-zinc-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white"
                value={loginForm.username}
                onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                required
                placeholder={publicClientPassportId ? 'Ex: guilherme' : 'admin ou login do cliente'}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1 italic">Senha de Segurança</label>
              <input 
                type="password" 
                className="w-full px-5 py-4 bg-zinc-800/50 border border-zinc-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white"
                value={loginForm.password}
                onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                required
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-4 sm:py-5 bg-green-500 hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-black rounded-2xl shadow-glow transition-all mt-2 uppercase italic text-xs sm:text-sm flex items-center justify-center gap-3 active:scale-95"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={18} />
                  Autenticando...
                </>
              ) : (
                publicClientPassportId ? "Acessar Espelho do Meu UTV" : "Autenticar Entrada"
              )}
            </button>
          </form>

          {/* Atalhos Rápidos para Testes */}
          <div className="mt-6 pt-4 border-t border-zinc-800/80 space-y-2.5">
            <p className="text-[9px] font-black uppercase text-zinc-400 text-center tracking-wider">
              ⚡ Acesso Rápido para Iniciar Testes:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoginForm({ username: 'admin', password: 'admin' });
                }}
                className="p-2.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-1 text-green-400 text-[9px] font-black uppercase">
                  <span>👑 Admin</span>
                </div>
                <div className="text-[8px] text-zinc-400 font-mono mt-0.5">
                  admin / admin
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginForm({ username: 'carlos', password: '123' });
                }}
                className="p-2.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-1 text-blue-400 text-[9px] font-black uppercase">
                  <span>🔧 Mecânico</span>
                </div>
                <div className="text-[8px] text-zinc-400 font-mono mt-0.5">
                  carlos / 123
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginForm({ username: 'guilherme', password: '123' });
                }}
                className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-1 text-emerald-400 text-[9px] font-black uppercase">
                  <span>🏁 Cliente UTV</span>
                </div>
                <div className="text-[8px] text-zinc-300 font-mono mt-0.5">
                  guilherme / 123
                </div>
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 border-t border-zinc-800/50 pt-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${supabaseService.isAvailable() ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 italic">
                {supabaseService.isAvailable() ? 'Servidor Supabase: Online' : 'Servidor Supabase: Offline'}
              </span>
            </div>
          </div>

          <p className="text-center text-zinc-600 text-[10px] mt-5 font-bold uppercase tracking-widest italic">
            © {new Date().getFullYear()} HPS Control Systems • v2.0
          </p>
        </div>

        {/* ALERT MODAL NA TELA DE LOGIN */}
        {alertConfig.isOpen && (
          <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl sm:rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden">
              <div className={`p-5 sm:p-8 flex items-center gap-4 sm:gap-6 ${alertConfig.type === 'error' ? 'bg-red-500 text-white' : alertConfig.type === 'success' ? 'bg-green-500 text-black' : 'bg-white text-black'}`}>
                <div className="p-3 sm:p-4 bg-black/10 rounded-2xl shrink-0">
                  {alertConfig.type === 'error' ? <X size={28} strokeWidth={4} /> : alertConfig.type === 'success' ? <Check size={28} strokeWidth={4} /> : <Info size={28} strokeWidth={4} />}
                </div>
                <h3 className="text-lg sm:text-2xl font-black uppercase italic tracking-tighter">{alertConfig.title}</h3>
              </div>
              <div className="p-6 sm:p-10 space-y-6 sm:space-y-8">
                <p className="text-zinc-300 text-xs sm:text-sm font-medium leading-relaxed">{alertConfig.message}</p>
                <button 
                  onClick={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                  className="w-full py-4 sm:py-5 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase text-[11px] rounded-2xl sm:rounded-[2rem] transition-all tracking-widest"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // TRAVA ABSOLUTA DE SEGURANÇA PARA CLIENTES (UserRole.CLIENT):
  // O cliente logado fica 100% restrito à visualização do Espelho do Cliente (sem menu lateral, sem edição e sem navegação pelo sistema)
  if (currentUser?.role === UserRole.CLIENT) {
    const allPassports = utvPassports.length > 0 ? utvPassports : DEFAULT_UTV_PASSPORTS;
    const clientLinkedPassports = allPassports.filter(
      p =>
        (currentUser.clientId && p.clientId === currentUser.clientId) ||
        p.customerName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
    );

    const lockedPassportFromUrl = publicClientPassportId
      ? allPassports.find(
          p => p.id === publicClientPassportId || p.qrCode.toUpperCase() === publicClientPassportId.toUpperCase()
        )
      : null;

    const activeClientPassport =
      lockedPassportFromUrl ||
      clientLinkedPassports.find(p => p.id === selectedClientLockedPassportId) ||
      clientLinkedPassports[0] ||
      null;

    if (!activeClientPassport) {
      return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
              <ShieldCheck size={32} />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 bg-zinc-800 text-emerald-400 text-[9px] font-black uppercase rounded-lg border border-zinc-700">
                Acesso Exclusivo do Cliente • Somente Visualização
              </span>
              <h2 className="text-xl font-black uppercase italic">Olá, {currentUser.name}</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Sua conta de cliente está ativa, porém ainda não há um Passaporte UTV vinculado ao seu perfil ou o link informado não foi localizado. Solicite o link atualizado à oficina.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-4 bg-red-500/20 hover:bg-red-500 hover:text-white text-red-400 border border-red-500/30 rounded-2xl text-xs font-black uppercase transition-all"
            >
              Sair da Conta
            </button>
          </div>
        </div>
      );
    }

    return (
      <UTVPassportClientMirror
        passport={activeClientPassport}
        items={items}
        tenant={currentTenant}
        isPublicStandalone={true}
        isClientLockedSession={true}
        onLogoutClient={handleLogout}
        clientPassportsList={lockedPassportFromUrl ? [lockedPassportFromUrl] : clientLinkedPassports}
        onSelectClientPassport={(p) => setSelectedClientLockedPassportId(p.id)}
      />
    );
  }

  // Se um funcionário/admin logado abriu um link com ?utv_passport=..., mostra o espelho com opção de fechar para voltar ao sistema:
  if (publicClientPassportId && targetPublicPassportFromUrl) {
    const ownerClient = clients.find(
      c => c.id === targetPublicPassportFromUrl.clientId || c.name.trim().toLowerCase() === targetPublicPassportFromUrl.customerName.trim().toLowerCase()
    );
    return (
      <UTVPassportClientMirror
        passport={targetPublicPassportFromUrl}
        items={items}
        tenant={currentTenant}
        isPublicStandalone={true}
        clientCredentials={ownerClient ? { username: ownerClient.username, password: ownerClient.password, clientName: ownerClient.name } : undefined}
        onClose={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('utv_passport');
          window.history.replaceState({}, '', url.toString());
          setPublicClientPassportId(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col lg:flex-row pb-28 lg:pb-0 overflow-x-hidden">
      
      {/* Sidebar Desktop (PC) */}
      <nav className="print-hidden hidden lg:flex flex-col w-24 xl:w-28 bg-black border-r border-zinc-800 py-5 items-center gap-3 sticky left-0 top-0 h-screen z-50 shrink-0 overflow-y-auto no-scrollbar">
        <div className="flex flex-col items-center shrink-0">
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-500 hover:scale-110 duration-300 transition-all select-none">
            <Smartphone size={20} className="animate-pulse" />
          </div>
          <span className="text-[7.5px] font-black uppercase tracking-widest text-green-500 mt-1 italic">HPS PRO</span>
        </div>
        <div className="flex flex-col gap-1.5 mt-2 flex-1 w-full px-2 overflow-y-auto no-scrollbar items-center">
          {[
            { id: 'dashboard', label: 'Gestão de Peças', short: 'Peças', icon: TrendingUp },
            { id: 'inventory', label: 'Estoque Físico', short: 'Estoque', icon: Layers },
            { id: 'service_orders', label: 'Ordens de Serviço', short: 'O.S.', icon: CheckCircle2 },
            { id: 'clients', label: 'Clientes', short: 'Clientes', icon: UserCircle },
            { id: 'history', label: 'Movimentações & Auditoria', short: 'Auditoria', icon: FileSpreadsheet },
            { id: 'analytics', label: 'Analytics', short: 'Dash', icon: BarChart3 },
            { id: 'labels', label: 'Etiquetas QR', short: 'Etiquetas', icon: QrCode },
            { id: 'users', label: 'Equipe', short: 'Equipe', icon: Users },
            { id: 'config', label: 'Configurações', short: 'Config', icon: Settings },
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              title={tab.label}
              className={`w-full py-2.5 px-2 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 shrink-0 ${activeTab === tab.id ? 'bg-green-500 text-black shadow-glow font-black' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}`}
            >
              <tab.icon size={20} />
              <span className="text-[7.5px] font-black uppercase tracking-tight leading-none truncate max-w-full">{tab.short}</span>
            </button>
          ))}
        </div>
        <button 
          onClick={handleLogout}
          className="p-3 rounded-2xl transition-all text-zinc-500 hover:text-red-500 hover:bg-zinc-900 shrink-0 flex flex-col items-center gap-0.5"
          title="Sair do Sistema"
        >
          <LogOut size={20} />
          <span className="text-[7px] font-black uppercase">Sair</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="print-hidden flex-1 p-3 sm:p-6 lg:p-8 xl:p-10 max-w-7xl mx-auto w-full min-h-screen overflow-x-hidden">
        
        {/* Universal Top Header */}
        <header className="mb-4 sm:mb-6 flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="lg:hidden p-2 sm:p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500 shrink-0">
              <Smartphone size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-green-500 italic">HPS CONTROL</span>
                <span className="text-zinc-600">/</span>
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-200 truncate">
                  {activeTab === 'dashboard' ? 'Gestão de Peças' :
                   activeTab === 'inventory' ? 'Estoque Físico' :
                   activeTab === 'service_orders' ? 'Ordens de Serviço' :
                   activeTab === 'clients' ? 'Clientes & Frotas' :
                   activeTab === 'history' ? 'Movimentações & Auditoria' :
                   activeTab === 'analytics' ? 'Relatórios & Analytics' :
                   activeTab === 'labels' ? 'Etiquetas & QR Code' :
                   activeTab === 'users' ? 'Equipe de Oficina' : 'Configurações'}
                </span>
              </div>
              <p className="text-[8.5px] sm:text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5 truncate">
                Gestão Especializada Can-Am BRP • Oficina, Peças & O.S.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Seletor Multi-Tenant de Oficina */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTenantDropdownOpen(prev => !prev)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-xl flex items-center gap-2 transition-all group"
                title="Alternar oficina ou cadastrar nova filial"
              >
                <Building2 size={15} className="text-blue-400 shrink-0" />
                <div className="text-left max-w-[110px] sm:max-w-[160px]">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black uppercase text-white truncate">
                      {currentTenant.name}
                    </span>
                    <ChevronDown size={11} className={`text-zinc-400 transition-transform ${isTenantDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <span className="text-[8px] font-bold text-zinc-500 uppercase block truncate">
                    {tenants.length > 1 ? `${tenants.length} Oficinas (Multi-Tenant)` : 'Oficina Matriz'}
                  </span>
                </div>
              </button>

              {/* Dropdown Menu de Oficinas */}
              {isTenantDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 z-[600] animate-in fade-in zoom-in-95">
                  <div className="p-2 border-b border-zinc-800 flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      Ambientes / Oficinas (Multi-Tenant)
                    </span>
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[8px] font-bold rounded">
                      SaaS
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto py-1 space-y-1 custom-scrollbar">
                    {tenants.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSwitchTenant(t)}
                        className={`w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-colors ${t.id === currentTenant.id ? 'bg-green-500/20 text-green-400 font-bold' : 'text-zinc-300 hover:bg-zinc-800'}`}
                      >
                        <div className="truncate pr-2">
                          <p className="truncate font-black uppercase text-[11px]">{t.name}</p>
                          <p className="text-[9px] text-zinc-500 truncate">{t.cnpj ? `CNPJ: ${t.cnpj}` : (t.corporateName || 'Oficina Ativa')}</p>
                        </div>
                        {t.id === currentTenant.id && <Check size={14} className="text-green-400 shrink-0" />}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-zinc-800 pt-1 mt-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTenantDropdownOpen(false);
                        setIsAddingTenant(true);
                      }}
                      className="w-full text-left p-2 rounded-xl flex items-center gap-2 text-xs text-green-400 hover:bg-green-500/10 font-black uppercase transition-colors"
                    >
                      <Plus size={14} /> Cadastrar Nova Oficina
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTenantDropdownOpen(false);
                        setActiveTab('config');
                        setConfigSubTab('company');
                      }}
                      className="w-full text-left p-2 rounded-xl flex items-center gap-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                    >
                      <Settings size={14} /> Dados da Oficina Ativa
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-[10px] font-black uppercase text-zinc-200">
                {currentUser?.name || 'Administrador'}
              </span>
              <span className="px-1.5 py-0.5 bg-zinc-800 text-[8px] font-black uppercase text-zinc-400 rounded">
                {currentUser?.role === UserRole.MECHANIC ? 'Mecânico' : 'Estoquista'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setOsFormData({ customerName: '', vehicleModel: '', observations: '', laborTemplateId: '', clientId: '', vehicleId: '', mechanicId: '' });
                setOsLaborList([]);
                setIsAddingCustomLabor(false);
                setIsAddingOS(true);
              }}
              className="px-3.5 py-2 bg-green-500 hover:bg-green-400 text-black rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 shadow-glow transition-all active:scale-95"
            >
              <Plus size={14} /> <span className="hidden sm:inline">Nova</span> O.S.
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="lg:hidden p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-xl transition-colors"
              title="Sair do Sistema"
            >
              <LogOut size={18} />
            </button>
          </div>
          </div>

          {/* Barra Rápida de Navegação Responsiva para Celular e Tablet (acesso direto a todas as 9 abas) */}
          <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-zinc-900">
            {[
              { id: 'dashboard', label: 'Peças', icon: TrendingUp },
              { id: 'inventory', label: 'Estoque', icon: Layers },
              { id: 'service_orders', label: 'Ordens de Serviço', icon: CheckCircle2 },
              { id: 'clients', label: 'Clientes', icon: UserCircle },
              { id: 'history', label: 'Auditoria', icon: FileSpreadsheet },
              { id: 'analytics', label: 'Dashboards', icon: BarChart3 },
              { id: 'labels', label: 'Etiquetas QR', icon: QrCode },
              { id: 'users', label: 'Equipe', icon: Users },
              { id: 'config', label: 'Config', icon: Settings },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                  activeTab === tab.id
                    ? 'bg-green-500 text-black shadow-glow'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                }`}
              >
                <tab.icon size={13} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* Supabase Sync Status Bar */}
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-zinc-900/30 border border-zinc-800/50 p-3.5 sm:p-4 rounded-2xl sm:rounded-[2rem] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              !supabaseService.isAvailable() 
                ? 'bg-zinc-800 text-zinc-500' 
                : supabaseService.isTableMissing('tenants')
                  ? 'bg-amber-500/10 text-amber-500'
                  : syncError 
                    ? 'bg-red-500/10 text-red-500' 
                    : 'bg-green-500/10 text-green-500'
            }`}>
              {supabaseService.isAvailable() ? <Cloud size={18} /> : <CloudOff size={18} />}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest italic text-zinc-500">Status do Banco de Dados</p>
              <p className={`text-[10px] font-black uppercase italic ${
                !supabaseService.isAvailable() 
                  ? 'text-zinc-500' 
                  : supabaseService.isTableMissing('tenants')
                    ? 'text-amber-400'
                    : syncError 
                      ? 'text-red-500' 
                      : 'text-green-500'
              }`}>
                {!supabaseService.isAvailable()
                  ? 'Modo Local (Supabase não configurado)'
                  : supabaseService.isTableMissing('tenants')
                    ? 'Supabase Conectado • Tabela tenants pendente'
                    : syncError 
                      ? syncError 
                      : 'Supabase Conectado & Sincronizado'}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {supabaseService.isAvailable() && (
              <button 
                type="button"
                onClick={() => setShowSqlModal(true)}
                className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-[9px] font-black uppercase transition-all active:scale-95 border ${
                  supabaseService.isTableMissing('tenants')
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                    : 'bg-zinc-800 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700'
                }`}
                title="Ver e copiar código SQL para criação das tabelas no Supabase"
              >
                <FileText size={13} className={supabaseService.isTableMissing('tenants') ? 'text-amber-400' : 'text-green-400'} />
                <span>Script SQL Supabase</span>
              </button>
            )}

            <button 
              onClick={syncToSupabase}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[9px] font-black uppercase transition-all active:scale-95 ${isSyncing ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-zinc-800 text-white hover:bg-zinc-700 shadow-lg'}`}
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
          </div>
        </div>

        {/* ALERTA GLOBAL PARA ADMIN / CHEFE DE OFICINA: TRIAGENS DE PASSAPORTE UTV AGUARDANDO LIBERAÇÃO */}
        {(() => {
          const pendingPassports = utvPassports.filter(p => p.activeTriage?.status === 'PENDING_APPROVAL');
          if (pendingPassports.length === 0) return null;
          return (
            <div className="mb-8 bg-amber-500/10 border-2 border-amber-500 rounded-3xl p-5 shadow-[0_0_40px_rgba(245,158,11,0.18)] space-y-3 animate-in slide-in-from-top-3 duration-300">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                  <h4 className="text-xs sm:text-sm font-black uppercase italic text-amber-400 tracking-wider">
                    🔔 Aviso ao Chefe de Oficina / Administrador: {pendingPassports.length} UTV(s) em Triagem Aguardando Aprovação de Manutenção!
                  </h4>
                </div>
                <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-500 text-black">
                  Leitura de QR Code Realizada pelo Mecânico
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingPassports.map(p => {
                  const tr = p.activeTriage!;
                  return (
                    <div key={p.id} className="bg-zinc-950/90 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-green-500 text-black font-black text-[9px] rounded uppercase">
                            {p.vehicleNumber || 'UTV'}
                          </span>
                          <span className="text-xs font-black uppercase italic text-white">{p.vehicleModel}</span>
                        </div>
                        <p className="text-[10px] text-zinc-300 font-bold uppercase mt-1">
                          👷 Mecânico <span className="text-amber-400 font-black">{tr.mechanicName}</span> iniciou triagem • KM Atual: <span className="text-green-400 font-mono font-black">{tr.reportedKm} km</span> • Data: {(tr.maintenanceDate.includes('T') ? new Date(tr.maintenanceDate) : new Date(tr.maintenanceDate + 'T12:00:00')).toLocaleDateString('pt-BR')}
                        </p>
                        {tr.notes && <p className="text-[9px] text-zinc-400 italic mt-0.5">"{tr.notes}"</p>}
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('service_orders');
                            setOsSubTab('passports');
                            setSelectedPassport(p);
                          }}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-[9px] font-black uppercase transition-all"
                        >
                          Ver Passaporte
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleApproveTriageAndCreateOS(p, tr)}
                            className="px-3.5 py-2 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[9px] font-black uppercase shadow-glow transition-all flex items-center gap-1"
                          >
                            <Check size={13} /> Aprovar & Abrir O.S.
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-4xl font-black uppercase italic tracking-tighter">Gestão de Peças</h1>
                <p className="text-[10px] text-green-500 font-black uppercase tracking-[0.2em] mt-1 italic">{isAdmin ? 'Acesso Administrativo HPS' : 'Acesso Técnico Campo'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {isAdmin && (
                  <button 
                    onClick={() => setActiveTab('history')}
                    className="flex items-center gap-2.5 bg-zinc-900 border border-zinc-800 hover:border-green-500/40 px-5 py-4 rounded-2xl text-[10px] font-black uppercase text-white hover:text-green-400 transition-all shadow-xl active:scale-95"
                    title="Acessar painel de auditoria e planilha de movimentações"
                  >
                    <FileSpreadsheet size={16} className="text-green-500" />
                    <span>Movimentações & Auditoria</span>
                  </button>
                )}
                <a href="https://epc.brp.com/#" target="_blank" className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-6 py-4 rounded-2xl text-[10px] font-black uppercase text-green-500 hover:bg-green-500 hover:text-black transition-all shadow-xl">
                  <ExternalLink size={16} /> EPC BRP OFICIAL
                </a>
              </div>
            </div>

            {/* Sistema de Alertas Inteligentes de Chegada de Peças */}
            {(() => {
              const alerts: Array<{ os: ServiceOrder, part: OSPart, item: InventoryItem }> = [];
              for (const os of serviceOrders) {
                if (os.stockDeducted) continue;
                for (const p of os.parts) {
                  const matchedItem = items.find(i => i.id === p.itemId);
                  if (matchedItem && matchedItem.quantity >= p.quantity) {
                    // The item has arrived/has sufficient physical balance now, but OS stock remains undeducted!
                    alerts.push({ os, part: p, item: matchedItem });
                  }
                }
              }

              if (alerts.length === 0) return null;

              return (
                <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                   <div className="flex items-center gap-2 px-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-green-500 italic">Alertas de Reposição / Chegada de Peças</h3>
                   </div>
                   <div className="grid grid-cols-1 gap-4">
                      {alerts.map(({ os, part, item }, idx) => (
                        <div key={idx} className="bg-zinc-950 border-2 border-green-500/30 p-6 rounded-[2.5rem] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-green-500/50 transition-all shadow-glow text-left">
                           <div className="flex gap-4 items-center">
                              <div className="p-4 bg-green-500/10 text-green-500 rounded-2xl">
                                 <Package size={22} className="animate-bounce" />
                              </div>
                              <div>
                                 <p className="text-[9px] font-black uppercase text-green-500 tracking-widest italic font-sans">Reposição de Item Identificada!</p>
                                 <h4 className="text-sm font-black text-white uppercase italic mt-1 leading-none font-sans">A peça "{item.name.toUpperCase()}" (PN: {item.partNumber}) agora possui saldo suficiente ({item.quantity} UN)!</h4>
                                 <p className="text-[8px] text-zinc-500 uppercase font-black mt-2 font-mono">Peça solicitada na O.S. #{os.osNumber} (Cliente: {os.customerName}) que estava aguardando chegada.</p>
                              </div>
                           </div>
                           <button 
                             onClick={() => {
                               setSelectedOS(os);
                             }} 
                             className="w-full sm:w-auto px-6 py-4 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[9px] rounded-xl tracking-wider shadow-glow active:scale-95 transition-all font-sans"
                           >
                             Visualizar O.S. & Confirmar Baixa ↗
                           </button>
                        </div>
                      ))}
                   </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                <p className="text-[9px] text-zinc-500 font-black uppercase mb-1">SKUs Cadastrados</p>
                <p className="text-4xl font-black">{items.length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                <p className="text-[9px] text-zinc-500 font-black uppercase mb-1">Saídas Mês</p>
                <p className="text-4xl font-black text-white">{history.filter(h => h.type === TransactionType.OUT).length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                <p className="text-[9px] text-zinc-500 font-black uppercase mb-1">Stock Alertas</p>
                <p className="text-4xl font-black text-amber-500">{items.filter(i => i.quantity <= i.minQuantity).length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                <p className="text-[9px] text-zinc-500 font-black uppercase mb-1">Valor Inventário</p>
                <p className="text-xl font-black text-green-500">R$ {items.reduce((acc, i) => acc + (i.value * i.quantity), 0).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            <div className="space-y-6">
               <PartsSearchFilter
                 searchTerm={searchTerm}
                 onSearchTermChange={setSearchTerm}
                 searchField={searchField}
                 onSearchFieldChange={setSearchField}
                 selectedCategory={selectedCategoryFilter}
                 onSelectedCategoryChange={setSelectedCategoryFilter}
                 categories={categories}
                 totalItemsCount={items.length}
                 filteredItemsCount={filteredItems.length}
               />

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {filteredItems.slice(0, 12).map(item => (
                   <div key={item.id} onClick={() => setSelectedItem(item)} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[2.5rem] flex items-center gap-5 cursor-pointer hover:bg-zinc-900 transition-all group overflow-hidden">
                     <div className="w-16 h-16 bg-black rounded-3xl flex items-center justify-center shrink-0 border border-zinc-800 group-hover:border-green-500/30">
                       {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <Package size={28} className="text-zinc-800 group-hover:text-green-500/50" />}
                     </div>
                     <div className="flex-1 min-w-0">
                       <h4 className="font-black text-xs uppercase truncate text-zinc-100 italic">{item.name}</h4>
                       <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mt-1">PN: {item.partNumber}</p>
                       <div className="flex items-center gap-2 mt-3">
                         <span className={`px-2 py-0.5 rounded text-[8px] font-black ${item.quantity <= item.minQuantity ? 'bg-amber-500 text-black' : 'bg-green-500/10 text-green-500'}`}>{item.quantity} UN DISPONÍVEL</span>
                       </div>
                     </div>
                     <ChevronRight size={18} className="text-zinc-800 group-hover:text-green-500 transition-all" />
                   </div>
                 ))}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'service_orders' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-6">
              <div>
                <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                  {osSubTab === 'passports' ? 'Passaporte UTV • Competição & Triagem QR' : 'Ordens de Serviço'}
                </h2>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">
                  {osSubTab === 'passports'
                    ? 'Controle preventivo por KM (Última Troca + Intervalo = Próxima Troca), Estoque em Tempo Real e Espelho do Cliente'
                    : 'Gerenciamento completo de Ordens de Serviço, Mão de Obra Compartilhada e Passaporte UTV'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Alternador O.S. vs Passaporte UTV */}
                <div className="flex bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setOsSubTab('orders')}
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${
                      osSubTab === 'orders' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 size={14} /> Ordens de Serviço ({serviceOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOsSubTab('passports')}
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${
                      osSubTab === 'passports' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Flag size={14} /> Passaporte UTV ({utvPassports.length})
                    {utvPassports.some(p => p.activeTriage?.status === 'PENDING_APPROVAL') && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setScanMode('passport');
                    setIsScanning(true);
                  }}
                  className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-green-400 border border-green-500/30 px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase transition-all active:scale-95"
                  title="Ler QR Code do Passaporte UTV"
                >
                  <QrCode size={16} /> Ler QR UTV
                </button>

                <button
                  onClick={() => {
                    setOsFormData({ customerName: '', vehicleModel: '', observations: '', laborTemplateId: '', clientId: '', vehicleId: '', mechanicId: '', passportId: '' });
                    setOsLaborList([]);
                    setOsInitialPartsList([]);
                    setIsAddingOS(true);
                  }}
                  className="flex items-center gap-2.5 bg-green-500 text-black px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase shadow-glow active:scale-95 transition-transform"
                >
                  <Plus size={16} /> Nova O.S.
                </button>
              </div>
            </div>

            {osSubTab === 'passports' ? (
              <UTVPassportModule
                passports={utvPassports}
                items={items}
                clients={clients}
                currentUser={currentUser}
                currentTenant={currentTenant}
                selectedPassport={selectedPassport}
                setSelectedPassport={setSelectedPassport}
                onSavePassport={handleSaveUTVPassport}
                onDeletePassport={handleDeleteUTVPassport}
                onOpenScannerForPassport={() => {
                  setScanMode('passport');
                  setIsScanning(true);
                }}
                onApproveTriageAndCreateOS={handleApproveTriageAndCreateOS}
                showAlert={showAlert}
              />
            ) : (
              (() => {
                const cleanQuery = osSearchQuery.trim().toLowerCase().replace(/^#/, '');
                const matchesSearch = (os: ServiceOrder) => {
                  if (!cleanQuery) return true;
                  const cName = (os.customerName || '').toLowerCase();
                  const osNum = (os.osNumber || '').toLowerCase();
                  const vModel = (os.vehicleModel || '').toLowerCase();
                  const mName = (os.mechanicName || '').toLowerCase();

                  if (osSearchField === 'customer') return cName.includes(cleanQuery);
                  if (osSearchField === 'osNumber') return osNum.includes(cleanQuery);
                  return (
                    cName.includes(cleanQuery) ||
                    osNum.includes(cleanQuery) ||
                    vModel.includes(cleanQuery) ||
                    mName.includes(cleanQuery)
                  );
                };

                const openOrders = serviceOrders.filter(
                  os => os.status === OSStatus.OPEN || os.status === OSStatus.IN_PROGRESS
                );
                const archivedOrders = serviceOrders.filter(
                  os => os.status === OSStatus.COMPLETED || os.status === OSStatus.CANCELLED
                );

                const basePartitionList =
                  osPartition === 'open'
                    ? openOrders
                    : osPartition === 'archived'
                    ? archivedOrders
                    : serviceOrders;

                const displayedOrders = basePartitionList.filter(matchesSearch);

                const matchesInArchivedWhenOnOpen =
                  osPartition === 'open' && cleanQuery
                    ? archivedOrders.filter(matchesSearch).length
                    : 0;
                const matchesInOpenWhenOnArchived =
                  osPartition === 'archived' && cleanQuery
                    ? openOrders.filter(matchesSearch).length
                    : 0;

                return (
                  <div className="space-y-6">
                    {/* PAINEL DE REPARTIÇÕES E PESQUISA DE O.S. (CLIENTE / Nº O.S.) */}
                    <div className="bg-zinc-900/90 border border-zinc-800 p-5 sm:p-6 rounded-[2.5rem] space-y-5 shadow-2xl">
                      {/* Abas de Repartição: Tela Principal (OPEN) vs Repartição Arquivadas/Finalizadas */}
                      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setOsPartition('open')}
                            className={`px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                              osPartition === 'open'
                                ? 'bg-green-500 text-black shadow-glow'
                                : 'bg-black border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${osPartition === 'open' ? 'bg-black animate-pulse' : 'bg-green-500'}`} />
                            <span>Tela Principal • O.S. Abertas (OPEN)</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                              osPartition === 'open' ? 'bg-black/20 text-black' : 'bg-zinc-800 text-green-400'
                            }`}>
                              {openOrders.length}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setOsPartition('archived')}
                            className={`px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                              osPartition === 'archived'
                                ? 'bg-emerald-500 text-black shadow-glow'
                                : 'bg-black border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                            }`}
                          >
                            <CheckCircle2 size={14} className={osPartition === 'archived' ? 'text-black' : 'text-emerald-400'} />
                            <span>Repartição • O.S. Finalizadas / Arquivadas</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                              osPartition === 'archived' ? 'bg-black/20 text-black' : 'bg-zinc-800 text-emerald-400'
                            }`}>
                              {archivedOrders.length}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setOsPartition('all')}
                            className={`px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                              osPartition === 'all'
                                ? 'bg-white text-black shadow-lg'
                                : 'bg-black border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                            }`}
                          >
                            <Layers size={14} />
                            <span>Todas as O.S. ({serviceOrders.length})</span>
                          </button>
                        </div>

                        <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400 bg-black/60 border border-zinc-800 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                          <Shield size={13} className="text-green-500 shrink-0" />
                          <span>
                            {osPartition === 'open'
                              ? 'Exibindo apenas O.S. em aberto (OPEN). Ao finalizar, a O.S. é arquivada automaticamente.'
                              : osPartition === 'archived'
                              ? 'Arquivo de Auditoria: O.S. finalizadas com data/hora registrada e edição pós-fechamento liberada.'
                              : 'Consulta global de todas as Ordens de Serviço (Abertas e Arquivadas).'}
                          </span>
                        </div>
                      </div>

                      {/* Barra de Pesquisa por Nome de Cliente ou Número da O.S. */}
                      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                        <div className="relative flex-1">
                          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <input
                            type="text"
                            value={osSearchQuery}
                            onChange={e => setOsSearchQuery(e.target.value)}
                            placeholder={
                              osSearchField === 'customer'
                                ? 'Digite o Nome do Cliente para filtrar as Ordens de Serviço...'
                                : osSearchField === 'osNumber'
                                ? 'Digite o Número da O.S. (ex: 0001)...'
                                : 'Pesquisar Ordem de Serviço por Nome do Cliente, Número da O.S. (#0001) ou Veículo...'
                            }
                            className="w-full bg-black border border-zinc-800 focus:border-green-500 pl-13 pr-11 py-4 rounded-2xl text-xs font-bold text-white outline-none transition-all placeholder:text-zinc-600"
                          />
                          {osSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setOsSearchQuery('')}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1"
                              title="Limpar pesquisa"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>

                        {/* Seletores de Filtro por Campo */}
                        <div className="flex items-center gap-1.5 bg-black border border-zinc-800 p-1.5 rounded-2xl overflow-x-auto">
                          <span className="text-[8.5px] font-black uppercase text-zinc-500 px-2.5 italic whitespace-nowrap">
                            Filtrar por:
                          </span>
                          <button
                            type="button"
                            onClick={() => setOsSearchField('all')}
                            className={`px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                              osSearchField === 'all'
                                ? 'bg-green-500 text-black shadow-glow'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            Cliente + Nº O.S.
                          </button>
                          <button
                            type="button"
                            onClick={() => setOsSearchField('customer')}
                            className={`px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                              osSearchField === 'customer'
                                ? 'bg-green-500 text-black shadow-glow'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            Nome do Cliente
                          </button>
                          <button
                            type="button"
                            onClick={() => setOsSearchField('osNumber')}
                            className={`px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                              osSearchField === 'osNumber'
                                ? 'bg-green-500 text-black shadow-glow'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            Número da O.S.
                          </button>
                        </div>
                      </div>

                      {/* Aviso inteligente se a busca encontrou resultados na outra repartição */}
                      {matchesInArchivedWhenOnOpen > 0 && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                          <div className="flex items-center gap-2.5 text-xs font-black uppercase text-emerald-400">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>
                              Localizada(s) {matchesInArchivedWhenOnOpen} O.S. FINALIZADA(S) / ARQUIVADA(S) para a pesquisa "{osSearchQuery}".
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOsPartition('archived')}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
                          >
                            Abrir Repartição de Finalizadas ({matchesInArchivedWhenOnOpen})
                          </button>
                        </div>
                      )}

                      {matchesInOpenWhenOnArchived > 0 && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
                          <div className="flex items-center gap-2.5 text-xs font-black uppercase text-green-400">
                            <Info size={16} className="shrink-0" />
                            <span>
                              Localizada(s) {matchesInOpenWhenOnArchived} O.S. ABERTA(S) (OPEN) para a pesquisa "{osSearchQuery}".
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOsPartition('open')}
                            className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
                          >
                            Ver na Tela Principal ({matchesInOpenWhenOnArchived})
                          </button>
                        </div>
                      )}
                    </div>

                    {/* GRID DE ORDENS DE SERVIÇO DA REPARTIÇÃO SELECIONADA */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayedOrders.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-zinc-500 font-black uppercase italic border-2 border-dashed border-zinc-800 rounded-[3rem] space-y-3">
                          <p className="text-sm text-zinc-400">
                            {cleanQuery
                              ? `Nenhuma Ordem de Serviço encontrada para "${osSearchQuery}" nesta repartição.`
                              : osPartition === 'open'
                              ? 'Nenhuma Ordem de Serviço com status OPEN na tela principal no momento.'
                              : 'Nenhuma Ordem de Serviço finalizada/arquivada até o momento.'}
                          </p>
                          {osPartition === 'open' && archivedOrders.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setOsPartition('archived')}
                              className="px-6 py-3 bg-zinc-800 hover:bg-emerald-500 hover:text-black text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-2"
                            >
                              <CheckCircle2 size={14} /> Consultar Repartição de O.S. Finalizadas ({archivedOrders.length})
                            </button>
                          )}
                        </div>
                      ) : (
                        displayedOrders.map(os => {
                          const linkedPassport = os.passportId ? utvPassports.find(p => p.id === os.passportId) : undefined;
                          const isCompleted = os.status === OSStatus.COMPLETED;
                          const completionTimestamp = os.completedAt || (isCompleted ? os.updatedAt : undefined);

                          return (
                            <div
                              key={os.id}
                              onClick={() => {
                                setSelectedOS(os);
                                setIsEditingOSHeader(false);
                              }}
                              className={`bg-zinc-900 border p-8 rounded-[3rem] space-y-5 shadow-xl transition-all group cursor-pointer ${
                                isCompleted
                                  ? 'border-emerald-500/30 hover:border-emerald-400/60 bg-gradient-to-b from-zinc-900 to-emerald-950/10'
                                  : 'border-zinc-800 hover:border-green-500/40'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <div
                                    className={`px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                      isCompleted
                                        ? 'bg-emerald-500 text-black'
                                        : os.status === OSStatus.IN_PROGRESS
                                        ? 'bg-amber-500 text-black'
                                        : 'bg-green-500/20 text-green-400 border border-green-500/40'
                                    }`}
                                  >
                                    {isCompleted
                                      ? 'FINALIZADA / ARQUIVADA'
                                      : os.status === OSStatus.OPEN
                                      ? 'OPEN (ABERTA)'
                                      : 'OPEN • EM EXECUÇÃO'}
                                  </div>
                                  {linkedPassport && (
                                    <span className="px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-[8px] font-black uppercase flex items-center gap-1">
                                      <Flag size={10} /> Passaporte {linkedPassport.vehicleNumber || 'UTV'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-xs font-black text-white bg-black border border-zinc-800 px-3 py-1 rounded-xl font-mono">
                                    O.S. #{os.osNumber}
                                  </span>
                                  <span className="text-[8px] font-bold text-zinc-500 mt-1">
                                    Aberta: {new Date(os.createdAt).toLocaleDateString('pt-BR')} {new Date(os.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-2xl font-black uppercase italic text-white leading-tight tracking-tighter group-hover:text-green-400 transition-colors">
                                  {os.customerName}
                                </h4>
                                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mt-1">
                                  {os.vehicleModel}
                                </p>
                                {os.mechanicName && (
                                  <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-[8px] font-black uppercase tracking-wider">
                                    <span>👷 MECÂNICO:</span>
                                    <span className="text-white">{os.mechanicName.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>

                              {/* SELO DE AUDITORIA DE FINALIZAÇÃO (QUANDO A O.S. FOI FINALIZADA) */}
                              {isCompleted && completionTimestamp && (
                                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase text-emerald-400">
                                    <span className="flex items-center gap-1.5">
                                      <Clock size={12} className="shrink-0" />
                                      <span>Finalizada em (Auditoria):</span>
                                    </span>
                                    <span className="font-mono text-white bg-black/60 px-2 py-0.5 rounded border border-emerald-500/30">
                                      {new Date(completionTimestamp).toLocaleDateString('pt-BR')} às{' '}
                                      {new Date(completionTimestamp).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[8px] font-bold uppercase text-zinc-400">
                                    <span>Responsável: {os.completedBy || 'Administrador HPS'}</span>
                                    <span className="text-amber-400 font-black flex items-center gap-1">
                                      <Pencil size={10} /> Edição Liberada
                                    </span>
                                  </div>
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                                <div className="flex flex-col">
                                  <span className="text-[8px] font-black uppercase text-zinc-600 italic">Itens / Mão de Obra</span>
                                  <span className="text-sm font-black text-zinc-300 tracking-widest">
                                    {os.parts.length} Peças / {os.laborItems.length} Serviços
                                  </span>
                                  {(() => {
                                    const grossLabor = os.laborItems.reduce((acc, l) => acc + getLaborOriginalValue(l), 0);
                                    const netLabor = os.laborItems.reduce((acc, l) => acc + getLaborFinalValue(l), 0);
                                    const laborDiscount = grossLabor - netLabor;
                                    if (laborDiscount > 0) {
                                      return (
                                        <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-black text-amber-400 uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                          🔗 M.O. Compartilhada (-R$ {laborDiscount.toLocaleString('pt-BR')})
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                                <div className="text-right">
                                  {(() => {
                                    const partsTotal = os.parts.reduce((acc, p) => acc + getPartFinalValue(p), 0);
                                    const netLabor = os.laborItems.reduce((acc, l) => acc + getLaborFinalValue(l), 0);
                                    const total = partsTotal + netLabor;
                                    return (
                                      <span className="text-xl font-black text-green-500 font-mono tabular-nums">
                                        R$ {total.toLocaleString('pt-BR')}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-zinc-800">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setSelectedOS(os);
                                      setShowOSDocumentPreview(true);
                                    }}
                                    className="px-3 py-2 bg-green-500/20 hover:bg-green-500 hover:text-black text-green-400 rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1.5 shadow-sm"
                                    title="Visualizar e Salvar Relatório Técnico em PDF A4"
                                  >
                                    <FileText size={12} /> Relatório PDF
                                  </button>

                                  {!isCompleted ? (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        updateOSStatus(os.id, OSStatus.COMPLETED);
                                      }}
                                      className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500 hover:text-black text-emerald-400 border border-emerald-500/30 rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1"
                                      title="Finalizar esta O.S., gravar data/hora de auditoria e arquivar"
                                    >
                                      <CheckCircle2 size={12} /> Finalizar e Arquivar
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        updateOSStatus(os.id, OSStatus.OPEN);
                                      }}
                                      className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500 hover:text-black text-amber-400 border border-amber-500/30 rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1"
                                      title="Reabrir esta O.S. e devolvê-la para a tela principal (OPEN)"
                                    >
                                      <RotateCcw size={12} /> Reabrir (OPEN)
                                    </button>
                                  )}

                                  {linkedPassport && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setSelectedPassport(linkedPassport);
                                          setOsSubTab('passports');
                                        }}
                                        className="px-3 py-2 bg-zinc-800 hover:bg-green-500 hover:text-black text-green-400 rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1"
                                        title="Abrir Passaporte UTV vinculado"
                                      >
                                        <Flag size={11} /> Passaporte UTV
                                      </button>
                                      <button
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setClientMirrorPassport(linkedPassport);
                                        }}
                                        className="px-3 py-2 bg-blue-500/15 hover:bg-blue-500 hover:text-black text-blue-400 rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1"
                                        title="Abrir Espelho do Cliente (Somente Visualização)"
                                      >
                                        <Eye size={11} /> Espelho Cliente
                                      </button>
                                    </>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    deleteOS(os.id);
                                  }}
                                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1.5 text-red-400 ml-auto"
                                >
                                  <Trash2 size={12} /> Excluir
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6 sm:space-y-8 animate-in slide-in-from-bottom-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-6 sm:pb-8">
              <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter">Estoque Físico</h2>
              {isAdmin && <button onClick={() => setIsAddingItem(true)} className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-500 text-black px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl text-[10px] font-black uppercase shadow-glow active:scale-95 transition-transform"><Plus size={16} /> Cadastrar Componente</button>}
            </div>

            <PartsSearchFilter
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              searchField={searchField}
              onSearchFieldChange={setSearchField}
              selectedCategory={selectedCategoryFilter}
              onSelectedCategoryChange={setSelectedCategoryFilter}
              categories={categories}
              totalItemsCount={items.length}
              filteredItemsCount={filteredItems.length}
            />

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[3rem] overflow-hidden shadow-2xl">
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-[11px] min-w-[640px]">
                   <thead className="bg-black text-zinc-500 font-black uppercase">
                     <tr>
                       <th className="p-4 sm:p-6 lg:p-8">Descrição Técnica</th>
                       <th className="p-4 sm:p-6 lg:p-8">Endereçamento</th>
                       <th className="p-4 sm:p-6 lg:p-8 text-center">Quantidade</th>
                       <th className="p-4 sm:p-6 lg:p-8 text-right">Unitário</th>
                       <th className="p-4 sm:p-6 lg:p-8 text-right">Patrimonial</th>
                       <th className="p-4 sm:p-6 lg:p-8 text-center">Ações</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-800">
                     {filteredItems.map(item => (
                       <tr key={item.id} className="hover:bg-white/5 cursor-pointer transition-colors" onClick={() => setSelectedItem(item)}>
                         <td className="p-4 sm:p-6 lg:p-8">
                           <div className="flex items-center gap-3">
                             {item.imageUrl ? (
                               <img src={item.imageUrl} className="w-10 h-10 rounded-xl object-cover border border-zinc-800 shrink-0" />
                             ) : (
                               <div className="w-10 h-10 rounded-xl bg-black border border-zinc-800 flex items-center justify-center shrink-0">
                                 <Package size={18} className="text-zinc-700" />
                               </div>
                             )}
                             <div>
                               <p className="font-black text-white uppercase italic">{item.name}</p>
                               <p className="text-[9px] text-zinc-600 font-bold mt-0.5">REF: {item.partNumber}</p>
                             </div>
                           </div>
                         </td>
                         <td className="p-4 sm:p-6 lg:p-8 text-green-500 font-black uppercase italic tracking-widest">{item.boxNumber}</td>
                         <td className="p-4 sm:p-6 lg:p-8 text-center whitespace-nowrap"><span className={`text-lg sm:text-xl font-black ${item.quantity <= item.minQuantity ? 'text-amber-500 shadow-glow' : 'text-zinc-300'}`}>{item.quantity}</span> <span className="text-[10px] text-zinc-500 font-bold ml-1 uppercase font-mono">{item.unit || 'un'}</span></td>
                         <td className="p-4 sm:p-6 lg:p-8 text-right font-mono text-zinc-300 whitespace-nowrap">R$ {item.value.toFixed(2)}</td>
                         <td className="p-4 sm:p-6 lg:p-8 text-right font-black text-zinc-400 whitespace-nowrap">R$ {(item.value * item.quantity).toLocaleString('pt-BR')}</td>
                         <td className="p-4 sm:p-6 lg:p-8 text-center" onClick={e => e.stopPropagation()}>
                           <div className="flex items-center justify-center gap-2">
                             <button 
                               type="button" 
                               onClick={() => handleStartEditItem(item)} 
                               className="px-3 py-1.5 bg-zinc-800 hover:bg-green-500 hover:text-black rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1.5 text-zinc-300 shadow-md active:scale-95"
                               title="Editar Cadastro da Peça"
                             >
                               <Pencil size={12} /> Editar
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <StockMovementsAudit
            transactions={history}
            items={items}
            isAdmin={isAdmin}
            serviceOrders={serviceOrders}
            onSelectOS={os => {
              setSelectedOS(os);
              setActiveTab('service_orders');
            }}
            onRefresh={syncToSupabase}
            isSyncing={isSyncing}
          />
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 sm:space-y-10 animate-in fade-in">
             <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter">Dashboards de Desempenho</h2>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                <div className="bg-zinc-900 border border-zinc-800 p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[3rem] space-y-6 sm:space-y-10 shadow-2xl">
                   <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-green-500 italic">Volume por Técnico</h4>
                      <BarChart3 size={18} className="text-zinc-700" />
                   </div>
                   <div className="space-y-6 sm:space-y-8">
                      {technicianStats.length === 0 ? <p className="text-center text-zinc-700 font-black uppercase text-[10px] italic py-10 opacity-30">Sem dados para processar</p> : technicianStats.map(([name, qty]) => {
                         const max = technicianStats[0][1] || 1;
                         return (
                           <div key={name} className="space-y-2 sm:space-y-3">
                              <div className="flex justify-between text-[10px] font-black uppercase italic"><span>{name}</span><span className="text-green-500">{qty} Unidades</span></div>
                              <div className="h-3 bg-black rounded-full overflow-hidden border border-zinc-800"><div className="h-full bg-green-500 shadow-glow transition-all duration-1000" style={{ width: `${(qty / max) * 100}%` }}></div></div>
                           </div>
                         );
                      })}
                   </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[3rem] space-y-6 sm:space-y-8 shadow-2xl">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-green-500 italic">Curva de Consumo Categorias</h4>
                   <div className="space-y-3 sm:space-y-4">
                      {categories.map(cat => {
                        const rawQty = history.filter(h => h.type === TransactionType.OUT && items.find(i => i.id === h.itemId)?.category === cat).reduce((acc, h) => acc + (Number(h.quantity) || 0), 0);
                        const qty = Math.round(rawQty * 10000) / 10000;
                        if (qty === 0) return null;
                        return (
                          <div key={cat} className="flex justify-between items-center p-4 sm:p-6 bg-black rounded-2xl sm:rounded-[2rem] border border-zinc-800 hover:border-green-500/30 transition-all group">
                             <span className="text-[10px] font-black uppercase italic group-hover:text-green-500">{cat}</span>
                             <div className="flex flex-col text-right">
                                <span className="text-2xl sm:text-3xl font-black text-white">{qty.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</span>
                                <span className="text-[8px] text-zinc-600 font-black uppercase tracking-tighter">Uso Total Acumulado</span>
                             </div>
                          </div>
                        );
                      })}
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-8">
                <div>
                  <h1 className="text-3xl font-black uppercase italic tracking-tighter">Gestão de Clientes & Acesso ao Espelho</h1>
                  <p className="text-[10px] text-green-500 font-black uppercase tracking-[0.2em] mt-1 italic">
                    Cadastro de Clientes, Frota UTV e Credenciais Exclusivas (Login/Senha Travados no Espelho)
                  </p>
                </div>
                <button 
                  onClick={() => setIsAddingClient(true)} 
                  className="flex items-center gap-3 bg-green-500 text-black px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-glow active:scale-95 transition-transform"
                >
                  <Plus size={16} /> Cadastrar Cliente
                </button>
             </div>

             {/* Modal de Adição de Cliente */}
             {isAddingClient && (
               <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-[3rem] space-y-8 shadow-2xl animate-in slide-in-from-top-6 duration-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-black uppercase italic tracking-widest text-green-500">Novo Cadastro de Cliente</h3>
                      <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                        Configure os dados do cliente e o Login/Senha exclusivos para ele visualizar o Espelho do UTV
                      </p>
                    </div>
                    <button onClick={() => { setIsAddingClient(false); setTempVehicles([]); }} className="p-3 bg-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-colors"><X size={16} /></button>
                  </div>
                  <form onSubmit={handleAddClient} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                       <div className="space-y-1 sm:col-span-2">
                          <p className="text-[9px] font-black uppercase text-zinc-500 ml-3 tracking-widest italic font-sans">Nome Completo *</p>
                          <input required type="text" placeholder="EX: CARLOS ALBERTO COSTA" className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500 transition-colors" value={clientFormData.name} onChange={e => setClientFormData({...clientFormData, name: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase text-zinc-500 ml-3 tracking-widest italic font-sans">CPF / CNPJ</p>
                          <input type="text" placeholder="EX: 123.456.789-00" className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500 transition-colors" value={clientFormData.cpf} onChange={e => setClientFormData({...clientFormData, cpf: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase text-zinc-500 ml-3 tracking-widest italic font-sans">Telefone / WhatsApp</p>
                          <input type="text" placeholder="EX: (11) 99876-5432" className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white font-black text-xs outline-none focus:border-green-500 transition-colors" value={clientFormData.phone} onChange={e => setClientFormData({...clientFormData, phone: e.target.value})} />
                       </div>
                    </div>

                    {/* CREDENCIAIS DE ACESSO EXCLUSIVO AO ESPELHO DO CLIENTE */}
                    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-[2rem] p-5 sm:p-7 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400">
                            <ShieldCheck size={20} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 italic">
                              Credenciais de Acesso ao Espelho do Cliente (Login Travado)
                            </h4>
                            <p className="text-[10px] text-zinc-400 font-medium">
                              Ao acessar com este Login e Senha, o cliente fica restrito apenas à visualização do link do Espelho UTV (sem editar nada ou navegar pelo sistema).
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const creds = generateSlugCredentials(clientFormData.name || 'cliente');
                            setClientFormData(prev => ({ ...prev, username: creds.username, password: creds.password, isAccessActive: true }));
                          }}
                          className="px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500 hover:text-black text-emerald-400 border border-emerald-500/40 rounded-xl text-[9px] font-black uppercase transition-all shrink-0 self-start sm:self-center"
                        >
                          ⚡ Gerar Login/Senha Automático
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase text-zinc-400 ml-2 tracking-wider">Login do Cliente (Espelho)</p>
                          <input
                            type="text"
                            placeholder="Ex: guilherme"
                            value={clientFormData.username}
                            onChange={e => setClientFormData({ ...clientFormData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                            className="w-full bg-black border border-zinc-800 focus:border-emerald-500 p-3.5 rounded-xl text-white font-mono font-bold text-xs outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase text-zinc-400 ml-2 tracking-wider">Senha do Cliente</p>
                          <input
                            type="text"
                            placeholder="Ex: 1234"
                            value={clientFormData.password}
                            onChange={e => setClientFormData({ ...clientFormData, password: e.target.value })}
                            className="w-full bg-black border border-zinc-800 focus:border-emerald-500 p-3.5 rounded-xl text-white font-mono font-bold text-xs outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase text-zinc-400 ml-2 tracking-wider">Status do Acesso</p>
                          <select
                            value={clientFormData.isAccessActive ? 'active' : 'blocked'}
                            onChange={e => setClientFormData({ ...clientFormData, isAccessActive: e.target.value === 'active' })}
                            className="w-full bg-black border border-zinc-800 focus:border-emerald-500 p-3.5 rounded-xl text-white font-black uppercase text-xs outline-none"
                          >
                            <option value="active">✅ Acesso Liberado (Somente Leitura)</option>
                            <option value="blocked">🚫 Acesso Bloqueado</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* VINCULAR VEÍCULOS NO CADASTRO */}
                    <div className="bg-black/40 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-8 space-y-6">
                       <div>
                          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-green-500 italic">Cadastrar Veículos do Cliente</h4>
                          <p className="text-[8px] text-zinc-500 font-bold uppercase mt-1">Adicione um ou mais veículos para este cliente</p>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-zinc-950 p-5 rounded-2xl border border-zinc-900">
                          <div className="space-y-1">
                             <p className="text-[8px] font-black text-zinc-600 uppercase ml-2">Modelo Veículo / Jet</p>
                             <input type="text" placeholder="EX: MAVERICK X3 RS" className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs uppercase font-bold outline-none" value={vehicleInput.model} onChange={e => setVehicleInput({...vehicleInput, model: e.target.value})} />
                          </div>
                          <div className="space-y-1">
                             <p className="text-[8px] font-black text-zinc-600 uppercase ml-2">Placa / Numeral (Se houver)</p>
                             <input type="text" placeholder="EX: #44 ou ABC1D23" className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs uppercase font-bold outline-none" value={vehicleInput.plate} onChange={e => setVehicleInput({...vehicleInput, plate: e.target.value})} />
                          </div>
                          <div className="space-y-1">
                             <p className="text-[8px] font-black text-zinc-600 uppercase ml-2">Ano (Opcional)</p>
                             <input type="text" placeholder="EX: 2024" className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs uppercase font-bold outline-none" value={vehicleInput.year} onChange={e => setVehicleInput({...vehicleInput, year: e.target.value})} />
                          </div>
                       </div>
                       
                       <button type="button" onClick={handleAddVehicleToTemp} className="w-full sm:w-auto px-6 py-4 bg-zinc-800 hover:bg-green-500/10 hover:text-green-500 text-white rounded-xl font-black text-[10px] uppercase transition-all tracking-wider">
                         + Adicionar Veículo à Lista Temp
                       </button>

                       {tempVehicles.length > 0 && (
                         <div className="space-y-3 pt-4 border-t border-zinc-900">
                            <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest italic">Veículos que serão salvos:</p>
                            {tempVehicles.map(v => (
                              <div key={v.id} className="flex justify-between items-center p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                                <div className="flex flex-col">
                                  <span className="text-white text-xs font-black uppercase italic">{v.model}</span>
                                  <span className="text-[8px] text-zinc-500 uppercase font-black">Placa: {v.plate || 'S/ PLACA'} {v.year ? `| Ano: ${v.year}` : ''}</span>
                                </div>
                                <button type="button" onClick={() => handleRemoveVehicleFromTemp(v.id)} className="p-2 text-zinc-600 hover:text-red-500 font-bold transition-all">[Remover]</button>
                              </div>
                            ))}
                         </div>
                       )}
                    </div>

                    <div className="flex gap-4">
                       <button type="button" onClick={() => { setIsAddingClient(false); setTempVehicles([]); }} className="flex-1 py-5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-black uppercase text-[10px] rounded-2xl transition-all">Cancelar</button>
                       <button type="submit" className="flex-1 py-5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[10px] rounded-2xl shadow-glow transition-all">Salvar Cadastro de Cliente</button>
                    </div>
                  </form>
               </div>
             )}

             {/* Modal de Edição de Cliente */}
             {editingClient && (
               <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[350] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
                 <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-[3rem] space-y-6 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto my-auto">
                   <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                     <div>
                       <h3 className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-3">
                         <Pencil size={18} className="text-green-500" />
                         Editar Cadastro e Login do Cliente
                       </h3>
                       <p className="text-[9px] text-green-500 font-bold uppercase tracking-widest mt-1">Alteração de dados, veículos e credenciais do Espelho</p>
                     </div>
                     <button onClick={() => setEditingClient(null)} className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-white transition-colors">
                       <X size={16} />
                     </button>
                   </div>

                   <form onSubmit={handleSaveEditClient} className="space-y-6">
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                       <div className="space-y-1 sm:col-span-2">
                         <p className="text-[9px] font-black uppercase text-zinc-400 ml-3 tracking-widest italic">Nome do Cliente *</p>
                         <input 
                           required 
                           type="text" 
                           value={editingClient.name} 
                           onChange={e => setEditingClient({ ...editingClient, name: e.target.value })}
                           className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500 transition-colors"
                         />
                       </div>
                       <div className="space-y-1">
                         <p className="text-[9px] font-black uppercase text-zinc-400 ml-3 tracking-widest italic">CPF / CNPJ</p>
                         <input 
                           type="text" 
                           value={editingClient.cpf || ''} 
                           onChange={e => setEditingClient({ ...editingClient, cpf: e.target.value })}
                           className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500 transition-colors"
                         />
                       </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-1">
                         <p className="text-[9px] font-black uppercase text-zinc-400 ml-3 tracking-widest italic">Telefone / WhatsApp</p>
                         <input 
                           type="text" 
                           placeholder="(11) 99999-9999"
                           value={editingClient.phone || ''} 
                           onChange={e => setEditingClient({ ...editingClient, phone: e.target.value })}
                           className="w-full bg-black border border-zinc-800 p-3.5 rounded-2xl text-white font-bold text-xs outline-none focus:border-green-500 transition-colors"
                         />
                       </div>
                       <div className="space-y-1">
                         <p className="text-[9px] font-black uppercase text-zinc-400 ml-3 tracking-widest italic">E-mail</p>
                         <input 
                           type="email" 
                           placeholder="cliente@email.com"
                           value={editingClient.email || ''} 
                           onChange={e => setEditingClient({ ...editingClient, email: e.target.value })}
                           className="w-full bg-black border border-zinc-800 p-3.5 rounded-2xl text-white font-bold text-xs outline-none focus:border-green-500 transition-colors"
                         />
                       </div>
                     </div>

                     {/* Credenciais de Login Exclusivo do Cliente para o Espelho UTV */}
                     <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
                       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                         <div>
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 italic flex items-center gap-1.5">
                             <ShieldCheck size={14} /> Credenciais do Espelho do Cliente (Acesso Travado)
                           </h4>
                           <p className="text-[9px] text-zinc-400 mt-0.5">
                             O cliente usará este Login e Senha para abrir o link do Espelho UTV em modo somente leitura.
                           </p>
                         </div>
                         <button
                           type="button"
                           onClick={() => {
                             const creds = generateSlugCredentials(editingClient.name || 'cliente');
                             setEditingClient({
                               ...editingClient,
                               username: creds.username,
                               password: creds.password,
                               isAccessActive: true
                             });
                           }}
                           className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500 hover:text-black text-emerald-400 border border-emerald-500/40 rounded-xl text-[8px] font-black uppercase transition-all shrink-0 self-start sm:self-center"
                         >
                           ⚡ Gerar Automático
                         </button>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                         <div className="space-y-1">
                           <p className="text-[8px] font-black uppercase text-zinc-400 ml-1">Login do Cliente</p>
                           <input
                             type="text"
                             placeholder="Ex: guilherme"
                             value={editingClient.username || ''}
                             onChange={e => setEditingClient({ ...editingClient, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                             className="w-full bg-black border border-zinc-800 focus:border-emerald-500 p-3 rounded-xl text-white font-mono font-bold text-xs outline-none"
                           />
                         </div>
                         <div className="space-y-1">
                           <p className="text-[8px] font-black uppercase text-zinc-400 ml-1">Senha do Cliente</p>
                           <input
                             type="text"
                             placeholder="Ex: 123"
                             value={editingClient.password || ''}
                             onChange={e => setEditingClient({ ...editingClient, password: e.target.value })}
                             className="w-full bg-black border border-zinc-800 focus:border-emerald-500 p-3 rounded-xl text-white font-mono font-bold text-xs outline-none"
                           />
                         </div>
                         <div className="space-y-1">
                           <p className="text-[8px] font-black uppercase text-zinc-400 ml-1">Permissão</p>
                           <select
                             value={editingClient.isAccessActive !== false ? 'active' : 'blocked'}
                             onChange={e => setEditingClient({ ...editingClient, isAccessActive: e.target.value === 'active' })}
                             className="w-full bg-black border border-zinc-800 focus:border-emerald-500 p-3 rounded-xl text-white font-black uppercase text-[10px] outline-none"
                           >
                             <option value="active">✅ Liberado</option>
                             <option value="blocked">🚫 Bloqueado</option>
                           </select>
                         </div>
                       </div>
                     </div>

                     {/* Gestão de Veículos do Cliente */}
                     <div className="bg-black/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
                       <div className="flex justify-between items-center">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-green-500 italic">Veículos Cadastrados</h4>
                         <span className="text-[9px] text-zinc-500 font-bold">{editingClient.vehicles.length} veículo(s)</span>
                       </div>

                       {editingClient.vehicles.length > 0 ? (
                         <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                           {editingClient.vehicles.map(veh => (
                             <div key={veh.id} className="flex justify-between items-center p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                               <div className="flex flex-col">
                                 <span className="text-white text-xs font-black uppercase italic">{veh.model}</span>
                                 <span className="text-[8px] text-zinc-500 uppercase font-bold">
                                   Placa: {veh.plate || 'S/ PLACA'} {veh.year ? `• Ano: ${veh.year}` : ''}
                                 </span>
                               </div>
                               <button 
                                 type="button" 
                                 onClick={() => handleRemoveVehicleFromEditingClient(veh.id)}
                                 className="p-2 text-zinc-500 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10"
                                 title="Excluir Veículo"
                               >
                                 <Trash2 size={14} />
                               </button>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <p className="text-[9px] text-zinc-600 font-bold uppercase italic">Nenhum veículo vinculado a este cliente.</p>
                       )}

                       {/* Inclusão de Novo Veículo */}
                       <div className="pt-3 border-t border-zinc-800 space-y-3">
                         <p className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">+ Inserir Novo Veículo para o Cliente:</p>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                           <input 
                             type="text" 
                             placeholder="Modelo (ex: Can-Am X3)" 
                             value={editClientVehicleInput.model} 
                             onChange={e => setEditClientVehicleInput({ ...editClientVehicleInput, model: e.target.value })}
                             className="bg-black border border-zinc-800 p-3 rounded-xl text-white text-xs uppercase font-bold outline-none"
                           />
                           <input 
                             type="text" 
                             placeholder="Placa (opcional)" 
                             value={editClientVehicleInput.plate} 
                             onChange={e => setEditClientVehicleInput({ ...editClientVehicleInput, plate: e.target.value })}
                             className="bg-black border border-zinc-800 p-3 rounded-xl text-white text-xs uppercase font-bold outline-none"
                           />
                           <input 
                             type="text" 
                             placeholder="Ano (opcional)" 
                             value={editClientVehicleInput.year} 
                             onChange={e => setEditClientVehicleInput({ ...editClientVehicleInput, year: e.target.value })}
                             className="bg-black border border-zinc-800 p-3 rounded-xl text-white text-xs uppercase font-bold outline-none"
                           />
                         </div>
                         <button 
                           type="button" 
                           onClick={handleAddVehicleToEditingClient} 
                           className="w-full sm:w-auto px-5 py-3 bg-zinc-800 hover:bg-green-500 hover:text-black text-zinc-300 font-black text-[9px] uppercase rounded-xl transition-all"
                         >
                           + Adicionar Veículo à Lista
                         </button>
                       </div>
                     </div>

                     <div className="flex gap-4 pt-2">
                       <button 
                         type="button" 
                         onClick={() => setEditingClient(null)} 
                         className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-black uppercase text-[10px] rounded-2xl transition-all"
                       >
                         Cancelar
                       </button>
                       <button 
                         type="submit" 
                         className="flex-1 py-4 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[10px] rounded-2xl shadow-glow transition-all"
                       >
                         Salvar Alterações
                       </button>
                     </div>
                   </form>
                 </div>
               </div>
             )}

             {/* Busca de Clientes */}
             <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-700" size={20} />
                <input 
                  type="text" 
                  placeholder="Filtrar clientes por Nome, CPF ou Login do Espelho..." 
                  value={clientSearchTerm} 
                  onChange={e => setClientSearchTerm(e.target.value)} 
                  className="w-full bg-zinc-900 border border-zinc-800 pl-16 pr-6 py-6 rounded-[2.5rem] font-bold text-xs outline-none focus:border-green-500/50 shadow-2xl" 
                />
             </div>

             {/* Grid Geral de Clientes */}
             <div className="grid grid-cols-1 gap-8">
                {clients.filter(c => 
                  c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) || 
                  c.cpf.includes(clientSearchTerm) ||
                  (c.username && c.username.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                ).length === 0 ? (
                  <div className="py-20 text-center text-zinc-800 font-black uppercase italic border-2 border-dashed border-zinc-800 rounded-[3rem]">Nenhum cliente cadastrado correspondente</div>
                ) : (
                  clients.filter(c => 
                    c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) || 
                    c.cpf.includes(clientSearchTerm) ||
                    (c.username && c.username.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                  ).map(client => {
                    const clientOS = serviceOrders.filter(o => o.clientId === client.id);
                    const clientPassports = utvPassports.filter(
                      p => p.clientId === client.id || p.customerName.trim().toLowerCase() === client.name.trim().toLowerCase()
                    );
                    const primaryPassport = clientPassports[0] || null;
                    return (
                      <div key={client.id} className="bg-zinc-900 border border-zinc-800 p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[3rem] shadow-2xl space-y-6 sm:space-y-8 animate-in slide-in-from-bottom-2">
                         <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-zinc-800 pb-6">
                            <div>
                               <div className="flex flex-wrap items-center gap-2.5">
                                 <h3 className="text-xl sm:text-2xl font-black uppercase italic text-white leading-tight tracking-tighter">{client.name}</h3>
                                 {client.username ? (
                                   <span className={`px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase border ${
                                     client.isAccessActive !== false
                                       ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                       : 'bg-red-500/15 text-red-400 border-red-500/30'
                                   }`}>
                                     {client.isAccessActive !== false ? '🔒 Login Espelho Ativo' : '🚫 Login Bloqueado'}
                                   </span>
                                 ) : (
                                   <span className="px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
                                     Sem Login Configurado
                                   </span>
                                 )}
                               </div>
                               <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[9px] font-black uppercase tracking-widest">
                                 <span className="text-green-500">CPF: {client.cpf || 'NÃO CONFIGURADO'}</span>
                                 {client.phone && <span className="text-zinc-400">• 📱 {client.phone}</span>}
                                 {client.email && <span className="text-zinc-400">• ✉️ {client.email}</span>}
                               </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                              <button onClick={() => handleStartEditClient(client)} className="flex-1 sm:flex-initial justify-center px-4 sm:px-5 py-3 bg-zinc-800 border border-zinc-700 hover:bg-green-500 hover:text-black transition-all rounded-xl text-[8px] font-black uppercase text-zinc-300 flex items-center gap-2">
                                <Pencil size={12} /> Editar / Credenciais
                              </button>
                              <button onClick={() => handleDeleteClient(client.id)} className="flex-1 sm:flex-initial justify-center px-4 sm:px-5 py-3 bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all rounded-xl text-[8px] font-black uppercase text-red-500 flex items-center gap-2">
                                <Trash2 size={12} /> Remover Cliente
                              </button>
                            </div>
                         </div>

                         {/* PAINEL DE CREDENCIAIS DO ESPELHO DO CLIENTE (LOGIN E SENHA TRAVADOS) */}
                         <div className="bg-black/60 border border-emerald-500/25 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                           <div className="space-y-1.5">
                             <div className="flex items-center gap-2">
                               <ShieldCheck size={15} className="text-emerald-400" />
                               <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                                 Acesso Exclusivo do Cliente ao Espelho UTV (Modo Somente Leitura)
                               </span>
                             </div>
                             {client.username ? (
                               <div className="flex flex-wrap items-center gap-3 text-xs">
                                 <span className="text-zinc-400">
                                   Login: <strong className="text-white font-mono bg-zinc-900 border border-zinc-700 px-2.5 py-0.5 rounded-lg">{client.username}</strong>
                                 </span>
                                 <span className="text-zinc-400">
                                   Senha: <strong className="text-white font-mono bg-zinc-900 border border-zinc-700 px-2.5 py-0.5 rounded-lg">{client.password || '•••'}</strong>
                                 </span>
                                 {primaryPassport && (
                                   <span className="text-[10px] text-zinc-400 font-bold">
                                     • Passaporte Vinculado: <strong className="text-green-400">{primaryPassport.vehicleNumber ? `${primaryPassport.vehicleNumber} ` : ''}{primaryPassport.vehicleModel}</strong>
                                   </span>
                                 )}
                               </div>
                             ) : (
                               <p className="text-[11px] text-zinc-400">
                                 Clique em <strong className="text-white">Editar / Credenciais</strong> para criar um Login e Senha exclusivos para este cliente acessar o link do Espelho.
                               </p>
                             )}
                           </div>

                           <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                             {client.username && (
                               <button
                                 type="button"
                                 onClick={() => handleToggleClientAccess(client)}
                                 className={`px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${
                                   client.isAccessActive !== false
                                     ? 'bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-300 border-zinc-700'
                                     : 'bg-emerald-500/20 hover:bg-emerald-500 hover:text-black text-emerald-400 border-emerald-500/40'
                                 }`}
                               >
                                 {client.isAccessActive !== false ? 'Bloquear Acesso' : 'Reativar Acesso'}
                               </button>
                             )}

                             {primaryPassport && (
                               <>
                                 <button
                                   type="button"
                                   onClick={() => {
                                     const mirrorUrl = `${window.location.origin}${window.location.pathname}?utv_passport=${encodeURIComponent(primaryPassport.id)}`;
                                     const msg = [
                                       `🏁 *${currentTenant.name} — Passaporte Oficial UTV (Espelho do Cliente)*`,
                                       `Olá *${client.name}*, acompanhe em tempo real a revisão e preparação do seu UTV *${primaryPassport.vehicleNumber ? `${primaryPassport.vehicleNumber} • ` : ''}${primaryPassport.vehicleModel}*:`,
                                       ``,
                                       `🔗 *Link do Espelho:* ${mirrorUrl}`,
                                       `👤 *Login de Cliente:* ${client.username || 'Solicite à oficina'}`,
                                       `🔑 *Senha:* ${client.password || 'Solicite à oficina'}`,
                                       ``,
                                       `_Acesso exclusivo de visualização em tempo real._`
                                     ].join('\n');
                                     navigator.clipboard.writeText(msg);
                                     setCopiedClientMirrorId(client.id);
                                     setTimeout(() => setCopiedClientMirrorId(null), 3000);
                                   }}
                                   className="flex-1 sm:flex-initial justify-center px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-400 border border-amber-500/40 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all"
                                 >
                                   {copiedClientMirrorId === client.id ? <Check size={13} /> : <Copy size={13} />}
                                   <span>{copiedClientMirrorId === client.id ? 'Convite Copiado!' : '📲 Copiar Link + Login/Senha'}</span>
                                 </button>

                                 <button
                                   type="button"
                                   onClick={() => setClientMirrorPassport(primaryPassport)}
                                   className="flex-1 sm:flex-initial justify-center px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all shadow-glow"
                                 >
                                   <ShieldCheck size={13} />
                                   <span>Abrir Espelho</span>
                                 </button>
                               </>
                             )}
                           </div>
                         </div>

                         {/* VEÍCULOS VINCULADOS */}
                         <div className="space-y-4">
                            <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">[ Veículos do Cliente ]</h4>
                            {client.vehicles.length === 0 ? (
                              <p className="text-[10px] text-zinc-700 font-bold uppercase italic ml-2">Nenhum veículo registrado para este cliente</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                 {client.vehicles.map(veh => (
                                   <div key={veh.id} className="p-5 bg-black rounded-2xl border border-zinc-800 flex items-center gap-4">
                                      <div className="p-3 bg-zinc-900 rounded-xl text-green-500">
                                         <QrCode size={18} />
                                      </div>
                                      <div className="flex flex-col">
                                         <span className="text-white text-xs font-black uppercase italic">{veh.model}</span>
                                         <span className="text-[8px] text-zinc-500 uppercase font-black">Placa: {veh.plate || 'S/ PLACA'} {veh.year ? `| Ano: ${veh.year}` : ''}</span>
                                      </div>
                                   </div>
                                 ))}
                              </div>
                            )}
                         </div>

                         {/* HISTÓRICO DE SERVIÇOS PRESTADOS */}
                         <div className="space-y-4 pt-6 border-t border-zinc-800">
                            <h4 className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">[ Histórico de Serviços / O.S. Destinadas ]</h4>
                            {clientOS.length === 0 ? (
                              <p className="text-[10px] text-zinc-700 font-bold uppercase italic ml-2">Nenhuma Ordem de Serviço destinada a este cliente até o momento.</p>
                            ) : (
                              <div className="space-y-3">
                                 {clientOS.map(os => {
                                   const partsSum = os.parts.reduce((sum, p) => sum + getPartFinalValue(p), 0);
                                   const laborSum = os.laborItems.reduce((sum, l) => sum + getLaborFinalValue(l), 0);
                                   return (
                                     <div key={os.id} onClick={() => setSelectedOS(os)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-black hover:bg-zinc-950 rounded-2xl border border-zinc-800 cursor-pointer hover:border-green-500/20 transition-all gap-4">
                                        <div className="flex items-center gap-4">
                                           <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${
                                             os.status === OSStatus.COMPLETED ? 'bg-green-500 text-black' : 
                                             os.status === OSStatus.IN_PROGRESS ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                           }`}>
                                             {os.status}
                                           </div>
                                           <div className="flex flex-col">
                                              <span className="text-white text-xs font-black uppercase">O.S. #{os.osNumber}</span>
                                              <span className="text-[7.5px] text-zinc-500 uppercase font-black">{os.vehicleModel} | Aberta em {new Date(os.createdAt).toLocaleDateString('pt-BR')}</span>
                                           </div>
                                        </div>
                                        <div className="text-right">
                                           <span className="text-xs font-black text-green-500 tracking-widest">R$ {(partsSum + laborSum).toLocaleString('pt-BR')}</span>
                                           <p className="text-[7px] text-zinc-600 font-black uppercase">{os.parts.length} Peças | {os.laborItems.length} Serviços</p>
                                        </div>
                                     </div>
                                   );
                                 })}
                              </div>
                            )}
                         </div>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-8 animate-in fade-in">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
                <div>
                   <h2 className="text-3xl font-black uppercase italic tracking-tighter">Gerenciar Equipe HPS</h2>
                   <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider italic mt-1">
                     Cadastre e gerencie acessos de mecânicos e stockistas ({users.length} funcionários cadastrados)
                   </p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleRefreshUsers(true)} 
                    disabled={isSyncing}
                    title="Recarregar e sincronizar funcionários do Supabase"
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-5 py-4 rounded-[2rem] font-black uppercase text-[10px] flex items-center justify-center gap-2 border border-zinc-700 active:scale-95 transition-all self-start sm:self-center"
                  >
                    <RefreshCw size={14} className={isSyncing ? "animate-spin text-green-500" : ""} /> Atualizar Equipe ({users.length})
                  </button>
                  <button 
                    onClick={() => setIsAddingUser(!isAddingUser)} 
                    className="bg-green-500 hover:bg-green-400 text-black px-6 py-4 rounded-[2rem] font-black uppercase text-[10px] flex items-center justify-center gap-2 shadow-glow active:scale-95 transition-all self-start sm:self-center"
                  >
                    <UserPlus size={16} /> {isAddingUser ? 'Fechar Formulário' : 'Novo Funcionário'}
                  </button>
                </div>
             </div>

             {isAddingUser && (
               <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[3rem] shadow-2xl animate-in slide-in-from-top-4 duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 pb-3 border-b border-zinc-800">
                    <h3 className="text-xl font-black uppercase italic tracking-tight text-green-500">Cadastro de Novo Funcionário</h3>
                    <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-auto">
                      <Building2 size={12} /> Oficina: {currentTenant.name}
                    </span>
                  </div>
                  <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-1 sm:space-y-2">
                        <p className="text-[9px] font-black uppercase text-zinc-500 ml-4 tracking-widest italic">Nome Completo *</p>
                        <input 
                          required 
                          type="text" 
                          placeholder="EX: CLAUDIO SILVA" 
                          className="w-full bg-black border border-zinc-800 p-4 rounded-xl sm:rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500" 
                          value={userFormData.name} 
                          onChange={e => setUserFormData({...userFormData, name: e.target.value})} 
                        />
                     </div>

                     <div className="space-y-1 sm:space-y-2">
                        <p className="text-[9px] font-black uppercase text-zinc-500 ml-4 tracking-widest italic">Função / Tipo de Acesso *</p>
                        <select 
                          required 
                          className="w-full bg-black border border-zinc-800 p-4 rounded-xl sm:rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500" 
                          value={userFormData.role} 
                          onChange={e => setUserFormData({...userFormData, role: e.target.value as UserRole})}
                        >
                          <option value={UserRole.MECHANIC}>Mecânico Oficial / Técnico</option>
                          <option value={UserRole.STOCKIST}>Stockist / Administrador</option>
                        </select>
                     </div>

                     <div className="space-y-1 sm:space-y-2">
                        <p className="text-[9px] font-black uppercase text-zinc-500 ml-4 tracking-widest italic">ID Usuário / Login de Acesso *</p>
                        <input 
                          required 
                          type="text" 
                          placeholder="EX: claudios" 
                          className="w-full bg-black border border-zinc-800 p-4 rounded-xl sm:rounded-2xl text-white font-black text-xs outline-none focus:border-green-500 animate-none" 
                          value={userFormData.username} 
                          onChange={e => setUserFormData({...userFormData, username: e.target.value})} 
                        />
                     </div>

                     <div className="space-y-1 sm:space-y-2">
                        <p className="text-[9px] font-black uppercase text-zinc-500 ml-4 tracking-widest italic">Senha de Login *</p>
                        <input 
                          required 
                          type="password" 
                          placeholder="••••••••" 
                          className="w-full bg-black border border-zinc-800 p-4 rounded-xl sm:rounded-2xl text-white font-black text-xs outline-none focus:border-green-500" 
                          value={userFormData.password} 
                          onChange={e => setUserFormData({...userFormData, password: e.target.value})} 
                        />
                     </div>

                     <div className="space-y-1 sm:space-y-2 md:col-span-2">
                        <p className="text-[9px] font-black uppercase text-zinc-500 ml-4 tracking-widest italic">E-mail de Contato (Opcional)</p>
                        <input 
                          type="email" 
                          placeholder="claudio@hpsbrp.com" 
                          className="w-full bg-black border border-zinc-800 p-4 rounded-xl sm:rounded-2xl text-white font-black text-xs outline-none focus:border-green-500" 
                          value={userFormData.email} 
                          onChange={e => setUserFormData({...userFormData, email: e.target.value})} 
                        />
                     </div>

                     <div className="flex gap-4 md:col-span-2 mt-2">
                        <button 
                          type="button" 
                          onClick={() => setIsAddingUser(false)} 
                          className="flex-1 py-4 bg-zinc-805 hover:bg-zinc-800 text-zinc-400 font-black uppercase text-[10px] rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          type="submit" 
                          className="flex-1 py-4 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[10px] rounded-xl shadow-glow transition-all"
                        >
                          Salvar Funcionário
                        </button>
                     </div>
                  </form>
               </div>
             )}

             {/* Métricas e Resumo do Histórico da Equipe */}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex items-center gap-4">
                 <div className="p-3.5 bg-green-500/10 text-green-500 rounded-2xl border border-green-500/20">
                   <Users size={22} />
                 </div>
                 <div>
                   <span className="text-2xl font-black italic tracking-tight text-white">{users.length}</span>
                   <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Total de Cadastros</p>
                 </div>
               </div>

               <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex items-center gap-4">
                 <div className="p-3.5 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20">
                   <Wrench size={22} />
                 </div>
                 <div>
                   <span className="text-2xl font-black italic tracking-tight text-white">
                     {users.filter(u => u.role === UserRole.MECHANIC).length}
                   </span>
                   <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Mecânicos Oficiais</p>
                 </div>
               </div>

               <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex items-center gap-4">
                 <div className="p-3.5 bg-yellow-500/10 text-yellow-400 rounded-2xl border border-yellow-500/20">
                   <Shield size={22} />
                 </div>
                 <div>
                   <span className="text-2xl font-black italic tracking-tight text-white">
                     {users.filter(u => u.role === UserRole.STOCKIST).length}
                   </span>
                   <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Estoquistas / Admin</p>
                 </div>
               </div>

               <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex items-center gap-4">
                 <div className="p-3.5 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
                   <Cloud size={22} />
                 </div>
                 <div>
                   <span className="text-xs font-black uppercase tracking-tight text-green-400 flex items-center gap-1.5 mt-1">
                     <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block"></span> Supabase Ativo
                   </span>
                   <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Histórico Integrado</p>
                 </div>
               </div>
             </div>

             {/* Barra de Pesquisa e Filtros da Equipe */}
             <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800 p-4 rounded-3xl">
               <div className="relative w-full sm:w-80">
                 <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                 <input 
                   type="text"
                   value={userSearchTerm}
                   onChange={e => setUserSearchTerm(e.target.value)}
                   placeholder="Pesquisar por nome, login, e-mail..."
                   className="w-full bg-black border border-zinc-800 pl-11 pr-10 py-3 rounded-2xl text-white text-xs font-bold outline-none focus:border-green-500 placeholder:text-zinc-600"
                 />
                 {userSearchTerm && (
                   <button 
                     onClick={() => setUserSearchTerm('')}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                   >
                     <X size={14} />
                   </button>
                 )}
               </div>

               <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                 <button
                   onClick={() => setUserRoleFilter('ALL')}
                   className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                     userRoleFilter === 'ALL' 
                       ? 'bg-green-500 text-black shadow-glow' 
                       : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
                   }`}
                 >
                   Todos ({users.length})
                 </button>
                 <button
                   onClick={() => setUserRoleFilter(UserRole.MECHANIC)}
                   className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                     userRoleFilter === UserRole.MECHANIC 
                       ? 'bg-blue-500 text-black font-black' 
                       : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
                   }`}
                 >
                   Mecânicos ({users.filter(u => u.role === UserRole.MECHANIC).length})
                 </button>
                 <button
                   onClick={() => setUserRoleFilter(UserRole.STOCKIST)}
                   className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                     userRoleFilter === UserRole.STOCKIST 
                       ? 'bg-yellow-500 text-black font-black' 
                       : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
                   }`}
                 >
                   Estoquistas / Admin ({users.filter(u => u.role === UserRole.STOCKIST).length})
                 </button>
               </div>
             </div>

             <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[680px]">
                   <thead className="bg-black text-zinc-500 font-black uppercase">
                      <tr>
                        <th className="p-4 sm:p-6 lg:p-8">Funcionário / Identificação</th>
                        <th className="p-4 sm:p-6 lg:p-8">Tipo de Acesso</th>
                        <th className="p-4 sm:p-6 lg:p-8">Login / ID Sistema</th>
                        <th className="p-4 sm:p-6 lg:p-8">Histórico / Atividade</th>
                        <th className="p-4 sm:p-6 lg:p-8 text-right">Operações</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-800">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-10 sm:p-16 text-center">
                            <div className="flex flex-col items-center justify-center gap-3 text-zinc-500">
                              <Users size={40} className="text-zinc-600 animate-pulse" />
                              <p className="font-black uppercase text-xs tracking-wider text-zinc-300">
                                {users.length === 0 
                                  ? 'Nenhum funcionário carregado no momento' 
                                  : 'Nenhum funcionário encontrado com os filtros aplicados'}
                              </p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                {users.length === 0 
                                  ? 'Clique abaixo para recuperar e sincronizar o histórico de funcionários do Supabase' 
                                  : 'Altere o termo da busca ou selecione "Todos" para ver a lista completa'}
                              </p>
                              {users.length === 0 ? (
                                <button 
                                  type="button" 
                                  onClick={() => handleRefreshUsers(true)}
                                  disabled={isSyncing}
                                  className="mt-3 px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-black text-[10px] uppercase rounded-xl transition-all shadow-glow flex items-center gap-2 active:scale-95"
                                >
                                  <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} /> Sincronizar Histórico do Supabase
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setUserSearchTerm(''); setUserRoleFilter('ALL'); }}
                                  className="mt-3 px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-black text-[10px] uppercase rounded-xl transition-all"
                                >
                                  Limpar Filtros de Busca
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map(u => {
                          const assignedOsCount = serviceOrders.filter(os => 
                            os.mechanicId === u.id || 
                            os.mechanicId === u.name ||
                            (os.notes && os.notes.toLowerCase().includes((u.name || '').toLowerCase()))
                          ).length;

                          const movementsCount = history.filter(h => 
                            h.recipientName === u.name || 
                            (h.mechanicId && h.mechanicId === u.id)
                          ).length;

                          return (
                            <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                               <td className="p-4 sm:p-6 lg:p-8 font-black uppercase text-white italic">
                                 <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-green-500 font-black text-xs not-italic shrink-0">
                                     {(u.name || 'F').substring(0, 2).toUpperCase()}
                                   </div>
                                   <div>
                                     <div className="text-white text-xs">{u.name}</div>
                                     <div className="flex items-center gap-1.5 mt-0.5">
                                       <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[7.5px] font-black uppercase tracking-wider inline-flex items-center gap-1 not-italic">
                                         <Building2 size={9} />
                                         {tenants.find(t => t.id === u.tenantId)?.name || 'Oficina Matriz'}
                                       </span>
                                     </div>
                                     {u.email ? (
                                       <div className="text-[9px] text-zinc-500 font-bold lowercase not-italic tracking-normal mt-0.5">{u.email}</div>
                                     ) : (
                                       <div className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest not-italic">Cadastro Ativo</div>
                                     )}
                                   </div>
                                 </div>
                               </td>
                               <td className="p-4 sm:p-6 lg:p-8 whitespace-nowrap">
                                  <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 ${
                                    u.role === UserRole.STOCKIST 
                                      ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' 
                                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                  }`}>
                                     {u.role === UserRole.STOCKIST ? (
                                       <><Shield size={12} /> Stockist / Administrador</>
                                     ) : (
                                       <><Wrench size={12} /> Mecânico Oficial</>
                                     )}
                                  </span>
                               </td>
                               <td className="p-4 sm:p-6 lg:p-8 whitespace-nowrap">
                                  <span className="font-mono text-xs px-3 py-1.5 bg-black/60 rounded-xl border border-zinc-800 text-zinc-400 group-hover:text-zinc-200">
                                    @{u.username}
                                  </span>
                                </td>
                               <td className="p-4 sm:p-6 lg:p-8 whitespace-nowrap">
                                  <div className="flex flex-col gap-1 text-[10px]">
                                    <span className="text-zinc-300 font-bold flex items-center gap-1.5">
                                      <FileText size={12} className="text-green-500" /> {assignedOsCount} O.S. Vinculadas
                                    </span>
                                    <span className="text-zinc-500 font-bold flex items-center gap-1.5">
                                      <Package size={12} className="text-zinc-500" /> {movementsCount} Peças Movimentadas
                                    </span>
                                  </div>
                               </td>
                               <td className="p-4 sm:p-6 lg:p-8 text-right space-x-2 whitespace-nowrap">
                                  <button 
                                    onClick={() => resetPassword(u.id)} 
                                    title="Redefinir Senha do Funcionário"
                                    className="p-2.5 sm:p-3 bg-zinc-800 text-zinc-400 rounded-xl hover:text-green-500 hover:bg-zinc-700 transition-all active:scale-95"
                                  >
                                    <Key size={16} />
                                  </button>
                                  <button 
                                    onClick={() => deleteUser(u.id)} 
                                    title="Excluir Acesso do Funcionário"
                                    className="p-2.5 sm:p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-95"
                                  >
                                     <Trash2 size={16} />
                                  </button>
                               </td>
                            </tr>
                          );
                        })
                      )}
                   </tbody>
                </table>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'labels' && (
          <div className="space-y-8 animate-in fade-in">
             <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-zinc-800 pb-8">
                <div>
                   <h2 className="text-3xl font-black uppercase italic tracking-tighter">Emissão de Etiquetas QR</h2>
                   <p className="text-[10px] text-green-500 font-black uppercase tracking-[0.2em] mt-1 italic">
                     {selectedLabelIds.length > 0
                       ? `${selectedLabelIds.length} etiqueta(s) selecionada(s) para impressão`
                       : `Lote completo pronto: ${filteredLabelItems.length} etiqueta(s) QR Code disponível(is)`}
                   </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                   <button
                     type="button"
                     onClick={() => {
                       const targetList = selectedLabelIds.length > 0
                         ? filteredLabelItems.filter(i => selectedLabelIds.includes(i.id))
                         : filteredLabelItems;
                       handlePrintLabelsBatch(targetList);
                     }}
                     className="flex-1 sm:flex-initial bg-white hover:bg-green-500 text-black px-8 py-4 rounded-[2rem] font-black uppercase text-[11px] flex items-center justify-center gap-3 shadow-glow active:scale-95 transition-all cursor-pointer"
                   >
                     <Printer size={18} />
                     <span>
                       {selectedLabelIds.length > 0
                         ? `Imprimir Lote HPS (${selectedLabelIds.length})`
                         : `Imprimir Lote HPS (${filteredLabelItems.length})`}
                     </span>
                   </button>
                   <button
                     type="button"
                     disabled={isGeneratingLabelsPdf}
                     onClick={() => {
                       const targetList = selectedLabelIds.length > 0
                         ? filteredLabelItems.filter(i => selectedLabelIds.includes(i.id))
                         : filteredLabelItems;
                       handleDownloadLabelsPdf(targetList);
                     }}
                     className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-green-400 border border-green-500/30 px-6 py-4 rounded-[2rem] font-black uppercase text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                   >
                     <Download size={16} />
                     <span>{isGeneratingLabelsPdf ? 'Gerando PDF...' : 'Baixar PDF Lote'}</span>
                   </button>
                </div>
             </div>

             {/* Barra de Filtro e Seleção do Lote de Etiquetas */}
             <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-zinc-900/70 border border-zinc-800 p-4 rounded-3xl">
                <div className="relative flex-1">
                   <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                   <input
                     type="text"
                     value={labelSearchTerm}
                     onChange={e => setLabelSearchTerm(e.target.value)}
                     placeholder="Filtrar etiquetas por Nome da Peça, Part Number, Gaveta/Box ou Categoria..."
                     className="w-full bg-black border border-zinc-800 pl-11 pr-10 py-3.5 rounded-2xl text-white text-xs font-bold outline-none focus:border-green-500 placeholder:text-zinc-600"
                   />
                   {labelSearchTerm && (
                     <button
                       type="button"
                       onClick={() => setLabelSearchTerm('')}
                       className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                     >
                       <X size={14} />
                     </button>
                   )}
                </div>
                <div className="flex items-center gap-2">
                   <button
                     type="button"
                     onClick={() => {
                       if (selectedLabelIds.length === filteredLabelItems.length && filteredLabelItems.length > 0) {
                         setSelectedLabelIds([]);
                       } else {
                         setSelectedLabelIds(filteredLabelItems.map(i => i.id));
                       }
                     }}
                     className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
                   >
                     {selectedLabelIds.length === filteredLabelItems.length && filteredLabelItems.length > 0
                       ? 'Desmarcar Todas'
                       : 'Selecionar Todas'}
                   </button>
                   {selectedLabelIds.length > 0 && (
                     <button
                       type="button"
                       onClick={() => setSelectedLabelIds([])}
                       className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
                     >
                       Limpar ({selectedLabelIds.length})
                     </button>
                   )}
                </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredLabelItems.length === 0 ? (
                  <p className="col-span-full text-center py-20 text-zinc-700 font-black uppercase italic">
                    Nenhum item encontrado para etiquetar
                  </p>
                ) : (
                  filteredLabelItems.map(item => {
                    const qrValue = (item.linkedQRCode || item.partNumber || item.id || '').trim();
                    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(qrValue)}`;
                    const isSelected = selectedLabelIds.includes(item.id);

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedLabelIds(prev =>
                            prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                          );
                        }}
                        className={`bg-white p-6 rounded-[2.5rem] text-black flex flex-col items-center gap-4 border-4 shadow-xl group hover:scale-[1.01] transition-all cursor-pointer relative ${
                          isSelected ? 'border-green-500 ring-4 ring-green-500/30' : 'border-zinc-200'
                        }`}
                      >
                         <div className="w-full flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-zinc-400">
                            <span className="truncate max-w-[140px]">{item.category || 'GERAL'}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${isSelected ? 'bg-green-500 text-black' : 'bg-zinc-100 text-zinc-500'}`}>
                              {isSelected ? '✓ NO LOTE' : 'SELECIONAR'}
                            </span>
                         </div>

                         <p className="text-[11px] font-black uppercase text-center leading-tight h-9 overflow-hidden italic">
                           {item.name}
                         </p>

                         <div className="w-32 h-32 bg-white rounded-2xl flex items-center justify-center border border-zinc-200 p-2 shadow-inner">
                            <img
                              src={qrImgUrl}
                              alt={item.partNumber}
                              className="w-28 h-28 object-contain"
                              loading="lazy"
                            />
                         </div>

                         <div className="text-center space-y-0.5">
                            <p className="text-[8px] font-black uppercase italic opacity-40 tracking-widest">Part Number Oficial</p>
                            <p className="text-sm font-black tracking-widest">{item.partNumber}</p>
                            <p className="text-[8px] font-mono font-bold text-zinc-500 truncate max-w-[180px]">
                              QR: {qrValue}
                            </p>
                         </div>

                         <div className="w-full py-2.5 bg-black text-white rounded-2xl text-center shadow-lg">
                            <p className="text-[9px] font-black uppercase italic tracking-[0.25em]">{item.boxNumber || 'S/ LOC'}</p>
                         </div>

                         <button
                           type="button"
                           onClick={e => {
                             e.stopPropagation();
                             handlePrintLabelsBatch([item]);
                           }}
                           className="w-full py-2 bg-zinc-100 hover:bg-green-500 hover:text-black text-zinc-700 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                         >
                           <Printer size={12} /> Imprimir Esta Etiqueta
                         </button>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-12 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-8">
               <div>
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter">Configurações Técnicas</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider italic mt-1">Gerencie setores, serviços e grupos do sistema</p>
               </div>
               <Settings className="text-green-500 shrink-0 hidden sm:block" size={28} />
            </div>

            {/* Sub-abas de Configuração */}
            <div className="flex flex-wrap gap-2 p-1 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl max-w-2xl">
               <button 
                 onClick={() => setConfigSubTab('company')} 
                 className={`flex-1 min-w-[130px] py-4 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${configSubTab === 'company' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white hover:bg-zinc-900/40'}`}
               >
                 <Building2 size={13} /> Dados da Oficina (A4)
               </button>
               <button 
                 onClick={() => setConfigSubTab('sectors')} 
                 className={`flex-1 min-w-[110px] py-4 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${configSubTab === 'sectors' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white hover:bg-zinc-900/40'}`}
               >
                 Setorização
               </button>
               <button 
                 onClick={() => setConfigSubTab('labor')} 
                 className={`flex-1 min-w-[110px] py-4 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${configSubTab === 'labor' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white hover:bg-zinc-900/40'}`}
               >
                 Mão de Obra
               </button>
               <button 
                 onClick={() => setConfigSubTab('groups')} 
                 className={`flex-1 min-w-[110px] py-4 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${configSubTab === 'groups' ? 'bg-green-500 text-black shadow-glow' : 'text-zinc-500 hover:text-white hover:bg-zinc-900/40'}`}
               >
                 Grupos Técnicos
               </button>
            </div>

            {configSubTab === 'company' && (
              <div className="space-y-8 animate-in fade-in">
                <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-[3rem] space-y-8 shadow-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div>
                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-[9px] font-black uppercase tracking-wider">
                        Multi-Tenant • Oficina Ativa
                      </span>
                      <h4 className="text-xl font-black uppercase italic tracking-tight text-white mt-1">
                        Identidade & Dados da Empresa
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                        Estes dados são impressos automaticamente no cabeçalho e rodapé oficial de todas as Ordens de Serviço (Folha A4).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingTenant(true)}
                        className="px-4 py-2.5 bg-zinc-800 hover:bg-green-500 hover:text-black text-zinc-200 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all"
                      >
                        <Plus size={14} /> Nova Filial / Oficina
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleSaveCompanySettings} className="space-y-6">
                    {/* Bloco 1: Identificação */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-green-500 flex items-center gap-2">
                        <Building2 size={14} /> Informações Principais da Oficina
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Nome Fantasia da Oficina *</label>
                          <input
                            required
                            type="text"
                            value={companySettingsForm.name}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, name: e.target.value })}
                            placeholder="Ex: HPS CONTROL OFICINA MATRIZ"
                            className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Especialidade / Subtítulo</label>
                          <input
                            type="text"
                            value={companySettingsForm.subtitle}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, subtitle: e.target.value })}
                            placeholder="Ex: Centro Técnico Can-Am BRP • Preparação Especializada"
                            className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-bold text-xs uppercase outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Razão Social</label>
                          <input
                            type="text"
                            value={companySettingsForm.corporateName}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, corporateName: e.target.value })}
                            placeholder="Ex: HPS Motores e Peças Ltda"
                            className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">CNPJ</label>
                          <input
                            type="text"
                            value={companySettingsForm.cnpj}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, cnpj: e.target.value })}
                            placeholder="00.000.000/0001-00"
                            className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-mono text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Telefone / WhatsApp</label>
                          <input
                            type="text"
                            value={companySettingsForm.phone}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, phone: e.target.value })}
                            placeholder="(00) 00000-0000"
                            className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-mono text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                      </div>

                      {/* Taxa Padrão por Hora da Oficina */}
                      <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-green-500/10 text-green-400 rounded-xl shrink-0">
                            <Clock size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-black uppercase text-white tracking-wider">
                                Valor Cobrado por Hora da Oficina (R$/h)
                              </label>
                              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[8px] font-black uppercase rounded">Editável / Reajuste</span>
                            </div>
                            <p className="text-[9px] text-zinc-400 mt-0.5">
                              Taxa padrão da oficina usada para cálculo proporcional de horas e minutos trabalhados. Mantenha atualizado quando houver reajuste nos valores.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs font-bold">R$</span>
                            <input
                              type="number"
                              step="1"
                              value={companySettingsForm.defaultHourlyRate || 150}
                              onChange={e => setCompanySettingsForm({ ...companySettingsForm, defaultHourlyRate: parseFloat(e.target.value) || 0 })}
                              placeholder="150"
                              className="w-32 bg-black border border-zinc-700 pl-9 pr-3 py-3 rounded-xl text-green-400 font-mono text-xs font-black outline-none focus:border-green-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bloco 2: Endereço para Impressão */}
                    <div className="space-y-4 pt-4 border-t border-zinc-800/80">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-green-500 flex items-center gap-2">
                        <MapPin size={14} /> Endereço Físico (Cabeçalho da O.S.)
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Rua / Logradouro</label>
                          <input
                            type="text"
                            value={companySettingsForm.street}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, street: e.target.value })}
                            placeholder="Ex: Av. Industrial das Oficinas"
                            className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Número</label>
                          <input
                            type="text"
                            value={companySettingsForm.number}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, number: e.target.value })}
                            placeholder="1500"
                            className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Bairro</label>
                          <input
                            type="text"
                            value={companySettingsForm.neighborhood}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, neighborhood: e.target.value })}
                            placeholder="Distrito Sul"
                            className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Cidade</label>
                          <input
                            type="text"
                            value={companySettingsForm.city}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, city: e.target.value })}
                            placeholder="São Paulo"
                            className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">Estado (UF)</label>
                          <input
                            type="text"
                            maxLength={2}
                            value={companySettingsForm.state}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, state: e.target.value.toUpperCase() })}
                            placeholder="SP"
                            className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs font-mono uppercase outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-zinc-400">E-mail de Contato</label>
                          <input
                            type="email"
                            value={companySettingsForm.email}
                            onChange={e => setCompanySettingsForm({ ...companySettingsForm, email: e.target.value })}
                            placeholder="contato@suaoficina.com.br"
                            className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bloco 3: Personalização do Documento A4 de OS */}
                    <div className="space-y-4 pt-4 border-t border-zinc-800/80">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-green-500 flex items-center gap-2">
                        <FileText size={14} /> Personalização da Folha A4 de Ordem de Serviço
                      </h5>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-zinc-400">URL do Logotipo da Oficina</label>
                        <input
                          type="text"
                          value={companySettingsForm.logoUrl}
                          onChange={e => setCompanySettingsForm({ ...companySettingsForm, logoUrl: e.target.value })}
                          placeholder="https://exemplo.com/logo-oficina.png"
                          className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-zinc-400">Termos Legais de Garantia (Impresso na OS)</label>
                        <textarea
                          rows={3}
                          value={companySettingsForm.warrantyTerms}
                          onChange={e => setCompanySettingsForm({ ...companySettingsForm, warrantyTerms: e.target.value })}
                          placeholder="Texto de garantia que aparecerá na folha de impressão da OS..."
                          className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-zinc-400">Mensagem de Agradecimento / Rodapé</label>
                        <input
                          type="text"
                          value={companySettingsForm.footerMessage}
                          onChange={e => setCompanySettingsForm({ ...companySettingsForm, footerMessage: e.target.value })}
                          placeholder="Ex: Agradecemos a preferência! Veículo revisado e liberado para uso."
                          className="w-full bg-black border border-zinc-800 p-3.5 rounded-xl text-white text-xs outline-none focus:border-green-500 transition-all"
                        />
                      </div>
                    </div>

                    {/* Botão de Salvar */}
                    <button
                      type="submit"
                      className="w-full py-5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-xs rounded-2xl shadow-glow active:scale-95 transition-all tracking-wider"
                    >
                      Salvar Dados da Oficina & Configurações da O.S.
                    </button>
                  </form>
                </div>

                {/* Prévia ao vivo do cabeçalho da OS */}
                <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-3xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">
                      Prévia do Cabeçalho da Ordem de Serviço (A4):
                    </span>
                    <span className="text-[8px] font-black uppercase text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                      Atualização em Tempo Real
                    </span>
                  </div>
                  <div className="bg-white text-black p-5 rounded-xl border border-zinc-300 shadow-lg">
                    <div className="border-b-2 border-black pb-3 flex justify-between items-start gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black uppercase tracking-tight text-black">
                            {companySettingsForm.name || 'NOME DA SUA OFICINA'}
                          </h3>
                          <span className="px-2 py-0.5 bg-black text-white text-[8px] font-black uppercase rounded">
                            {companySettingsForm.subtitle?.split('•')[0]?.trim() || 'Especialista'}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold uppercase text-zinc-700 mt-0.5">
                          {companySettingsForm.corporateName ? `${companySettingsForm.corporateName} • ` : ''}
                          {companySettingsForm.subtitle || 'Centro Técnico de Oficina & Preparação'}
                        </p>
                        <div className="text-[9px] text-zinc-600 mt-1 flex flex-wrap gap-x-2">
                          {companySettingsForm.cnpj && <span>CNPJ: {companySettingsForm.cnpj}</span>}
                          {companySettingsForm.phone && <span>• Tel: {companySettingsForm.phone}</span>}
                          {companySettingsForm.city && <span>• {companySettingsForm.city}/{companySettingsForm.state || 'UF'}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black uppercase border-2 border-black px-2 py-0.5 bg-zinc-100 inline-block">
                          ORDEM DE SERVIÇO #0001
                        </div>
                        <p className="text-[9px] text-zinc-600 mt-1 uppercase font-bold">Oficina Ativa</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Backup & Exportação Isolada da Oficina (Multi-Tenant SaaS) */}
                <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-[2.5rem] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                    <div>
                      <h5 className="text-[11px] font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <Download size={14} className="text-green-500" /> Backup & Exportação de Dados da Oficina
                      </h5>
                      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                        Download ou restauração completa dos dados isolados desta unidade ({currentTenant.name}) em arquivo JSON seguro.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-[8px] font-black uppercase">
                      Isolamento Tenant
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <button
                      type="button"
                      onClick={handleExportTenantData}
                      className="p-5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-green-500/50 rounded-2xl flex items-center justify-between transition-all group active:scale-95 text-left"
                    >
                      <div className="space-y-1">
                        <span className="text-xs font-black uppercase text-white group-hover:text-green-400 flex items-center gap-2">
                          <Download size={16} className="text-green-500" /> Exportar Backup (JSON)
                        </span>
                        <p className="text-[9px] text-zinc-500 font-bold uppercase">
                          Salva estoque, ordens de serviço, clientes e configurações desta filial.
                        </p>
                      </div>
                    </button>

                    <label className="p-5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/50 rounded-2xl flex items-center justify-between transition-all group active:scale-95 text-left cursor-pointer">
                      <div className="space-y-1">
                        <span className="text-xs font-black uppercase text-white group-hover:text-blue-400 flex items-center gap-2">
                          <Upload size={16} className="text-blue-400" /> Restaurar / Importar Dados
                        </span>
                        <p className="text-[9px] text-zinc-500 font-bold uppercase">
                          Carrega um arquivo .json de backup para este ambiente de oficina.
                        </p>
                      </div>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportTenantData}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {configSubTab === 'sectors' && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-[3rem] space-y-8 shadow-2xl animate-in fade-in">
                 <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-500 italic">Setorização do Veículo</h4>
                    <LayoutGrid size={18} className="text-zinc-700" />
                 </div>
                 <form onSubmit={handleAddSection} className="space-y-4">
                    <input required type="text" placeholder="NOME DO SISTEMA (EX: SISTEMA DE FRENAGEM)" className="w-full bg-black border border-zinc-800 p-5 rounded-2xl text-white font-black text-[10px] uppercase outline-none focus:border-green-500/50 transition-all" value={sectionFormData.name} onChange={e => setSectionFormData({...sectionFormData, name: e.target.value})} />
                    <input required type="text" placeholder="COMPONENTES (SEPARADOS POR VÍRGULA)" className="w-full bg-black border border-zinc-800 p-5 rounded-2xl text-white font-black text-[10px] uppercase outline-none focus:border-green-500/50 transition-all" value={sectionFormData.components} onChange={e => setSectionFormData({...sectionFormData, components: e.target.value})} />
                    <button type="submit" className="w-full py-5 bg-green-500 text-black font-black uppercase text-[10px] rounded-2xl shadow-glow active:scale-95 transition-all">Criar Repartição</button>
                 </form>
                 <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {vehicleSections.length === 0 ? (
                       <p className="text-center py-10 text-zinc-650 font-black uppercase italic text-[10px]">Nenhuma repartição cadastrada</p>
                    ) : vehicleSections.map(s => (
                      <div key={s.id} className="flex justify-between items-center p-6 bg-black rounded-[2rem] border border-zinc-800 hover:border-zinc-700 transition-all">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase italic text-white">{s.name}</span>
                            <span className="text-[8px] text-zinc-600 font-black uppercase italic mt-1">{s.components.join(', ')}</span>
                         </div>
                         <button onClick={() => handleDeleteSection(s.id)} className="p-3 text-zinc-500 hover:text-red-500 transition-colors active:scale-95"><Trash2 size={16} /></button>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {configSubTab === 'labor' && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-[3rem] space-y-8 shadow-2xl animate-in fade-in">
                 {/* Card Superior: Taxa Horária Padrão da Oficina & Reajuste Rápido */}
                 <div className="p-5 sm:p-6 bg-gradient-to-r from-green-950/30 via-zinc-950 to-zinc-900 border-2 border-green-500/30 rounded-3xl space-y-4 shadow-xl">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                     <div className="flex items-center gap-3">
                       <div className="p-3 bg-green-500/10 text-green-400 rounded-2xl shrink-0 border border-green-500/20">
                         <Clock size={24} />
                       </div>
                       <div>
                         <div className="flex items-center gap-2">
                           <h5 className="text-sm font-black uppercase text-white tracking-wider">
                             Valor Cobrado por Hora da Oficina
                           </h5>
                           <span className="px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 text-[8px] font-black uppercase rounded">
                             Oficina Ativa
                           </span>
                         </div>
                         <p className="text-[9px] text-zinc-400 mt-0.5">
                           Preencha manualmente o valor cobrado por hora. Ao lançar uma nova mão de obra por tempo, o sistema calcula o valor ou divide proporcionalmente por minutos trabalhados. Mantenha editável para quando houver reajuste nos valores.
                         </p>
                       </div>
                     </div>

                     <div className="flex items-center gap-2 shrink-0">
                       <div className="relative">
                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs font-bold">R$</span>
                         <input
                           type="number"
                           step="1"
                           value={currentTenant.defaultHourlyRate || 150}
                           onChange={e => {
                             const val = parseFloat(e.target.value) || 0;
                             handleQuickUpdateHourlyRate(val);
                           }}
                           placeholder="150"
                           className="w-32 bg-black border border-green-500/40 pl-9 pr-3 py-3 rounded-xl text-green-400 font-mono text-sm font-black outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/40"
                         />
                         <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-[9px]">/h</span>
                       </div>
                     </div>
                   </div>

                   {/* Botões Rápidos de Reajuste */}
                   <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800">
                     <span className="text-[8px] font-black uppercase text-zinc-400 tracking-wider mr-1">Reajuste Rápido:</span>
                     {[120, 150, 180, 200, 220, 250].map(rate => (
                       <button
                         key={rate}
                         type="button"
                         onClick={() => handleQuickUpdateHourlyRate(rate)}
                         className={`px-3 py-1.5 rounded-lg text-[9px] font-mono font-black transition-all ${
                           (currentTenant.defaultHourlyRate || 150) === rate
                             ? 'bg-green-500 text-black shadow-glow'
                             : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                         }`}
                       >
                         R$ {rate}/h
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* BARRA DE PESQUISA E CONSULTA RÁPIDA: VERIFICAR SE A MÃO DE OBRA JÁ EXISTE */}
                 <div className="p-5 sm:p-6 bg-black/90 border-2 border-zinc-800 focus-within:border-green-500/60 rounded-3xl space-y-4 transition-all shadow-lg">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                     <div>
                       <h5 className="text-[10px] font-black uppercase tracking-widest text-green-400 flex items-center gap-2">
                         <Search size={15} /> Consultar / Pesquisar Mão de Obra Cadastrada
                       </h5>
                       <p className="text-[9px] text-zinc-400 mt-0.5">
                         Na dúvida se uma mão de obra já existe? Pesquise abaixo pelo <strong className="text-white">nome do serviço</strong>, <strong className="text-white">setor do veículo</strong> ou <strong className="text-white">peça amarrada</strong> antes de cadastrar.
                       </p>
                     </div>
                     <span className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-xl text-[9px] font-mono font-black text-zinc-300 shrink-0">
                       {laborTemplates.length} M.O.(s) no catálogo
                     </span>
                   </div>

                   <div className="relative">
                     <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                     <input
                       type="text"
                       placeholder="🔍 DIGITE PARA PESQUISAR SE A MÃO DE OBRA JÁ EXISTE (EX: MANGA DE EIXO, DIFERENCIAL, SEMI EIXO, PIVÔ...)"
                       value={laborCatalogSearchTerm}
                       onChange={e => setLaborCatalogSearchTerm(e.target.value)}
                       className="w-full bg-zinc-950 border border-zinc-700 focus:border-green-500 pl-11 pr-24 py-3.5 rounded-2xl text-white font-black text-xs uppercase outline-none transition-all"
                     />
                     {laborCatalogSearchTerm && (
                       <button
                         type="button"
                         onClick={() => setLaborCatalogSearchTerm('')}
                         className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-1"
                       >
                         <X size={11} /> Limpar
                       </button>
                     )}
                   </div>

                   {laborCatalogSearchTerm.trim() !== '' && (() => {
                     const normalizeStr = (str: string) =>
                       (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                     const q = normalizeStr(laborCatalogSearchTerm);
                     const matchedTemplates = laborTemplates.filter(t => {
                       const descMatch = normalizeStr(t.description).includes(q);
                       const secName = vehicleSections.find(s => s.id === t.sectionId)?.name || '';
                       const secMatch = normalizeStr(secName).includes(q);
                       const tiedPieces = items.filter(i => (t.linkedItemIds && t.linkedItemIds.includes(i.id)) || i.laborTemplateId === t.id);
                       const pieceMatch = tiedPieces.some(p => normalizeStr(p.name).includes(q) || normalizeStr(p.partNumber || '').includes(q));
                       return descMatch || secMatch || pieceMatch;
                     });

                     return (
                       <div className="space-y-2.5 pt-1 animate-in fade-in">
                         {matchedTemplates.length > 0 ? (
                           <div className="p-4 bg-amber-950/20 border border-amber-500/40 rounded-2xl space-y-3">
                             <div className="flex items-center justify-between gap-2 flex-wrap">
                               <span className="text-[9.5px] font-black uppercase text-amber-400 flex items-center gap-1.5">
                                 ⚠️ Já existe(m) {matchedTemplates.length} mão(s) de obra compatível(is) com "{laborCatalogSearchTerm.toUpperCase()}":
                               </span>
                               <span className="text-[8px] text-zinc-400 uppercase font-bold">
                                 Você pode editar um modelo existente abaixo
                               </span>
                             </div>
                             <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                               {matchedTemplates.map(t => {
                                 const tiedPieces = items.filter(i => (t.linkedItemIds && t.linkedItemIds.includes(i.id)) || i.laborTemplateId === t.id);
                                 const gross = computeLaborGross(t);
                                 const secName = vehicleSections.find(s => s.id === t.sectionId)?.name || 'Sem Setor';
                                 return (
                                   <div key={t.id} className="p-3 bg-black/90 border border-zinc-800 hover:border-amber-500/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                                     <div className="space-y-1 min-w-0">
                                       <div className="flex items-center gap-2 flex-wrap">
                                         <span className="text-[10px] font-black uppercase text-white">{t.description}</span>
                                         <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-green-400 rounded text-[8px] font-mono font-black">
                                           {t.pricingType === 'fixed'
                                             ? `FIXO: R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                             : `${(t.defaultHours || 0) === 0 && (t.minutes || 0) === 0 ? 1 : t.defaultHours}h${t.minutes ? ` ${t.minutes}m` : ''} • R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                         </span>
                                         <span className="text-[8px] text-zinc-500 font-bold uppercase">Setor: {secName}</span>
                                       </div>
                                       <div className="text-[8px] text-zinc-400 flex items-center gap-1 flex-wrap">
                                         <span className="text-zinc-500 font-black uppercase">Peças Amarradas ({tiedPieces.length}):</span>
                                         {tiedPieces.length === 0 ? (
                                           <span className="italic text-zinc-600">Nenhuma peça amarrada</span>
                                         ) : (
                                           tiedPieces.map(p => (
                                             <span key={p.id} className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-300 font-mono">
                                               {p.name}
                                             </span>
                                           ))
                                         )}
                                       </div>
                                     </div>
                                     <button
                                       type="button"
                                       onClick={() => handleStartEditLaborTemplate(t)}
                                       className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-[8.5px] rounded-xl transition-all shrink-0 flex items-center gap-1.5 shadow-md"
                                     >
                                       <Pencil size={12} /> Editar Existente
                                     </button>
                                   </div>
                                 );
                               })}
                             </div>
                           </div>
                         ) : (
                           <div className="p-4 bg-green-950/20 border border-green-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                             <div>
                               <span className="text-[9.5px] font-black uppercase text-green-400 block">
                                 ✅ Nenhuma mão de obra encontrada para "{laborCatalogSearchTerm.toUpperCase()}"
                               </span>
                               <p className="text-[8.5px] text-zinc-400 mt-0.5">
                                 Esta mão de obra ainda não consta no catálogo. Você pode cadastrá-la agora mesmo!
                               </p>
                             </div>
                             <button
                               type="button"
                               onClick={() => {
                                 setLaborTemplateFormData(prev => ({
                                   ...prev,
                                   description: laborCatalogSearchTerm.toUpperCase()
                                 }));
                               }}
                               className="px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[8.5px] rounded-xl transition-all shrink-0 shadow-glow"
                             >
                               + Usar Nome no Cadastro Abaixo
                             </button>
                           </div>
                         )}
                       </div>
                     );
                   })()}
                 </div>

                 <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-500 italic">
                        {editingLaborTemplate ? 'Editar Modelo de Mão de Obra' : 'Cadastro de Mão de Obra / Serviço'}
                      </h4>
                      {editingLaborTemplate && (
                        <p className="text-[9px] text-amber-400 font-bold uppercase mt-1">
                          Editando Modelo: {editingLaborTemplate.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingLaborTemplate && (
                        <button
                          type="button"
                          onClick={handleCancelEditLaborTemplate}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[9px] font-black uppercase transition-all"
                        >
                          Cancelar Edição
                        </button>
                      )}
                      <Wrench size={18} className="text-zinc-700" />
                    </div>
                 </div>

                 <form onSubmit={handleAddLaborTemplate} className="space-y-5">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1.5 ml-1">
                        Descrição Técnica do Serviço *
                      </label>
                      <input 
                        required 
                        type="text" 
                        placeholder="EX: TROCA DE MANGA DE EIXO DIANTEIRA DIREITA / REVISÃO DO DIFERENCIAL" 
                        className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500/50 transition-all" 
                        value={laborTemplateFormData.description} 
                        onChange={e => setLaborTemplateFormData({...laborTemplateFormData, description: e.target.value})} 
                      />

                      {/* DETECTOR EM TEMPO REAL DE DUPLICIDADE ENQUANTO DIGITA A DESCRIÇÃO */}
                      {laborTemplateFormData.description.trim().length >= 3 && (() => {
                        const normalizeStr = (str: string) =>
                          (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                        const typed = normalizeStr(laborTemplateFormData.description);
                        const similarTemplates = laborTemplates.filter(t => {
                          if (editingLaborTemplate && t.id === editingLaborTemplate.id) return false;
                          const target = normalizeStr(t.description);
                          return target.includes(typed) || typed.includes(target);
                        });
                        if (similarTemplates.length === 0) return null;
                        const exactMatch = similarTemplates.some(t => normalizeStr(t.description) === typed);

                        return (
                          <div className={`mt-2.5 p-3.5 rounded-2xl border space-y-2 animate-in fade-in ${
                            exactMatch
                              ? 'bg-red-950/30 border-red-500/60'
                              : 'bg-amber-950/20 border-amber-500/40'
                          }`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[9px] font-black uppercase ${exactMatch ? 'text-red-400' : 'text-amber-400'}`}>
                                {exactMatch
                                  ? '🚨 ATENÇÃO: Já existe uma Mão de Obra cadastrada com este nome exato!'
                                  : `🔎 Encontramos ${similarTemplates.length} Mão(s) de Obra semelhante(s) já cadastrada(s):`}
                              </span>
                            </div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                              {similarTemplates.slice(0, 5).map(t => {
                                const gross = computeLaborGross(t);
                                return (
                                  <div key={t.id} className="p-2.5 bg-black/80 border border-zinc-800 rounded-xl flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="text-[9.5px] font-black uppercase text-white block truncate">
                                        {t.description}
                                      </span>
                                      <span className="text-[8px] font-mono text-zinc-400">
                                        {t.pricingType === 'fixed'
                                          ? `Valor Fixo: R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                          : `Tempo: ${(t.defaultHours || 0) === 0 && (t.minutes || 0) === 0 ? 1 : t.defaultHours}h${t.minutes ? ` ${t.minutes}m` : ''} (R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditLaborTemplate(t)}
                                      className="px-3 py-1.5 bg-zinc-800 hover:bg-amber-500 hover:text-black text-amber-400 rounded-lg text-[8px] font-black uppercase transition-all shrink-0 flex items-center gap-1"
                                    >
                                      <Pencil size={11} /> Carregar / Editar
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* SELETOR DE MODALIDADE: TEMPO (HORAS/MINUTOS) vs DIFICULDADE (VALOR FIXO) */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-zinc-400 block ml-1">
                        Modalidade de Cobrança da Mão de Obra *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setLaborTemplateFormData(prev => ({
                            ...prev,
                            pricingType: 'hourly',
                            defaultHours: (Number(prev.defaultHours) || 0) === 0 && (Number(prev.minutes) || 0) === 0 ? 1 : prev.defaultHours,
                            defaultValuePerHour: Number(prev.defaultValuePerHour) > 0 ? prev.defaultValuePerHour : (Number(prev.fixedValue) || currentTenant.defaultHourlyRate || 150)
                          }))}
                          className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                            laborTemplateFormData.pricingType === 'hourly'
                              ? 'bg-green-500/10 border-green-500 text-white shadow-glow'
                              : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Clock size={20} className={laborTemplateFormData.pricingType === 'hourly' ? 'text-green-400' : 'text-zinc-600'} />
                          <div>
                            <span className="text-xs font-black uppercase block">⏱️ Cobrança por Tempo</span>
                            <p className="text-[8.5px] text-zinc-400 mt-0.5">
                              Calcula o valor pelo tempo trabalhado em horas ou dividido por minutos trabalhados.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setLaborTemplateFormData(prev => ({
                            ...prev,
                            pricingType: 'fixed',
                            fixedValue: Number(prev.fixedValue) > 0 ? prev.fixedValue : (computeLaborGross(prev) || prev.defaultValuePerHour || currentTenant.defaultHourlyRate || 150)
                          }))}
                          className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                            laborTemplateFormData.pricingType === 'fixed'
                              ? 'bg-amber-500/10 border-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                              : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Zap size={20} className={laborTemplateFormData.pricingType === 'fixed' ? 'text-amber-400' : 'text-zinc-600'} />
                          <div>
                            <span className="text-xs font-black uppercase block">⚡ Cobrança por Dificuldade</span>
                            <p className="text-[8.5px] text-zinc-400 mt-0.5">
                              Valor fixo específico por complexidade técnica (NÃO soma taxa horária e NÃO vincula a outra M.O.).
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* CAMPOS CONFORME A MODALIDADE */}
                    {laborTemplateFormData.pricingType === 'hourly' ? (
                      /* MODO 1: TEMPO (HORAS E MINUTOS) */
                      <div className="p-4 sm:p-5 bg-black/60 border border-zinc-800 rounded-2xl space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                              Horas Trabalhadas
                            </label>
                            <input 
                              type="number" 
                              min="0"
                              step="any"
                              placeholder="1" 
                              className="w-full bg-black border border-zinc-700 p-3.5 rounded-xl text-white font-mono font-black text-xs outline-none focus:border-green-500" 
                              value={laborTemplateFormData.defaultHours} 
                              onChange={e => setLaborTemplateFormData({...laborTemplateFormData, defaultHours: Math.max(0, parseFloat(e.target.value) || 0)})} 
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                              Minutos Trabalhados (0-59 min)
                            </label>
                            <input 
                              type="number" 
                              min="0"
                              max="59"
                              step="1"
                              placeholder="0" 
                              className="w-full bg-black border border-zinc-700 p-3.5 rounded-xl text-white font-mono font-black text-xs outline-none focus:border-green-500" 
                              value={laborTemplateFormData.minutes || 0} 
                              onChange={e => setLaborTemplateFormData({...laborTemplateFormData, minutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0))})} 
                            />
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[9px] font-black uppercase text-zinc-400">
                                Valor Cobrado por Hora (R$/h)
                              </label>
                              <span className="text-[7.5px] text-green-400 uppercase font-black">Editável</span>
                            </div>
                            <input 
                              type="number" 
                              step="any"
                              placeholder="150" 
                              className="w-full bg-black border border-zinc-700 p-3.5 rounded-xl text-green-400 font-mono font-black text-xs outline-none focus:border-green-500" 
                              value={laborTemplateFormData.defaultValuePerHour} 
                              onChange={e => setLaborTemplateFormData({...laborTemplateFormData, defaultValuePerHour: parseFloat(e.target.value) || 0})} 
                            />
                          </div>
                        </div>

                        {/* Chips Rápidos de Minutos */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[7.5px] font-black uppercase text-zinc-500 mr-1">Atalhos de Tempo:</span>
                          {[
                            { label: '15 min', h: 0, m: 15 },
                            { label: '30 min', h: 0, m: 30 },
                            { label: '45 min', h: 0, m: 45 },
                            { label: '1 hora', h: 1, m: 0 },
                            { label: '1h 30m', h: 1, m: 30 },
                            { label: '2 horas', h: 2, m: 0 },
                            { label: '3 horas', h: 3, m: 0 }
                          ].map(preset => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setLaborTemplateFormData({
                                ...laborTemplateFormData,
                                defaultHours: preset.h,
                                minutes: preset.m
                              })}
                              className={`px-2.5 py-1 rounded-lg text-[8px] font-mono font-black transition-all ${
                                laborTemplateFormData.defaultHours === preset.h && (laborTemplateFormData.minutes || 0) === preset.m
                                  ? 'bg-green-500 text-black shadow-glow'
                                  : 'bg-zinc-800 text-zinc-300 hover:text-white'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        {/* Banner de Demonstração do Cálculo Proporcional */}
                        {(() => {
                          const rawH = laborTemplateFormData.defaultHours || 0;
                          const m = laborTemplateFormData.minutes || 0;
                          const h = (rawH === 0 && m === 0) ? 1 : rawH;
                          const rate = laborTemplateFormData.defaultValuePerHour || 0;
                          const calculatedGross = computeLaborGross(laborTemplateFormData);
                          return (
                            <div className="p-3 bg-black border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-[9px]">
                              <div className="text-zinc-400">
                                <span>Cálculo: </span>
                                <span className="text-white font-bold">({h}h {m > 0 ? `+ ${m}min (${(m/60).toFixed(2)}h)` : ''})</span>
                                <span> x </span>
                                <span className="text-green-400">R$ {rate.toFixed(2)}/h</span>
                                <span className="text-zinc-500 ml-1">(dividido por minutos trabalhados)</span>
                              </div>
                              <div className="text-right">
                                <span className="text-zinc-400 uppercase text-[8px] mr-1">Valor Calculado:</span>
                                <span className="text-green-400 font-black text-sm">
                                  R$ {calculatedGross.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      /* MODO 2: DIFICULDADE (VALOR FIXO ESPECÍFICO) */
                      <div className="p-4 sm:p-5 bg-amber-950/10 border border-amber-500/30 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[8px] font-black uppercase">
                            ⚡ Preço Fixo Específico
                          </span>
                          <span className="text-[9px] text-zinc-400">
                            Não soma nem multiplica por horas; o valor é cobrado integralmente pela complexidade.
                          </span>
                        </div>
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                            Valor Cobrado por Esta Mão de Obra (R$) *
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs font-bold">R$</span>
                            <input 
                              type="number" 
                              step="any"
                              placeholder="Ex: 350.00" 
                              className="w-full bg-black border border-amber-500/40 pl-9 pr-3 py-3.5 rounded-xl text-amber-400 font-mono font-black text-sm outline-none focus:border-amber-400" 
                              value={laborTemplateFormData.fixedValue || ''} 
                              onChange={e => setLaborTemplateFormData({...laborTemplateFormData, fixedValue: parseFloat(e.target.value) || 0})} 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Setor / Repartição do Veículo (Opcional) */}
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1.5 ml-1">
                        Repartição / Setor do Veículo (Opcional)
                      </label>
                      <select 
                        className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500/50 transition-all" 
                        value={laborTemplateFormData.sectionId} 
                        onChange={e => setLaborTemplateFormData({...laborTemplateFormData, sectionId: e.target.value})}
                      >
                         <option value="">SEM REPARTIÇÃO ESPECÍFICA (OPCIONAL)</option>
                         {vehicleSections.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                      </select>
                    </div>

                    {/* SEÇÃO PRINCIPAL SOLICITADA: AMARRAR PEÇAS CADASTRADAS A ESTA MÃO DE OBRA (SEM LIMITE) */}
                    <div className="p-5 sm:p-6 bg-gradient-to-r from-zinc-950 via-black to-zinc-950 border-2 border-green-500/30 rounded-3xl space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-black uppercase tracking-wider text-green-400 flex items-center gap-2">
                              <Package size={16} /> Peças e Insumos Amarrados a Esta Mão de Obra
                            </h5>
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-md text-[8px] font-black uppercase">
                              Sem Limite de Peças
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-400 mt-1 leading-relaxed">
                            Amarre as peças do seu estoque que acionam este serviço (ex: <strong className="text-white">Troca de manga de eixo dianteira direita</strong> amarrada à peça <strong className="text-white">MANGA DE EIXO</strong>, rolamentos, etc). Ao lançar a peça na O.S., o sistema vinculará automaticamente esta M.O. e verificará M.O. Compartilhada!
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-black border border-zinc-700 text-white rounded-xl text-[9px] font-mono font-black shrink-0">
                          {(laborTemplateFormData.linkedItemIds || []).length} peça(s) amarrada(s)
                        </span>
                      </div>

                      {/* Seletor e Pesquisa de Peças do Estoque para Adicionar */}
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="🔍 FILTRAR PEÇAS POR NOME OU PART NUMBER..."
                            value={laborTemplatePartSearch}
                            onChange={e => setLaborTemplatePartSearch(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white text-[10px] uppercase font-bold outline-none focus:border-green-500"
                          />
                          <select
                            className="flex-1 bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-white text-[10px] uppercase font-black outline-none focus:border-green-500"
                            value=""
                            onChange={e => {
                              const chosenId = e.target.value;
                              if (chosenId && !(laborTemplateFormData.linkedItemIds || []).includes(chosenId)) {
                                handleTogglePartLinkToLaborTemplate(chosenId);
                              }
                            }}
                          >
                            <option value="">-- SELECIONE UMA PEÇA PARA AMARRAR A ESTA M.O. --</option>
                            {items
                              .filter(i => {
                                const alreadyLinked = (laborTemplateFormData.linkedItemIds || []).includes(i.id);
                                if (alreadyLinked) return false;
                                if (!laborTemplatePartSearch.trim()) return true;
                                const q = laborTemplatePartSearch.toLowerCase();
                                return (i.name || '').toLowerCase().includes(q) || (i.partNumber || '').toLowerCase().includes(q);
                              })
                              .map(i => (
                                <option key={i.id} value={i.id}>
                                  + AMARRAR: {i.name.toUpperCase()} (PN: {i.partNumber || 'S/N'}) - R$ {i.value.toFixed(2)}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {/* Lista de Peças Amarradas Atualmente */}
                      <div className="space-y-2 pt-1">
                        {(laborTemplateFormData.linkedItemIds || []).length === 0 ? (
                          <div className="p-4 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl text-center">
                            <p className="text-[10px] text-zinc-500 italic">
                              Nenhuma peça amarrada a esta mão de obra ainda. Selecione peças no campo acima para vincular quantas desejar (sem limites).
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                            {(laborTemplateFormData.linkedItemIds || []).map(itemId => {
                              const piece = items.find(i => i.id === itemId);
                              if (!piece) return null;
                              return (
                                <div
                                  key={itemId}
                                  className="p-3 bg-zinc-950 border border-green-500/30 rounded-xl flex items-center justify-between gap-2 transition-all hover:border-green-400"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-black uppercase text-white truncate">
                                      {piece.name}
                                    </span>
                                    <span className="text-[8px] font-mono text-zinc-400">
                                      PN: <strong className="text-zinc-200">{piece.partNumber || 'S/N'}</strong> • R$ {piece.value.toFixed(2)}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePartLinkToLaborTemplate(itemId)}
                                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                                    title="Desamarrar esta peça"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* VÍNCULO A OUTRA MÃO DE OBRA: 100% OPCIONAL (M.O. COMPARTILHADA) */}
                    <div className="p-4 sm:p-6 bg-black/60 border border-zinc-800/80 rounded-2xl space-y-4">
                      <div 
                        className="flex items-center justify-between gap-4 cursor-pointer" 
                        onClick={() => {
                          const next = !isSharedLinkActive;
                          setIsSharedLinkActive(next);
                          if (!next) {
                            setLaborTemplateFormData({ ...laborTemplateFormData, linkedTemplateId: '' });
                          }
                        }}
                      >
                        <div className="flex-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-2 cursor-pointer">
                            🔗 Vínculo a Outra Mão de Obra (Opcional - M.O. Compartilhada)
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${isSharedLinkActive ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                              {isSharedLinkActive ? 'Vínculo Ativo' : 'Não Obrigatório / Independente'}
                            </span>
                          </label>
                          <p className="text-[8px] text-zinc-400 mt-1">
                            {isSharedLinkActive 
                              ? 'Vínculo configurado: Este serviço aproveitará a desmontagem prévia de outro serviço na mesma região (ex: cubo de roda aproveita retirada de pneus do disco de freio).'
                              : 'Por padrão, o vínculo NÃO é obrigatório. Deixe desmarcado para que este serviço seja 100% independente, ou ative para pré-configurar o desconto.'}
                          </p>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={isSharedLinkActive} 
                          onChange={e => {
                            setIsSharedLinkActive(e.target.checked);
                            if (!e.target.checked) {
                              setLaborTemplateFormData({ ...laborTemplateFormData, linkedTemplateId: '' });
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                        />
                      </div>

                      {isSharedLinkActive && (
                        <div className="space-y-4 pt-3 border-t border-zinc-800/80 animate-in fade-in">
                          <div>
                            <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">
                              Selecione a Mão de Obra Base que já Realiza a Desmontagem:
                            </label>
                            <select 
                              className="w-full bg-zinc-900 border border-zinc-700/70 p-4 rounded-xl text-white font-black text-[10px] uppercase outline-none focus:border-amber-500 transition-all" 
                              value={laborTemplateFormData.linkedTemplateId} 
                              onChange={e => setLaborTemplateFormData({...laborTemplateFormData, linkedTemplateId: e.target.value})}
                            >
                               <option value="">-- SELECIONE O SERVIÇO BASE (EX: REVISÃO DE DISCOS / DESMONTAGEM DE PNEUS) --</option>
                               {laborTemplates
                                 .filter(t => !editingLaborTemplate || t.id !== editingLaborTemplate.id)
                                 .map(t => (
                                   <option key={t.id} value={t.id}>
                                     {t.description.toUpperCase()} ({t.defaultHours}h - R$ {t.defaultHours * t.defaultValuePerHour})
                                   </option>
                               ))}
                            </select>
                          </div>

                          {laborTemplateFormData.linkedTemplateId && (
                            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3 animate-in fade-in">
                              <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider block">
                                Regra de Desconto Cadastrado para Mão de Obra Compartilhada:
                              </span>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">Tipo de Desconto</label>
                                  <select
                                    className="w-full bg-black border border-zinc-700 p-3 rounded-xl text-white font-bold text-[9px] uppercase outline-none focus:border-amber-500"
                                    value={laborTemplateFormData.discountType}
                                    onChange={e => setLaborTemplateFormData({
                                      ...laborTemplateFormData,
                                      discountType: e.target.value as 'percentage' | 'fixed'
                                    })}
                                  >
                                    <option value="percentage">PORCENTAGEM (%)</option>
                                    <option value="fixed">VALOR FIXO (R$)</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">
                                    {laborTemplateFormData.discountType === 'percentage' ? 'Desconto Cadastrado (%)' : 'Desconto Cadastrado (R$)'}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={laborTemplateFormData.discountType === 'percentage' ? 100 : undefined}
                                    className="w-full bg-black border border-zinc-700 p-3 rounded-xl text-amber-400 font-mono font-black text-xs outline-none focus:border-amber-500"
                                    value={laborTemplateFormData.discountType === 'percentage' ? laborTemplateFormData.discountPercentage : laborTemplateFormData.discountValue}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (laborTemplateFormData.discountType === 'percentage') {
                                        setLaborTemplateFormData({ ...laborTemplateFormData, discountPercentage: val });
                                      } else {
                                        setLaborTemplateFormData({ ...laborTemplateFormData, discountValue: val });
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Atalhos rápidos de desconto */}
                              {laborTemplateFormData.discountType === 'percentage' && (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <span className="text-[7.5px] font-black uppercase text-zinc-500 tracking-wider mr-1">Predefinições:</span>
                                  {[30, 40, 50, 60, 70].map(pct => (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => setLaborTemplateFormData({ ...laborTemplateFormData, discountPercentage: pct })}
                                      className={`px-2.5 py-1 rounded-lg text-[8px] font-black transition-all ${
                                        laborTemplateFormData.discountPercentage === pct
                                          ? 'bg-amber-500 text-black shadow-glow'
                                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                      }`}
                                    >
                                      {pct}%
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div>
                                <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">
                                  Justificativa Técnica (Aparece no Relatório / PDF da O.S.)
                                </label>
                                <input
                                  type="text"
                                  placeholder="Ex: Metade do serviço já feito na primeira M.O. (aproveitamento de desmontagem de pneus)"
                                  className="w-full bg-black border border-zinc-700 p-3 rounded-xl text-zinc-200 text-[9px] outline-none focus:border-amber-500"
                                  value={laborTemplateFormData.sharedNotes}
                                  onChange={e => setLaborTemplateFormData({ ...laborTemplateFormData, sharedNotes: e.target.value })}
                                />
                              </div>

                              {/* Live preview */}
                              {(() => {
                                const gross = computeLaborGross(laborTemplateFormData);
                                let disc = 0;
                                if (laborTemplateFormData.discountType === 'percentage') {
                                  disc = (gross * (laborTemplateFormData.discountPercentage || 0)) / 100;
                                } else {
                                  disc = laborTemplateFormData.discountValue || 0;
                                }
                                const net = Math.max(0, gross - disc);
                                return (
                                  <div className="p-3 bg-black/80 rounded-lg flex items-center justify-between text-[9px] font-mono border border-zinc-800">
                                    <span className="text-zinc-400">Integral: R$ {gross}</span>
                                    <span className="text-amber-400 font-bold">- R$ {disc} ({Math.round((disc / (gross || 1)) * 100)}%)</span>
                                    <span className="text-green-400 font-black">Faturado: R$ {net}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button type="submit" className="flex-1 py-5 bg-green-500 text-black font-black uppercase text-[10px] rounded-2xl shadow-glow active:scale-95 transition-all">
                        {editingLaborTemplate ? 'Salvar Alterações no Modelo' : 'Salvar no Catálogo'}
                      </button>
                      {editingLaborTemplate && (
                        <button 
                          type="button" 
                          onClick={handleCancelEditLaborTemplate}
                          className="px-6 py-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase text-[10px] rounded-2xl transition-all"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                 </form>

                 {/* CABEÇALHO E FILTRO DA LISTA DE MÃOS DE OBRA CADASTRADAS */}
                 <div className="pt-4 border-t border-zinc-800 space-y-4">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                     <div>
                       <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300">
                         Catálogo de Mãos de Obra Cadastradas ({laborTemplates.length})
                       </h5>
                       <p className="text-[8.5px] text-zinc-500 uppercase font-bold mt-0.5">
                         Lista completa de serviços técnicos cadastrados nesta oficina
                       </p>
                     </div>
                     <div className="relative w-full sm:w-80">
                       <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                       <input
                         type="text"
                         placeholder="FILTRAR LISTA DE MÃO DE OBRA..."
                         value={laborCatalogSearchTerm}
                         onChange={e => setLaborCatalogSearchTerm(e.target.value)}
                         className="w-full bg-black border border-zinc-800 focus:border-green-500 pl-9 pr-8 py-2.5 rounded-xl text-white font-black text-[9.5px] uppercase outline-none transition-all"
                       />
                       {laborCatalogSearchTerm && (
                         <button
                           type="button"
                           onClick={() => setLaborCatalogSearchTerm('')}
                           className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                         >
                           <X size={13} />
                         </button>
                       )}
                     </div>
                   </div>

                   <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                    {(() => {
                      const normalizeStr = (str: string) =>
                        (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                      const q = normalizeStr(laborCatalogSearchTerm);
                      const filteredLaborTemplates = !q
                        ? laborTemplates
                        : laborTemplates.filter(t => {
                            const descMatch = normalizeStr(t.description).includes(q);
                            const secName = vehicleSections.find(s => s.id === t.sectionId)?.name || '';
                            const secMatch = normalizeStr(secName).includes(q);
                            const tiedPieces = items.filter(i => (t.linkedItemIds && t.linkedItemIds.includes(i.id)) || i.laborTemplateId === t.id);
                            const pieceMatch = tiedPieces.some(p => normalizeStr(p.name).includes(q) || normalizeStr(p.partNumber || '').includes(q));
                            return descMatch || secMatch || pieceMatch;
                          });

                      if (laborTemplates.length === 0) {
                        return <p className="text-center py-10 text-zinc-650 font-black uppercase italic text-[10px]">Nenhum modelo de mão de obra cadastrado</p>;
                      }
                      if (filteredLaborTemplates.length === 0) {
                        return (
                          <div className="text-center py-10 bg-black/50 border border-dashed border-zinc-800 rounded-2xl space-y-2">
                            <p className="text-zinc-400 font-black uppercase text-[10px]">
                              Nenhuma mão de obra encontrada com "{laborCatalogSearchTerm.toUpperCase()}"
                            </p>
                            <button
                              type="button"
                              onClick={() => setLaborCatalogSearchTerm('')}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[8.5px] font-black uppercase"
                            >
                              Mostrar Todas ({laborTemplates.length})
                            </button>
                          </div>
                        );
                      }

                      return filteredLaborTemplates.map(t => {
                        const linked = t.linkedTemplateId ? laborTemplates.find(lt => lt.id === t.linkedTemplateId) : null;
                        const tiedPieces = items.filter(i => (t.linkedItemIds && t.linkedItemIds.includes(i.id)) || i.laborTemplateId === t.id);
                        const gross = computeLaborGross(t);

                        return (
                        <div key={t.id} className="p-5 bg-black rounded-[2rem] border border-zinc-800 hover:border-zinc-700 transition-all space-y-3">
                           <div className="flex justify-between items-start gap-4">
                             <div className="flex flex-col gap-1 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black uppercase italic text-white">{t.description}</span>
                                  {t.pricingType === 'fixed' ? (
                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[7.5px] font-black uppercase tracking-wider">
                                      ⚡ DIFICULDADE (VALOR FIXO)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-[7.5px] font-black uppercase tracking-wider">
                                      ⏱️ TEMPO (HORAS/MINUTOS)
                                    </span>
                                  )}
                                  {t.linkedTemplateId ? (
                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[7.5px] font-black uppercase tracking-wider">
                                      🔗 M.O. COMPARTILHADA ({t.discountPercentage || 50}% OFF)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[7.5px] font-black uppercase tracking-wider">
                                      INDEPENDENTE
                                    </span>
                                  )}
                                </div>
                                <span className="text-[8.5px] text-zinc-400 font-black uppercase italic">
                                  {vehicleSections.find(s => s.id === t.sectionId)?.name || 'Sem Repartição Específica'} | {t.pricingType === 'fixed' ? `Preço Fixo: R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : `${(t.defaultHours || 0) === 0 && (t.minutes || 0) === 0 ? 1 : t.defaultHours}h ${t.minutes ? `${t.minutes}m` : ''} x R$ ${(t.defaultValuePerHour || gross).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h (Total: R$ ${gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}
                                </span>
                                {linked && (
                                  <span className="text-[8px] text-amber-500/80 font-medium">
                                    ↳ Vinculado à M.O.: {linked.description} ({t.sharedNotes || 'Desconto configurado'})
                                  </span>
                                )}
                             </div>
                             <div className="flex items-center gap-1 shrink-0">
                               <button 
                                 type="button" 
                                 onClick={() => handleStartEditLaborTemplate(t)} 
                                 className="p-2.5 text-zinc-400 hover:text-green-500 hover:bg-zinc-900 rounded-xl transition-all" 
                                 title="Editar Modelo"
                               >
                                 <Pencil size={15} />
                               </button>
                               <button 
                                 type="button" 
                                 onClick={() => handleDeleteLaborTemplate(t.id)} 
                                 className="p-2.5 text-zinc-500 hover:text-red-500 hover:bg-zinc-900 rounded-xl transition-all" 
                                 title="Excluir Modelo"
                               >
                                 <Trash2 size={15} />
                               </button>
                             </div>
                           </div>

                           {/* Peças amarradas a este modelo */}
                           <div className="pt-2 border-t border-zinc-900 flex items-center justify-between flex-wrap gap-2">
                             <div className="flex items-center gap-1.5 flex-wrap">
                               <span className="text-[7.5px] font-black uppercase text-zinc-500 tracking-wider">
                                 Peças Amarradas:
                                </span>
                               {tiedPieces.length === 0 ? (
                                 <span className="text-[7.5px] text-zinc-600 italic">Nenhuma peça vinculada</span>
                               ) : (
                                 tiedPieces.map(p => (
                                   <span key={p.id} className="px-2 py-0.5 bg-zinc-900 text-zinc-300 border border-zinc-800 rounded text-[7.5px] font-mono">
                                     {p.name} ({p.partNumber || 'S/N'})
                                   </span>
                                 ))
                               )}
                             </div>
                             <span className="text-[7.5px] font-black uppercase text-green-400">
                               {tiedPieces.length} peça(s) no sistema
                             </span>
                           </div>
                        </div>
                      );
                    });
                    })()}
                   </div>
                 </div>
              </div>
            )}

            {configSubTab === 'groups' && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-[3rem] space-y-8 shadow-2xl animate-in fade-in">
                 <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-500 italic">Grupos Técnicos / Categorias</h4>
                    <Layers size={18} className="text-zinc-700" />
                 </div>
                 
                 {/* Form Criar Grupo */}
                 <form onSubmit={handleAddCategory} className="space-y-4">
                    <input 
                      required 
                      type="text" 
                      placeholder="NOME DO NOVO GRUPO TÉCNICO (EX: SISTEMA DE TURBO)" 
                      className="w-full bg-black border border-zinc-800 p-5 rounded-2xl text-white font-black text-[10px] uppercase outline-none focus:border-green-500/50 transition-all" 
                      value={newCategoryName} 
                      onChange={e => setNewCategoryName(e.target.value)} 
                    />
                    <button type="submit" className="w-full py-5 bg-green-500 text-black font-black uppercase text-[10px] rounded-2xl shadow-glow active:scale-95 transition-all">Criar Grupo Técnico</button>
                 </form>

                 <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {categories.length === 0 ? (
                       <p className="text-center py-10 text-zinc-650 font-black uppercase italic text-[10px]">Nenhum grupo técnico cadastrado</p>
                    ) : categories.map(cat => (
                      <div key={cat} className="p-6 bg-black rounded-[2rem] border border-zinc-800 flex flex-col gap-4">
                         {editingCategory?.original === cat ? (
                           <div className="flex gap-3">
                              <input 
                                type="text"
                                className="flex-1 bg-zinc-900 border border-zinc-700 px-4 py-2 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500"
                                value={editingCategory.current}
                                onChange={e => setEditingCategory({ ...editingCategory, current: e.target.value })}
                              />
                              <button onClick={() => handleUpdateCategory(cat, editingCategory.current)} className="px-4 py-2 bg-green-500 text-black text-[10px] font-black uppercase rounded-xl transition-all">Salvar</button>
                              <button onClick={() => setEditingCategory(null)} className="px-5 py-2 bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase rounded-xl transition-all">Cancelar</button>
                           </div>
                         ) : (
                           <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase italic text-white">{cat}</span>
                              <div className="flex gap-2">
                                 <button 
                                   onClick={() => setEditingCategory({ original: cat, current: cat })} 
                                   className="py-2 px-4 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold uppercase rounded-xl text-[9px] hover:border-green-500/30 hover:text-green-500 transition-all active:scale-95"
                                 >
                                   Editar
                                 </button>
                                 <button 
                                   onClick={() => handleDeleteCategory(cat)} 
                                   className="py-2 px-4 bg-red-500/10 text-red-500 font-bold uppercase rounded-xl text-[9px] hover:bg-red-500 hover:text-white transition-colors active:scale-95"
                                 >
                                   Excluir
                                 </button>
                              </div>
                           </div>
                         )}
                      </div>
                    ))}
                 </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé Moderno: Nome do Sistema ao Centro Inferior */}
        <footer className="mt-20 pb-12 flex flex-col items-center justify-center select-none text-center">
           <div className="flex items-center gap-3 px-6 py-3 bg-zinc-900/60 border border-zinc-800/60 rounded-full shadow-glow">
             <Smartphone size={16} className="text-green-500 animate-pulse" />
             <span className="text-xs font-black uppercase tracking-[0.1em] italic text-zinc-400">
               HPS <span className="text-white font-black">CONTROL</span>
             </span>
           </div>
           <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600 italic mt-3">Can-Am BRP Specialized System</p>
        </footer>

      </main>

      {/* Nav Mobile & Tablet */}
      <nav className="print-hidden lg:hidden fixed bottom-0 left-0 right-0 bg-black/95 border-t border-zinc-800 px-1.5 sm:px-4 py-2 flex justify-around items-center z-[150] backdrop-blur-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        {[
          { id: 'dashboard', label: 'Peças', icon: TrendingUp },
          { id: 'inventory', label: 'Estoque', icon: Layers },
          { id: 'service_orders', label: 'O.S.', icon: CheckCircle2 },
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex flex-col items-center gap-0.5 py-1 px-1.5 sm:px-3 rounded-xl transition-all min-w-0 ${activeTab === tab.id ? 'text-green-500 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <tab.icon size={19} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-tight truncate">{tab.label}</span>
          </button>
        ))}

        {/* QR Code Action Button */}
        <button 
          onClick={() => { setScanMode('search'); setIsScanning(true); }} 
          className="w-11 h-11 sm:w-12 sm:h-12 bg-green-500 rounded-2xl flex items-center justify-center -mt-7 border-2 border-zinc-950 shadow-glow active:scale-90 transition-all shrink-0"
          title="Escanear QR Code"
        >
          <QrCode size={20} className="text-black" strokeWidth={3} />
        </button>

        {[
          { id: 'history', label: 'Auditoria', icon: FileSpreadsheet },
          { id: 'labels', label: 'Etiquetas', icon: Printer },
          { id: 'config', label: 'Config', icon: Settings },
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex flex-col items-center gap-0.5 py-1 px-1.5 sm:px-3 rounded-xl transition-all min-w-0 ${activeTab === tab.id ? 'text-green-500 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <tab.icon size={19} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-tight truncate">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* MODAL ADICIONAR O.S. */}
      {isAddingOS && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex items-end sm:items-center justify-center backdrop-blur-xl p-2 sm:p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[3rem] w-full max-w-2xl shadow-[0_-20px_60px_rgba(34,197,94,0.15)] animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 duration-500 my-auto max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-7 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 shrink-0">
              <h3 className="text-xl sm:text-3xl font-black uppercase italic tracking-tighter text-green-500">Abertura de O.S.</h3>
              <button onClick={() => setIsAddingOS(false)} className="p-2.5 sm:p-3 bg-zinc-800 rounded-xl sm:rounded-2xl text-zinc-400 hover:text-white active:scale-90 transition-transform"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddOS} className="p-4 sm:p-8 space-y-5 sm:space-y-7 overflow-y-auto flex-1">
              <div className="space-y-4 sm:space-y-6">
                 {/* Seleção de Cliente Cadastrado (Opcional, mas se selecionado preenche e vincula) */}
                 <div className="space-y-1 sm:space-y-2">
                    <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic font-sans">Vincular Cliente Cadastrado (Opcional)</p>
                    <select 
                      className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none" 
                      value={osFormData.clientId} 
                      onChange={e => {
                        const selId = e.target.value;
                        const foundCli = clients.find(c => c.id === selId);
                        if (foundCli) {
                          setOsFormData({
                            ...osFormData,
                            clientId: selId,
                            customerName: foundCli.name,
                            vehicleId: '',
                            vehicleModel: ''
                          });
                        } else {
                          setOsFormData({
                            ...osFormData,
                            clientId: '',
                            customerName: '',
                            vehicleId: '',
                            vehicleModel: ''
                          });
                        }
                      }}
                    >
                      <option value="">-- NOVO CLIENTE (INSERIR MANUALMENTE) --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name.toUpperCase()} (CPF: {c.cpf || 'S/ CPF'})</option>
                      ))}
                    </select>
                 </div>

                 {/* Se tiver cliente selecionado, mostrar a lista de veículos dele */}
                 {osFormData.clientId && (
                   <div className="space-y-1 sm:space-y-2 animate-in slide-in-from-top-1 duration-200">
                      <p className="text-[9px] font-black uppercase text-green-500 ml-4 tracking-widest italic">Selecionar Veículo do Cliente</p>
                      <select 
                        required
                        className="w-full bg-zinc-950 border border-green-500/30 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none focus:border-green-500/50" 
                        value={osFormData.vehicleId} 
                        onChange={e => {
                          const vId = e.target.value;
                          const client = clients.find(c => c.id === osFormData.clientId);
                          const veh = client?.vehicles.find(v => v.id === vId);
                          if (veh) {
                            setOsFormData({
                              ...osFormData,
                              vehicleId: vId,
                              vehicleModel: `${veh.model.toUpperCase()} ${veh.plate ? `(PLACA: ${veh.plate.toUpperCase()})` : ''}`
                            });
                          } else {
                            setOsFormData({
                              ...osFormData,
                              vehicleId: '',
                              vehicleModel: ''
                            });
                          }
                        }}
                      >
                        <option value="">-- SELECIONE O VEÍCULO --</option>
                        {clients.find(c => c.id === osFormData.clientId)?.vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.model.toUpperCase()} {v.plate ? `[PLACA: ${v.plate.toUpperCase()}]` : ''}</option>
                        ))}
                      </select>
                   </div>
                 )}

                 <div className="space-y-1 sm:space-y-2">
                    <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Nome do Cliente</p>
                    <input required type="text" placeholder="EX: JOÃO DA SILVA" className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none read-only:text-zinc-500" value={osFormData.customerName} readOnly={!!osFormData.clientId} onChange={e => setOsFormData({...osFormData, customerName: e.target.value})} />
                 </div>
                 <div className="space-y-1 sm:space-y-2">
                    <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Modelo do Veículo</p>
                    <input required type="text" placeholder="EX: CAN-AM MAVERICK X3" className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none read-only:text-zinc-500" value={osFormData.vehicleModel} readOnly={!!osFormData.clientId && !!osFormData.vehicleId} onChange={e => setOsFormData({...osFormData, vehicleModel: e.target.value})} />
                 </div>

                 {/* CAMPO PASSAPORTE UTV (NA CRIAÇÃO DE OS) */}
                 <div className="bg-zinc-950/90 border-2 border-green-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] space-y-4">
                   <div className="flex flex-wrap items-center justify-between gap-2">
                     <div>
                       <p className="text-[10px] font-black uppercase text-green-400 tracking-widest italic flex items-center gap-2">
                         <Flag size={15} className="text-green-500" />
                         <span>Passaporte UTV (Competição, Histórico & Preventiva por KM)</span>
                       </p>
                       <p className="text-[9px] text-zinc-400 mt-0.5">
                         Vincule ou gerencie o Passaporte UTV com QR Code individual, próxima corrida, última manutenção e cálculo automático de troca de peças/óleos.
                       </p>
                     </div>
                     <button
                       type="button"
                       onClick={() => {
                         setIsAddingOS(false);
                         setActiveTab('service_orders');
                         setOsSubTab('passports');
                       }}
                       className="px-3 py-2 bg-green-500/15 hover:bg-green-500 hover:text-black text-green-400 border border-green-500/30 rounded-xl text-[8px] font-black uppercase transition-all flex items-center gap-1.5"
                     >
                       <QrCode size={12} /> Cadastrar / Gerenciar Passaportes UTV
                     </button>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[8px] font-black uppercase text-zinc-400 block">
                       Selecionar Passaporte UTV Cadastrado para esta O.S.:
                     </label>
                     <select
                       value={osFormData.passportId || ''}
                       onChange={e => {
                         const pid = e.target.value;
                         const foundP = utvPassports.find(p => p.id === pid);
                         if (foundP) {
                           const nextComp = (foundP.competitions || []).find(c => c.status === 'UPCOMING' || c.status === 'IN_PREP');
                           setOsFormData(prev => ({
                             ...prev,
                             passportId: foundP.id,
                             clientId: foundP.clientId || prev.clientId,
                             vehicleId: foundP.vehicleId || prev.vehicleId,
                             customerName: foundP.customerName || prev.customerName,
                             vehicleModel: `${foundP.vehicleNumber ? `${foundP.vehicleNumber} - ` : ''}${foundP.vehicleModel}`,
                             observations: prev.observations || `[PASSAPORTE UTV ${foundP.qrCode}] KM Atual: ${foundP.currentKm} km | Próxima Corrida: ${nextComp?.name || 'A definir'} | O que fazer: ${foundP.nextCompetitionPlan || ''}`
                           }));
                         } else {
                           setOsFormData(prev => ({ ...prev, passportId: '' }));
                           setOsInitialPartsList([]);
                         }
                       }}
                       className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3.5 rounded-xl text-white font-black text-xs uppercase outline-none"
                     >
                       <option value="">-- NENHUM PASSAPORTE UTV VINCULADO --</option>
                       {utvPassports.map(p => (
                         <option key={p.id} value={p.id}>
                           🏁 {p.vehicleNumber ? `${p.vehicleNumber} • ` : ''}{p.vehicleModel.toUpperCase()} — {p.customerName.toUpperCase()} (KM ATUAL: {p.currentKm} KM | QR: {p.qrCode})
                         </option>
                       ))}
                     </select>
                   </div>

                   {(() => {
                     const selPass = utvPassports.find(p => p.id === osFormData.passportId);
                     if (!selPass) return null;

                     const nextComp = (selPass.competitions || []).find(c => c.status === 'UPCOMING' || c.status === 'IN_PREP');
                     const dueItems = (selPass.maintenanceItems || []).filter(m => {
                       const nextKm = (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0);
                       return (nextKm - selPass.currentKm) <= 100;
                     });

                     return (
                       <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                         <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                           <div>
                             <span className="text-[8px] font-black uppercase text-green-400 font-mono">
                               QR CODE INDIVIDUAL: {selPass.qrCode}
                             </span>
                             <h5 className="text-xs font-black uppercase italic text-white">
                               {selPass.vehicleNumber} {selPass.vehicleModel} • Odômetro: <span className="text-green-400 font-mono">{selPass.currentKm} km</span>
                             </h5>
                           </div>
                           <div className="flex items-center gap-1.5">
                             <button
                               type="button"
                               onClick={() => setClientMirrorPassport(selPass)}
                               className="px-2.5 py-1.5 bg-blue-500/15 hover:bg-blue-500 hover:text-black text-blue-400 border border-blue-500/30 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 transition-all"
                             >
                               <Eye size={11} /> Espelho Cliente
                             </button>
                             <button
                               type="button"
                               onClick={() => {
                                 setIsAddingOS(false);
                                 setActiveTab('service_orders');
                                 setOsSubTab('passports');
                                 setSelectedPassport(selPass);
                               }}
                               className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[8px] font-black uppercase transition-all"
                             >
                               Abrir Ficha Completa
                             </button>
                           </div>
                         </div>

                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[9px]">
                           <div className="bg-black/60 border border-zinc-800/80 p-2.5 rounded-xl">
                             <span className="text-[7.5px] font-black uppercase text-zinc-500 block">🏁 Próxima Corrida & O que deverá ser feito:</span>
                             <p className="font-black text-amber-400 uppercase mt-0.5">{nextComp?.name || 'Não definida'}</p>
                             <p className="text-zinc-300 mt-1 line-clamp-2">{selPass.nextCompetitionPlan || 'Sem plano cadastrado'}</p>
                           </div>
                           <div className="bg-black/60 border border-zinc-800/80 p-2.5 rounded-xl">
                             <span className="text-[7.5px] font-black uppercase text-zinc-500 block">🔧 O que foi feito na última manutenção:</span>
                             <p className="text-zinc-300 mt-1 line-clamp-3">{selPass.lastMaintenanceSummary || 'Sem histórico anterior'}</p>
                           </div>
                         </div>

                         {/* Peças vencidas ou em atenção no Passaporte */}
                         <div className="space-y-1.5 pt-1">
                           <div className="flex items-center justify-between">
                             <span className="text-[8px] font-black uppercase text-zinc-400">
                               Peças/Fluidos com troca vencida ou próxima ({dueItems.length} de {selPass.maintenanceItems.length}):
                             </span>
                             {dueItems.length > 0 && (
                               <button
                                 type="button"
                                 onClick={() => {
                                   const newParts: OSPart[] = [];
                                   const newLabors: LaborItem[] = [...osLaborList];

                                   for (const m of dueItems) {
                                     const stockItem = items.find(i =>
                                       (m.itemId && i.id === m.itemId) ||
                                       (m.partNumber && i.partNumber.trim().toUpperCase() === m.partNumber.trim().toUpperCase())
                                     );
                                     const matchedT = stockItem ? findLaborTemplateForPart(stockItem, laborTemplates) : undefined;
                                     const laborId = generateId();

                                     if (matchedT && !newLabors.some(l => l.description.toLowerCase() === matchedT.description.toLowerCase())) {
                                       const gross = computeLaborGross(matchedT);
                                       newLabors.push({
                                         id: laborId,
                                         description: matchedT.description,
                                         pricingType: matchedT.pricingType || 'hourly',
                                         hours: matchedT.defaultHours || 1,
                                         minutes: matchedT.minutes || 0,
                                         valuePerHour: matchedT.defaultValuePerHour || currentTenant.defaultHourlyRate || 150,
                                         fixedValue: matchedT.fixedValue,
                                         section: vehicleSections.find(s => s.id === matchedT.sectionId)?.name,
                                         originalTotal: gross,
                                         finalTotal: gross,
                                         linkedPartIds: stockItem ? [stockItem.id] : undefined
                                       });
                                     }

                                     newParts.push({
                                       itemId: stockItem?.id || m.itemId || generateId(),
                                       name: stockItem?.name || m.name,
                                       partNumber: stockItem?.partNumber || m.partNumber || 'S/PN',
                                       quantity: Number(m.requiredQty) || 1,
                                       unitValue: stockItem?.value || 0,
                                       unit: stockItem?.unit || m.unit || 'un',
                                       linkedLaborId: matchedT ? laborId : undefined,
                                       linkedLaborDescription: matchedT?.description
                                     });
                                   }

                                   setOsInitialPartsList(newParts);
                                   setOsLaborList(newLabors);
                                   showAlert(
                                     "Itens do Passaporte Importados!",
                                     `${newParts.length} peça(s)/fluido(s) em manutenção do Passaporte UTV e suas respectivas mãos de obra foram carregados para esta O.S.!`,
                                     "success"
                                   );
                                 }}
                                 className="px-2.5 py-1 bg-green-500 hover:bg-green-400 text-black font-black text-[8px] uppercase rounded-lg transition-all shadow-sm"
                               >
                                 + Importar Peças Vencidas & M.O. para esta O.S.
                               </button>
                             )}
                           </div>

                           {dueItems.length > 0 && (
                             <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                               {dueItems.map(m => {
                                 const nextKm = (Number(m.lastChangeKm) || 0) + (Number(m.intervalKm) || 0);
                                 const stockItem = items.find(i =>
                                   (m.itemId && i.id === m.itemId) ||
                                   (m.partNumber && i.partNumber.trim().toUpperCase() === m.partNumber.trim().toUpperCase())
                                 );
                                 const hasStock = stockItem && stockItem.quantity >= (Number(m.requiredQty) || 1);
                                 return (
                                   <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-black border border-zinc-800 text-[9px]">
                                     <div>
                                       <span className="font-black text-white uppercase">{m.name}</span>
                                       <span className="text-zinc-500 font-mono ml-2">
                                         ({m.lastChangeKm} + {m.intervalKm} = Próx: {nextKm} km)
                                       </span>
                                     </div>
                                     <span className={`px-2 py-0.5 rounded font-black text-[7.5px] uppercase ${
                                       hasStock ? 'bg-green-500/15 text-green-400' : 'bg-red-500/20 text-red-400'
                                     }`}>
                                       {hasStock ? `EM ESTOQUE (${stockItem?.quantity})` : 'FALTA EM ESTOQUE'}
                                     </span>
                                   </div>
                                 );
                               })}
                             </div>
                           )}

                           {osInitialPartsList.length > 0 && (
                             <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-xl text-[9px] text-green-400 font-black uppercase flex items-center justify-between">
                               <span>✓ {osInitialPartsList.length} peça(s) do Passaporte UTV prontas para entrar na O.S.</span>
                               <button
                                 type="button"
                                 onClick={() => setOsInitialPartsList([])}
                                 className="text-red-400 hover:underline text-[8px]"
                               >
                                 Limpar
                               </button>
                             </div>
                           )}
                         </div>
                       </div>
                     );
                   })()}
                 </div>

                 {/* Mão de Obra e Serviços da OS (Uma ou Mais Mãos de Obra) */}
                 <div className="bg-black/40 border border-zinc-800 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black uppercase text-green-500 tracking-widest italic flex items-center gap-2">
                        <Wrench size={14} />
                        <span>Mão de Obra / Serviços da O.S. *</span>
                      </p>
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-wider">
                        {osLaborList.length} serviço(s) adicionado(s)
                      </span>
                    </div>

                    {/* Lista de Mão de Obra já adicionada */}
                    {osLaborList.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {osLaborList.map((item, idx) => {
                          const gross = getLaborOriginalValue(item);
                          const finalVal = getLaborFinalValue(item);
                          const discount = gross - finalVal;
                          const isShared = Boolean(item.isShared || item.linkedToId || discount > 0);
                          const isFixed = item.pricingType === 'fixed';
                          const linkedLabor = item.linkedToId ? osLaborList.find(l => l.id === item.linkedToId) : null;

                          return (
                            <div key={item.id || idx} className={`flex justify-between items-center p-3.5 bg-zinc-900 border ${isShared ? 'border-amber-500/40 bg-amber-950/10' : 'border-zinc-800'} rounded-xl`}>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-white text-xs font-black uppercase italic">{item.description}</span>
                                  {isFixed ? (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-[7.5px] font-black uppercase tracking-wider">
                                      ⚡ DIFICULDADE (FIXO)
                                    </span>
                                  ) : isShared ? (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-[7.5px] font-black uppercase tracking-wider">
                                      🔗 M.O. COMPARTILHADA (-{item.discountPercentage || Math.round((discount / (gross || 1)) * 100)}%)
                                    </span>
                                  ) : null}
                                </div>
                                {isFixed ? (
                                  <span className="text-[8px] text-amber-400 font-bold uppercase">
                                    ⚡ Valor Fixo Específico: R$ {(item.fixedValue || item.originalTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {item.section ? `• ${item.section}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-[8px] text-zinc-500 font-bold uppercase">
                                    {item.hours}h {item.minutes ? `${item.minutes}m` : ''} x R$ {item.valuePerHour}/h {item.section ? `• ${item.section}` : ''}
                                  </span>
                                )}
                                {isShared && (
                                  <span className="text-[8px] text-amber-400/90 italic">
                                    ↳ Desconto de aproveitamento técnico{linkedLabor ? ` (vinculado a "${linkedLabor.description}")` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col items-end">
                                  {discount > 0 && (
                                    <span className="text-[9px] text-zinc-500 line-through font-mono">
                                      R$ {gross.toLocaleString('pt-BR')}
                                    </span>
                                  )}
                                  <span className="text-xs font-black text-green-500 font-mono">
                                    R$ {finalVal.toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveLaborFromOSCreation(item.id)} 
                                  className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                                  title="Remover este serviço"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-between items-center pr-2 pt-1 border-t border-zinc-800/60">
                          {(() => {
                            const totalGross = osLaborList.reduce((sum, l) => sum + getLaborOriginalValue(l), 0);
                            const totalNet = osLaborList.reduce((sum, l) => sum + getLaborFinalValue(l), 0);
                            const totalDiscount = totalGross - totalNet;
                            return (
                              <>
                                <div>
                                  {totalDiscount > 0 && (
                                    <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                      Economia M.O. Compartilhada: - R$ {totalDiscount.toLocaleString('pt-BR')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] font-black uppercase text-zinc-400">Total Mão de Obra: </span>
                                  <span className="text-xs font-black text-green-500 font-mono">
                                    R$ {totalNet.toLocaleString('pt-BR')}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Adicionar Mão de Obra de Modelo Cadastrado (Ordem Alfabética A-Z + Barra de Pesquisa) */}
                    {(() => {
                      const sortedCreateTemplates = [...laborTemplates].sort((a, b) =>
                        (a.description || '').localeCompare(b.description || '', 'pt-BR', { sensitivity: 'base' })
                      );
                      const cleanCreateQuery = osCreateLaborSearch.trim().toLowerCase();
                      const filteredCreateTemplates = cleanCreateQuery
                        ? sortedCreateTemplates.filter(t => {
                            const secName = (vehicleSections.find(s => s.id === t.sectionId)?.name || '').toLowerCase();
                            return (t.description || '').toLowerCase().includes(cleanCreateQuery) || secName.includes(cleanCreateQuery);
                          })
                        : sortedCreateTemplates;

                      return (
                        <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">+ Selecionar Mão de Obra Cadastrada (Ordem A-Z):</p>
                            <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase">
                              {filteredCreateTemplates.length} de {sortedCreateTemplates.length} M.O.
                            </span>
                          </div>
                          {/* Barra de Pesquisa de M.O. do Catálogo */}
                          <div className="relative">
                            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                            <input
                              type="text"
                              value={osCreateLaborSearch}
                              onChange={e => setOsCreateLaborSearch(e.target.value)}
                              placeholder="PESQUISAR M.O. NO CATÁLOGO POR NOME OU SETOR..."
                              className="w-full bg-zinc-950 border border-zinc-800 focus:border-green-500 pl-9 pr-8 py-2.5 rounded-xl text-white font-bold text-[11px] uppercase outline-none transition-colors placeholder:text-zinc-600"
                            />
                            {osCreateLaborSearch && (
                              <button
                                type="button"
                                onClick={() => setOsCreateLaborSearch('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white rounded-lg"
                                title="Limpar filtro"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>

                          {/* Resultados rápidos clicáveis quando o usuário estiver pesquisando */}
                          {cleanCreateQuery && (
                            <div className="max-h-40 overflow-y-auto custom-scrollbar bg-zinc-950 border border-zinc-800 rounded-xl divide-y divide-zinc-800/70">
                              {filteredCreateTemplates.length === 0 ? (
                                <p className="p-3 text-[10px] text-zinc-500 font-bold uppercase text-center">
                                  Nenhuma M.O. encontrada para "{osCreateLaborSearch}"
                                </p>
                              ) : (
                                filteredCreateTemplates.map(t => {
                                  const g = computeLaborGross(t);
                                  const secName = vehicleSections.find(s => s.id === t.sectionId)?.name;
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => {
                                        handleAddLaborToOSCreation(t.id);
                                        setOsFormData({ ...osFormData, laborTemplateId: '' });
                                        setOsCreateLaborSearch('');
                                      }}
                                      className="w-full px-3 py-2.5 text-left hover:bg-green-500/15 flex items-center justify-between gap-2 transition-colors group"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-black text-white uppercase truncate group-hover:text-green-400">
                                          {t.description}
                                        </p>
                                        <p className="text-[9px] text-zinc-500 uppercase font-bold">
                                          {secName ? `${secName} • ` : ''}
                                          {t.pricingType === 'fixed'
                                            ? `Valor Fixo / Dificuldade`
                                            : `${t.defaultHours}H${t.minutes ? ` ${t.minutes}M` : ''}`}
                                          {t.linkedTemplateId ? ' • [M.O. COMPARTILHADA]' : ''}
                                        </p>
                                      </div>
                                      <span className="text-[11px] font-mono font-black text-green-400 shrink-0">
                                        + R$ {(t.pricingType === 'fixed' ? (t.fixedValue || 0) : g).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-2">
                            <select 
                              className="flex-1 bg-black border border-zinc-800 p-3 sm:p-4 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500" 
                              value={osFormData.laborTemplateId} 
                              onChange={e => setOsFormData({...osFormData, laborTemplateId: e.target.value})}
                            >
                              <option value="">-- SELECIONE UM MODELO DE SERVIÇO ({filteredCreateTemplates.length} EM ORDEM A-Z) --</option>
                              {filteredCreateTemplates.map(t => {
                                const g = computeLaborGross(t);
                                return (
                                  <option key={t.id} value={t.id}>
                                    {t.description.toUpperCase()} - {t.pricingType === 'fixed' ? `⚡ R$ ${(t.fixedValue || 0).toLocaleString('pt-BR')} [DIFICULDADE]` : `R$ ${g.toLocaleString('pt-BR')} (${t.defaultHours}H${t.minutes ? ` ${t.minutes}M` : ''})`}{t.linkedTemplateId ? ' [M.O. COMPARTILHADA]' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <button 
                              type="button" 
                              onClick={() => {
                                if (osFormData.laborTemplateId) {
                                  handleAddLaborToOSCreation(osFormData.laborTemplateId);
                                  setOsFormData({...osFormData, laborTemplateId: ''});
                                  setOsCreateLaborSearch('');
                                }
                              }}
                              className="px-4 py-3 bg-zinc-800 hover:bg-green-500 hover:text-black text-zinc-300 font-black text-[9px] uppercase rounded-xl transition-all whitespace-nowrap active:scale-95"
                            >
                              + Incluir na O.S.
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Ou Adicionar Mão de Obra Customizada / Específica */}
                    <div className="pt-2">
                      {!isAddingCustomLabor ? (
                        <button 
                          type="button" 
                          onClick={() => setIsAddingCustomLabor(true)}
                          className="text-[8px] font-black uppercase text-green-400 hover:underline flex items-center gap-1.5"
                        >
                          <Plus size={12} /> + Inserir Serviço Customizado / Diferenciado
                        </button>
                      ) : (
                        <div className="bg-zinc-950/80 border border-zinc-800 p-4 rounded-xl space-y-3 animate-in fade-in duration-150">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black text-zinc-400 uppercase">Serviço Personalizado:</span>
                            <button type="button" onClick={() => setIsAddingCustomLabor(false)} className="text-[8px] text-zinc-500 hover:text-white uppercase font-bold">Cancelar</button>
                          </div>
                          <input 
                            type="text" 
                            placeholder="DESCRIÇÃO DO SERVIÇO" 
                            value={customLaborInput.description} 
                            onChange={e => setCustomLaborInput({...customLaborInput, description: e.target.value})}
                            className="w-full bg-black border border-zinc-800 p-2.5 rounded-lg text-white font-black text-xs uppercase outline-none"
                          />
                          {/* Seletor de Modalidade: Tempo vs Dificuldade */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setCustomLaborInput({ ...customLaborInput, pricingType: 'hourly' })}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                                customLaborInput.pricingType === 'hourly'
                                  ? 'bg-green-500/15 border-green-500 text-white'
                                  : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                              }`}
                            >
                              <Clock size={16} className={customLaborInput.pricingType === 'hourly' ? 'text-green-400' : 'text-zinc-600'} />
                              <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase block">⏱️ Por Tempo</span>
                                <span className="text-[8px] text-zinc-400 block truncate">Horas e minutos</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCustomLaborInput({ ...customLaborInput, pricingType: 'fixed' })}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                                customLaborInput.pricingType === 'fixed'
                                  ? 'bg-amber-500/15 border-amber-500 text-white'
                                  : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                              }`}
                            >
                              <Zap size={16} className={customLaborInput.pricingType === 'fixed' ? 'text-amber-400' : 'text-zinc-600'} />
                              <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase block">⚡ Por Dificuldade</span>
                                <span className="text-[8px] text-zinc-400 block truncate">Preço fixo específico</span>
                              </div>
                            </button>
                          </div>

                          {customLaborInput.pricingType === 'hourly' ? (
                            <div className="space-y-2 bg-black/60 p-3 rounded-xl border border-zinc-800">
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">Horas</label>
                                  <input 
                                    type="number" 
                                    min="0"
                                    step="1"
                                    placeholder="0" 
                                    value={customLaborInput.hours} 
                                    onChange={e => setCustomLaborInput({...customLaborInput, hours: Math.max(0, parseInt(e.target.value) || 0)})}
                                    className="w-full bg-black border border-zinc-700 p-2.5 rounded-lg text-white font-mono font-black text-xs outline-none focus:border-green-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">Minutos (0-59)</label>
                                  <input 
                                    type="number" 
                                    min="0"
                                    max="59"
                                    step="1"
                                    placeholder="0" 
                                    value={customLaborInput.minutes || 0} 
                                    onChange={e => setCustomLaborInput({...customLaborInput, minutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0))})}
                                    className="w-full bg-black border border-zinc-700 p-2.5 rounded-lg text-white font-mono font-black text-xs outline-none focus:border-green-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">Valor/Hora (R$)</label>
                                  <input 
                                    type="number" 
                                    step="any"
                                    placeholder="150" 
                                    value={customLaborInput.valuePerHour || ''} 
                                    onChange={e => setCustomLaborInput({...customLaborInput, valuePerHour: parseFloat(e.target.value) || 0})}
                                    className="w-full bg-black border border-zinc-700 p-2.5 rounded-lg text-green-400 font-mono font-black text-xs outline-none focus:border-green-500"
                                  />
                                </div>
                              </div>

                              {/* Chips rápidos de tempo */}
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[7px] font-black uppercase text-zinc-500 mr-1">Rápido:</span>
                                {[
                                  { label: '15m', h: 0, m: 15 },
                                  { label: '30m', h: 0, m: 30 },
                                  { label: '45m', h: 0, m: 45 },
                                  { label: '1h', h: 1, m: 0 },
                                  { label: '1h 30m', h: 1, m: 30 },
                                  { label: '2h', h: 2, m: 0 }
                                ].map(p => (
                                  <button
                                    key={p.label}
                                    type="button"
                                    onClick={() => setCustomLaborInput({ ...customLaborInput, hours: p.h, minutes: p.m })}
                                    className={`px-2 py-0.5 rounded text-[8px] font-mono font-black transition-all ${
                                      customLaborInput.hours === p.h && (customLaborInput.minutes || 0) === p.m
                                        ? 'bg-green-500 text-black'
                                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>

                              {/* Banner demonstrativo do cálculo proporcional */}
                              {(() => {
                                const h = customLaborInput.hours || 0;
                                const m = customLaborInput.minutes || 0;
                                const rate = customLaborInput.valuePerHour || 0;
                                const totalH = h + (m / 60);
                                const calc = Number((totalH * rate).toFixed(2));
                                return (
                                  <div className="p-2 bg-black border border-zinc-800 rounded-lg flex items-center justify-between text-[8px] font-mono">
                                    <span className="text-zinc-400">
                                      ({h}h {m > 0 ? `+ ${m}min` : ''}) x R$ {rate}/h
                                    </span>
                                    <span className="text-green-400 font-black">
                                      = R$ {calc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-950/15 border border-amber-500/30 rounded-xl space-y-2">
                              <label className="text-[8px] font-black uppercase text-amber-400 block">
                                ⚡ Valor Específico do Serviço por Dificuldade (R$)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs font-bold">R$</span>
                                <input 
                                  type="number" 
                                  step="any"
                                  placeholder="Ex: 350.00" 
                                  value={customLaborInput.fixedValue || ''} 
                                  onChange={e => setCustomLaborInput({...customLaborInput, fixedValue: parseFloat(e.target.value) || 0})}
                                  className="w-full bg-black border border-amber-500/40 pl-9 pr-3 py-2.5 rounded-lg text-amber-400 font-mono font-black text-xs outline-none focus:border-amber-400"
                                />
                              </div>
                              <p className="text-[7.5px] text-zinc-400">
                                Preço fixo cobrado exclusivamente pela complexidade do serviço. Não soma taxa horária e não vincula a outro serviço.
                              </p>
                            </div>
                          )}

                          <div>
                            <select
                              value={customLaborInput.section}
                              onChange={e => setCustomLaborInput({...customLaborInput, section: e.target.value})}
                              className="w-full bg-black border border-zinc-800 p-2.5 rounded-lg text-white font-bold text-[10px] uppercase outline-none"
                            >
                              <option value="">SETOR DO VEÍCULO (OPCIONAL)</option>
                              {vehicleSections.map(s => <option key={s.id} value={s.name}>{s.name.toUpperCase()}</option>)}
                            </select>
                          </div>

                          {/* OPÇÃO MANUAL: MARCAR COMO MÃO DE OBRA COMPARTILHADA */}
                          {osLaborList.length > 0 && (
                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={customLaborInput.isShared}
                                  onChange={e => setCustomLaborInput({
                                    ...customLaborInput,
                                    isShared: e.target.checked,
                                    linkedToId: e.target.checked ? (customLaborInput.linkedToId || osLaborList[0].id) : ''
                                  })}
                                  className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                                />
                                <span className="text-[9px] font-black uppercase text-amber-400">
                                  🔗 Marcar Manualmente como M.O. Compartilhada (com Desconto)
                                </span>
                              </label>

                              {customLaborInput.isShared && (
                                <div className="space-y-2 pt-1">
                                  <div>
                                    <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">
                                      Vincular a qual serviço já existente na O.S.?
                                    </label>
                                    <select
                                      className="w-full bg-black border border-zinc-700 p-2 rounded text-white font-bold text-[9px] uppercase"
                                      value={customLaborInput.linkedToId}
                                      onChange={e => setCustomLaborInput({...customLaborInput, linkedToId: e.target.value})}
                                    >
                                      {osLaborList.map(l => (
                                        <option key={l.id} value={l.id}>
                                          {l.description.toUpperCase()} ({l.pricingType === 'fixed' ? `⚡ R$ ${(l.fixedValue || l.originalTotal || 0).toLocaleString('pt-BR')}` : `${l.hours}h${l.minutes ? ` ${l.minutes}m` : ''} - R$ ${computeLaborGross(l).toLocaleString('pt-BR')}`})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">Tipo Desconto</label>
                                      <select
                                        className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-[9px]"
                                        value={customLaborInput.discountType}
                                        onChange={e => setCustomLaborInput({
                                          ...customLaborInput,
                                          discountType: e.target.value as 'percentage' | 'fixed'
                                        })}
                                      >
                                        <option value="percentage">PORCENTAGEM (%)</option>
                                        <option value="fixed">VALOR FIXO (R$)</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">
                                        {customLaborInput.discountType === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-full bg-black border border-zinc-700 p-2 rounded text-amber-400 font-mono text-xs font-black"
                                        value={customLaborInput.discountType === 'percentage' ? customLaborInput.discountPercentage : customLaborInput.discountValue}
                                        onChange={e => {
                                          const v = parseFloat(e.target.value) || 0;
                                          if (customLaborInput.discountType === 'percentage') {
                                            setCustomLaborInput({...customLaborInput, discountPercentage: v});
                                          } else {
                                            setCustomLaborInput({...customLaborInput, discountValue: v});
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">Justificativa Técnica</label>
                                    <input
                                      type="text"
                                      placeholder="Ex: Metade do serviço executado na primeira M.O. (desmontagem)"
                                      className="w-full bg-black border border-zinc-700 p-2 rounded text-zinc-200 text-[9px]"
                                      value={customLaborInput.sharedReason}
                                      onChange={e => setCustomLaborInput({...customLaborInput, sharedReason: e.target.value})}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <button 
                            type="button" 
                            onClick={handleAddCustomLaborToOSCreation}
                            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black text-[9px] uppercase rounded-lg transition-all"
                          >
                            + Confirmar e Inserir Serviço
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                 {/* Seleção de Mecânico Vinculado (Se cadastrado) */}
                 {users.some(u => u.role === UserRole.MECHANIC) && (
                   <div className="space-y-1 sm:space-y-2 animate-in fade-in duration-200">
                      <p className="text-[9px] font-black uppercase text-green-500 ml-4 tracking-widest italic">Vincular Mecânico Responsável *</p>
                      <select 
                        required
                        className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none focus:border-green-500" 
                        value={osFormData.mechanicId} 
                        onChange={e => setOsFormData({...osFormData, mechanicId: e.target.value})}
                      >
                        <option value="">-- SELECIONE UM MECÂNICO RESPONSÁVEL --</option>
                        {users.filter(u => u.role === UserRole.MECHANIC).map(m => (
                           <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>
                        ))}
                      </select>
                   </div>
                 )}

                 <div className="space-y-1 sm:space-y-2">
                    <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Observações Iniciais</p>
                    <textarea placeholder="DESCREVA O PROBLEMA OU SERVIÇO" className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none h-32 resize-none" value={osFormData.observations} onChange={e => setOsFormData({...osFormData, observations: e.target.value})} />
                 </div>
              </div>
              <button type="submit" className="w-full py-5 sm:py-6 bg-green-500 text-black font-black uppercase text-[11px] sm:text-xs rounded-2xl shadow-glow active:scale-95 transition-all">Abrir Ordem de Serviço</button>
            </form>
          </div>
        </div>
      )}

      {/* DETALHES O.S. MODAL */}
      {selectedOS && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[350] flex flex-col overflow-hidden animate-in fade-in duration-300 print-hidden">
           <header className="p-3 sm:p-5 lg:p-6 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-xl shrink-0">
             <div className="flex flex-col min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                   <span className="text-[10px] sm:text-xs font-black text-green-500 uppercase tracking-[0.15em] italic">O.S. #{selectedOS.osNumber}</span>
                   <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                     selectedOS.status === OSStatus.COMPLETED ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                     selectedOS.status === OSStatus.IN_PROGRESS ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                     selectedOS.status === OSStatus.CANCELLED ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                     'bg-green-500/20 text-green-400 border border-green-500/30'
                   }`}>
                     {selectedOS.status === OSStatus.COMPLETED
                       ? 'FINALIZADA / ARQUIVADA'
                       : selectedOS.status === OSStatus.OPEN
                       ? 'OPEN (ABERTA)'
                       : selectedOS.status}
                   </span>
                   <span className="text-[8px] sm:text-[8.5px] font-bold text-zinc-500 uppercase">
                     Aberta: {new Date(selectedOS.createdAt).toLocaleDateString('pt-BR')} {new Date(selectedOS.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                   </span>
                   {(selectedOS.status === OSStatus.COMPLETED || selectedOS.completedAt) && (
                     <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[8px] sm:text-[8.5px] font-black uppercase flex items-center gap-1">
                       <Clock size={10} />
                       Finalizada: {new Date(selectedOS.completedAt || selectedOS.updatedAt).toLocaleDateString('pt-BR')} às {new Date(selectedOS.completedAt || selectedOS.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                     </span>
                   )}
                </div>
                <span className="text-sm sm:text-lg lg:text-xl font-black text-white uppercase tracking-tight italic mt-0.5 truncate">
                   {selectedOS.customerName} — {selectedOS.vehicleModel}
                </span>
                {selectedOS.mechanicName && (
                  <span className="text-[8.5px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 italic flex items-center gap-1.5">
                    <span>👷 MECÂNICO:</span>
                    <span className="text-green-400">{selectedOS.mechanicName.toUpperCase()}</span>
                  </span>
                )}
             </div>
             <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingOSHeader) {
                      setIsEditingOSHeader(false);
                    } else {
                      handleStartEditOSHeader(selectedOS);
                    }
                  }}
                  className={`px-3 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 border transition-all ${
                    isEditingOSHeader
                      ? 'bg-amber-500 text-black border-amber-500'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title="Alterar Cliente, Veículo, Mecânico ou Observações desta O.S."
                >
                  <Pencil size={13} />
                  <span>{isEditingOSHeader ? 'Fechar Edição' : 'Editar Dados da O.S.'}</span>
                </button>
                {(() => {
                  const linkedP = selectedOS.passportId ? utvPassports.find(p => p.id === selectedOS.passportId) : undefined;
                  if (!linkedP) return null;
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOS(null);
                          setActiveTab('service_orders');
                          setOsSubTab('passports');
                          setSelectedPassport(linkedP);
                        }}
                        className="px-3 py-2.5 bg-green-500/15 hover:bg-green-500 hover:text-black text-green-400 border border-green-500/30 rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 transition-all"
                        title="Abrir Passaporte UTV deste veículo"
                      >
                        <Flag size={14} />
                        <span className="hidden sm:inline">Passaporte UTV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientMirrorPassport(linkedP)}
                        className="px-3 py-2.5 bg-blue-500/15 hover:bg-blue-500 hover:text-black text-blue-400 border border-blue-500/30 rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 transition-all"
                        title="Abrir Espelho do Cliente (Somente Leitura)"
                      >
                        <Eye size={14} />
                        <span className="hidden sm:inline">Espelho Cliente</span>
                      </button>
                    </>
                  );
                })()}
                {selectedOS.status !== OSStatus.COMPLETED ? (
                  <button
                    type="button"
                    onClick={() => updateOSStatus(selectedOS.id, OSStatus.COMPLETED)}
                    className="px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                    title="Finalizar esta O.S., gravar data/hora de auditoria e arquivar"
                  >
                    <CheckCircle2 size={15} />
                    <span>Finalizar O.S.</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateOSStatus(selectedOS.id, OSStatus.OPEN)}
                    className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                    title="Reabrir esta O.S. e retorná-la para a tela principal (OPEN)"
                  >
                    <RotateCcw size={15} />
                    <span>Reabrir O.S. (OPEN)</span>
                  </button>
                )}
                <select 
                  className="bg-zinc-800 border border-zinc-700 text-white font-black text-[10px] uppercase px-3 py-2.5 rounded-xl outline-none focus:border-green-500"
                  value={selectedOS.status}
                  onChange={(e) => updateOSStatus(selectedOS.id, e.target.value as OSStatus)}
                >
                  {Object.values(OSStatus).map(s => {
                    const label = s === OSStatus.OPEN ? 'OPEN (ABERTA)' :
                                  s === OSStatus.IN_PROGRESS ? 'EM ANDAMENTO' :
                                  s === OSStatus.COMPLETED ? 'FINALIZADA / ARQUIVADA' :
                                  s === OSStatus.CANCELLED ? 'CANCELADA' : s;
                    return <option key={s} value={s}>{label}</option>;
                  })}
                </select>
                <button 
                  type="button" 
                  onClick={() => setShowOSDocumentPreview(true)} 
                  className="px-3.5 py-2.5 bg-green-500 hover:bg-green-400 text-black rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                  title="Visualizar e Salvar Relatório PDF no Computador"
                >
                  <FileText size={15} />
                  <span className="hidden sm:inline">Relatório PDF / Salvar</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowOSDocumentPreview(true)} 
                  className="px-3.5 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                  title="Imprimir Ordem de Serviço em A4"
                >
                  <Printer size={15} />
                  <span className="hidden sm:inline">Imprimir A4</span>
                </button>
                <button 
                  onClick={() => {
                    setSelectedOS(null);
                    setIsEditingOSHeader(false);
                    setOsPartSearchTerm('');
                    setOsPartFormData({ itemId: '', quantity: 1 });
                  }} 
                  className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-white transition-colors"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
             </div>
           </header>

           <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6">
              {/* BANNER DE AUDITORIA DE FINALIZAÇÃO E EDIÇÃO PÓS-FECHAMENTO */}
              {(selectedOS.status === OSStatus.COMPLETED || selectedOS.completedAt) && (
                <div className="bg-emerald-950/30 border border-emerald-500/40 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-400">
                      <CheckCircle2 size={16} />
                      <span>Registro de Auditoria • Ordem de Serviço Finalizada e Arquivada</span>
                    </div>
                    <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                      Data e Hora da Finalização:{' '}
                      <strong className="text-white font-mono bg-black/70 px-2 py-0.5 rounded border border-emerald-500/30">
                        {new Date(selectedOS.completedAt || selectedOS.updatedAt).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(selectedOS.completedAt || selectedOS.updatedAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </strong>
                      {selectedOS.completedBy ? ` • Finalizada por: ${selectedOS.completedBy}` : ''}
                    </p>
                  </div>
                  <div className="px-3.5 py-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-[9px] font-black uppercase text-amber-300 flex items-center gap-2 shrink-0">
                    <Pencil size={13} />
                    <span>Alterações Pós-Fechamento Habilitadas (Peças, Quantidades, M.O. e Dados)</span>
                  </div>
                </div>
              )}

              {/* PAINEL DE EDIÇÃO DOS DADOS PRINCIPAIS DA O.S. (CLIENTE, VEÍCULO, MECÂNICO, OBSERVAÇÕES) */}
              {isEditingOSHeader && (
                <form
                  onSubmit={handleSaveOSHeaderEdit}
                  className="bg-zinc-900 border-2 border-amber-500/40 p-5 sm:p-6 rounded-3xl space-y-4 shadow-2xl animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-400 italic">
                      <Pencil size={15} />
                      <span>Editar Dados Cadastrais e Observações da O.S. #{selectedOS.osNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingOSHeader(false)}
                      className="text-[9px] font-black uppercase text-zinc-400 hover:text-white"
                    >
                      Cancelar ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-zinc-400 ml-2">Nome do Cliente *</label>
                      <input
                        required
                        type="text"
                        value={osHeaderEditData.customerName}
                        onChange={e => setOsHeaderEditData({ ...osHeaderEditData, customerName: e.target.value })}
                        className="w-full bg-black border border-zinc-800 focus:border-amber-500 p-3.5 rounded-xl text-xs font-black text-white uppercase outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-zinc-400 ml-2">Veículo / Modelo *</label>
                      <input
                        required
                        type="text"
                        value={osHeaderEditData.vehicleModel}
                        onChange={e => setOsHeaderEditData({ ...osHeaderEditData, vehicleModel: e.target.value })}
                        className="w-full bg-black border border-zinc-800 focus:border-amber-500 p-3.5 rounded-xl text-xs font-black text-white uppercase outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-zinc-400 ml-2">Mecânico Responsável</label>
                      <select
                        value={osHeaderEditData.mechanicId}
                        onChange={e => setOsHeaderEditData({ ...osHeaderEditData, mechanicId: e.target.value })}
                        className="w-full bg-black border border-zinc-800 focus:border-amber-500 p-3.5 rounded-xl text-xs font-black text-white uppercase outline-none"
                      >
                        <option value="">Sem Mecânico Específico / Geral</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role === UserRole.MECHANIC ? 'Mecânico' : 'Admin/Estoquista'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-zinc-400 ml-2">Observações Técnicas da O.S.</label>
                    <textarea
                      value={osHeaderEditData.observations}
                      onChange={e => setOsHeaderEditData({ ...osHeaderEditData, observations: e.target.value })}
                      className="w-full bg-black border border-zinc-800 focus:border-amber-500 p-3.5 rounded-xl text-xs font-bold text-white uppercase outline-none h-20 resize-none"
                      placeholder="Observações técnicas, anotações ou histórico de alterações..."
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsEditingOSHeader(false)}
                      className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[10px] font-black uppercase"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-[10px] font-black uppercase shadow-lg"
                    >
                      Salvar Alterações na O.S.
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mão de Obra */}
                <div className="bg-zinc-900/90 border border-zinc-800 p-5 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 shadow-xl">
                   <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 italic flex items-center gap-2">
                        <Wrench size={14} /> Mão de Obra / Serviços ({selectedOS.laborItems.length})
                      </h4>
                      <div className="text-right">
                        {(() => {
                          const gross = selectedOS.laborItems.reduce((acc, l) => acc + getLaborOriginalValue(l), 0);
                          const net = selectedOS.laborItems.reduce((acc, l) => acc + getLaborFinalValue(l), 0);
                          const disc = gross - net;
                          return (
                            <div className="flex flex-col items-end">
                              {disc > 0 && (
                                <span className="text-[8px] text-amber-400 font-bold uppercase">
                                  Economia M.O.: - R$ {disc.toLocaleString('pt-BR')}
                                </span>
                              )}
                              <span className="text-[9px] font-mono text-green-400 font-black">
                                Total: R$ {net.toLocaleString('pt-BR')}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                   </div>
                   <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {selectedOS.laborItems.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 italic text-center py-4">Nenhum serviço vinculado a esta O.S.</p>
                      ) : selectedOS.laborItems.map(labor => {
                        const linkedItems = selectedOS.laborItems.filter(l => l.linkedToId === labor.id);
                        if (labor.linkedToId) return null; // Don't show linked items as top-level

                        const gross = getLaborOriginalValue(labor);
                        const finalVal = getLaborFinalValue(labor);
                        const discount = gross - finalVal;
                        const isShared = Boolean(labor.isShared || labor.linkedToId || discount > 0);
                        const isFixed = labor.pricingType === 'fixed';
                        const linkedPartsForLabor = selectedOS.parts
                          .map((p, pIdx) => ({ part: p, pIdx }))
                          .filter(({ part }) =>
                            part.linkedLaborId === labor.id ||
                            (!part.linkedLaborId && part.linkedLaborDescription && part.linkedLaborDescription.toLowerCase() === labor.description.toLowerCase())
                          );
                        const isManagingThisLaborParts = managingPartsForLaborId === labor.id;

                        return (
                          <div key={labor.id} className="space-y-2">
                            <div className={`p-4 bg-black rounded-xl border ${isShared ? 'border-amber-500/40' : 'border-zinc-800'} hover:border-zinc-700 transition-colors space-y-2.5`}>
                              <div className="flex justify-between items-center gap-2">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                   <div className="flex items-center gap-2 flex-wrap">
                                     <span className="text-xs font-black uppercase italic text-white">{labor.description}</span>
                                     {labor.section && <span className="px-2 py-0.5 bg-zinc-800 rounded text-[7px] font-black text-zinc-400 uppercase">{labor.section}</span>}
                                     {isFixed ? (
                                       <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-[7px] font-black uppercase">
                                         ⚡ DIFICULDADE (FIXO)
                                       </span>
                                     ) : isShared ? (
                                       <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-[7px] font-black uppercase">
                                         🔗 COMPARTILHADA (-{labor.discountPercentage || Math.round((discount / (gross || 1)) * 100)}%)
                                       </span>
                                     ) : null}
                                   </div>
                                   {isFixed ? (
                                     <span className="text-[8px] text-amber-400 font-bold uppercase">
                                       ⚡ Valor Fixo: R$ {gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                     </span>
                                   ) : (
                                     <span className="text-[8px] text-zinc-500 font-bold uppercase">
                                       {labor.hours}h {labor.minutes ? `${labor.minutes}m` : ''} x R$ {labor.valuePerHour}/h
                                     </span>
                                   )}
                                   {labor.sharedReason && (
                                     <span className="text-[8px] text-amber-400/90 italic">
                                       ↳ {labor.sharedReason}
                                     </span>
                                   )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                   <div className="flex flex-col items-end">
                                     {discount > 0 && (
                                       <span className="text-[9px] text-zinc-500 line-through font-mono">
                                         R$ {gross.toLocaleString('pt-BR')}
                                       </span>
                                     )}
                                     <span className="text-sm font-black text-green-500 font-mono">
                                       R$ {finalVal.toLocaleString('pt-BR')}
                                     </span>
                                   </div>
                                   <button
                                     type="button"
                                     onClick={() => setManagingPartsForLaborId(isManagingThisLaborParts ? null : labor.id)}
                                     className={`px-2 py-1.5 rounded-lg text-[7.5px] font-black uppercase flex items-center gap-1 border transition-all ${
                                       isManagingThisLaborParts || linkedPartsForLabor.length > 0
                                         ? 'bg-green-500/15 text-green-400 border-green-500/40 hover:bg-green-500 hover:text-black'
                                         : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                     }`}
                                     title="Vincular uma ou mais peças desta O.S. a esta Mão de Obra"
                                   >
                                     <Package size={11} />
                                     <span>Peças ({linkedPartsForLabor.length})</span>
                                   </button>
                                   <button 
                                     type="button" 
                                     onClick={() => handleDeleteLaborFromOS(selectedOS.id, labor.id)} 
                                     className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" 
                                     title="Excluir Serviço da OS"
                                   >
                                     <Trash2 size={15} />
                                   </button>
                                </div>
                              </div>

                              {/* Badges de Peças vinculadas a esta Mão de Obra */}
                              {linkedPartsForLabor.length > 0 && (
                                <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-1.5">
                                  <span className="text-[7.5px] font-black uppercase text-green-400 tracking-wider mr-1">
                                    🔩 Peças vinculadas ({linkedPartsForLabor.length}):
                                  </span>
                                  {linkedPartsForLabor.map(({ part, pIdx }) => (
                                    <span
                                      key={pIdx}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/30 text-green-300 text-[7.5px] font-black uppercase"
                                    >
                                      <span>{part.name} ({part.mlQuantity ? `${part.mlQuantity} ml` : `${part.quantity} ${part.unit || 'un'}`})</span>
                                      <button
                                        type="button"
                                        onClick={() => handleLinkLaunchedPartToOSLabor(selectedOS.id, pIdx, '')}
                                        className="text-zinc-400 hover:text-red-400 ml-0.5"
                                        title="Desvincular peça desta M.O."
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Painel Rápido para Vincular 1 ou Mais Peças da O.S. a esta M.O. */}
                              {isManagingThisLaborParts && (
                                <div className="p-3 bg-zinc-950 border border-green-500/40 rounded-xl space-y-2 animate-in fade-in duration-150">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black uppercase text-green-400">
                                      🔗 Selecione as peças desta O.S. para vincular a "{labor.description}":
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setManagingPartsForLaborId(null)}
                                      className="text-[8px] font-black uppercase text-zinc-400 hover:text-white"
                                    >
                                      Concluir ✕
                                    </button>
                                  </div>
                                  {selectedOS.parts.length === 0 ? (
                                    <p className="text-[8.5px] text-zinc-500 italic">
                                      Nenhuma peça lançada na O.S. ainda. Ao lançar uma peça ao lado, você também pode escolher esta M.O.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                      {selectedOS.parts.map((p, pIdx) => {
                                        const isLinkedHere =
                                          p.linkedLaborId === labor.id ||
                                          (!p.linkedLaborId && p.linkedLaborDescription && p.linkedLaborDescription.toLowerCase() === labor.description.toLowerCase());
                                        return (
                                          <label
                                            key={pIdx}
                                            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all text-[8.5px] ${
                                              isLinkedHere
                                                ? 'bg-green-500/15 border-green-500/50 text-white'
                                                : 'bg-black border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={Boolean(isLinkedHere)}
                                                onChange={() =>
                                                  handleLinkLaunchedPartToOSLabor(
                                                    selectedOS.id,
                                                    pIdx,
                                                    isLinkedHere ? '' : labor.id
                                                  )
                                                }
                                                className="accent-green-500 w-3.5 h-3.5 rounded cursor-pointer"
                                              />
                                              <span className="font-black uppercase">{p.name}</span>
                                              <span className="font-mono text-zinc-500">
                                                ({p.mlQuantity ? `${p.mlQuantity} ml` : `${p.quantity} ${p.unit || 'un'}`})
                                              </span>
                                            </div>
                                            {p.linkedLaborDescription && !isLinkedHere && (
                                              <span className="text-[7px] text-amber-400 uppercase font-bold">
                                                Vinculada a: {p.linkedLaborDescription}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {linkedItems.map(linked => {
                              const lGross = getLaborOriginalValue(linked);
                              const lFinal = getLaborFinalValue(linked);
                              const lDisc = lGross - lFinal;
                              const isLFixed = linked.pricingType === 'fixed';
                              const linkedPartsForSubLabor = selectedOS.parts
                                .map((p, pIdx) => ({ part: p, pIdx }))
                                .filter(({ part }) =>
                                  part.linkedLaborId === linked.id ||
                                  (!part.linkedLaborId && part.linkedLaborDescription && part.linkedLaborDescription.toLowerCase() === linked.description.toLowerCase())
                                );
                              const isManagingSubLaborParts = managingPartsForLaborId === linked.id;

                              return (
                                <div key={linked.id} className="ml-6 p-3 bg-amber-950/15 rounded-xl border border-dashed border-amber-500/40 space-y-2">
                                   <div className="flex justify-between items-center gap-2">
                                     <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-black uppercase italic text-zinc-300">{linked.description}</span>
                                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[7px] font-black uppercase">
                                            🔗 M.O. COMPARTILHADA (-{linked.discountPercentage || 50}%)
                                          </span>
                                        </div>
                                        {isLFixed ? (
                                          <span className="text-[7px] text-amber-400 font-bold uppercase">
                                            ⚡ Valor Fixo: R$ {lGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {linked.section ? `• ${linked.section}` : ''}
                                          </span>
                                        ) : (
                                          <span className="text-[7px] text-zinc-500 font-bold uppercase">
                                            {linked.hours}h {linked.minutes ? `${linked.minutes}m` : ''} x R$ {linked.valuePerHour}/h {linked.section ? `• ${linked.section}` : ''}
                                          </span>
                                        )}
                                        <span className="text-[7.5px] text-amber-400/90 italic">
                                          ↳ {linked.sharedReason || `Aproveitamento de desmontagem de "${labor.description}"`}
                                        </span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <div className="flex flex-col items-end">
                                          {lDisc > 0 && (
                                            <span className="text-[8px] text-zinc-500 line-through font-mono">
                                              R$ {lGross.toLocaleString('pt-BR')}
                                            </span>
                                          )}
                                          <span className="text-xs font-black text-green-400 font-mono">
                                            R$ {lFinal.toLocaleString('pt-BR')}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setManagingPartsForLaborId(isManagingSubLaborParts ? null : linked.id)}
                                          className={`px-2 py-1 rounded-lg text-[7px] font-black uppercase flex items-center gap-1 border transition-all ${
                                            isManagingSubLaborParts || linkedPartsForSubLabor.length > 0
                                              ? 'bg-green-500/15 text-green-400 border-green-500/40'
                                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                                          }`}
                                          title="Vincular peças desta O.S. a esta M.O. compartilhada"
                                        >
                                          <Package size={10} />
                                          <span>Peças ({linkedPartsForSubLabor.length})</span>
                                        </button>
                                        <button 
                                          type="button" 
                                          onClick={() => handleDeleteLaborFromOS(selectedOS.id, linked.id)} 
                                          className="p-1 text-zinc-500 hover:text-red-500 transition-all" 
                                          title="Excluir Serviço Vinculado da OS"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                     </div>
                                   </div>

                                   {linkedPartsForSubLabor.length > 0 && (
                                     <div className="pt-1.5 border-t border-amber-500/20 flex flex-wrap items-center gap-1">
                                       <span className="text-[7px] font-black uppercase text-green-400 mr-1">🔩 Peças:</span>
                                       {linkedPartsForSubLabor.map(({ part, pIdx }) => (
                                         <span
                                           key={pIdx}
                                           className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-300 text-[7px] font-black uppercase"
                                         >
                                           <span>{part.name} ({part.mlQuantity ? `${part.mlQuantity} ml` : `${part.quantity} ${part.unit || 'un'}`})</span>
                                           <button
                                             type="button"
                                             onClick={() => handleLinkLaunchedPartToOSLabor(selectedOS.id, pIdx, '')}
                                             className="text-zinc-400 hover:text-red-400"
                                           >
                                             ✕
                                           </button>
                                         </span>
                                       ))}
                                     </div>
                                   )}

                                   {isManagingSubLaborParts && (
                                     <div className="p-2.5 bg-zinc-950 border border-green-500/40 rounded-lg space-y-1.5">
                                       {selectedOS.parts.map((p, pIdx) => {
                                         const isLinkedHere =
                                           p.linkedLaborId === linked.id ||
                                           (!p.linkedLaborId && p.linkedLaborDescription && p.linkedLaborDescription.toLowerCase() === linked.description.toLowerCase());
                                         return (
                                           <label
                                             key={pIdx}
                                             className="flex items-center justify-between p-1.5 rounded bg-black border border-zinc-800 cursor-pointer text-[8px] text-zinc-300"
                                           >
                                             <div className="flex items-center gap-1.5">
                                               <input
                                                 type="checkbox"
                                                 checked={Boolean(isLinkedHere)}
                                                 onChange={() =>
                                                   handleLinkLaunchedPartToOSLabor(
                                                     selectedOS.id,
                                                     pIdx,
                                                     isLinkedHere ? '' : linked.id
                                                   )
                                                 }
                                                 className="accent-green-500 w-3 h-3 rounded"
                                               />
                                               <span className="font-black uppercase">{p.name}</span>
                                             </div>
                                           </label>
                                         );
                                       })}
                                     </div>
                                   )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                   </div>

                   <div className="pt-4 border-t border-zinc-800 space-y-3">
                      <p className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">+ Inserir Novo Serviço Nesta O.S.:</p>
                      {/* Smart Warning */}
                      {(laborFormData.section && selectedOS.laborItems.some(l => l.section === laborFormData.section)) || 
                       (laborFormData.description.length > 3 && selectedOS.laborItems.some(l => l.description.toLowerCase().includes(laborFormData.description.toLowerCase()) || laborFormData.description.toLowerCase().includes(l.description.toLowerCase()))) ? (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center gap-2 animate-pulse">
                          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                          <p className="text-[8px] font-black uppercase text-amber-500">
                            Atenção: Já existe um serviço {laborFormData.section && selectedOS.laborItems.some(l => l.section === laborFormData.section) ? `no setor "${laborFormData.section}"` : 'semelhante'} lançado. O sistema verificará vínculos de M.O. compartilhada.
                          </p>
                        </div>
                      ) : null}

                      {/* Catálogo de Mão de Obra (Ordem Alfabética A-Z + Barra de Pesquisa/Filtro) */}
                      {(() => {
                        const sortedDetailTemplates = [...laborTemplates].sort((a, b) =>
                          (a.description || '').localeCompare(b.description || '', 'pt-BR', { sensitivity: 'base' })
                        );
                        const cleanDetailQuery = osDetailLaborSearch.trim().toLowerCase();
                        const filteredDetailTemplates = cleanDetailQuery
                          ? sortedDetailTemplates.filter(t => {
                              const secName = (vehicleSections.find(s => s.id === t.sectionId)?.name || '').toLowerCase();
                              return (t.description || '').toLowerCase().includes(cleanDetailQuery) || secName.includes(cleanDetailQuery);
                            })
                          : sortedDetailTemplates;

                        const applyCatalogTemplate = (template: LaborTemplate) => {
                          const secName = vehicleSections.find(s => s.id === template.sectionId)?.name || '';
                          setLaborFormData(prev => ({
                            ...prev,
                            description: template.description,
                            pricingType: template.pricingType || 'hourly',
                            hours: template.pricingType === 'fixed' ? 0 : template.defaultHours,
                            minutes: template.pricingType === 'fixed' ? 0 : (template.minutes || 0),
                            valuePerHour: template.defaultValuePerHour || currentTenant.defaultHourlyRate || 150,
                            fixedValue: template.fixedValue || (template.defaultHours * template.defaultValuePerHour) || 150,
                            section: secName,
                            isShared: Boolean(template.linkedTemplateId || (template.discountPercentage && template.discountPercentage > 0)),
                            discountPercentage: template.discountPercentage ?? 50,
                            discountValue: template.discountValue || 0,
                            discountType: template.discountValue ? 'fixed' : 'percentage',
                            sharedReason: template.sharedNotes || ''
                          }));
                        };

                        return (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-[8px] font-black uppercase text-zinc-500 block">
                                Opção 1: Selecionar do Catálogo de Mão de Obra (Ordem Alfabética A-Z)
                              </label>
                              <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase">
                                {filteredDetailTemplates.length} de {sortedDetailTemplates.length} M.O.
                              </span>
                            </div>

                            {/* Barra de Pesquisa / Filtro de M.O. */}
                            <div className="relative">
                              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                              <input
                                type="text"
                                value={osDetailLaborSearch}
                                onChange={e => setOsDetailLaborSearch(e.target.value)}
                                placeholder="PESQUISAR E FILTRAR M.O. DO CATÁLOGO (EX: REVISÃO, SUSPENSÃO, FREIO)..."
                                className="w-full bg-zinc-950 border border-zinc-800 focus:border-green-500 pl-9 pr-8 py-2.5 rounded-xl text-white font-bold text-[11px] uppercase outline-none transition-colors placeholder:text-zinc-600"
                              />
                              {osDetailLaborSearch && (
                                <button
                                  type="button"
                                  onClick={() => setOsDetailLaborSearch('')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white rounded-lg"
                                  title="Limpar pesquisa"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>

                            {/* Lista rápida clicável quando houver termo digitado */}
                            {cleanDetailQuery && (
                              <div className="max-h-44 overflow-y-auto custom-scrollbar bg-zinc-950 border border-zinc-800 rounded-xl divide-y divide-zinc-800/70">
                                {filteredDetailTemplates.length === 0 ? (
                                  <p className="p-3 text-[10px] text-zinc-500 font-bold uppercase text-center">
                                    Nenhuma M.O. encontrada no catálogo para "{osDetailLaborSearch}"
                                  </p>
                                ) : (
                                  filteredDetailTemplates.map(t => {
                                    const g = computeLaborGross(t);
                                    const secName = vehicleSections.find(s => s.id === t.sectionId)?.name;
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                          applyCatalogTemplate(t);
                                          setOsDetailLaborSearch('');
                                        }}
                                        className="w-full px-3 py-2.5 text-left hover:bg-green-500/15 flex items-center justify-between gap-2 transition-colors group"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-black text-white uppercase truncate group-hover:text-green-400">
                                            {t.description}
                                          </p>
                                          <p className="text-[9px] text-zinc-500 uppercase font-bold">
                                            {secName ? `${secName} • ` : ''}
                                            {t.pricingType === 'fixed'
                                              ? '⚡ Valor Fixo / Dificuldade'
                                              : `${t.defaultHours}H${t.minutes ? ` ${t.minutes}M` : ''}`}
                                            {t.linkedTemplateId ? ' • [VÍNCULO CONFIGURADO]' : ''}
                                          </p>
                                        </div>
                                        <span className="text-[11px] font-mono font-black text-green-400 shrink-0">
                                          R$ {(t.pricingType === 'fixed' ? (t.fixedValue || 0) : g).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}

                            {/* Dropdown Completo em Ordem Alfabética A-Z */}
                            <select 
                              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500"
                              onChange={e => {
                                const template = laborTemplates.find(t => t.id === e.target.value);
                                if (template) {
                                  applyCatalogTemplate(template);
                                }
                              }}
                              value=""
                            >
                              <option value="">
                                -- SELECIONAR MODELO PRÉ-CADASTRADO ({filteredDetailTemplates.length} EM ORDEM A-Z) --
                              </option>
                              {filteredDetailTemplates.map(t => {
                                const g = computeLaborGross(t);
                                return (
                                  <option key={t.id} value={t.id}>
                                    {t.description.toUpperCase()} - {t.pricingType === 'fixed' ? `⚡ R$ ${(t.fixedValue || 0).toLocaleString('pt-BR')} [DIFICULDADE]` : `R$ ${g.toLocaleString('pt-BR')} (${t.defaultHours}H${t.minutes ? ` ${t.minutes}M` : ''})`}{t.linkedTemplateId ? ' [VÍNCULO CONFIGURADO]' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        );
                      })()}

                      <div className="space-y-1">
                        <label className="text-[8px] font-black uppercase text-zinc-500 block">Opção 2: Ou Digite o Serviço Manualmente</label>
                        <input type="text" placeholder="DESCRIÇÃO DO SERVIÇO" className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500" value={laborFormData.description} onChange={e => setLaborFormData({...laborFormData, description: e.target.value})} />
                      </div>

                      {/* Seletor de Modalidade de Cobrança: Tempo vs Dificuldade */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setLaborFormData({ ...laborFormData, pricingType: 'hourly' })}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                            laborFormData.pricingType === 'hourly'
                              ? 'bg-green-500/15 border-green-500 text-white'
                              : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Clock size={16} className={laborFormData.pricingType === 'hourly' ? 'text-green-400' : 'text-zinc-600'} />
                          <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase block">⏱️ Por Tempo</span>
                            <span className="text-[8px] text-zinc-400 block truncate">Horas e minutos</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setLaborFormData({ ...laborFormData, pricingType: 'fixed' })}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                            laborFormData.pricingType === 'fixed'
                              ? 'bg-amber-500/15 border-amber-500 text-white'
                              : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Zap size={16} className={laborFormData.pricingType === 'fixed' ? 'text-amber-400' : 'text-zinc-600'} />
                          <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase block">⚡ Por Dificuldade</span>
                            <span className="text-[8px] text-zinc-400 block truncate">Preço fixo específico</span>
                          </div>
                        </button>
                      </div>

                      {laborFormData.pricingType === 'hourly' ? (
                        <div className="space-y-2 bg-black/60 p-3.5 rounded-xl border border-zinc-800">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">Horas</label>
                              <input 
                                type="number" 
                                min="0"
                                step="1"
                                placeholder="0" 
                                className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white font-mono font-black text-xs outline-none focus:border-green-500" 
                                value={laborFormData.hours} 
                                onChange={e => setLaborFormData({...laborFormData, hours: Math.max(0, parseInt(e.target.value) || 0)})} 
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">Minutos (0-59)</label>
                              <input 
                                type="number" 
                                min="0"
                                max="59"
                                step="1"
                                placeholder="0" 
                                className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-white font-mono font-black text-xs outline-none focus:border-green-500" 
                                value={laborFormData.minutes || 0} 
                                onChange={e => setLaborFormData({...laborFormData, minutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0))})} 
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[8px] font-black uppercase text-zinc-400">Valor/Hora (R$)</label>
                                <span className="text-[7px] text-green-400 font-bold">Editável</span>
                              </div>
                              <input 
                                type="number" 
                                step="any"
                                placeholder="150" 
                                className="w-full bg-black border border-zinc-700 p-2.5 rounded-xl text-green-400 font-mono font-black text-xs outline-none focus:border-green-500" 
                                value={laborFormData.valuePerHour || ''} 
                                onChange={e => setLaborFormData({...laborFormData, valuePerHour: parseFloat(e.target.value) || 0})} 
                              />
                            </div>
                          </div>

                          {/* Chips rápidos de minutos e horas */}
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[7px] font-black uppercase text-zinc-500 mr-1">Rápido:</span>
                            {[
                              { label: '15m', h: 0, m: 15 },
                              { label: '30m', h: 0, m: 30 },
                              { label: '45m', h: 0, m: 45 },
                              { label: '1h', h: 1, m: 0 },
                              { label: '1h 30m', h: 1, m: 30 },
                              { label: '2h', h: 2, m: 0 }
                            ].map(preset => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setLaborFormData({
                                  ...laborFormData,
                                  hours: preset.h,
                                  minutes: preset.m
                                })}
                                className={`px-2 py-0.5 rounded text-[8px] font-mono font-black transition-all ${
                                  laborFormData.hours === preset.h && (laborFormData.minutes || 0) === preset.m
                                    ? 'bg-green-500 text-black'
                                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>

                          {/* Banner de Demonstração do Cálculo Proporcional */}
                          {(() => {
                            const h = laborFormData.hours || 0;
                            const m = laborFormData.minutes || 0;
                            const rate = laborFormData.valuePerHour || 0;
                            const totalH = h + (m / 60);
                            const calculatedGross = Number((totalH * rate).toFixed(2));
                            return (
                              <div className="p-2.5 bg-black border border-zinc-800 rounded-xl flex items-center justify-between text-[8px] font-mono">
                                <span className="text-zinc-400">
                                  Cálculo: ({h}h {m > 0 ? `+ ${m}min` : ''}) x R$ {rate}/h (dividido por minutos)
                                </span>
                                <span className="text-green-400 font-black text-xs">
                                  = R$ {calculatedGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="p-3.5 bg-amber-950/15 border border-amber-500/30 rounded-xl space-y-2">
                          <label className="text-[8px] font-black uppercase text-amber-400 block">
                            ⚡ Valor Específico do Serviço por Dificuldade (R$)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs font-bold">R$</span>
                            <input 
                              type="number" 
                              step="any"
                              placeholder="Ex: 350.00" 
                              className="w-full bg-black border border-amber-500/40 pl-9 pr-3 py-2.5 rounded-xl text-amber-400 font-mono font-black text-xs outline-none focus:border-amber-400" 
                              value={laborFormData.fixedValue || ''} 
                              onChange={e => setLaborFormData({...laborFormData, fixedValue: parseFloat(e.target.value) || 0})} 
                            />
                          </div>
                          <p className="text-[7.5px] text-zinc-400">
                            Valor fixo específico cobrado pela complexidade. NÃO soma taxa horária e NÃO vincula a outro serviço.
                          </p>
                        </div>
                      )}
                      
                      <div>
                         <select className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500" value={laborFormData.section} onChange={e => setLaborFormData({...laborFormData, section: e.target.value})}>
                            <option value="">SETOR DO VEÍCULO (OPCIONAL)</option>
                            {vehicleSections.map(s => <option key={s.id} value={s.name}>{s.name.toUpperCase()}</option>)}
                         </select>
                      </div>

                      {/* Configuração de Mão de Obra Compartilhada Manual (Somente se já existir M.O. na O.S. e for cobrança por tempo) */}
                      {selectedOS.laborItems.length > 0 && laborFormData.pricingType !== 'fixed' && (
                        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={laborFormData.isShared}
                              onChange={e => setLaborFormData({
                                ...laborFormData,
                                isShared: e.target.checked,
                                linkedToId: e.target.checked ? (laborFormData.linkedToId || selectedOS.laborItems[0]?.id) : ''
                              })}
                              className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                            />
                            <span className="text-[9px] font-black uppercase text-amber-400">
                              🔗 Configurar como M.O. Compartilhada (Escolha com qual M.O. desta O.S. compartilhar)
                            </span>
                          </label>

                          {laborFormData.isShared && (
                            <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                              <div>
                                <label className="text-[8px] font-bold uppercase text-amber-400 block mb-1">
                                  Escolha a Mão de Obra já existente nesta O.S. para vincular o compartilhamento:
                                </label>
                                <select
                                  className="w-full bg-black border border-amber-500/40 focus:border-amber-400 p-2.5 rounded-lg text-white font-black text-[9.5px] uppercase outline-none cursor-pointer"
                                  value={laborFormData.linkedToId}
                                  onChange={e => setLaborFormData({
                                    ...laborFormData,
                                    linkedToId: e.target.value,
                                    isShared: Boolean(e.target.value)
                                  })}
                                >
                                  <option value="">-- SELECIONE A MÃO DE OBRA DESTA O.S. --</option>
                                  {selectedOS.laborItems.map(l => (
                                    <option key={l.id} value={l.id}>
                                      🛠️ {l.description.toUpperCase()} — R$ {getLaborFinalValue(l).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">Tipo Desconto</label>
                                  <select
                                    className="w-full bg-black border border-zinc-700 p-2 rounded text-white text-[9px]"
                                    value={laborFormData.discountType}
                                    onChange={e => setLaborFormData({
                                      ...laborFormData,
                                      discountType: e.target.value as 'percentage' | 'fixed'
                                    })}
                                  >
                                    <option value="percentage">PORCENTAGEM (%)</option>
                                    <option value="fixed">VALOR FIXO (R$)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">
                                    {laborFormData.discountType === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-full bg-black border border-zinc-700 p-2 rounded text-amber-400 font-mono text-xs font-black"
                                    value={laborFormData.discountType === 'percentage' ? laborFormData.discountPercentage : laborFormData.discountValue}
                                    onChange={e => {
                                      const v = parseFloat(e.target.value) || 0;
                                      if (laborFormData.discountType === 'percentage') {
                                        setLaborFormData({...laborFormData, discountPercentage: v});
                                      } else {
                                        setLaborFormData({...laborFormData, discountValue: v});
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[8px] font-bold uppercase text-zinc-400 block mb-1">Justificativa Técnica</label>
                                <input
                                  type="text"
                                  placeholder="Ex: Metade do serviço já executado na desmontagem anterior"
                                  className="w-full bg-black border border-zinc-700 p-2 rounded text-zinc-200 text-[9px]"
                                  value={laborFormData.sharedReason}
                                  onChange={e => setLaborFormData({...laborFormData, sharedReason: e.target.value})}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button onClick={() => handleAddLaborToOS(selectedOS.id)} className="w-full py-3 bg-zinc-800 text-white font-black uppercase text-[10px] rounded-xl hover:bg-green-500 hover:text-black transition-all active:scale-95">+ Adicionar Serviço à O.S.</button>
                   </div>
                </div>

                {/* Peças e Insumos */}
                <div className="bg-zinc-900/90 border border-zinc-800 p-5 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 shadow-xl">
                   <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 italic flex items-center gap-2">
                        <Package size={14} /> Peças e Insumos ({selectedOS.parts.length})
                      </h4>
                      <span className="text-[9px] font-mono text-zinc-400">
                        Total: R$ {selectedOS.parts.reduce((acc, p) => acc + getPartFinalValue(p), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                   </div>
                   <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {selectedOS.parts.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 italic text-center py-4">Nenhuma peça vinculada a esta O.S.</p>
                      ) : selectedOS.parts.map((part, idx) => {
                        const matchedItem = items.find(i => i.id === part.itemId);
                        const isWaitingReplenishment = matchedItem ? matchedItem.quantity < part.quantity : true;
                        const hasLowStock = matchedItem ? matchedItem.quantity <= matchedItem.minQuantity : false;
                        const partTotal = getPartFinalValue(part);
                        const isEditingThisPart = editingOSPartIdx === idx;
                        const unitLabel = part.unit || matchedItem?.unit || 'un';
                        const isPartMl = Boolean(part.measureMode === 'ml' || part.mlQuantity);

                        return (
                          <div key={idx} className={`p-4 bg-black rounded-xl border ${isEditingThisPart ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)]' : 'border-zinc-800 hover:border-zinc-700'} space-y-2.5 transition-all`}>
                             <div className="flex justify-between items-start gap-2">
                                <div className="flex flex-col min-w-0 flex-1">
                                   <div className="flex flex-wrap items-center gap-2">
                                     <span className="text-xs font-black uppercase italic text-white">{part.name}</span>
                                     {part.mlQuantity ? (
                                       <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 font-mono">
                                         <Droplet size={10} /> {part.mlQuantity} ml ({part.quantity} L)
                                       </span>
                                     ) : (
                                       <span className="px-2 py-0.5 rounded bg-zinc-800 text-green-400 border border-zinc-700 text-[8px] font-black uppercase font-mono">
                                         QTD: {part.quantity} {unitLabel}
                                       </span>
                                     )}
                                   </div>
                                   <span className="text-[8px] text-zinc-500 font-mono uppercase mt-0.5">
                                     PN: {part.partNumber || 'S/ PN'} | {part.mlQuantity ? (
                                       `Rateio ML: ${part.mlQuantity} ml @ R$ ${(part.unitValue / 1000).toFixed(4).replace('.', ',')}/ml (Litro: R$ ${part.unitValue.toFixed(2).replace('.', ',')})`
                                     ) : (
                                       `${part.quantity} ${unitLabel} x R$ ${part.unitValue.toFixed(2).replace('.', ',')}`
                                     )}
                                   </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                   <span className="text-sm font-black text-green-500 font-mono mr-1">
                                     R$ {partTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                   </span>
                                   <button
                                     type="button"
                                     onClick={() => {
                                       if (isEditingThisPart) {
                                         setEditingOSPartIdx(null);
                                       } else {
                                         setEditingOSPartIdx(idx);
                                         setEditingOSPartMode(isPartMl ? 'ml' : 'standard');
                                         setEditingOSPartQtyInput(
                                           isPartMl ? String(part.mlQuantity || Math.round(part.quantity * 1000)) : String(part.quantity)
                                         );
                                       }
                                     }}
                                     className={`px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 transition-all border ${
                                       isEditingThisPart
                                         ? 'bg-green-500 text-black border-green-400'
                                         : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-green-400 border-zinc-800'
                                     }`}
                                     title="Alterar quantidade lançada deste item na O.S."
                                   >
                                     <Pencil size={11} />
                                     <span>Alterar Qtd</span>
                                   </button>
                                   <button 
                                     type="button" 
                                     onClick={() => handleDeletePartFromOS(selectedOS.id, idx)} 
                                     className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" 
                                     title="Remover Peça da O.S."
                                   >
                                     <Trash2 size={15} />
                                   </button>
                                </div>
                             </div>

                             {/* Painel de Edição de Quantidade Pós-Lançamento */}
                             {isEditingThisPart && (
                               <div className="p-3 bg-zinc-950 border border-green-500/40 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                                 <div className="flex items-center justify-between">
                                   <span className="text-[8px] font-black uppercase text-green-400 tracking-wider flex items-center gap-1.5">
                                     <Pencil size={10} /> Editar Quantidade Lançada ({isPartMl ? 'em ML' : `em ${unitLabel.toUpperCase()}`})
                                   </span>
                                   <span className="text-[8px] font-mono text-zinc-400">
                                     Atual: <strong className="text-white">{isPartMl ? `${part.mlQuantity} ml` : `${part.quantity} ${unitLabel}`}</strong>
                                   </span>
                                 </div>

                                 <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                   {/* Botão - */}
                                   <button
                                     type="button"
                                     onClick={() => {
                                       const step = editingOSPartMode === 'ml' ? 50 : 1;
                                       const curr = parseFloat(editingOSPartQtyInput) || 0;
                                       const next = Math.max(editingOSPartMode === 'ml' ? 50 : 0.1, Math.round((curr - step) * 100) / 100);
                                       setEditingOSPartQtyInput(String(next));
                                     }}
                                     className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs rounded-lg transition-colors"
                                     title="Diminuir quantidade"
                                   >
                                     -
                                   </button>

                                   <div className="relative flex-1 min-w-[110px]">
                                     <input
                                       type="number"
                                       step="any"
                                       min="0.01"
                                       autoFocus
                                       value={editingOSPartQtyInput}
                                       onChange={e => setEditingOSPartQtyInput(e.target.value)}
                                       onKeyDown={e => {
                                         if (e.key === 'Enter') {
                                           e.preventDefault();
                                           handleUpdatePartQuantityInOS(
                                             selectedOS.id,
                                             idx,
                                             parseFloat(editingOSPartQtyInput),
                                             editingOSPartMode
                                           );
                                         } else if (e.key === 'Escape') {
                                           setEditingOSPartIdx(null);
                                         }
                                       }}
                                       className="w-full bg-black border border-green-500/60 focus:border-green-400 px-3 py-2 rounded-lg text-white font-mono font-black text-xs outline-none text-center"
                                       placeholder={editingOSPartMode === 'ml' ? 'Ex: 500' : 'Ex: 6'}
                                     />
                                     <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] font-mono font-black uppercase text-zinc-500">
                                       {editingOSPartMode === 'ml' ? 'ML' : unitLabel}
                                     </span>
                                   </div>

                                   {/* Botão + */}
                                   <button
                                     type="button"
                                     onClick={() => {
                                       const step = editingOSPartMode === 'ml' ? 50 : 1;
                                       const curr = parseFloat(editingOSPartQtyInput) || 0;
                                       const next = Math.round((curr + step) * 100) / 100;
                                       setEditingOSPartQtyInput(String(next));
                                     }}
                                     className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs rounded-lg transition-colors"
                                     title="Aumentar quantidade"
                                   >
                                     +
                                   </button>

                                   <button
                                     type="button"
                                     onClick={() =>
                                       handleUpdatePartQuantityInOS(
                                         selectedOS.id,
                                         idx,
                                         parseFloat(editingOSPartQtyInput),
                                         editingOSPartMode
                                       )
                                     }
                                     className="px-3.5 py-2 bg-green-500 hover:bg-green-400 text-black font-black text-[9px] uppercase rounded-lg transition-all flex items-center gap-1 shadow-glow"
                                   >
                                     <Check size={12} /> Salvar
                                   </button>

                                   <button
                                     type="button"
                                     onClick={() => setEditingOSPartIdx(null)}
                                     className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-black text-[9px] uppercase rounded-lg transition-all"
                                   >
                                     Cancelar
                                   </button>
                                 </div>

                                 {/* Prévia do novo subtotal */}
                                 {(() => {
                                   const parsedVal = parseFloat(editingOSPartQtyInput);
                                   if (isNaN(parsedVal) || parsedVal <= 0) return null;
                                   const previewTotal = editingOSPartMode === 'ml'
                                     ? Math.round(((part.unitValue / 1000) * parsedVal) * 100) / 100
                                     : Math.round((parsedVal * part.unitValue) * 100) / 100;
                                   return (
                                     <div className="flex items-center justify-between text-[8px] font-mono pt-1 border-t border-zinc-800/80 text-zinc-400">
                                       <span>
                                         Novo cálculo: {parsedVal} {editingOSPartMode === 'ml' ? 'ml' : unitLabel} x R$ {editingOSPartMode === 'ml' ? (part.unitValue / 1000).toFixed(4).replace('.', ',') : part.unitValue.toFixed(2).replace('.', ',')}
                                       </span>
                                       <span className="text-green-400 font-black">
                                         Novo Subtotal: R$ {previewTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                       </span>
                                     </div>
                                   );
                                 })()}
                               </div>
                             )}

                             {/* Smart Indicators & Vínculo Direto com M.O. já existente na O.S. */}
                             <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-900 text-left">
                                <div className="flex flex-wrap items-center gap-2">
                                  {part.linkedLaborDescription ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-md text-[7px] font-black uppercase tracking-wider">
                                      ⚡ M.O. VINCULADA NA O.S.: {part.linkedLaborDescription}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-500 rounded-md text-[7px] font-black uppercase">
                                      Peça Avulsa / Sem M.O. vinculada
                                    </span>
                                  )}
                                  {isWaitingReplenishment && !selectedOS.stockDeducted && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-md text-[7px] font-black uppercase tracking-wider animate-pulse italic">
                                      ⚠️ AGUARDANDO REPOSIÇÃO (Saldo: {matchedItem ? matchedItem.quantity : 0} {matchedItem?.unit || 'un'})
                                    </span>
                                  )}
                                  {!isWaitingReplenishment && hasLowStock && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-400/10 border border-red-400/20 text-red-400 rounded-md text-[7px] font-black uppercase tracking-wider italic">
                                      ⚠️ SALDO CRÍTICO (Saldo: {matchedItem?.quantity} {matchedItem?.unit || 'un'})
                                    </span>
                                  )}
                                </div>

                                {selectedOS.laborItems.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[7px] font-black uppercase text-zinc-500">🔗 M.O. da O.S.:</span>
                                    <select
                                      value={
                                        part.linkedLaborId ||
                                        selectedOS.laborItems.find(
                                          l => part.linkedLaborDescription && l.description.toLowerCase() === part.linkedLaborDescription.toLowerCase()
                                        )?.id ||
                                        ''
                                      }
                                      onChange={e => handleLinkLaunchedPartToOSLabor(selectedOS.id, idx, e.target.value)}
                                      className="bg-zinc-950 border border-zinc-800 hover:border-green-500/50 focus:border-green-500 px-2 py-1 rounded-lg text-[8px] font-black uppercase text-zinc-200 outline-none max-w-[210px] truncate cursor-pointer"
                                      title="Vincular esta peça a uma Mão de Obra já existente nesta O.S."
                                    >
                                      <option value="">-- SEM VÍNCULO NA O.S. --</option>
                                      {selectedOS.laborItems.map(l => (
                                        <option key={l.id} value={l.id}>
                                          🛠️ {l.description.toUpperCase()}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                             </div>
                          </div>
                        );
                      })}
                   </div>

                   <div className="pt-4 border-t border-zinc-800 space-y-3">
                      <div className="flex justify-between items-center px-1">
                         <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest italic font-sans">+ Vincular Peça do Estoque:</span>
                         <a 
                           href="https://epc.brp.com/#" 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           className="text-[8px] font-black uppercase text-green-500 hover:text-green-400 hover:underline flex items-center gap-1 italic transition-all active:scale-95 font-sans"
                         >
                           <ExternalLink size={10} /> Catálogo EPC BRP ↗
                         </a>
                      </div>

                      {/* Campo de pesquisa por nome ou part number */}
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input 
                          type="text" 
                          placeholder="PESQUISAR PEÇA POR NOME OU PART NUMBER..." 
                          className="w-full bg-black border border-zinc-800 pl-10 pr-9 py-2.5 rounded-xl text-white font-bold text-xs uppercase placeholder:text-zinc-600 outline-none focus:border-green-500 transition-colors"
                          value={osPartSearchTerm}
                          onChange={e => setOsPartSearchTerm(e.target.value)}
                        />
                        {osPartSearchTerm && (
                          <button 
                            type="button"
                            onClick={() => setOsPartSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5 rounded transition-colors"
                            title="Limpar pesquisa"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      <select 
                        className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500" 
                        value={osPartFormData.itemId} 
                        onChange={e => {
                          const chosenId = e.target.value;
                          const chosenItem = items.find(i => i.id === chosenId);
                          const isFluid = Boolean(
                            chosenItem && (
                              (chosenItem.unit && ['l', 'litro', 'litros', 'ml'].includes(chosenItem.unit.toLowerCase())) ||
                              chosenItem.category === ItemCategory.INSUMOS ||
                              (chosenItem.name || '').toLowerCase().includes('óleo') ||
                              (chosenItem.name || '').toLowerCase().includes('oleo') ||
                              (chosenItem.name || '').toLowerCase().includes('fluido') ||
                              (chosenItem.name || '').toLowerCase().includes('xps')
                            )
                          );
                          const tiedTemplate = chosenItem ? findLaborTemplateForPart(chosenItem, laborTemplates) : null;
                          setIsQuickBindingCatalogInOS(false);
                          setOsPartSharedLaborId('');
                          setOsPartSharedDiscountType('percentage');
                          setOsPartSharedDiscountPct(tiedTemplate?.discountPercentage || 50);
                          setOsPartSharedDiscountVal(tiedTemplate?.discountValue || 0);
                          setOsPartSharedReason('');
                          setOsPartFormData({
                            itemId: chosenId,
                            quantity: 1,
                            measureMode: isFluid ? 'ml' : 'standard',
                            mlQuantity: 500
                          });
                        }}
                      >
                         <option value="">
                           {osPartSearchTerm 
                             ? (filteredOsPartItems.length > 0 
                                 ? `-- SELECIONE A PEÇA FILTRADA (${filteredOsPartItems.length} ENCONTRADA${filteredOsPartItems.length > 1 ? 'S' : ''}) --` 
                                 : '-- NENHUMA PEÇA ENCONTRADA PARA ESTA BUSCA --')
                             : 'SELECIONE UMA PEÇA DO ESTOQUE'}
                         </option>
                         {filteredOsPartItems.map(i => {
                           const tiedLabor = findLaborTemplateForPart(i, laborTemplates);
                           return (
                             <option key={i.id} value={i.id}>
                               {i.name.toUpperCase()} (PN: {i.partNumber || 'S/N'}) {tiedLabor ? `⚡ [M.O.: ${tiedLabor.description.toUpperCase()}]` : ''} - SALDO: {i.quantity} {(i.unit || 'UN').toUpperCase()} - R$ {i.value.toFixed(2).replace('.', ',')}
                             </option>
                           );
                         })}
                      </select>

                      {/* PAINEL DINÂMICO DE VINCULAÇÃO: LITRO vs ML COM CÁLCULO PROPORCIONAL */}
                      {(() => {
                        const selectedItemToLink = items.find(i => i.id === osPartFormData.itemId);
                        if (!selectedItemToLink) {
                          return (
                            <div className="p-3 bg-black/40 border border-zinc-800 rounded-xl text-center">
                              <p className="text-[10px] text-zinc-500 italic">Selecione uma peça na lista acima para definir a quantidade ou volume e vincular à O.S.</p>
                            </div>
                          );
                        }

                        const isFluidOrLiter = Boolean(
                          (selectedItemToLink.unit && ['l', 'litro', 'litros', 'ml'].includes(selectedItemToLink.unit.toLowerCase())) ||
                          selectedItemToLink.category === ItemCategory.INSUMOS ||
                          (selectedItemToLink.name || '').toLowerCase().includes('óleo') ||
                          (selectedItemToLink.name || '').toLowerCase().includes('oleo') ||
                          (selectedItemToLink.name || '').toLowerCase().includes('fluido') ||
                          (selectedItemToLink.name || '').toLowerCase().includes('fluid') ||
                          (selectedItemToLink.name || '').toLowerCase().includes('líquido') ||
                          (selectedItemToLink.name || '').toLowerCase().includes('lubrificante') ||
                          (selectedItemToLink.name || '').toLowerCase().includes('xps')
                        );

                        const isMlMode = osPartFormData.measureMode === 'ml';
                        const unitPrice = selectedItemToLink.value || 0;
                        const currentUnit = selectedItemToLink.unit || 'un';

                        // Cálculos em tempo real
                        const mlUsed = osPartFormData.mlQuantity || 0;
                        const pricePerMl = unitPrice / 1000;
                        const mlTotalCalculated = Math.round((pricePerMl * mlUsed) * 100) / 100;
                        const mlLitersEquivalent = Math.round((mlUsed / 1000) * 1000) / 1000;

                        const stdQty = osPartFormData.quantity || 0;
                        const stdTotalCalculated = Math.round((stdQty * unitPrice) * 100) / 100;

                        return (
                          <div className="bg-black/60 p-4 rounded-2xl border border-zinc-800 space-y-3.5">
                            {/* Cabeçalho do item selecionado */}
                            <div className="flex justify-between items-start pb-2 border-b border-zinc-800/80 gap-2">
                              <div className="flex flex-col">
                                <span className="text-[7.5px] font-black uppercase tracking-widest text-zinc-500">Componente Selecionado:</span>
                                <span className="text-xs font-black text-white uppercase italic leading-tight">{selectedItemToLink.name}</span>
                                <span className="text-[8px] font-mono text-zinc-500">PN: {selectedItemToLink.partNumber || 'S/ PN'} • Saldo Físico: {selectedItemToLink.quantity} {currentUnit}</span>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <span className="text-[7.5px] font-black uppercase text-zinc-500">Valor Cadastrado:</span>
                                <p className="text-xs font-mono font-black text-green-500">
                                  R$ {unitPrice.toFixed(2).replace('.', ',')} / {currentUnit.toUpperCase()}
                                </p>
                              </div>
                            </div>

                            {/* Seletor do Modo de Lançamento (Litro vs Fracionado em ML) */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                  <Droplet size={11} className={isFluidOrLiter ? "text-cyan-400" : "text-zinc-500"} />
                                  Modo de Lançamento na O.S.:
                                </span>
                                {isFluidOrLiter && (
                                  <span className="text-[7.5px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    Óleo / Fluido Detectado
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                                <button
                                  type="button"
                                  onClick={() => setOsPartFormData({ ...osPartFormData, measureMode: 'standard' })}
                                  className={`py-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
                                    !isMlMode
                                      ? 'bg-zinc-800 text-white shadow font-black border border-zinc-700'
                                      : 'text-zinc-500 hover:text-zinc-300'
                                  }`}
                                >
                                  <span>{isFluidOrLiter ? '🥛 Lançar por Litro (L)' : `📦 Padrão (${currentUnit})`}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOsPartFormData({ ...osPartFormData, measureMode: 'ml' })}
                                  className={`py-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
                                    isMlMode
                                      ? 'bg-cyan-500 text-black shadow-glow font-black'
                                      : 'text-zinc-500 hover:text-cyan-400'
                                  }`}
                                >
                                  <Droplet size={12} />
                                  <span>💧 Fracionado em ML</span>
                                </button>
                              </div>
                            </div>

                            {/* Conteúdo específico por modo */}
                            {isMlMode ? (
                              <div className="space-y-2.5 bg-cyan-950/20 p-3.5 rounded-xl border border-cyan-500/30">
                                <div className="flex justify-between items-center">
                                  <label className="text-[8px] font-black uppercase text-cyan-300 tracking-wider">
                                    Quantidade Utilizada (em Mililitros - ML):
                                  </label>
                                  <span className="text-[8px] font-mono text-cyan-400/80">
                                    1 Litro = 1.000 ML
                                  </span>
                                </div>

                                <div className="relative">
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Ex: 500 ou 750"
                                    value={osPartFormData.mlQuantity || ''}
                                    onChange={e => setOsPartFormData({ ...osPartFormData, mlQuantity: Math.max(0, parseFloat(e.target.value) || 0) })}
                                    className="w-full bg-black border border-cyan-500/50 p-3 pr-14 rounded-xl text-white font-black text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 font-mono"
                                  />
                                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-black text-xs font-mono">
                                    ML
                                  </span>
                                </div>

                                {/* Atalhos rápidos de ML */}
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  <span className="text-[7px] font-black uppercase text-zinc-500 self-center mr-1">Rápido:</span>
                                  {[100, 200, 250, 350, 500, 750, 800, 950, 1000, 1500].map(ml => (
                                    <button
                                      key={ml}
                                      type="button"
                                      onClick={() => setOsPartFormData({ ...osPartFormData, mlQuantity: ml })}
                                      className={`px-2 py-1 rounded-md text-[8px] font-mono font-black transition-all ${
                                        osPartFormData.mlQuantity === ml
                                          ? 'bg-cyan-500 text-black font-black shadow-glow'
                                          : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                                      }`}
                                    >
                                      {ml} ml
                                    </button>
                                  ))}
                                </div>

                                {/* Demonstração do Cálculo Proporcional */}
                                <div className="p-3 bg-black/70 border border-cyan-500/20 rounded-xl space-y-1 font-mono text-[8.5px]">
                                  <p className="text-[8px] font-black uppercase text-cyan-400 font-sans tracking-wider mb-1 flex items-center gap-1">
                                    <span>⚡ Cálculo Automático Proporcional:</span>
                                  </p>
                                  <div className="flex justify-between text-zinc-400">
                                    <span>• Valor do Litro Cadastrado:</span>
                                    <span className="text-white">R$ {unitPrice.toFixed(2).replace('.', ',')}</span>
                                  </div>
                                  <div className="flex justify-between text-zinc-400">
                                    <span>• Valor por 1 ML (R$ {unitPrice.toFixed(2)} ÷ 1.000):</span>
                                    <span className="text-cyan-300">R$ {pricePerMl.toFixed(4).replace('.', ',')} / ml</span>
                                  </div>
                                  <div className="flex justify-between text-zinc-400">
                                    <span>• Baixa Física do Estoque ({mlUsed} ÷ 1.000):</span>
                                    <span className="text-zinc-200">{mlLitersEquivalent.toFixed(3).replace('.', ',')} Litro(s)</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-cyan-500/30 text-xs font-black font-sans">
                                    <span className="text-white uppercase">Total a Faturar na O.S.:</span>
                                    <span className="text-cyan-400 font-mono text-sm">
                                      R$ {mlTotalCalculated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Modo Litro / Padrão */
                              <div className="space-y-2.5">
                                <div className="flex justify-between items-center">
                                  <label className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">
                                    Quantidade em {currentUnit.toUpperCase()}:
                                  </label>
                                  <span className="text-[8px] font-mono text-zinc-500">
                                    Saldo Físico: {selectedItemToLink.quantity} {currentUnit}
                                  </span>
                                </div>

                                <div className="relative">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.01"
                                    placeholder="QUANTIDADE"
                                    value={osPartFormData.quantity || ''}
                                    onChange={e => setOsPartFormData({ ...osPartFormData, quantity: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-black border border-zinc-800 p-3 pr-14 rounded-xl text-white font-black text-sm outline-none focus:border-green-500 font-mono"
                                  />
                                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-black text-xs uppercase font-mono">
                                    {currentUnit}
                                  </span>
                                </div>

                                {/* Atalhos Rápidos para Litros */}
                                {isFluidOrLiter && (
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    <span className="text-[7px] font-black uppercase text-zinc-500 self-center mr-1">Rápido:</span>
                                    {[0.5, 1, 1.5, 2, 3, 4, 5].map(l => (
                                      <button
                                        key={l}
                                        type="button"
                                        onClick={() => setOsPartFormData({ ...osPartFormData, quantity: l })}
                                        className={`px-2 py-1 rounded-md text-[8px] font-mono font-black transition-all ${
                                          osPartFormData.quantity === l
                                            ? 'bg-green-500 text-black font-black'
                                            : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                                        }`}
                                      >
                                        {l} L
                                      </button>
                                    ))}
                                  </div>
                                )}

                                <div className="p-2.5 bg-black/60 border border-zinc-800 rounded-xl flex justify-between items-center text-xs font-black">
                                  <span className="text-zinc-400 text-[8px] uppercase">Total da Peça na O.S.:</span>
                                  <span className="text-green-500 font-mono text-sm">
                                    R$ {stdTotalCalculated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* SELETOR DIRETO: VINCULAR A UMA MÃO DE OBRA JÁ EXISTENTE NESTA PRÓPRIA O.S. */}
                            {selectedOS.laborItems.length > 0 && (
                              <div className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                                osPartTargetLaborId
                                  ? 'bg-green-950/30 border-2 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                                  : 'bg-zinc-950/90 border-zinc-800'
                              }`}>
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-[8.5px] font-black uppercase text-green-400 tracking-wider flex items-center gap-1.5">
                                    <Wrench size={12} />
                                    <span>🛠️ Vincular a uma Mão de Obra já existente nesta O.S. (1 ou + peças na mesma M.O.):</span>
                                  </label>
                                  {osPartTargetLaborId && (
                                    <button
                                      type="button"
                                      onClick={() => setOsPartTargetLaborId('')}
                                      className="text-[8px] font-black uppercase text-zinc-400 hover:text-red-400 underline"
                                    >
                                      Limpar seleção
                                    </button>
                                  )}
                                </div>

                                <select
                                  value={osPartTargetLaborId}
                                  onChange={e => setOsPartTargetLaborId(e.target.value)}
                                  className="w-full bg-black border border-zinc-700 focus:border-green-500 p-2.5 rounded-xl text-white font-black text-[10px] uppercase outline-none cursor-pointer"
                                >
                                  <option value="">
                                    -- NÃO VINCULAR A M.O. JÁ LANÇADA (USAR REGRA DO CATÁLOGO / AVULSA) --
                                  </option>
                                  {selectedOS.laborItems.map(l => {
                                    const countParts = selectedOS.parts.filter(
                                      p => p.linkedLaborId === l.id || (!p.linkedLaborId && p.linkedLaborDescription && p.linkedLaborDescription.toLowerCase() === l.description.toLowerCase())
                                    ).length;
                                    const val = getLaborFinalValue(l);
                                    return (
                                      <option key={l.id} value={l.id}>
                                        🛠️ {l.description.toUpperCase()} — R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({countParts} peça{countParts === 1 ? '' : 's'} já vinculada{countParts === 1 ? '' : 's'})
                                      </option>
                                    );
                                  })}
                                </select>

                                {osPartTargetLaborId && (() => {
                                  const chosenOSLabor = selectedOS.laborItems.find(l => l.id === osPartTargetLaborId);
                                  if (!chosenOSLabor) return null;
                                  return (
                                    <p className="text-[9px] text-green-300 font-bold leading-snug">
                                      ✓ Ao confirmar, <strong className="text-white">"{selectedItemToLink.name}"</strong> será adicionada à M.O. <strong className="text-green-400">"{chosenOSLabor.description}"</strong> já aberta nesta O.S., sem duplicar o valor do serviço.
                                    </p>
                                  );
                                })()}
                              </div>
                            )}

                            {/* AVISO DE VÍNCULO AUTOMÁTICO DE MÃO DE OBRA (Se a peça estiver amarrada a um modelo e não estiver vinculando a uma M.O. já lançada) */}
                            {!osPartTargetLaborId && (() => {
                              const matchedTemplate = findLaborTemplateForPart(selectedItemToLink, laborTemplates);
                              if (!matchedTemplate || isQuickBindingCatalogInOS) {
                                return (
                                  <div className="p-3.5 bg-zinc-950/90 border border-zinc-800 rounded-2xl space-y-3 text-zinc-400 text-[10px]">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <span className="flex items-center gap-2">
                                        <Package size={14} className="text-amber-400 shrink-0" />
                                        <span>
                                          {matchedTemplate
                                            ? `Alterando vínculo de catálogo da peça "${selectedItemToLink.name}"`
                                            : 'Esta peça não possui mão de obra amarrada no catálogo. Ao vincular, entrará como insumo/peça avulsa (ou escolha uma M.O. acima).'}
                                        </span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!isQuickBindingCatalogInOS) {
                                            setQuickBindTemplateId(matchedTemplate?.id || '');
                                            setQuickBindModeInOS(selectedOS.laborItems.length > 0 ? 'os_existing' : 'existing');
                                            setQuickNewTemplateForm({
                                              description: `TROCA DE ${selectedItemToLink.name.toUpperCase()}`,
                                              pricingType: 'hourly',
                                              defaultHours: 1,
                                              minutes: 0,
                                              defaultValuePerHour: currentTenant.defaultHourlyRate || 150,
                                              fixedValue: 150,
                                              sectionId: selectedItemToLink.sectionId || ''
                                            });
                                            setIsQuickBindingCatalogInOS(true);
                                          } else {
                                            setIsQuickBindingCatalogInOS(false);
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-green-500/15 hover:bg-green-500 hover:text-black text-green-400 border border-green-500/40 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap cursor-pointer"
                                      >
                                        {isQuickBindingCatalogInOS ? '✕ Fechar Painel' : '🔗 Amarrar no Catálogo ↗'}
                                      </button>
                                    </div>

                                    {isQuickBindingCatalogInOS && (
                                      <div className="p-3.5 bg-black border border-green-500/40 rounded-xl space-y-3 animate-in fade-in duration-150">
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                                          <span className="text-[9px] font-black uppercase text-green-400 tracking-wider flex items-center gap-1.5">
                                            <Wrench size={12} /> Vincular "{selectedItemToLink.name}" a uma Mão de Obra
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setLaborTemplateFormData(prev => ({
                                                ...prev,
                                                description: prev.description || `TROCA DE ${selectedItemToLink.name.toUpperCase()}`,
                                                linkedItemIds: Array.from(new Set([...(prev.linkedItemIds || []), selectedItemToLink.id]))
                                              }));
                                              setIsQuickBindingCatalogInOS(false);
                                              setSelectedOS(null);
                                              setActiveTab('config');
                                              setConfigSubTab('labor');
                                            }}
                                            className="text-[8px] font-black uppercase text-zinc-400 hover:text-green-400 underline cursor-pointer"
                                          >
                                            Ir para Tela Completa do Catálogo ↗
                                          </button>
                                        </div>

                                        {/* Seletor de Modo: M.O. Desta O.S. vs M.O. do Catálogo vs Criar Nova */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                                          <button
                                            type="button"
                                            onClick={() => setQuickBindModeInOS('os_existing')}
                                            className={`py-1.5 px-2 rounded-md text-[8px] font-black uppercase transition-all ${
                                              quickBindModeInOS === 'os_existing'
                                                ? 'bg-green-500 text-black'
                                                : 'text-zinc-400 hover:text-white'
                                            }`}
                                          >
                                            🛠️ M.O. Desta O.S. ({selectedOS.laborItems.length})
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setQuickBindModeInOS('existing')}
                                            className={`py-1.5 px-2 rounded-md text-[8px] font-black uppercase transition-all ${
                                              quickBindModeInOS === 'existing'
                                                ? 'bg-green-500 text-black'
                                                : 'text-zinc-400 hover:text-white'
                                            }`}
                                          >
                                            📋 M.O. do Catálogo ({laborTemplates.length})
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setQuickBindModeInOS('new')}
                                            className={`py-1.5 px-2 rounded-md text-[8px] font-black uppercase transition-all ${
                                              quickBindModeInOS === 'new'
                                                ? 'bg-green-500 text-black'
                                                : 'text-zinc-400 hover:text-white'
                                            }`}
                                          >
                                            ➕ Nova no Catálogo
                                          </button>
                                        </div>

                                        {quickBindModeInOS === 'os_existing' ? (
                                          <div className="space-y-2.5">
                                            {selectedOS.laborItems.length === 0 ? (
                                              <div className="p-3 bg-zinc-900/70 rounded-lg text-center space-y-2">
                                                <p className="text-[9px] text-zinc-400">Nenhum serviço lançado nesta O.S. ainda.</p>
                                                <button
                                                  type="button"
                                                  onClick={() => setQuickBindModeInOS('existing')}
                                                  className="px-3 py-1.5 bg-green-500 text-black font-black text-[8.5px] uppercase rounded-lg"
                                                >
                                                  Escolher do Catálogo de M.O.
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="space-y-2">
                                                <label className="text-[8px] font-black uppercase text-zinc-400 block">
                                                  Escolha uma Mão de Obra já lançada nesta O.S. para vincular esta peça:
                                                </label>
                                                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                                  {selectedOS.laborItems.map(l => {
                                                    const countParts = selectedOS.parts.filter(
                                                      p => p.linkedLaborId === l.id || (!p.linkedLaborId && p.linkedLaborDescription && p.linkedLaborDescription.toLowerCase() === l.description.toLowerCase())
                                                    ).length;
                                                    const val = getLaborFinalValue(l);
                                                    return (
                                                      <button
                                                        key={l.id}
                                                        type="button"
                                                        onClick={() => {
                                                          setOsPartTargetLaborId(l.id);
                                                          setIsQuickBindingCatalogInOS(false);
                                                        }}
                                                        className="w-full p-2.5 rounded-lg bg-zinc-950 hover:bg-green-500/15 border border-zinc-800 hover:border-green-500 text-left flex items-center justify-between gap-2 transition-all"
                                                      >
                                                        <div>
                                                          <span className="text-[9.5px] font-black uppercase text-white block">
                                                            🛠️ {l.description}
                                                          </span>
                                                          <span className="text-[8px] text-zinc-400 font-mono">
                                                            {countParts} peça(s) já vinculada(s) nesta O.S.
                                                          </span>
                                                        </div>
                                                        <span className="px-2.5 py-1 bg-green-500 text-black font-black text-[8px] uppercase rounded-md shrink-0">
                                                          Selecionar (R$ {val.toLocaleString('pt-BR')})
                                                        </span>
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ) : quickBindModeInOS === 'existing' ? (
                                          <div className="space-y-2.5">
                                            {laborTemplates.length === 0 ? (
                                              <div className="p-3 bg-zinc-900/70 rounded-lg text-center space-y-2">
                                                <p className="text-[9px] text-zinc-400">Nenhuma mão de obra cadastrada no catálogo ainda.</p>
                                                <button
                                                  type="button"
                                                  onClick={() => setQuickBindModeInOS('new')}
                                                  className="px-3 py-1.5 bg-green-500 text-black font-black text-[8.5px] uppercase rounded-lg"
                                                >
                                                  + Criar Primeira Mão de Obra Agora
                                                </button>
                                              </div>
                                            ) : (
                                              <>
                                                <label className="text-[8px] font-black uppercase text-zinc-400 block">
                                                  Selecione a Mão de Obra do Catálogo para amarrar esta peça:
                                                </label>
                                                <select
                                                  value={quickBindTemplateId}
                                                  onChange={e => setQuickBindTemplateId(e.target.value)}
                                                  className="w-full bg-zinc-950 border border-zinc-700 p-2.5 rounded-lg text-white font-black text-[10px] uppercase outline-none focus:border-green-500"
                                                >
                                                  <option value="">-- SELECIONE A MÃO DE OBRA --</option>
                                                  {laborTemplates.map(t => {
                                                    const g = computeLaborGross(t);
                                                    const sec = vehicleSections.find(s => s.id === t.sectionId);
                                                    return (
                                                      <option key={t.id} value={t.id}>
                                                        {t.description.toUpperCase()} — {t.pricingType === 'fixed' ? `FIXO R$ ${(t.fixedValue || 0).toLocaleString('pt-BR')}` : `R$ ${g.toLocaleString('pt-BR')} (${t.defaultHours}h${t.minutes ? ` ${t.minutes}m` : ''})`}{sec ? ` [${sec.name}]` : ''}
                                                      </option>
                                                    );
                                                  })}
                                                </select>
                                                <button
                                                  type="button"
                                                  onClick={() => handleQuickBindPartToExistingTemplate(selectedItemToLink, quickBindTemplateId)}
                                                  className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[9px] rounded-lg shadow-glow transition-all active:scale-95"
                                                >
                                                  ✓ Salvar Vínculo no Catálogo e Ativar nesta O.S.
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="space-y-2.5">
                                            <div>
                                              <label className="text-[8px] font-black uppercase text-zinc-400 block mb-1">
                                                Descrição da Nova Mão de Obra *
                                              </label>
                                              <input
                                                type="text"
                                                placeholder="EX: TROCA DE MANGA DE EIXO DIANTEIRA"
                                                value={quickNewTemplateForm.description}
                                                onChange={e => setQuickNewTemplateForm({ ...quickNewTemplateForm, description: e.target.value })}
                                                className="w-full bg-zinc-950 border border-zinc-700 p-2.5 rounded-lg text-white font-black text-[10px] uppercase outline-none focus:border-green-500"
                                              />
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                              <button
                                                type="button"
                                                onClick={() => setQuickNewTemplateForm({ ...quickNewTemplateForm, pricingType: 'hourly' })}
                                                className={`p-2 rounded-lg border text-[8.5px] font-black uppercase ${
                                                  quickNewTemplateForm.pricingType === 'hourly'
                                                    ? 'bg-green-500/15 border-green-500 text-green-400'
                                                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                                                }`}
                                              >
                                                ⏱️ Por Tempo (Horas/Min)
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setQuickNewTemplateForm({ ...quickNewTemplateForm, pricingType: 'fixed' })}
                                                className={`p-2 rounded-lg border text-[8.5px] font-black uppercase ${
                                                  quickNewTemplateForm.pricingType === 'fixed'
                                                    ? 'bg-amber-500/15 border-amber-500 text-amber-400'
                                                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                                                }`}
                                              >
                                                ⚡ Valor Fixo (Dificuldade)
                                              </button>
                                            </div>

                                            {quickNewTemplateForm.pricingType === 'hourly' ? (
                                              <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                  <label className="text-[7.5px] font-black uppercase text-zinc-500 block mb-0.5">Horas</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    value={quickNewTemplateForm.defaultHours}
                                                    onChange={e => setQuickNewTemplateForm({ ...quickNewTemplateForm, defaultHours: Math.max(0, parseInt(e.target.value) || 0) })}
                                                    className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded-lg text-white font-mono font-black text-[10px]"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-[7.5px] font-black uppercase text-zinc-500 block mb-0.5">Minutos</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    max="59"
                                                    value={quickNewTemplateForm.minutes}
                                                    onChange={e => setQuickNewTemplateForm({ ...quickNewTemplateForm, minutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })}
                                                    className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded-lg text-white font-mono font-black text-[10px]"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-[7.5px] font-black uppercase text-zinc-500 block mb-0.5">R$ / Hora</label>
                                                  <input
                                                    type="number"
                                                    step="any"
                                                    value={quickNewTemplateForm.defaultValuePerHour}
                                                    onChange={e => setQuickNewTemplateForm({ ...quickNewTemplateForm, defaultValuePerHour: parseFloat(e.target.value) || 0 })}
                                                    className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded-lg text-green-400 font-mono font-black text-[10px]"
                                                  />
                                                </div>
                                              </div>
                                            ) : (
                                              <div>
                                                <label className="text-[7.5px] font-black uppercase text-amber-400 block mb-0.5">Valor Fixo (R$)</label>
                                                <input
                                                  type="number"
                                                  step="any"
                                                  value={quickNewTemplateForm.fixedValue}
                                                  onChange={e => setQuickNewTemplateForm({ ...quickNewTemplateForm, fixedValue: parseFloat(e.target.value) || 0 })}
                                                  className="w-full bg-zinc-950 border border-amber-500/40 p-2 rounded-lg text-amber-400 font-mono font-black text-[10px]"
                                                />
                                              </div>
                                            )}

                                            <div>
                                              <label className="text-[7.5px] font-black uppercase text-zinc-500 block mb-0.5">
                                                Setor do Veículo (p/ M.O. Compartilhada)
                                              </label>
                                              <select
                                                value={quickNewTemplateForm.sectionId}
                                                onChange={e => setQuickNewTemplateForm({ ...quickNewTemplateForm, sectionId: e.target.value })}
                                                className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded-lg text-white font-black text-[9.5px] uppercase"
                                              >
                                                <option value="">-- SEM SETOR ESPECÍFICO --</option>
                                                {vehicleSections.map(s => (
                                                  <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                              </select>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() => handleQuickCreateAndBindLaborTemplateInOS(selectedItemToLink)}
                                              className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[9px] rounded-lg shadow-glow transition-all active:scale-95"
                                            >
                                              + Cadastrar no Catálogo e Amarrar Peça Agora
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              const sec = vehicleSections.find(s => s.id === matchedTemplate.sectionId);
                              const secName = sec?.name || '';
                              const grossLabor = computeLaborGross(matchedTemplate);
                              const selectedSharedLaborInOS = selectedOS.laborItems.length > 0 && osPartSharedLaborId
                                ? selectedOS.laborItems.find(l => l.id === osPartSharedLaborId)
                                : undefined;

                              let previewDiscountPct = 0;
                              let previewDiscountVal = 0;
                              if (selectedSharedLaborInOS) {
                                if (osPartSharedDiscountType === 'percentage') {
                                  previewDiscountPct = Math.min(100, Math.max(0, Number(osPartSharedDiscountPct) || 0));
                                  previewDiscountVal = Number(((grossLabor * previewDiscountPct) / 100).toFixed(2));
                                } else {
                                  previewDiscountVal = Math.min(grossLabor, Math.max(0, Number(osPartSharedDiscountVal) || 0));
                                  previewDiscountPct = grossLabor > 0 ? Math.round((previewDiscountVal / grossLabor) * 100) : 0;
                                }
                              }
                              const previewFinalLabor = Math.max(0, Number((grossLabor - previewDiscountVal).toFixed(2)));

                              return (
                                <div className="p-4 bg-gradient-to-r from-green-950/60 via-zinc-950 to-zinc-900 border-2 border-green-500 rounded-2xl space-y-3.5 animate-in fade-in shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                                  <div className="flex items-start gap-3">
                                    <div className="p-2.5 bg-green-500 text-black font-black rounded-xl shrink-0 mt-0.5 shadow-glow">
                                      <Wrench size={18} />
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="px-2 py-0.5 bg-green-500 text-black text-[8px] font-black uppercase tracking-wider rounded font-mono shadow-glow">
                                            ⚡ VÍNCULO AUTOMÁTICO DE MÃO DE OBRA ATIVO
                                          </span>
                                          {selectedSharedLaborInOS && (
                                            <span className="px-2 py-0.5 bg-amber-500 text-black text-[8px] font-black uppercase tracking-wider rounded font-mono">
                                              🔗 M.O. COMPARTILHADA COM: {selectedSharedLaborInOS.description} (-{previewDiscountPct}%)
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuickBindTemplateId(matchedTemplate.id);
                                            setQuickBindModeInOS('existing');
                                            setIsQuickBindingCatalogInOS(true);
                                          }}
                                          className="text-[8px] font-black uppercase text-zinc-400 hover:text-green-400 underline"
                                        >
                                          Trocar Vínculo ↗
                                        </button>
                                      </div>
                                      <p className="text-xs sm:text-sm font-black uppercase text-white mt-1.5 leading-snug">
                                        Ao vincular este item será criada a mão de obra:
                                        <span className="text-green-400 font-extrabold italic block sm:inline sm:ml-1 underline decoration-green-500/50">
                                          "{matchedTemplate.description}"
                                        </span>
                                      </p>
                                      <div className="flex items-center gap-2 mt-2 flex-wrap text-[9px] font-mono">
                                        <span className="px-2 py-1 bg-black rounded-lg border border-zinc-800 text-zinc-300">
                                          {matchedTemplate.pricingType === 'fixed'
                                            ? `⚡ Preço Fixo (Dificuldade): R$ ${(matchedTemplate.fixedValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                            : `⏱️ Tempo: ${matchedTemplate.defaultHours}h ${matchedTemplate.minutes ? `${matchedTemplate.minutes}m` : ''} • R$ ${matchedTemplate.defaultValuePerHour}/h (Total: R$ ${grossLabor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
                                          }
                                        </span>
                                        {secName && (
                                          <span className="px-2 py-1 bg-black rounded-lg border border-zinc-800 text-zinc-300 font-sans font-bold uppercase">
                                            Setor: {secName}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-green-500/20 flex items-center justify-between">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={autoCreateLaborOnPartLink}
                                        onChange={e => {
                                          setAutoCreateLaborOnPartLink(e.target.checked);
                                          if (!e.target.checked) {
                                            setOsPartSharedLaborId('');
                                          }
                                        }}
                                        className="w-4 h-4 accent-green-500 rounded cursor-pointer"
                                      />
                                      <span className="text-[9px] font-black uppercase text-zinc-300 hover:text-white">
                                        Criar e incluir automaticamente esta M.O. na O.S. ao confirmar
                                      </span>
                                    </label>
                                  </div>

                                  {/* CAMPO DE MÃO DE OBRA COMPARTILHADA: SOMENTE SE JÁ EXISTIR MÃO DE OBRA NESTA O.S. */}
                                  {autoCreateLaborOnPartLink && selectedOS.laborItems.length > 0 && matchedTemplate.pricingType !== 'fixed' && (
                                    <div className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                                      selectedSharedLaborInOS
                                        ? 'bg-amber-950/25 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                                        : 'bg-black/80 border-zinc-800'
                                    }`}>
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <label className="text-[8.5px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                                          <span>🔗 Mão de Obra Compartilhada (Opcional — Escolha qual M.O. desta O.S. vincular):</span>
                                        </label>
                                        {selectedSharedLaborInOS && (
                                          <button
                                            type="button"
                                            onClick={() => setOsPartSharedLaborId('')}
                                            className="text-[8px] font-black uppercase text-zinc-400 hover:text-red-400 underline"
                                          >
                                            Remover compartilhamento
                                          </button>
                                        )}
                                      </div>

                                      <select
                                        value={osPartSharedLaborId}
                                        onChange={e => {
                                          const nextId = e.target.value;
                                          setOsPartSharedLaborId(nextId);
                                          const chosenL = selectedOS.laborItems.find(l => l.id === nextId);
                                          if (chosenL) {
                                            const defaultPct = matchedTemplate.discountPercentage || 50;
                                            setOsPartSharedDiscountPct(defaultPct);
                                            setOsPartSharedDiscountVal(
                                              matchedTemplate.discountValue || Number(((grossLabor * defaultPct) / 100).toFixed(2))
                                            );
                                            setOsPartSharedReason(
                                              matchedTemplate.sharedNotes ||
                                              `Metade do serviço (desmontagem) já executado na M.O. "${chosenL.description}"`
                                            );
                                          }
                                        }}
                                        className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 p-2.5 rounded-xl text-white font-black text-[9.5px] uppercase outline-none cursor-pointer"
                                      >
                                        <option value="">
                                          -- NÃO COMPARTILHAR (COBRAR M.O. INTEGRAL: R$ {grossLabor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) --
                                        </option>
                                        {selectedOS.laborItems.map(l => {
                                          const lVal = getLaborFinalValue(l);
                                          return (
                                            <option key={l.id} value={l.id}>
                                              🔗 COMPARTILHAR COM: {l.description.toUpperCase()} — R$ {lVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{l.section ? ` [${l.section}]` : ''}
                                            </option>
                                          );
                                        })}
                                      </select>

                                      {selectedSharedLaborInOS && (
                                        <div className="space-y-2.5 pt-2 border-t border-amber-500/20 animate-in fade-in duration-150">
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            <div>
                                              <label className="text-[7.5px] font-black uppercase text-zinc-400 block mb-1">
                                                Tipo de Desconto Compartilhado
                                              </label>
                                              <select
                                                value={osPartSharedDiscountType}
                                                onChange={e => setOsPartSharedDiscountType(e.target.value as 'percentage' | 'fixed')}
                                                className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded-lg text-white font-black text-[9px] uppercase outline-none focus:border-amber-500"
                                              >
                                                <option value="percentage">PORCENTAGEM (%)</option>
                                                <option value="fixed">VALOR FIXO (R$)</option>
                                              </select>
                                            </div>

                                            <div>
                                              <label className="text-[7.5px] font-black uppercase text-zinc-400 block mb-1">
                                                {osPartSharedDiscountType === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}
                                              </label>
                                              <input
                                                type="number"
                                                min="0"
                                                max={osPartSharedDiscountType === 'percentage' ? 100 : grossLabor}
                                                step="any"
                                                value={osPartSharedDiscountType === 'percentage' ? osPartSharedDiscountPct : osPartSharedDiscountVal}
                                                onChange={e => {
                                                  const val = parseFloat(e.target.value) || 0;
                                                  if (osPartSharedDiscountType === 'percentage') {
                                                    setOsPartSharedDiscountPct(val);
                                                  } else {
                                                    setOsPartSharedDiscountVal(val);
                                                  }
                                                }}
                                                className="w-full bg-zinc-950 border border-amber-500/50 p-2 rounded-lg text-amber-400 font-mono font-black text-xs outline-none focus:border-amber-400"
                                              />
                                            </div>
                                          </div>

                                          {osPartSharedDiscountType === 'percentage' && (
                                            <div className="flex flex-wrap items-center gap-1">
                                              <span className="text-[7.5px] font-black uppercase text-zinc-500 mr-1">Atalhos:</span>
                                              {[30, 40, 50, 60, 70].map(pct => (
                                                <button
                                                  key={pct}
                                                  type="button"
                                                  onClick={() => setOsPartSharedDiscountPct(pct)}
                                                  className={`px-2 py-0.5 rounded text-[8px] font-mono font-black transition-all ${
                                                    osPartSharedDiscountPct === pct
                                                      ? 'bg-amber-500 text-black'
                                                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                                                  }`}
                                                >
                                                  {pct}%
                                                </button>
                                              ))}
                                            </div>
                                          )}

                                          <div>
                                            <label className="text-[7.5px] font-black uppercase text-zinc-400 block mb-1">
                                              Justificativa Técnica (Impressa na O.S.)
                                            </label>
                                            <input
                                              type="text"
                                              value={osPartSharedReason}
                                              onChange={e => setOsPartSharedReason(e.target.value)}
                                              placeholder={`Ex: Aproveitamento da desmontagem de "${selectedSharedLaborInOS.description}"`}
                                              className="w-full bg-zinc-950 border border-zinc-700 p-2 rounded-lg text-zinc-200 text-[9px] outline-none focus:border-amber-500"
                                            />
                                          </div>

                                          <div className="p-2.5 bg-black/90 border border-amber-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono">
                                            <span className="text-zinc-400">
                                              Integral: <strong className="text-zinc-200">R$ {grossLabor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                            </span>
                                            <span className="text-amber-400 font-bold">
                                              Desc. ({previewDiscountPct}%): - R$ {previewDiscountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-green-400 font-black">
                                              Valor Final M.O.: R$ {previewFinalLabor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Botão de confirmação de vinculação */}
                            {(() => {
                              const matchedTemplate = findLaborTemplateForPart(selectedItemToLink, laborTemplates);
                              const chosenExistingLabor = osPartTargetLaborId
                                ? selectedOS.laborItems.find(l => l.id === osPartTargetLaborId)
                                : undefined;
                              const chosenSharedLabor = !chosenExistingLabor && selectedOS.laborItems.length > 0 && osPartSharedLaborId
                                ? selectedOS.laborItems.find(l => l.id === osPartSharedLaborId)
                                : undefined;
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleAddPartToOS(selectedOS.id)}
                                  className="w-full py-4 bg-green-500 text-black font-black uppercase text-[10px] rounded-xl shadow-glow hover:bg-green-400 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <Wrench size={16} />
                                  <span>
                                    {chosenExistingLabor
                                      ? `+ Vincular Peça à M.O. da O.S. "${chosenExistingLabor.description}"`
                                      : matchedTemplate && autoCreateLaborOnPartLink && chosenSharedLabor
                                      ? `+ Vincular Peça e Criar M.O. Compartilhada "${matchedTemplate.description}"`
                                      : matchedTemplate && autoCreateLaborOnPartLink
                                      ? `+ Vincular Peça e Criar M.O. "${matchedTemplate.description}"`
                                      : '+ Vincular Peça à Ordem de Serviço'}
                                  </span>
                                </button>
                              );
                            })()}
                          </div>
                        );
                      })()}

                      {/* Delayed Deduct Stock mechanism */}
                      <div className="pt-2 space-y-2">
                         {(() => {
                           const pendingPartsCount = selectedOS.parts.filter(p => p.stockDeducted === false).length;
                           const hasPendingDeduction = !selectedOS.stockDeducted || pendingPartsCount > 0;

                           if (hasPendingDeduction) {
                             return (
                               <button 
                                 type="button"
                                 onClick={() => handleDeductStockForOS(selectedOS.id)} 
                                 className="w-full py-3.5 bg-green-500 text-black font-black uppercase text-[10px] rounded-xl shadow-glow hover:bg-green-400 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                               >
                                 <CheckCircle2 size={15} />
                                 <span>
                                   {pendingPartsCount > 0 && selectedOS.parts.some(p => p.stockDeducted === true)
                                     ? `🟢 EFETIVAR BAIXA DAS NOVAS PEÇAS NO ESTOQUE (${pendingPartsCount} PENDENTE${pendingPartsCount > 1 ? 'S' : ''})`
                                     : '🟢 EFETIVAR BAIXA DAS PEÇAS DESTA O.S. NO ESTOQUE'}
                                 </span>
                               </button>
                             );
                           }

                           return (
                             <div className="space-y-2">
                               <button
                                 type="button"
                                 onClick={() => setShowStockDeductOptionsInOS(prev => !prev)}
                                 className="w-full p-3 bg-zinc-950 hover:bg-zinc-900 border border-green-500/40 hover:border-green-500 rounded-xl flex items-center justify-between gap-2 text-green-400 transition-all cursor-pointer"
                                 title="Clique para gerenciar, reprocessar ou estornar a baixa de estoque desta O.S."
                               >
                                 <div className="flex items-center gap-2">
                                   <CheckCircle2 size={15} className="shrink-0 text-green-500" />
                                   <span className="text-[8.5px] font-black uppercase tracking-wider italic">
                                     ✅ BAIXA DAS PEÇAS DESTA O.S. EFETUADA NO ESTOQUE
                                   </span>
                                 </div>
                                 <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-green-500/15 text-green-300 border border-green-500/30">
                                   {showStockDeductOptionsInOS ? 'Fechar ✕' : 'Gerenciar / Efetivar ▾'}
                                 </span>
                               </button>

                               {showStockDeductOptionsInOS && (
                                 <div className="p-3 bg-black border border-green-500/40 rounded-xl space-y-2 animate-in fade-in duration-150">
                                   <p className="text-[8.5px] text-zinc-400 leading-relaxed">
                                     Caso tenha lançado peças antes e queira forçar a baixa física no estoque agora, ou deseje estornar a baixa para devolver o saldo ao estoque:
                                   </p>
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                     <button
                                       type="button"
                                       onClick={() => handleDeductStockForOS(selectedOS.id, true)}
                                       className="py-2.5 px-3 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[8.5px] rounded-lg shadow-glow transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                     >
                                       <CheckCircle2 size={13} />
                                       <span>Efetivar Baixa Agora</span>
                                     </button>
                                     <button
                                       type="button"
                                       onClick={() => handleRevertStockForOS(selectedOS.id)}
                                       className="py-2.5 px-3 bg-zinc-900 hover:bg-amber-500 hover:text-black text-amber-400 border border-amber-500/40 font-black uppercase text-[8.5px] rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                     >
                                       <RotateCcw size={13} />
                                       <span>Estornar / Reabrir Baixa</span>
                                     </button>
                                   </div>
                                 </div>
                               )}
                             </div>
                           );
                         })()}
                      </div>
                   </div>
                </div>
              </div>

              {/* Observações da O.S. */}
              {selectedOS.observations && (
                <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl">
                   <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider mb-1 italic">Observações da O.S.:</p>
                   <p className="text-xs text-zinc-300 uppercase whitespace-pre-wrap font-mono">{selectedOS.observations}</p>
                </div>
              )}

              {/* Resumo Financeiro */}
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl sm:rounded-3xl shadow-xl">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 italic flex items-center gap-2">
                      <BarChart3 size={15} /> Resumo Financeiro da O.S. #{selectedOS.osNumber}
                    </h4>
                 </div>
                 {(() => {
                   const totalParts = selectedOS.parts.reduce((acc, p) => acc + getPartFinalValue(p), 0);
                   const grossLabor = selectedOS.laborItems.reduce((acc, l) => acc + getLaborOriginalValue(l), 0);
                   const netLabor = selectedOS.laborItems.reduce((acc, l) => acc + getLaborFinalValue(l), 0);
                   const laborSavings = grossLabor - netLabor;
                   const totalOS = totalParts + netLabor;

                   return (
                     <div className="space-y-4">
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="bg-black p-4 rounded-xl border border-zinc-800">
                             <p className="text-[8px] font-black uppercase text-zinc-500 mb-1">Total Peças</p>
                             <p className="text-xl font-black text-white font-mono">R$ {totalParts.toLocaleString('pt-BR')}</p>
                          </div>
                          <div className="bg-black p-4 rounded-xl border border-zinc-800">
                             <div className="flex justify-between items-center mb-1">
                               <p className="text-[8px] font-black uppercase text-zinc-500">Mão de Obra</p>
                               {laborSavings > 0 && (
                                 <span className="text-[7.5px] font-black text-amber-400 uppercase">
                                   Desc: -R$ {laborSavings.toLocaleString('pt-BR')}
                                 </span>
                               )}
                             </div>
                             <p className="text-xl font-black text-white font-mono">R$ {netLabor.toLocaleString('pt-BR')}</p>
                          </div>
                          <div className="bg-green-500 p-4 rounded-xl shadow-glow">
                             <p className="text-[8px] font-black uppercase text-black mb-1">Total Geral da O.S.</p>
                             <p className="text-2xl font-black text-black font-mono">R$ {totalOS.toLocaleString('pt-BR')}</p>
                          </div>
                       </div>
                       {laborSavings > 0 && (
                         <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-amber-400">
                           <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5">
                             🔗 Economia Aplicada por M.O. Compartilhada:
                           </span>
                           <span className="text-xs font-mono font-black">
                             - R$ {laborSavings.toLocaleString('pt-BR')}
                           </span>
                         </div>
                       )}
                     </div>
                   );
                 })()}
              </div>

              {/* Ações Finais */}
              <div className="flex flex-col sm:flex-row gap-3 pb-8">
                 <button onClick={() => deleteOS(selectedOS.id)} className="flex-1 py-4 bg-red-500/10 border border-red-500/20 text-red-400 font-black uppercase text-[10px] rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                   <Trash2 size={15} /> Excluir O.S. Definitivamente
                 </button>
                 <button onClick={() => setShowOSDocumentPreview(true)} className="flex-1 py-4 bg-green-500 text-black font-black uppercase text-[10px] rounded-xl shadow-glow hover:bg-green-400 active:scale-95 transition-all flex items-center justify-center gap-2">
                   <FileText size={15} /> Relatório Técnico / Salvar PDF
                 </button>
                 <button onClick={() => setShowOSDocumentPreview(true)} className="flex-1 py-4 bg-white text-black font-black uppercase text-[10px] rounded-xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                   <Printer size={15} /> Imprimir Ordem de Serviço A4
                 </button>
                 <button onClick={() => setSelectedOS(null)} className="px-6 py-4 bg-zinc-800 text-zinc-300 font-black uppercase text-[10px] rounded-xl hover:bg-zinc-700 transition-all">
                   Fechar
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL ADICIONAR ITEM */}
      {isAddingItem && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex items-end sm:items-center justify-center backdrop-blur-xl p-2 sm:p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[3rem] w-full max-w-2xl shadow-[0_-20px_60px_rgba(34,197,94,0.15)] animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 duration-500 my-auto max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-7 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 shrink-0">
              <h3 className="text-xl sm:text-3xl font-black uppercase italic tracking-tighter text-green-500">Novo Componente BRP</h3>
              <button onClick={() => setIsAddingItem(false)} className="p-2.5 sm:p-3 bg-zinc-800 rounded-xl sm:rounded-2xl text-zinc-400 hover:text-white active:scale-90 transition-transform"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddItem} className="p-4 sm:p-8 space-y-5 sm:space-y-7 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 bg-black/40 border border-zinc-800 p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] shadow-inner">
                 <div className="space-y-1 sm:space-y-2">
                    <div className="flex justify-between items-center px-1">
                       <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Part Number BRP</p>
                       <a 
                         href="https://epc.brp.com/#" 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         className="text-[9px] font-black uppercase text-green-500 hover:text-green-400 hover:underline flex items-center gap-1 italic transition-all active:scale-95"
                       >
                         <ExternalLink size={10} /> Catálogo EPC BRP ↗
                       </a>
                    </div>
                    <input required type="text" placeholder="INSIRA O PART NUMBER" className="w-full bg-zinc-950 border border-zinc-900 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs uppercase outline-none focus:border-green-500 transition-all placeholder:text-zinc-800" value={formData.partNumber} onChange={e => setFormData({...formData, partNumber: e.target.value})} />
                 </div>
                 <div className="space-y-1 sm:space-y-2">
                    <p className="text-[9px] font-black uppercase text-zinc-500 px-1 tracking-widest italic">Descrição Comercial</p>
                    <input required type="text" placeholder="EX: BOMBA DE COMBUSTÍVEL CAN-AM" className="w-full bg-zinc-950 border border-zinc-900 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs sm:text-sm uppercase outline-none focus:border-green-500 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
              </div>
              <div className="space-y-4 sm:space-y-6">
                 <div className="space-y-1 sm:space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                          <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Repartição do Veículo</p>
                          <select required className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs outline-none uppercase" value={formData.sectionId} onChange={e => setFormData({...formData, sectionId: e.target.value})}>
                            <option value="">SELECIONE O SETOR</option>
                            {vehicleSections.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                          </select>
                       </div>
                       <div>
                          <div className="flex justify-between items-center px-4">
                             <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest italic flex items-center gap-1.5">
                               <Wrench size={12} className="text-green-500" /> Mão de Obra Vinculada
                             </p>
                             <span className="text-[8px] font-bold text-green-400 uppercase">⚡ Auto na OS</span>
                          </div>
                          <select 
                            className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs outline-none uppercase focus:border-green-500" 
                            value={formData.laborTemplateId} 
                            onChange={e => setFormData({...formData, laborTemplateId: e.target.value})}
                          >
                            <option value="">-- SEM VÍNCULO (ITEM AVULSO) --</option>
                            {laborTemplates.map(t => (
                              <option key={t.id} value={t.id}>
                                ⚡ {t.description.toUpperCase()} {t.pricingType === 'fixed' ? `(Fixo R$ ${(t.fixedValue || 0).toFixed(2)})` : `(${t.defaultHours}h)`}
                              </option>
                            ))}
                          </select>
                       </div>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                   <div className="space-y-1 sm:space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Grupo Técnico</p>
                      <select required className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs outline-none uppercase" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                        <option value="">SELECIONE O GRUPO TÉCNICO</option>
                        {categories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1 sm:space-y-2">
                      <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Endereço Gaveta</p>
                      <input required type="text" placeholder="EX: A-12" className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-xs uppercase" value={formData.boxNumber} onChange={e => setFormData({...formData, boxNumber: e.target.value})} />
                    </div>
                  </div>

                  {/* TERMINAL DE LEITURA / VÍNCULO DE QR CODE & CÓDIGO DE BARRAS */}
                  <div className="bg-black/40 border border-zinc-800 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-6 space-y-4">
                     <div className="flex justify-between items-center px-1">
                        <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest italic flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${formData.linkedQRCode ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`}></span>
                          Terminal de Vínculo QR Code / Código de Barras
                        </p>
                        <QrCode className="text-zinc-600" size={16} />
                     </div>
                     
                     <div className="bg-zinc-950 border border-zinc-900 rounded-xl sm:rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div className="flex-1 w-full space-y-1">
                           <p className="text-[8px] font-black uppercase text-zinc-600 tracking-wider">Código Capturado</p>
                           <input 
                             type="text" 
                             placeholder="Aguardando scanner manual ou câmera..." 
                             className="w-full bg-transparent border-b border-zinc-800 focus:border-green-500 py-1 text-white font-mono text-xs uppercase outline-none transition-colors"
                             value={formData.linkedQRCode} 
                             onChange={e => setFormData({...formData, linkedQRCode: e.target.value})} 
                           />
                        </div>
                        <button 
                          type="button" 
                          onClick={() => { setScanMode('bind'); setIsScanning(true); }} 
                          className="w-full sm:w-auto px-5 py-3 bg-green-500 hover:bg-green-400 text-black rounded-xl font-black text-[10px] uppercase transition-all tracking-wider flex items-center justify-center gap-2 active:scale-95 shadow-glow"
                        >
                          <QrCode size={14} />
                          Câmera Scanner
                        </button>
                     </div>
                     
                     <div className="text-[9px] font-mono text-zinc-500 uppercase px-1 flex justify-between items-center">
                        <span>ESTADO: {formData.linkedQRCode ? 'VINCULADO' : 'AGUARDANDO LEITURA'}</span>
                        {formData.linkedQRCode && (
                          <button 
                            type="button" 
                            onClick={() => setFormData({...formData, linkedQRCode: ''})} 
                            className="text-red-500 font-bold hover:underline transition-all"
                          >
                            [REMOVER VÍNCULO]
                          </button>
                        )}
                     </div>
                  </div>
                  {/* SELEÇÃO E FILTRO DE UNIDADE DE MEDIDA */}
                  <UnitOfMeasureSelector 
                    value={formData.unit || 'un'} 
                    onChange={u => setFormData({ ...formData, unit: u })} 
                    itemNameHint={formData.name} 
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-1 sm:space-y-2">
                       <div className="flex justify-between items-center ml-4 mr-1">
                         <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest italic">Preço Unitário R$</p>
                         <span className="text-[8px] font-black uppercase text-green-500 font-mono font-bold">Por {formData.unit || 'un'}</span>
                       </div>
                       <input type="number" step="0.01" placeholder="0,00" className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-green-500 font-black text-sm" value={formData.value || ''} onChange={e => setFormData({...formData, value: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                       <div className="flex justify-between items-center ml-4 mr-1">
                         <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest italic">Saldo Inicial</p>
                         <span className="text-[8px] font-black uppercase text-green-500 font-mono font-bold">Em {formData.unit || 'un'}</span>
                       </div>
                       <input required type="number" step="any" placeholder="0" className="w-full bg-black border border-zinc-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl text-white font-black text-sm" value={formData.quantity || ''} onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})} />
                    </div>
                 </div>

                 {/* FOTO DO COMPONENTE */}
                 <div className="bg-black/40 border border-zinc-800 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-6 space-y-4">
                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest italic flex items-center gap-2">
                      <Image size={16} className="text-green-500" />
                      Foto da Peça / Componente (Opcional)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                       <div>
                          <label className="cursor-pointer px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-green-500 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 text-white transition-all">
                             <Upload size={14} className="text-green-500" />
                             Carregar Foto
                             <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'new')} />
                          </label>
                       </div>
                       <input 
                         type="text" 
                         placeholder="Ou cole a URL da imagem..." 
                         value={formData.imageUrl} 
                         onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                         className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-white text-xs outline-none focus:border-green-500" 
                       />
                    </div>
                    {formData.imageUrl && (
                       <div className="relative w-20 h-20 rounded-xl border border-zinc-700 overflow-hidden group">
                          <img src={formData.imageUrl} className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setFormData({ ...formData, imageUrl: '' })}
                            className="absolute inset-0 bg-black/70 flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={16} />
                          </button>
                       </div>
                    )}
                 </div>

                 {/* OBSERVAÇÕES E ESPECIFICAÇÕES */}
                 <div className="space-y-1 sm:space-y-2">
                    <p className="text-[9px] font-black uppercase text-zinc-600 ml-4 tracking-widest italic">Observações / Especificações do Item</p>
                    <textarea 
                      rows={2} 
                      placeholder="Insira detalhes técnicos, especificações ou observações desta peça..." 
                      className="w-full bg-black border border-zinc-800 p-4 rounded-xl sm:rounded-2xl text-white font-medium text-xs outline-none focus:border-green-500 transition-all resize-none" 
                      value={formData.observations} 
                      onChange={e => setFormData({...formData, observations: e.target.value})} 
                    />
                 </div>
              </div>
              <button type="submit" className="w-full py-5 sm:py-6 bg-green-500 text-black font-black uppercase text-[12px] rounded-[3rem] shadow-glow active:scale-95 transition-all">Registrar no Banco de Dados HPS</button>
            </form>
          </div>
        </div>
      )}

      {/* DETALHES MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black z-[250] flex flex-col animate-in slide-in-from-bottom-10 duration-500 overflow-y-auto no-scrollbar">
            <header className="p-4 sm:p-8 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-3xl sticky top-0 z-10">
              <div className="flex flex-col">
                 <span className="text-[10px] sm:text-[11px] font-black text-green-500 uppercase tracking-[0.3em] italic">{selectedItem.category}</span>
                 <span className="text-sm sm:text-lg font-black text-zinc-400 uppercase tracking-tighter italic">Endereço: {selectedItem.boxNumber}</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => handleStartEditItem(selectedItem)} 
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase shadow-glow active:scale-95 transition-all"
                >
                  <Pencil size={14} /> Editar Cadastro
                </button>
                <button onClick={() => setSelectedItem(null)} className="p-3 sm:p-5 bg-zinc-800 rounded-xl sm:rounded-[2rem] text-zinc-500 hover:text-white transition-colors"><X size={20} /></button>
              </div>
            </header>
            
            <div className="flex-1 p-4 sm:p-10 space-y-8 sm:space-y-12 max-w-4xl mx-auto w-full pb-44 sm:pb-40">
              <div className="w-full aspect-square bg-zinc-900 rounded-[2rem] sm:rounded-[3.5rem] border-2 border-zinc-800 overflow-hidden shadow-2xl relative flex items-center justify-center group">
                {selectedItem.imageUrl ? <img src={selectedItem.imageUrl} className="w-full h-full object-cover" /> : <Package size={100} className="text-zinc-800 group-hover:scale-110 transition-transform duration-500" strokeWidth={1} />}
                <div className="absolute bottom-4 left-4 sm:bottom-8 sm:left-8 bg-black/95 px-4 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl border border-zinc-800 text-[9px] sm:text-[11px] font-black text-green-500 shadow-glow italic">PART NUMBER: {selectedItem.partNumber}</div>
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 z-10">
                  <label className="cursor-pointer px-3.5 py-2 bg-black/90 hover:bg-black text-white border border-zinc-700 hover:border-green-500 rounded-xl sm:rounded-2xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md transition-all shadow-xl">
                    <Upload size={13} className="text-green-500" />
                    <span>{selectedItem.imageUrl ? 'Trocar Foto' : 'Adicionar Foto'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'detail')} />
                  </label>
                  {selectedItem.imageUrl && (
                    <button 
                      type="button" 
                      onClick={() => handleUpdateItemPhoto(selectedItem.id, '')}
                      className="p-2.5 bg-black/90 hover:bg-red-500 hover:text-white text-zinc-400 border border-zinc-700 rounded-xl sm:rounded-2xl transition-all shadow-xl"
                      title="Remover foto do item"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="space-y-6 sm:space-y-10">
                <h1 className="text-3xl sm:text-5xl font-black uppercase italic leading-none text-white tracking-tighter">{selectedItem.name}</h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                  <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-2xl sm:rounded-[3rem] shadow-xl">
                    <p className="text-[9px] sm:text-[11px] text-zinc-500 font-black uppercase mb-2 tracking-widest italic">Disponibilidade</p>
                    <p className={`text-4xl sm:text-6xl font-black ${selectedItem.quantity <= selectedItem.minQuantity ? 'text-amber-500 shadow-glow' : 'text-green-500'}`}>{selectedItem.quantity} <span className="text-xs uppercase opacity-40 italic font-black">{selectedItem.unit || 'un'}</span></p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-10 rounded-2xl sm:rounded-[3rem] shadow-xl">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[9px] sm:text-[11px] text-zinc-500 font-black uppercase tracking-widest italic">Preço de Referência</p>
                      <span className="text-[8px] font-bold text-green-500 uppercase tracking-wider">Editável</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xl font-black text-green-500 italic">R$</span>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="bg-black border border-zinc-800 px-3 py-2 rounded-xl text-white font-black text-xl sm:text-2xl outline-none focus:border-green-500 w-full font-mono italic"
                        value={editingItemValue !== null ? editingItemValue : selectedItem.value} 
                        onChange={e => setEditingItemValue(e.target.value)} 
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (editingItemValue !== null && editingItemValue !== "") {
                              const parsed = parseFloat(editingItemValue);
                              if (!isNaN(parsed) && parsed >= 0) {
                                handleUpdateItemValue(selectedItem.id, parsed);
                              }
                            }
                            setEditingItemValue(null);
                          }
                        }}
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          if (editingItemValue !== null && editingItemValue !== "") {
                            const parsed = parseFloat(editingItemValue);
                            if (!isNaN(parsed) && parsed >= 0) {
                              handleUpdateItemValue(selectedItem.id, parsed);
                            }
                          }
                          setEditingItemValue(null);
                        }}
                        className="px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black font-black text-[10px] uppercase rounded-xl shadow-glow transition-all shrink-0 active:scale-95"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                </div>

                {/* OBSERVAÇÕES */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] space-y-3">
                   <div className="flex justify-between items-center">
                      <p className="text-[9px] sm:text-[11px] font-black uppercase text-green-500 italic tracking-widest flex items-center gap-3">
                        <Info size={16} /> Observações & Especificações do Item
                      </p>
                      {!isEditingItemObs ? (
                        <button 
                          type="button" 
                          onClick={() => { setTempObs(selectedItem.observations || ''); setIsEditingItemObs(true); }}
                          className="text-[9px] font-black uppercase text-zinc-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg transition-colors"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            type="button" 
                            onClick={() => setIsEditingItemObs(false)} 
                            className="text-[9px] font-black uppercase text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-800 rounded-lg"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button" 
                            onClick={() => {
                              handleUpdateItemObservations(selectedItem.id, tempObs);
                              setIsEditingItemObs(false);
                            }} 
                            className="text-[9px] font-black uppercase text-black bg-green-500 hover:bg-green-400 px-3 py-1 rounded-lg font-bold shadow-glow"
                          >
                            Salvar
                          </button>
                        </div>
                      )}
                   </div>
                   {isEditingItemObs ? (
                     <textarea 
                       rows={3} 
                       value={tempObs} 
                       onChange={e => setTempObs(e.target.value)} 
                       placeholder="Insira anotações, especificações, compatibilidade ou observações para esta peça..."
                       className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white text-xs outline-none focus:border-green-500 transition-colors resize-none"
                     />
                   ) : (
                     <p className="text-xs sm:text-sm text-zinc-400 font-medium leading-relaxed italic">
                       {selectedItem.observations || "Nenhuma nota ou observação adicional foi registrada para este componente BRP."}
                     </p>
                   )}
                </div>

                {/* HISTÓRICO DE RECOMPRAS DESTA PEÇA */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-8 space-y-6">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                         <h3 className="text-sm sm:text-base font-black uppercase text-white tracking-wider flex items-center gap-2">
                            <TrendingUp size={18} className="text-green-500" />
                            Histórico de Recompras & Aquisições
                         </h3>
                         <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Entradas com custo unitário, nota fiscal e fornecedor</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setIsAddingPurchase(!isAddingPurchase)} 
                        className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-glow active:scale-95 transition-all"
                      >
                        <Plus size={14} /> {isAddingPurchase ? 'Fechar Formulário' : 'Registrar Recompra'}
                      </button>
                   </div>

                   {/* FORMULÁRIO DE NOVA RECOMPRA */}
                   {isAddingPurchase && (
                      <div className="bg-black/60 border border-green-500/30 p-5 sm:p-6 rounded-2xl space-y-4 animate-in fade-in duration-300">
                         <p className="text-[10px] font-black uppercase text-green-500 tracking-widest">Nova Entrada / Recompra de Estoque</p>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="space-y-1">
                               <p className="text-[8px] font-black uppercase text-zinc-500">Quantidade Comprada *</p>
                               <input 
                                 type="number" 
                                 min="1" 
                                 className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white font-black text-sm outline-none focus:border-green-500" 
                                 value={purchaseFormData.quantity} 
                                 onChange={e => setPurchaseFormData({ ...purchaseFormData, quantity: parseInt(e.target.value) || 0 })} 
                               />
                            </div>
                            <div className="space-y-1">
                               <p className="text-[8px] font-black uppercase text-zinc-500">Custo Unitário R$ *</p>
                               <input 
                                 type="number" 
                                 step="0.01" 
                                 placeholder="0,00" 
                                 className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-green-500 font-black text-sm outline-none focus:border-green-500" 
                                 value={purchaseFormData.unitCost || ''} 
                                 onChange={e => setPurchaseFormData({ ...purchaseFormData, unitCost: parseFloat(e.target.value) || 0 })} 
                               />
                            </div>
                            <div className="space-y-1">
                               <p className="text-[8px] font-black uppercase text-zinc-500">Fornecedor / Distribuidor</p>
                               <input 
                                 type="text" 
                                 placeholder="Ex: BRP Brasil, Napa, etc." 
                                 className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white text-xs uppercase outline-none focus:border-green-500" 
                                 value={purchaseFormData.supplier} 
                                 onChange={e => setPurchaseFormData({ ...purchaseFormData, supplier: e.target.value })} 
                               />
                            </div>
                            <div className="space-y-1">
                               <p className="text-[8px] font-black uppercase text-zinc-500">Nº Nota Fiscal (NF)</p>
                               <input 
                                 type="text" 
                                 placeholder="Ex: NF-e 12455" 
                                 className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white text-xs uppercase outline-none focus:border-green-500" 
                                 value={purchaseFormData.invoiceNumber} 
                                 onChange={e => setPurchaseFormData({ ...purchaseFormData, invoiceNumber: e.target.value })} 
                               />
                            </div>
                         </div>
                         <div className="space-y-1">
                            <p className="text-[8px] font-black uppercase text-zinc-500">Observações da Compra</p>
                            <input 
                              type="text" 
                              placeholder="Detalhes adicionais do lote ou do pedido..." 
                              className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white text-xs outline-none focus:border-green-500" 
                              value={purchaseFormData.notes} 
                              onChange={e => setPurchaseFormData({ ...purchaseFormData, notes: e.target.value })} 
                            />
                         </div>
                         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
                            <label className="flex items-center gap-2 cursor-pointer text-[10px] text-zinc-400">
                               <input 
                                 type="checkbox" 
                                 checked={purchaseFormData.updateItemValue} 
                                 onChange={e => setPurchaseFormData({ ...purchaseFormData, updateItemValue: e.target.checked })} 
                                 className="rounded border-zinc-700 text-green-500 focus:ring-green-500"
                               />
                               <span>Atualizar preço de referência do item para este valor de custo</span>
                            </label>
                            <div className="flex gap-2 w-full sm:w-auto">
                               <button 
                                 type="button" 
                                 onClick={() => setIsAddingPurchase(false)} 
                                 className="flex-1 sm:flex-none px-4 py-2.5 bg-zinc-800 text-zinc-300 rounded-xl text-[10px] font-black uppercase hover:text-white"
                               >
                                 Cancelar
                               </button>
                               <button 
                                 type="button" 
                                 onClick={() => handleRegisterPurchase(selectedItem.id)} 
                                 className="flex-1 sm:flex-none px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black rounded-xl text-[10px] font-black uppercase shadow-glow tracking-wider"
                               >
                                 Confirmar e Adicionar Estoque
                               </button>
                            </div>
                         </div>
                      </div>
                   )}

                   {/* LISTA DE RECOMPRAS */}
                   {selectedItem.purchaseHistory && selectedItem.purchaseHistory.length > 0 ? (
                      <div className="overflow-x-auto">
                         <table className="w-full text-left text-[10px]">
                            <thead className="bg-black/60 text-zinc-500 font-black uppercase border-b border-zinc-800">
                               <tr>
                                  <th className="p-3">Data</th>
                                  <th className="p-3 text-center">Quantidade</th>
                                  <th className="p-3 text-right">Custo Unit.</th>
                                  <th className="p-3 text-right">Total</th>
                                  <th className="p-3">Fornecedor</th>
                                  <th className="p-3">NF</th>
                                  <th className="p-3 text-center">Ações</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                               {selectedItem.purchaseHistory.map(p => (
                                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                     <td className="p-3 text-zinc-400 font-medium whitespace-nowrap">
                                        {new Date(p.date).toLocaleDateString('pt-BR')}
                                     </td>
                                     <td className="p-3 text-center font-black text-green-500 text-xs">
                                        +{p.quantity} un
                                     </td>
                                     <td className="p-3 text-right font-mono text-zinc-300">
                                        R$ {p.unitCost.toFixed(2)}
                                     </td>
                                     <td className="p-3 text-right font-black text-white font-mono">
                                        R$ {(p.unitCost * p.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                     </td>
                                     <td className="p-3 font-bold uppercase text-zinc-300">
                                        {p.supplier || '—'}
                                     </td>
                                     <td className="p-3 font-mono text-zinc-400 uppercase">
                                        {p.invoiceNumber || '—'}
                                     </td>
                                     <td className="p-3 text-center">
                                        <button 
                                          type="button" 
                                          onClick={() => handleDeletePurchase(selectedItem.id, p.id)} 
                                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" 
                                          title="Excluir registro de compra"
                                        >
                                           <Trash2 size={13} />
                                        </button>
                                     </td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                   ) : (
                      <div className="text-center py-6 border border-dashed border-zinc-800 rounded-2xl space-y-1">
                         <p className="text-xs text-zinc-500 font-medium">Nenhum registro de recompra cadastrado para este item.</p>
                         <p className="text-[10px] text-zinc-600">Clique em "Registrar Recompra" para cadastrar novas entradas com fornecedor, custo e nota fiscal.</p>
                      </div>
                   )}
                </div>
              </div>
                 
                 {/* TERMINAL DE VÍNCULO PARA ITEM EXISTENTE */}
                 <div className="bg-black border border-zinc-800 rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 space-y-4 mt-6 sm:mt-10">
                    <div className="text-[10px] sm:text-[11px] font-black uppercase text-green-500 italic tracking-widest flex items-center justify-between">
                      <span className="flex items-center gap-2 sm:gap-3"><QrCode size={18} /> Terminal de Vínculo QR / Código de Barras</span>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-bold ${selectedItem.linkedQRCode ? 'bg-green-500/10 text-green-500 border border-green-500/20 animate-pulse' : 'bg-zinc-800 text-zinc-500'}`}>
                        {selectedItem.linkedQRCode ? 'CONECTADO' : 'NÃO VINCULADO'}
                      </span>
                    </div>
                    
                    <p className="text-[11px] sm:text-xs text-zinc-500 leading-relaxed italic">
                      Utilize este terminal para atrelar um QR Code ou código de barras físico a esta peça. O código de barras permite buscas mais precisas no caixa e na execução de saídas.
                    </p>
 
                    <div className="bg-zinc-900 border border-zinc-900 rounded-xl sm:rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                       <div className="flex-1 w-full space-y-1">
                          <p className="text-[8px] font-black uppercase text-zinc-600 tracking-wider">Código de Barras / QR Code</p>
                          <input 
                            type="text" 
                            placeholder="Digite o código ou use a câmera..." 
                            className="w-full bg-transparent border-b border-zinc-800 focus:border-green-500 py-1 text-white font-mono text-xs uppercase outline-none transition-colors"
                            value={selectedItem.linkedQRCode || ''} 
                            onChange={e => handleUpdateItemQRCode(selectedItem.id, e.target.value)} 
                          />
                       </div>
                       <button 
                         type="button" 
                         onClick={() => { setScanMode('bind'); setIsScanning(true); }} 
                         className="w-full sm:w-auto px-5 py-3 bg-green-500 hover:bg-green-400 text-black rounded-xl font-black text-[10px] uppercase transition-all tracking-wider flex items-center justify-center gap-2 active:scale-95 shadow-glow"
                       >
                         <QrCode size={14} />
                         Escanear Código
                       </button>
                    </div>
 
                    {selectedItem.linkedQRCode && (
                      <div className="flex justify-end pr-1">
                        <button 
                          type="button" 
                          onClick={() => handleUpdateItemQRCode(selectedItem.id, '')} 
                          className="text-[9px] font-bold text-red-500 uppercase hover:underline"
                        >
                          [DESVINCULAR CÓDIGO ATUAL]
                        </button>
                      </div>
                    )}
                 </div>
            </div>
            {isAdmin && (
              <div className="p-4 sm:p-6 bg-black/95 backdrop-blur-2xl border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-3 gap-3 fixed bottom-0 left-0 right-0 z-[280]">
                <button onClick={() => setMovementModal({ isOpen: true, itemId: selectedItem.id, type: TransactionType.IN })} className="py-4 sm:py-5 bg-green-500 text-black font-black uppercase text-[10px] sm:text-[12px] rounded-xl sm:rounded-2xl shadow-glow active:scale-95 transition-all">Dar Entrada</button>
                <button onClick={() => setMovementModal({ isOpen: true, itemId: selectedItem.id, type: TransactionType.OUT })} className="py-4 sm:py-5 bg-white text-black font-black uppercase text-[10px] sm:text-[12px] rounded-xl sm:rounded-2xl shadow-xl active:scale-95 transition-all">Dar Baixa / Saída</button>
                <button onClick={() => handleDeleteItem(selectedItem.id)} className="col-span-2 sm:col-span-1 py-4 sm:py-5 bg-red-500/10 border border-red-500/20 text-red-500 font-black uppercase text-[10px] sm:text-[12px] rounded-xl sm:rounded-2xl hover:bg-red-500 hover:text-white transition-all">Excluir Item</button>
              </div>
            )}
         </div>
      )}

      {/* MODAL DE EDIÇÃO COMPLETA DE PEÇA */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/90 z-[320] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto no-scrollbar">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="p-6 sm:p-8 bg-zinc-950 border-b border-zinc-800 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-500/10 rounded-2xl border border-green-500/20 text-green-500">
                    <Pencil size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black uppercase italic text-white tracking-tighter">Editar Cadastro da Peça</h3>
                    <p className="text-[9px] text-green-500 font-black uppercase tracking-widest mt-0.5">Atualização de Dados, Valores e Foto</p>
                  </div>
               </div>
               <button onClick={() => setEditingItem(null)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-colors">
                  <X size={18} />
               </button>
            </div>
            
            <form onSubmit={handleSaveEditedItem} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Part Number BRP *</p>
                     <input 
                       required 
                       type="text" 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-mono font-bold text-xs uppercase outline-none focus:border-green-500" 
                       value={editingItem.partNumber} 
                       onChange={e => setEditingItem({ ...editingItem, partNumber: e.target.value })} 
                     />
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Descrição Comercial *</p>
                     <input 
                       required 
                       type="text" 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500" 
                       value={editingItem.name} 
                       onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} 
                     />
                  </div>
               </div>

               {/* SELEÇÃO E FILTRO DE UNIDADE DE MEDIDA */}
               <UnitOfMeasureSelector 
                 value={editingItem.unit || 'un'} 
                 onChange={u => setEditingItem({ ...editingItem, unit: u })} 
                 itemNameHint={editingItem.name} 
               />

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                     <div className="flex justify-between items-center">
                       <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Preço Unitário R$</p>
                       <span className="text-[8px] font-black uppercase text-green-500 font-mono">Por {editingItem.unit || 'un'}</span>
                     </div>
                     <input 
                       type="number" 
                       step="0.01" 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-green-500 font-black text-sm outline-none focus:border-green-500" 
                       value={editingItem.value} 
                       onChange={e => setEditingItem({ ...editingItem, value: parseFloat(e.target.value) || 0 })} 
                     />
                  </div>
                  <div className="space-y-1">
                     <div className="flex justify-between items-center">
                       <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Estoque Atual</p>
                       <span className="text-[8px] font-black uppercase text-green-500 font-mono">Em {editingItem.unit || 'un'}</span>
                     </div>
                     <input 
                       type="number" 
                       step="any"
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-sm outline-none focus:border-green-500" 
                       value={editingItem.quantity} 
                       onChange={e => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || 0 })} 
                     />
                  </div>
                  <div className="space-y-1">
                     <div className="flex justify-between items-center">
                       <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Estoque Mínimo</p>
                       <span className="text-[8px] font-black uppercase text-green-500 font-mono">Em {editingItem.unit || 'un'}</span>
                     </div>
                     <input 
                       type="number" 
                       step="any"
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-sm outline-none focus:border-green-500" 
                       value={editingItem.minQuantity} 
                       onChange={e => setEditingItem({ ...editingItem, minQuantity: parseFloat(e.target.value) || 0 })} 
                     />
                  </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                     <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Repartição Veículo</p>
                     <select 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-bold text-xs uppercase outline-none focus:border-green-500"
                       value={editingItem.sectionId || ''} 
                       onChange={e => setEditingItem({ ...editingItem, sectionId: e.target.value })}
                     >
                        <option value="">NENHUMA</option>
                        {vehicleSections.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <div className="flex justify-between items-center">
                       <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic flex items-center gap-1">
                         <Wrench size={11} className="text-green-500" /> M.O. Vinculada
                       </p>
                       <span className="text-[7px] font-black text-green-400 uppercase">⚡ Auto na OS</span>
                     </div>
                     <select 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-bold text-xs uppercase outline-none focus:border-green-500"
                       value={editingItem.laborTemplateId || ''} 
                       onChange={e => setEditingItem({ ...editingItem, laborTemplateId: e.target.value })}
                     >
                        <option value="">NENHUMA (SEM VÍNCULO)</option>
                        {laborTemplates.map(t => (
                          <option key={t.id} value={t.id}>
                            ⚡ {t.description.toUpperCase()} {t.pricingType === 'fixed' ? `(Fixo R$ ${(t.fixedValue || 0).toFixed(2)})` : `(${t.defaultHours}h)`}
                          </option>
                        ))}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Grupo Técnico</p>
                     <select 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-bold text-xs uppercase outline-none focus:border-green-500"
                       value={editingItem.category} 
                       onChange={e => setEditingItem({ ...editingItem, category: e.target.value as any })}
                     >
                        {categories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Endereço Gaveta</p>
                     <input 
                       type="text" 
                       className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-green-500" 
                       value={editingItem.boxNumber} 
                       onChange={e => setEditingItem({ ...editingItem, boxNumber: e.target.value })} 
                     />
                  </div>
               </div>

               {/* FOTO */}
               <div className="bg-black border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                     <Image size={15} className="text-green-500" /> Foto do Item
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                     <div className="w-20 h-20 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                        {editingItem.imageUrl ? (
                          <img src={editingItem.imageUrl} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={28} className="text-zinc-700" />
                        )}
                     </div>
                     <div className="flex-1 space-y-2 w-full">
                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl text-[10px] font-black uppercase text-white transition-all">
                           <Upload size={13} className="text-green-500" /> Carregar Foto do Aparelho
                           <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'edit')} />
                        </label>
                        <input 
                          type="text" 
                          placeholder="Ou cole a URL da imagem aqui..." 
                          value={editingItem.imageUrl || ''} 
                          onChange={e => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-white text-xs outline-none focus:border-green-500" 
                        />
                     </div>
                     {editingItem.imageUrl && (
                       <button 
                         type="button" 
                         onClick={() => setEditingItem({ ...editingItem, imageUrl: undefined })}
                         className="p-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                         title="Remover foto"
                       >
                         <Trash2 size={16} />
                       </button>
                     )}
                  </div>
               </div>

               {/* QR CODE */}
               <div className="bg-black border border-zinc-800 rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                     <QrCode size={15} className="text-green-500" /> QR Code / Código de Barras Vinculado
                  </p>
                  <div className="flex gap-2">
                     <input 
                       type="text" 
                       placeholder="Código alfanumérico do código de barras..." 
                       value={editingItem.linkedQRCode || ''} 
                       onChange={e => setEditingItem({ ...editingItem, linkedQRCode: e.target.value })}
                       className="flex-1 bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white font-mono text-xs uppercase outline-none focus:border-green-500" 
                     />
                     <button 
                       type="button" 
                       onClick={() => { setScanMode('bind'); setIsScanning(true); }}
                       className="px-4 py-3 bg-zinc-800 hover:bg-green-500 hover:text-black rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 text-zinc-300"
                     >
                       <QrCode size={14} /> Escanear
                     </button>
                  </div>
               </div>

               {/* OBSERVAÇÕES */}
               <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest italic">Observações / Especificações</p>
                  <textarea 
                    rows={3} 
                    className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white text-xs outline-none focus:border-green-500 resize-none" 
                    value={editingItem.observations || ''} 
                    onChange={e => setEditingItem({ ...editingItem, observations: e.target.value })} 
                    placeholder="Instruções adicionais, compatibilidade, notas técnicas..." 
                  />
               </div>

               <div className="flex gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingItem(null)} 
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-black uppercase text-xs transition-all tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-4 bg-green-500 hover:bg-green-400 text-black rounded-2xl font-black uppercase text-xs shadow-glow transition-all tracking-wider"
                  >
                    Salvar Alterações
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}

      {movementModal.isOpen && (
        <div className="fixed inset-0 bg-black/98 z-[300] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-[3rem] w-full max-w-lg shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden">
             <div className={`p-6 sm:p-10 flex items-center gap-4 sm:gap-6 ${movementModal.type === TransactionType.IN ? 'bg-green-500 text-black' : 'bg-white text-black'}`}>
                <div className="p-3 sm:p-4 bg-black/10 rounded-xl sm:rounded-2xl">{movementModal.type === TransactionType.IN ? <Plus size={24} sm:size={30} strokeWidth={4} /> : <LogOut size={24} sm:size={30} className="rotate-180" strokeWidth={4} />}</div>
                <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter leading-none">{movementModal.type === TransactionType.IN ? 'Entrada Estoque' : 'Baixa de Material'}</h3>
             </div>
             <div className="p-6 sm:p-10 space-y-6 sm:space-y-8 text-center">
                <div className="space-y-1 sm:space-y-2">
                   <p className="text-[10px] sm:text-[11px] text-zinc-500 font-black uppercase tracking-widest italic">Quantas unidades?</p>
                   <input type="number" className="w-full bg-transparent text-6xl sm:text-7xl font-black text-center text-green-500 outline-none" value={movementQty} onChange={e => setMovementQty(parseInt(e.target.value) || 1)} />
                </div>
                {movementModal.type === TransactionType.OUT && (
                  <div className="space-y-4 text-left">
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setDestination(MovementDestination.OS)} className={`py-4 rounded-xl border transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${destination === MovementDestination.OS ? 'bg-green-500 border-green-500 text-black shadow-glow' : 'bg-black border-zinc-800 text-zinc-600'}`}>Ordem Serviço</button>
                      <button type="button" onClick={() => setDestination(MovementDestination.INTERNAL)} className={`py-4 rounded-xl border transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${destination === MovementDestination.INTERNAL ? 'bg-green-500 border-green-500 text-black shadow-glow' : 'bg-black border-zinc-800 text-zinc-600'}`}>Uso Oficina</button>
                    </div>
                    {destination === MovementDestination.OS && <input type="text" placeholder="INSIRA O Nº DA O.S." className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-xs outline-none focus:border-green-500/50 uppercase" value={osNumber} onChange={e => setOsNumber(e.target.value)} />}
                    <select className="w-full bg-black border border-zinc-800 p-4 rounded-xl text-white font-black text-xs outline-none focus:border-green-500/50 uppercase italic" value={recipient} onChange={e => setRecipient(e.target.value)}>
                      <option value="">ENTREGUE PARA QUAL TÉCNICO?</option>
                      {users.filter(u => u.role === UserRole.MECHANIC).map(u => <option key={u.id} value={u.name}>{u.name.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-3 sm:gap-4 pt-2">
                  <button onClick={() => setMovementModal({ isOpen: false, itemId: null, type: TransactionType.OUT })} className="flex-1 py-4 sm:py-5 bg-zinc-800 rounded-xl font-black uppercase text-[10px] sm:text-xs italic tracking-widest">Cancelar</button>
                  <button onClick={() => processMovement()} className={`flex-[2] py-4 sm:py-5 font-black rounded-xl uppercase text-[10px] sm:text-xs italic tracking-widest shadow-glow ${movementModal.type === TransactionType.IN ? 'bg-green-500 text-black' : 'bg-white text-black'}`}>Confirmar Lançamento</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {isScanning && <QRScanner onScan={handleQRScan} onClose={() => setIsScanning(false)} />}

      {/* MODAL DE ALERTA DE MÃO DE OBRA COMPARTILHADA */}
      {sharedLaborWarning?.isOpen && (
        <SharedLaborWarningModal
          data={sharedLaborWarning}
          onConfirmWithDiscount={handleConfirmSharedLaborWarning}
          onConfirmWithoutDiscount={handleConfirmSharedLaborWithoutDiscount}
          onLinkPartOnly={handleConfirmSharedLaborLinkPartOnly}
          onCancel={() => setSharedLaborWarning(null)}
        />
      )}

      {/* MODAL DE IMPRESSÃO / VISUALIZAÇÃO DE RELATÓRIO TÉCNICO DE O.S. */}
      {selectedOS && showOSDocumentPreview && (
        <OSPrintDocument
          os={selectedOS}
          isPreviewModal={true}
          onClosePreview={() => setShowOSDocumentPreview(false)}
          tenant={currentTenant}
        />
      )}

      {/* RELATÓRIO TÉCNICO OFICIAL PARA IMPRESSÃO EM PAPEL / PDF */}
      {selectedOS && activeTab === 'service_orders' && (
        <div className="hidden print:block print:relative print:w-full print:h-auto bg-white text-black p-0 m-0">
          <OSPrintDocument
            os={selectedOS}
            isPreviewModal={false}
            tenant={currentTenant}
          />
        </div>
      )}

      {/* MODAL ESPELHO DO PASSAPORTE UTV - CLIENTE (SOMENTE LEITURA) */}
      {clientMirrorPassport && (() => {
        const ownerClient = clients.find(
          c => c.id === clientMirrorPassport.clientId || c.name.trim().toLowerCase() === clientMirrorPassport.customerName.trim().toLowerCase()
        );
        return (
          <UTVPassportClientMirror
            passport={clientMirrorPassport}
            items={items}
            tenant={currentTenant}
            clientCredentials={ownerClient ? { username: ownerClient.username, password: ownerClient.password, clientName: ownerClient.name } : undefined}
            onClose={() => setClientMirrorPassport(null)}
          />
        );
      })()}

      {/* MODAL CADASTRO DE NOVA OFICINA (MULTI-TENANT SAAS) */}
      {isAddingTenant && (
        <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl sm:rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden my-auto">
            <div className="p-6 bg-zinc-950 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight text-white">Cadastrar Nova Oficina / Filial</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Ambiente Multi-Tenant Isolado</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddingTenant(false)}
                className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-zinc-400">Nome Fantasia da Nova Oficina *</label>
                <input
                  required
                  type="text"
                  placeholder="EX: HPS PREPARAÇÕES - FILIAL CAMPINAS"
                  value={newTenantInput.name}
                  onChange={e => setNewTenantInput({ ...newTenantInput, name: e.target.value })}
                  className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3.5 rounded-xl text-white font-black text-xs uppercase outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-zinc-400">Razão Social</label>
                  <input
                    type="text"
                    placeholder="Ex: HPS Motores Ltda"
                    value={newTenantInput.corporateName}
                    onChange={e => setNewTenantInput({ ...newTenantInput, corporateName: e.target.value })}
                    className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white text-xs outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-zinc-400">CNPJ</label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={newTenantInput.cnpj}
                    onChange={e => setNewTenantInput({ ...newTenantInput, cnpj: e.target.value })}
                    className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white font-mono text-xs outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-zinc-400">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={newTenantInput.phone}
                    onChange={e => setNewTenantInput({ ...newTenantInput, phone: e.target.value })}
                    className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white text-xs outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-zinc-400">E-mail de Contato</label>
                  <input
                    type="email"
                    placeholder="filial@oficina.com.br"
                    value={newTenantInput.email}
                    onChange={e => setNewTenantInput({ ...newTenantInput, email: e.target.value })}
                    className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white text-xs outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-zinc-400">Cidade</label>
                  <input
                    type="text"
                    placeholder="Ex: Campinas"
                    value={newTenantInput.city}
                    onChange={e => setNewTenantInput({ ...newTenantInput, city: e.target.value })}
                    className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white text-xs uppercase outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-zinc-400">Estado (UF)</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={newTenantInput.state}
                    onChange={e => setNewTenantInput({ ...newTenantInput, state: e.target.value.toUpperCase() })}
                    className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white text-xs font-black uppercase outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-zinc-400">Especialidade / Slogan</label>
                <input
                  type="text"
                  placeholder="Centro Técnico Especializado & Preparação"
                  value={newTenantInput.subtitle}
                  onChange={e => setNewTenantInput({ ...newTenantInput, subtitle: e.target.value })}
                  className="w-full bg-black border border-zinc-800 focus:border-green-500 p-3 rounded-xl text-white text-xs outline-none transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddingTenant(false)}
                  className="flex-1 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black uppercase text-[10px] rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-3.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[10px] rounded-xl shadow-glow transition-all"
                >
                  Criar e Ativar Oficina
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ALERT MODAL */}
      {alertConfig.isOpen && (
        <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl sm:rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className={`p-5 sm:p-8 flex items-center gap-4 sm:gap-6 ${alertConfig.type === 'error' ? 'bg-red-500 text-white' : alertConfig.type === 'success' ? 'bg-green-500 text-black' : 'bg-white text-black'}`}>
              <div className="p-3 sm:p-4 bg-black/10 rounded-2xl shrink-0">
                {alertConfig.type === 'error' ? <X size={28} strokeWidth={4} /> : alertConfig.type === 'success' ? <Check size={28} strokeWidth={4} /> : <Info size={28} strokeWidth={4} />}
              </div>
              <h3 className="text-lg sm:text-2xl font-black uppercase italic tracking-tighter">{alertConfig.title}</h3>
            </div>
            <div className="p-6 sm:p-10 space-y-6 sm:space-y-8">
              <p className="text-zinc-300 text-xs sm:text-sm font-medium leading-relaxed">{alertConfig.message}</p>
              <button 
                onClick={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                className="w-full py-4 sm:py-5 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase text-[11px] rounded-2xl sm:rounded-[2rem] transition-all tracking-widest"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmConfig.isOpen && (
        <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl sm:rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 sm:p-8 bg-white text-black flex items-center gap-4 sm:gap-6">
              <div className="p-3 sm:p-4 bg-black/10 rounded-2xl shrink-0">
                <AlertTriangle size={28} strokeWidth={4} />
              </div>
              <h3 className="text-lg sm:text-2xl font-black uppercase italic tracking-tighter">{confirmConfig.title}</h3>
            </div>
            <div className="p-6 sm:p-10 space-y-6 sm:space-y-8">
              <p className="text-zinc-300 text-xs sm:text-sm font-medium leading-relaxed">{confirmConfig.message}</p>
              <div className="flex gap-3 sm:gap-4">
                <button 
                  onClick={() => confirmConfig.onCancel?.()}
                  className="flex-1 py-4 sm:py-5 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase text-[11px] rounded-2xl sm:rounded-[2rem] transition-all tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    confirmConfig.onConfirm();
                    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                  }}
                  className="flex-1 py-4 sm:py-5 bg-red-500 hover:bg-red-600 text-white font-black uppercase text-[11px] rounded-2xl sm:rounded-[2rem] transition-all tracking-widest shadow-glow-red"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SCRIPT SQL DO SUPABASE */}
      {showSqlModal && (
        <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-500/10 text-green-500 rounded-xl">
                  <Database size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase italic tracking-tight text-white">Configuração do Supabase SQL</h3>
                  <p className="text-[10px] text-zinc-400 font-medium">Script para criar a tabela tenants e garantir sincronização completa</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-300 space-y-2">
                <p className="font-bold flex items-center gap-2">
                  <AlertTriangle size={16} /> Como resolver os erros de Sincronização ("invalid input syntax", colunas ausentes ou tabelas pendentes):
                </p>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  O script abaixo foi atualizado com proteção total: garante que colunas como <code className="text-green-400">unitValue</code> e <code className="text-green-400">quantity</code> existam antes de serem convertidas para <strong className="text-green-400">NUMERIC</strong>, prevenindo os erros <strong className="text-amber-400">42703 (column does not exist)</strong> e <strong className="text-amber-400">22P02 (invalid input syntax for type integer: "3.3")</strong>.
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-300 text-[11px] pt-1">
                  <li>Acesse o painel do seu projeto no Supabase: <span className="text-green-400 font-mono">app.supabase.com</span></li>
                  <li>No menu lateral esquerdo, selecione a aba <b>SQL Editor</b></li>
                  <li>Clique em <b>New Query</b> (ou no botão '+')</li>
                  <li>Copie o script SQL abaixo, cole no editor e clique no botão <b>Run</b> (ou aperte Ctrl+Enter)</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Script SQL de Atualização</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(supabaseService.getTenantMigrationSql());
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2500);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[9px] transition-all active:scale-95"
                  >
                    {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedSql ? 'Copiado para Área de Transferência!' : 'Copiar Código SQL'}</span>
                  </button>
                </div>
                <pre className="bg-black/90 p-4 rounded-2xl border border-zinc-800 font-mono text-[10px] text-green-400 overflow-x-auto max-h-64 select-all leading-relaxed">
                  {supabaseService.getTenantMigrationSql()}
                </pre>
              </div>
            </div>

            <div className="p-5 bg-zinc-950 border-t border-zinc-800 flex flex-wrap justify-between items-center gap-3">
              <span className="text-[10px] text-zinc-500">Após executar o SQL no Supabase, clique abaixo para testar a sincronia.</span>
              <button 
                type="button"
                onClick={() => {
                  supabaseService.clearMissingTableCache();
                  setShowSqlModal(false);
                  syncToSupabase();
                }}
                className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black font-black uppercase text-[10px] rounded-xl transition-all shadow-glow"
              >
                Já executei no Supabase, testar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
