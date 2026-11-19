import { 
  User, UserRole, InventoryItem, ServiceOrder, OSStatus, 
  VehicleSection, LaborTemplate, Client, Transaction, TransactionType, 
  MovementDestination, ItemCategory, Tenant, UTVPassport
} from '../types';

export const DEFAULT_TENANT_ID = 'tenant_matriz_hps';

export const DEFAULT_TENANTS: Tenant[] = [
  {
    id: DEFAULT_TENANT_ID,
    name: 'HPS Control Matriz',
    corporateName: 'HPS Motores e Preparações Especiais Ltda',
    cnpj: '12.345.678/0001-90',
    phone: '(11) 98765-4321',
    email: 'contato@hpscontrol.com',
    subtitle: 'BRP Especialista • Centro Técnico de Oficina & Preparação',
    address: {
      street: 'Av. das Oficinas',
      number: '1500',
      neighborhood: 'Distrito Industrial',
      city: 'São Paulo',
      state: 'SP',
      zip: '01234-567'
    },
    printSettings: {
      warrantyTerms: 'Garantia de 90 (noventa) dias para serviços executados e peças genuínas conforme Art. 26 do Código de Defesa do Consumidor. Não cobre mau uso em competições ou pistas sem aviso prévio.',
      footerMessage: 'Agradecemos a preferência! Veículo testado e aprovado em dinamômetro e inspeção técnica.',
      primaryColor: '#22c55e',
      showLogo: true
    },
    plan: 'pro',
    status: 'active',
    createdAt: new Date().toISOString(),
    defaultHourlyRate: 150
  }
];

export const DEFAULT_USERS: User[] = [
  {
    id: 'user_admin',
    name: 'Administrador HPS',
    username: 'admin',
    password: 'admin',
    role: UserRole.STOCKIST,
    email: 'admin@hpscontrol.com',
    tenantId: DEFAULT_TENANT_ID
  },
  {
    id: 'user_carlos',
    name: 'Carlos Silva (Mecânico Chefe)',
    username: 'carlos',
    password: '123',
    role: UserRole.MECHANIC,
    email: 'carlos@hpscontrol.com',
    tenantId: DEFAULT_TENANT_ID
  },
  {
    id: 'user_lucas',
    name: 'Lucas Ferreira (Técnico Suspensão)',
    username: 'lucas',
    password: '123',
    role: UserRole.MECHANIC,
    email: 'lucas@hpscontrol.com',
    tenantId: DEFAULT_TENANT_ID
  }
];

export const DEFAULT_SECTIONS: VehicleSection[] = [
  {
    id: 'sec_freios',
    name: 'Sistema de Frenagem',
    components: ['Disco de Freio', 'Pinça de Freio', 'Flexível', 'Pastilhas de Freio', 'Fluido DOT 5.1']
  },
  {
    id: 'sec_rodas',
    name: 'Rodas e Cubos',
    components: ['Cubo de Roda', 'Rolamento de Roda', 'Prisioneiros', 'Roda Beadlock', 'Pneu']
  },
  {
    id: 'sec_transmissao',
    name: 'Transmissão e CVT',
    components: ['Correia CVT', 'Polia Primária', 'Polia Secundária', 'Variador', 'Semi-eixo', 'Homocinética']
  },
  {
    id: 'sec_susp_diant',
    name: 'Suspensão Dianteira',
    components: ['Amortecedor Fox Podium', 'Balança Superior', 'Balança Inferior', 'Pivô', 'Barra Estabilizadora']
  },
  {
    id: 'sec_susp_tras',
    name: 'Suspensão Traseira',
    components: ['Amortecedor Traseiro', 'Braço Traseiro Trailing Arm', 'Barras Tensoras Radios']
  },
  {
    id: 'sec_motor',
    name: 'Sistema de Motor e Cabeçote',
    components: ['Velas Iridium', 'Filtro de Óleo XPS', 'Filtro de Ar', 'Radiador', 'Bomba d’Água']
  }
];

export const DEFAULT_LABOR_TEMPLATES: LaborTemplate[] = [
  {
    id: 'lab_disco_freio',
    description: 'Revisão e Troca do Disco de Freio',
    defaultHours: 2.0,
    defaultValuePerHour: 150.0,
    sectionId: 'sec_freios',
    // 100% Independente por padrão
    linkedTemplateId: undefined,
    discountPercentage: undefined,
    discountValue: undefined,
    sharedNotes: undefined
  },
  {
    id: 'lab_cubo_roda',
    description: 'Substituição do Cubo de Roda',
    defaultHours: 1.5,
    defaultValuePerHour: 150.0,
    sectionId: 'sec_rodas',
    // Pré-configurado opcionalmente com vínculo ao Disco de Freio (aproveitamento de desmontagem de pneus)
    linkedTemplateId: 'lab_disco_freio',
    discountPercentage: 50,
    discountValue: 112.5,
    sharedNotes: 'Metade do serviço (desmontagem de rodas/pinças e acesso) já executado na revisão de discos'
  },
  {
    id: 'lab_pastilhas',
    description: 'Troca de Jogo de Pastilhas de Freio',
    defaultHours: 1.0,
    defaultValuePerHour: 150.0,
    sectionId: 'sec_freios',
    linkedTemplateId: 'lab_disco_freio',
    discountPercentage: 50,
    discountValue: 75.0,
    sharedNotes: 'Aproveitamento de desmontagem prévia de rodas no mesmo conjunto de freios'
  },
  {
    id: 'lab_correia_cvt',
    description: 'Substituição da Correia de Transmissão CVT',
    defaultHours: 1.5,
    defaultValuePerHour: 180.0,
    sectionId: 'sec_transmissao',
    linkedTemplateId: undefined
  },
  {
    id: 'lab_revisao_geral',
    description: 'Revisão Geral e Check-up Preventivo 100 Horas',
    defaultHours: 4.0,
    defaultValuePerHour: 160.0,
    linkedTemplateId: undefined
  }
];

export const DEFAULT_ITEMS: InventoryItem[] = [
  {
    id: 'item_disco_freio',
    name: 'Disco de Freio Dianteiro Ventilado Can-Am BRP',
    partNumber: '705601511',
    value: 480.0,
    quantity: 8,
    minQuantity: 2,
    category: ItemCategory.FREIOS,
    boxNumber: 'CX-04',
    entryDate: '2026-09-01T08:00:00.000Z',
    sectionId: 'sec_freios',
    laborTemplateId: 'lab_disco_freio',
    unit: 'un',
    observations: 'Peça original Can-Am Maverick X3 / Defender. Aço temperado de alta performance.'
  },
  {
    id: 'item_cubo_roda',
    name: 'Cubo de Roda Dianteira Reforçado BRP',
    partNumber: '705401824',
    value: 620.0,
    quantity: 4,
    minQuantity: 2,
    category: ItemCategory.RODAS,
    boxNumber: 'CX-02',
    entryDate: '2026-09-05T09:30:00.000Z',
    sectionId: 'sec_rodas',
    laborTemplateId: 'lab_cubo_roda',
    unit: 'un',
    observations: 'Cubo forjado reforçado para suportar trilhas pesadas e saltos.'
  },
  {
    id: 'item_pastilhas',
    name: 'Jogo de Pastilhas de Freio Sintetizadas BRP',
    partNumber: '715900248',
    value: 220.0,
    quantity: 12,
    minQuantity: 4,
    category: ItemCategory.FREIOS,
    boxNumber: 'GAV-01',
    entryDate: '2026-09-10T11:00:00.000Z',
    sectionId: 'sec_freios',
    laborTemplateId: 'lab_pastilhas',
    unit: 'jg'
  },
  {
    id: 'item_correia_cvt',
    name: 'Correia de Transmissão CVT Reforçada Can-Am',
    partNumber: '422280652',
    value: 980.0,
    quantity: 6,
    minQuantity: 2,
    category: ItemCategory.TRANSMISSAO,
    boxNumber: 'CX-01',
    entryDate: '2026-09-12T14:20:00.000Z',
    sectionId: 'sec_transmissao',
    laborTemplateId: 'lab_correia_cvt',
    unit: 'un',
    observations: 'Composto de fibra de aramida de altíssima durabilidade.'
  },
  {
    id: 'item_rolamento',
    name: 'Rolamento de Roda Blindado Duplo BRP',
    partNumber: '293350118',
    value: 165.0,
    quantity: 10,
    minQuantity: 3,
    category: ItemCategory.RODAS,
    boxNumber: 'GAV-03',
    entryDate: '2026-09-15T10:15:00.000Z',
    sectionId: 'sec_rodas',
    unit: 'un'
  },
  {
    id: 'item_oleo_xps',
    name: 'Óleo XPS 4-Stroke 5W-40 Sintético (1 Litro)',
    partNumber: '779133',
    value: 98.0,
    quantity: 36,
    minQuantity: 12,
    category: ItemCategory.INSUMOS,
    boxNumber: 'PRAT-01',
    entryDate: '2026-09-20T16:00:00.000Z',
    unit: 'L',
    observations: 'Óleo lubrificante genuíno BRP com proteção contra altas temperaturas.'
  },
  {
    id: 'item_parabarro',
    name: 'Para-barro Dianteiro Can-Am Maverick X3 (Par)',
    partNumber: '715004277',
    value: 580.0,
    quantity: 6,
    minQuantity: 2,
    category: ItemCategory.INSUMOS,
    boxNumber: 'CX-08',
    entryDate: '2026-09-22T10:00:00.000Z',
    unit: 'par',
    observations: 'Par de para-barros de alta resistência em polietileno flexível BRP.'
  }
];

export const DEFAULT_CLIENTS: Client[] = [
  {
    id: 'client_guilherme',
    name: 'Guilherme Bueno',
    cpf: '123.456.789-00',
    phone: '(11) 99888-7766',
    email: 'guilherme@cliente.com',
    username: 'guilherme',
    password: '123',
    isAccessActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    vehicles: [
      {
        id: 'veh_mav_x3',
        model: 'Can-Am Maverick X3 XRS Turbo RR',
        plate: 'BRA-2026',
        year: '2024'
      },
      {
        id: 'veh_def_hd10',
        model: 'Can-Am Defender HD10 Pro',
        plate: 'HPS-4421',
        year: '2023'
      }
    ]
  },
  {
    id: 'client_roberto',
    name: 'Roberto Mendes',
    cpf: '987.654.321-11',
    phone: '(11) 98765-1122',
    email: 'roberto@cliente.com',
    username: 'roberto',
    password: '123',
    isAccessActive: true,
    createdAt: '2026-09-10T14:30:00.000Z',
    vehicles: [
      {
        id: 'veh_com_xt',
        model: 'Can-Am Commander XT 1000R',
        plate: 'COM-7788',
        year: '2022'
      }
    ]
  }
];

export const DEFAULT_SERVICE_ORDERS: ServiceOrder[] = [
  {
    id: 'os_demo_0001',
    osNumber: '0001',
    customerName: 'Guilherme Bueno',
    vehicleModel: 'CAN-AM MAVERICK X3 XRS TURBO RR (PLACA: BRA-2026)',
    status: OSStatus.OPEN,
    createdAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T14:00:00.000Z',
    clientId: 'client_guilherme',
    vehicleId: 'veh_mav_x3',
    mechanicId: 'user_carlos',
    mechanicName: 'Carlos Silva (Mecânico Chefe)',
    observations: 'Revisão preventiva e corretiva no trem dianteiro. Veículo apresentou ruído nos cubos após trilha pesada. Metade do serviço de desmontagem já executado na revisão de discos, desconto de 50% concedido na 2ª M.O.',
    stockDeducted: false,
    laborItems: [
      {
        id: 'labor_1_disco',
        description: 'Revisão e Troca do Disco de Freio',
        hours: 2.0,
        valuePerHour: 150.0,
        section: 'Sistema de Frenagem',
        originalTotal: 300.0,
        finalTotal: 300.0,
        isShared: false
      },
      {
        id: 'labor_2_cubo',
        description: 'Substituição do Cubo de Roda',
        hours: 1.5,
        valuePerHour: 150.0,
        section: 'Rodas e Cubos',
        linkedToId: 'labor_1_disco',
        isShared: true,
        discountPercentage: 50,
        discountValue: 112.5,
        originalTotal: 225.0,
        finalTotal: 112.5,
        sharedReason: 'Metade do serviço (desmontagem de rodas e pinças) já foi executado na M.O. Revisão e Troca do Disco de Freio'
      }
    ],
    parts: [
      {
        itemId: 'item_disco_freio',
        name: 'Disco de Freio Dianteiro Ventilado Can-Am BRP',
        partNumber: '705601511',
        quantity: 2,
        unitValue: 480.0
      },
      {
        itemId: 'item_cubo_roda',
        name: 'Cubo de Roda Dianteira Reforçado BRP',
        partNumber: '705401824',
        quantity: 1,
        unitValue: 620.0
      },
      {
        itemId: 'item_pastilhas',
        name: 'Jogo de Pastilhas de Freio Sintetizadas BRP',
        partNumber: '715900248',
        quantity: 1,
        unitValue: 220.0
      }
    ]
  }
];

export const DEFAULT_HISTORY: Transaction[] = [
  {
    id: 'tx_demo_01',
    itemId: 'item_disco_freio',
    itemName: 'Disco de Freio Dianteiro Ventilado Can-Am BRP',
    partNumber: '705601511',
    userId: 'user_admin',
    userName: 'Administrador HPS',
    type: TransactionType.IN,
    quantity: 10,
    date: '2026-09-01T08:00:00.000Z',
    recipientName: 'ENTRADA DE NOTA FISCAL',
    unitValue: 350.0,
    notes: 'Lote de reposição importado BRP Brasil'
  },
  {
    id: 'tx_demo_02',
    itemId: 'item_cubo_roda',
    itemName: 'Cubo de Roda Dianteira Reforçado BRP',
    partNumber: '705401824',
    userId: 'user_admin',
    userName: 'Administrador HPS',
    type: TransactionType.IN,
    quantity: 5,
    date: '2026-09-05T09:30:00.000Z',
    recipientName: 'ENTRADA DE NOTA FISCAL',
    unitValue: 460.0,
    notes: 'Reposição de estoque oficina'
  }
];

export const DEFAULT_UTV_PASSPORTS: UTVPassport[] = [
  {
    id: 'passport_mav_104',
    qrCode: 'UTV-PASS-MAV104-BRP',
    vehicleNumber: '#104',
    vehicleModel: 'CAN-AM MAVERICK X3 XRS TURBO RR',
    chassisOrPlate: 'BRA-2026 / 3JBMX3RR26',
    clientId: 'client_guilherme',
    vehicleId: 'veh_mav_x3',
    customerName: 'Guilherme Bueno',
    currentKm: 1480,
    lastMaintenanceSummary: 'Revisão completa pós-Baja Jalapão: substituição de correia CVT preventiva, troca de óleo XPS 5W40 (3.3L), limpeza de polias primária/secundária e reaperto estrutural de suspensão dianteira com gabarito.',
    lastMaintenanceDate: '2026-10-10',
    nextCompetitionPlan: 'Preparação Rally dos Sertões: substituir semi-eixo dianteiro por atingir limite de KM, trocar jogo de pastilhas sintetizadas, sangria completa de freio Racing DOT 5.1 e inspeção de cubos de roda.',
    carStatus: 'IN_TRIAGE',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-20T15:30:00.000Z',
    tenantId: DEFAULT_TENANT_ID,
    maintenanceItems: [
      {
        id: 'pm_semieixo_1',
        name: 'Semi-eixo Dianteiro Reforçado Can-Am',
        partNumber: '705402098',
        category: 'PECA',
        requiredQty: 2,
        unit: 'un',
        lastChangeKm: 950,
        intervalKm: 500,
        nextChangeKm: 1450,
        lastChangeDate: '2026-08-15',
        notes: 'Troca obrigatória a cada 500 km de especial de velocidade'
      },
      {
        id: 'pm_correia_cvt',
        itemId: 'item_correia_cvt',
        name: 'Correia de Transmissão CVT Reforçada Can-Am',
        partNumber: '422280652',
        category: 'PECA',
        requiredQty: 1,
        unit: 'un',
        lastChangeKm: 1000,
        intervalKm: 500,
        nextChangeKm: 1500,
        lastChangeDate: '2026-10-10',
        notes: 'Atenção: falta apenas 20 km para o limite de segurança'
      },
      {
        id: 'pm_oleo_motor',
        itemId: 'item_oleo_xps',
        name: 'Óleo XPS 4-Stroke 5W-40 Sintético (1 Litro)',
        partNumber: '779133',
        category: 'OLEO',
        requiredQty: 3.3,
        unit: 'L',
        lastChangeKm: 1000,
        intervalKm: 450,
        nextChangeKm: 1450,
        lastChangeDate: '2026-10-10',
        notes: 'Troca de óleo de motor + filtro a cada 450 km de prova'
      },
      {
        id: 'pm_pastilhas',
        itemId: 'item_pastilhas',
        name: 'Jogo de Pastilhas de Freio Sintetizadas BRP',
        partNumber: '715900248',
        category: 'PECA',
        requiredQty: 2,
        unit: 'jg',
        lastChangeKm: 900,
        intervalKm: 600,
        nextChangeKm: 1500,
        lastChangeDate: '2026-08-15',
        notes: 'Verificar espessura antes da largada'
      },
      {
        id: 'pm_cubo_roda',
        itemId: 'item_cubo_roda',
        name: 'Cubo de Roda Dianteira Reforçado BRP',
        partNumber: '705401824',
        category: 'PECA',
        requiredQty: 2,
        unit: 'un',
        lastChangeKm: 1000,
        intervalKm: 1000,
        nextChangeKm: 2000,
        lastChangeDate: '2026-10-10',
        notes: 'Cubos dianteiros em bom estado, folga zero'
      }
    ],
    competitions: [
      {
        id: 'comp_1',
        name: 'Rally Baja Jalapão 500 - Etapa Campeonato Brasileiro',
        date: '2026-09-25',
        distanceKm: 620,
        status: 'COMPLETED',
        location: 'São Félix do Tocantins - TO',
        resultOrNotes: 'P2 Geral UTV Pro • Carro completou sem quebras mecânicas, exigiu alto esforço de suspensão e CVT nas areias.'
      },
      {
        id: 'comp_2',
        name: 'Copa Interior Off-Road - Etapa Barretos',
        date: '2026-10-08',
        distanceKm: 380,
        status: 'COMPLETED',
        location: 'Barretos - SP',
        resultOrNotes: 'P1 Categoria UTV Over Pro • Pista de cascalho rápido.'
      },
      {
        id: 'comp_3',
        name: 'Rally dos Sertões - Prólogo + Etapas Maratona',
        date: '2026-11-20',
        distanceKm: 850,
        status: 'UPCOMING',
        location: 'Brasília - DF',
        resultOrNotes: 'Prova alvo principal da temporada. Exige revisão preventiva total de transmissão e semi-eixos.'
      }
    ],
    triageHistory: []
  }
];

