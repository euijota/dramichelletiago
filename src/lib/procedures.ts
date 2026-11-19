export const PROCEDURE_CATEGORIES = [
  "Clínica Geral & Prevenção",
  "Dentística & Estética",
  "Endodontia",
  "Periodontia",
  "Cirurgia & Exodontia",
  "Prótese & Reabilitação",
  "Ortodontia & Alinhadores",
  "Harmonização Orofacial (HOF)",
  "Odontopediatria",
  "Radiologia & Laserterapia",
] as const;

export type ProcedureCategory = (typeof PROCEDURE_CATEGORIES)[number];

export type ProcedureTargetType =
  "tooth" | "arch_upper" | "arch_lower" | "mouth" | "face" | "sextant";

export interface ClinicalProcedureCatalogItem {
  id: string;
  code: string;
  name: string;
  category: ProcedureCategory;
  defaultTargetType: ProcedureTargetType;
  requiresSurfaces: boolean;
  defaultPriceParticular: number;
  defaultPriceConvenio: number;
  defaultStatus: "planned" | "completed";
  evolutionTemplate: string;
  isCustom?: boolean;
}

export interface TreatmentPlanItemInput {
  id: string;
  procedureId?: string;
  procedureCode?: string;
  procedureName: string;
  category?: string;
  toothNumber: number; // 0..4 para regiões gerais ou 11..48 / 51..85 para dentes
  surfaces: string[];
  cost: number;
  notes?: string;
  odontogramProcedureId?: string;
}

export const REGION_OPTIONS: ReadonlyArray<{
  code: number;
  label: string;
  shortLabel: string;
  targetType: ProcedureTargetType;
}> = [
  { code: 0, label: "Boca Toda / Geral", shortLabel: "Boca Toda", targetType: "mouth" },
  { code: 1, label: "Arcada Superior", shortLabel: "Arcada Sup.", targetType: "arch_upper" },
  { code: 2, label: "Arcada Inferior", shortLabel: "Arcada Inf.", targetType: "arch_lower" },
  { code: 3, label: "Face / HOF", shortLabel: "Face / HOF", targetType: "face" },
  {
    code: 4,
    label: "Sextantes / Periodontia",
    shortLabel: "Sextantes / Perio",
    targetType: "sextant",
  },
];

export const PERMANENT_TOOTH_NUMBERS: number[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
];

export const DECIDUOUS_TOOTH_NUMBERS: number[] = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
];

export const STORAGE_KEY = "dra_michelle_procedure_catalog_v1";

export const DEFAULT_PROCEDURE_CATALOG: ClinicalProcedureCatalogItem[] = [
  // 1. Clínica Geral & Prevenção
  {
    id: "proc-avaliacao-inicial",
    code: "81000030",
    name: "Avaliação Clínica / Planejamento Odontológico",
    category: "Clínica Geral & Prevenção",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 150,
    defaultPriceConvenio: 80,
    defaultStatus: "completed",
    evolutionTemplate:
      "Realizada anamnese detalhada, exame clínico intra e extraoral completo, levantamento das necessidades odontológicas e elaboração de plano de tratamento personalizado. Orientações gerais entregues ao paciente.",
  },
  {
    id: "proc-profilaxia-atf",
    code: "84000190",
    name: "Profilaxia + ATF + OHB",
    category: "Clínica Geral & Prevenção",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 220,
    defaultPriceConvenio: 110,
    defaultStatus: "completed",
    evolutionTemplate:
      "Realizada evidenciação de biofilme, profilaxia coronária com pasta profilática e taça de borracha/escova de Robinson, aplicação tópica de flúor (ATF) e orientação de higiene bucal (OHB) com técnica de escovação e fio dental.",
  },
  {
    id: "proc-curativo-civ",
    code: "85100048",
    name: "Curativo / Forramento (CIV/Dycal)",
    category: "Clínica Geral & Prevenção",
    defaultTargetType: "tooth",
    requiresSurfaces: true,
    defaultPriceParticular: 160,
    defaultPriceConvenio: 90,
    defaultStatus: "completed",
    evolutionTemplate:
      "Isolamento relativo do campo operatório, remoção parcial/total de tecido cariado amolecido, proteção pulpar com hidróxido de cálcio (Dycal) e selamento provisório com cimento de ionômero de vidro (CIV). Paciente assintomático e orientado.",
  },
  {
    id: "proc-urgencia-alivio-dor",
    code: "81000065",
    name: "Atendimento de Urgência / Alívio de Dor",
    category: "Clínica Geral & Prevenção",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 200,
    defaultPriceConvenio: 110,
    defaultStatus: "completed",
    evolutionTemplate:
      "Atendimento clínico de urgência para alívio de sintomatologia dolorosa. Realizada avaliação clínica, exame radiográfico periapical, intervenção imediata e prescrição medicamentosa quando indicada.",
  },

  // 2. Dentística & Estética
  {
    id: "proc-restauracao-resina-1f",
    code: "85100196",
    name: "Restauração em Resina Composta (1 Face)",
    category: "Dentística & Estética",
    defaultTargetType: "tooth",
    requiresSurfaces: true,
    defaultPriceParticular: 230,
    defaultPriceConvenio: 115,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia local e isolamento do campo operatório. Remoção de tecido cariado/restauração deficiente, condicionamento ácido seletivo, aplicação de sistema adesivo fotopolimerizável e restauração em resina composta pela técnica incremental. Ajuste oclusal, acabamento e polimento.",
  },
  {
    id: "proc-restauracao-resina-2f",
    code: "85100200",
    name: "Restauração em Resina Composta (2 Faces)",
    category: "Dentística & Estética",
    defaultTargetType: "tooth",
    requiresSurfaces: true,
    defaultPriceParticular: 290,
    defaultPriceConvenio: 145,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia local e isolamento do campo operatório com matriz metálica/poliéster e cunha interproximal. Remoção de tecido cariado, condicionamento ácido, sistema adesivo e reconstrução anatômica em resina composta (2 faces). Checagem do ponto de contato, ajuste oclusal e polimento.",
  },
  {
    id: "proc-restauracao-resina-3f",
    code: "85100218",
    name: "Restauração em Resina Composta (3+ Faces / Complexa)",
    category: "Dentística & Estética",
    defaultTargetType: "tooth",
    requiresSurfaces: true,
    defaultPriceParticular: 360,
    defaultPriceConvenio: 180,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia local, isolamento do campo operatório e estabilização com matriz e cunha. Remoção de lesão extensa, proteção do complexo dentino-pulpar, condicionamento ácido, adesivagem e reconstrução em resina composta multi-incremento (3+ faces). Ajuste oclusal e polimento final.",
  },
  {
    id: "proc-faceta-resina",
    code: "85100137",
    name: "Faceta Direta em Resina Composta",
    category: "Dentística & Estética",
    defaultTargetType: "tooth",
    requiresSurfaces: true,
    defaultPriceParticular: 650,
    defaultPriceConvenio: 450,
    defaultStatus: "planned",
    evolutionTemplate:
      "Seleção de cor em luz natural, isolamento relativo/modificado, preparo minimamente invasivo do esmalte, condicionamento ácido total, sistema adesivo e estratificação estética com resina composta de esmalte e dentina. Texturização superficial, acabamento e polimento com discos e pastas diamantadas.",
  },
  {
    id: "proc-clareamento-combinado",
    code: "85100064",
    name: "Clareamento Dental Combinado (Consultório + Caseiro)",
    category: "Dentística & Estética",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 1100,
    defaultPriceConvenio: 850,
    defaultStatus: "planned",
    evolutionTemplate:
      "Registro de cor inicial na escala Vita, profilaxia prévia, proteção gengival com barreira fotopolimerizável e aplicação de gel clareador em consultório (peróxido de hidrogênio 35%). Entrega de moldeiras personalizadas e seringas para protocolo caseiro assistido + dessensibilizante.",
  },
  {
    id: "proc-clareamento-consultorio",
    code: "85100072",
    name: "Clareamento Dental de Consultório (Sessão)",
    category: "Dentística & Estética",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 550,
    defaultPriceConvenio: 420,
    defaultStatus: "planned",
    evolutionTemplate:
      "Registro de cor prévio, profilaxia com pedra-pomes, instalação de afastador labial e barreira gengival fotopolimerizável. Aplicação de gel clareador em consultório com monitoramento de sensibilidade, dessensibilização pós-sessão e orientações de dieta.",
  },

  // 3. Endodontia
  {
    id: "proc-endo-unirradicular",
    code: "85200140",
    name: "Tratamento de Canal (Endo Unirradicular)",
    category: "Endodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 750,
    defaultPriceConvenio: 420,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia local, isolamento absoluto com grampo e lençol de borracha, abertura coronária, odontometria eletrônica/radiográfica, preparo químico-mecânico com irrigação de hipoclorito de sódio e EDTA, secagem com cones de papel e obturação termomecânica/cone único. Selamento coronário e Rx final.",
  },
  {
    id: "proc-endo-birradicular",
    code: "85200158",
    name: "Tratamento de Canal (Endo Birradicular)",
    category: "Endodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 920,
    defaultPriceConvenio: 520,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia local, isolamento absoluto, acesso coronário e localização dos 2 condutos. Odontometria (CRT), instrumentação mecanizada/manual sob irrigação abundante, medicação/obturação dos condutos com cimento endodôntico e guta-percha. Selamento provisório/definitivo e Rx controle.",
  },
  {
    id: "proc-endo-multirradicular",
    code: "85200166",
    name: "Tratamento de Canal (Endo Multirradicular)",
    category: "Endodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 1250,
    defaultPriceConvenio: 680,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia bloqueio/infiltrativa, isolamento absoluto, cirurgia de acesso e exploração dos condutos radiculares. Odontometria eletrônica + radiográfica, preparo químico-mecânico completo, ativação ultrassônica de irrigante e obturação tridimensional dos canais. Selamento coronário.",
  },
  {
    id: "proc-urgencia-endo",
    code: "85200085",
    name: "Urgência Endodôntica / Pulpectomia / Medicação Intracanal",
    category: "Endodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 280,
    defaultPriceConvenio: 160,
    defaultStatus: "completed",
    evolutionTemplate:
      "Anestesia local, isolamento absoluto, acesso coronário de urgência, esvaziamento pulpar/drenagem e irrigação com hipoclorito. Inserção de medicação intracanal (hidróxido de cálcio / tricresol) e selamento coronário duplo para controle da dor.",
  },

  // 4. Periodontia
  {
    id: "proc-raspagem-supra",
    code: "85300047",
    name: "Raspagem Supragengival e Polimento",
    category: "Periodontia",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 260,
    defaultPriceConvenio: 130,
    defaultStatus: "completed",
    evolutionTemplate:
      "Raspagem supragengival com ultrassom piezoelétrico e curetas periodontais para remoção de cálculo dentário e biofilme. Polimento coronário com pasta profilática, irrigação com clorexidina 0,12% e orientação de higiene interproximal.",
  },
  {
    id: "proc-raspagem-sub",
    code: "85300039",
    name: "Raspagem Subgengival e Alisamento Radicular",
    category: "Periodontia",
    defaultTargetType: "sextant",
    requiresSurfaces: false,
    defaultPriceParticular: 320,
    defaultPriceConvenio: 170,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia infiltrativa na região, sondagem periodontal de bolsas, raspagem subgengival e alisamento radicular com curetas Gracey específicas por sextante. Irrigação subgengival com solução antisséptica e controle pós-operatório.",
  },
  {
    id: "proc-gengivoplastia",
    code: "85300020",
    name: "Gengivoplastia / Aumento de Coroa Clínica Estética",
    category: "Periodontia",
    defaultTargetType: "arch_upper",
    requiresSurfaces: false,
    defaultPriceParticular: 850,
    defaultPriceConvenio: 480,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia infiltrativa, sondagem do sulco gengival e marcação dos pontos sangrantes conforme planejamento estético. Incisão em bisel interno/externo, remoção de colarinho gengival e regularização do contorno. Hemostasia e orientações pós-operatórias.",
  },

  // 5. Cirurgia & Exodontia
  {
    id: "proc-exodontia-simples",
    code: "82000875",
    name: "Exodontia Simples (Elemento Permanente)",
    category: "Cirurgia & Exodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 320,
    defaultPriceConvenio: 180,
    defaultStatus: "planned",
    evolutionTemplate:
      "Antissepsia intra e extraoral, anestesia bloqueio/infiltrativa, sindesmotomia, luxação com alavanca e exodontia com fórceps sem intercorrências. Curetagem alveolar, irrigação com soro fisiológico 0,9%, sutura simples e entrega de orientações pós-operatórias e prescrição.",
  },
  {
    id: "proc-exodontia-siso",
    code: "82001715",
    name: "Exodontia de Terceiro Molar (Siso / Incluso)",
    category: "Cirurgia & Exodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 680,
    defaultPriceConvenio: 380,
    defaultStatus: "planned",
    evolutionTemplate:
      "Antissepsia, anestesia regional, incisão e descolamento mucoperiosteal, osteotomia/odontosecção sob irrigação abundante com soro fisiológico estéril, remoção completa do elemento dentário e saco pericoronário. Limpeza da loja cirúrgica, sutura e prescrição pós-operatória.",
  },
  {
    id: "proc-exodontia-raiz",
    code: "82000859",
    name: "Exodontia de Raiz Residual",
    category: "Cirurgia & Exodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 340,
    defaultPriceConvenio: 190,
    defaultStatus: "planned",
    evolutionTemplate:
      "Anestesia local, sindesmotomia e acesso à raiz residual, luxação cuidadosa com microalavancas e remoção completa sem fratura apical. Inspeção e curetagem do alvéolo, irrigação com soro fisiológico, sutura e orientações pós-operatórias.",
  },
  {
    id: "proc-dente-ausente",
    code: "99000001",
    name: "Dente Ausente / Extraído (Registro de Odontograma)",
    category: "Cirurgia & Exodontia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 0,
    defaultPriceConvenio: 0,
    defaultStatus: "completed",
    evolutionTemplate:
      "Elemento dentário registrado como ausente/extraído no exame clínico inicial para mapeamento fiel do odontograma.",
  },

  // 6. Prótese & Reabilitação
  {
    id: "proc-coroa-total",
    code: "85400084",
    name: "Coroa Total (Porcelana / Zircônia / E-max)",
    category: "Prótese & Reabilitação",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 1800,
    defaultPriceConvenio: 1200,
    defaultStatus: "planned",
    evolutionTemplate:
      "Preparo protético para coroa total, afastamento gengival, moldagem de precisão / escaneamento intraoral, registro oclusal, seleção de cor (escala Vita) e instalação/cimentação de provisório ou coroa definitiva com ajuste oclusal.",
  },
  {
    id: "proc-coroa-provisoria",
    code: "85400076",
    name: "Coroa Provisória em Resina Acrílica / Bisacrílica",
    category: "Prótese & Reabilitação",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 250,
    defaultPriceConvenio: 150,
    defaultStatus: "planned",
    evolutionTemplate:
      "Confecção/reembasamento de coroa provisória adaptada ao término cervical, ajuste de pontos de contato e oclusão cêntrica/excursiva, acabamento, polimento e cimentação com cimento provisório sem eugenol.",
  },
  {
    id: "proc-protese-dentflex",
    code: "85400408",
    name: "Prótese Parcial Removível Flexível (Dentflex)",
    category: "Prótese & Reabilitação",
    defaultTargetType: "arch_upper",
    requiresSurfaces: false,
    defaultPriceParticular: 1350,
    defaultPriceConvenio: 980,
    defaultStatus: "planned",
    evolutionTemplate:
      "Moldagem anatômica/funcional, registro maxilomandibular e seleção de cor/formato dental. Prova em cera/instalação da prótese flexível com verificação de retenção, estabilidade e ajuste oclusal bilateral.",
  },
  {
    id: "proc-protese-ppr",
    code: "85400416",
    name: "Prótese Parcial Removível (PPR Estrutura Metálica)",
    category: "Prótese & Reabilitação",
    defaultTargetType: "arch_lower",
    requiresSurfaces: false,
    defaultPriceParticular: 1450,
    defaultPriceConvenio: 1050,
    defaultStatus: "planned",
    evolutionTemplate:
      "Preparo de planos-guia e nichos, moldagem de trabalho, prova da armação metálica em cromo-cobalto, montagem dos dentes e instalação final da PPR com orientações de higienização e adaptação.",
  },
  {
    id: "proc-protese-total",
    code: "85400459",
    name: "Prótese Total Removível (Superior ou Inferior)",
    category: "Prótese & Reabilitação",
    defaultTargetType: "arch_upper",
    requiresSurfaces: false,
    defaultPriceParticular: 1650,
    defaultPriceConvenio: 1150,
    defaultStatus: "planned",
    evolutionTemplate:
      "Moldagem anatômica e funcional com moldeira individual, planos de orientação e dimensão vertical de oclusão (DVO), prova estética/fonética dos dentes em cera e instalação com ajuste oclusal balanceado.",
  },
  {
    id: "proc-placa-miorrelaxante",
    code: "85400351",
    name: "Placa Miorrelaxante Oclusal (Bruxismo / ATM)",
    category: "Prótese & Reabilitação",
    defaultTargetType: "arch_upper",
    requiresSurfaces: false,
    defaultPriceParticular: 680,
    defaultPriceConvenio: 450,
    defaultStatus: "planned",
    evolutionTemplate:
      "Moldagem/escaneamento das arcadas e registro oclusal. Instalação de placa miorrelaxante rígida em acrílico termopolimerizável/impressa com ajuste de contatos bilaterais simultâneos e guias canina/anterior.",
  },

  // 7. Ortodontia & Alinhadores
  {
    id: "proc-aligner-setup",
    code: "86000010",
    name: "Esthetic Aligner — Planejamento Digital / Setup 3D",
    category: "Ortodontia & Alinhadores",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 950,
    defaultPriceConvenio: 750,
    defaultStatus: "planned",
    evolutionTemplate:
      "Escaneamento intraoral/moldagem de precisão, protocolo fotográfico ortodôntico e envio para planejamento digital 3D (Setup Esthetic Aligner) com simulação de movimentação e definição de attachments.",
  },
  {
    id: "proc-aligner-manutencao",
    code: "86000028",
    name: "Esthetic Aligner — Entrega / Manutenção de Alinhadores",
    category: "Ortodontia & Alinhadores",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 350,
    defaultPriceConvenio: 250,
    defaultStatus: "completed",
    evolutionTemplate:
      "Conferência de adaptação do alinhador atual, colagem de attachments/realização de IPR conforme planejamento digital, entrega das próximas placas alinhadoras e orientação de uso diário (22h/dia).",
  },
  {
    id: "proc-manutencao-orto",
    code: "86000354",
    name: "Manutenção Ortodôntica Mensal",
    category: "Ortodontia & Alinhadores",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 220,
    defaultPriceConvenio: 140,
    defaultStatus: "completed",
    evolutionTemplate:
      "Avaliação de higiene e integridade de bráquetes/tubos, troca de arcos ortodônticos superior/inferior, ativação mecânica, troca de ligaduras elásticas e orientação de elásticos intermaxilares.",
  },

  // 8. Harmonização Orofacial (HOF)
  {
    id: "proc-hof-toxina",
    code: "87000010",
    name: "HOF — Toxina Botulínica (Terço Superior / Bruxismo)",
    category: "Harmonização Orofacial (HOF)",
    defaultTargetType: "face",
    requiresSurfaces: false,
    defaultPriceParticular: 1400,
    defaultPriceConvenio: 1200,
    defaultStatus: "planned",
    evolutionTemplate:
      "Registro fotográfico padronizado (repouso e mímica), assepsia da pele, marcação anatômica dos pontos motores e aplicação de toxina botulínica (registrar marca, lote, validade, diluição e unidades por ponto). Orientações pós-procedimento e agendamento de retorno em 15 dias.",
  },
  {
    id: "proc-hof-fios-pdo",
    code: "87000028",
    name: "HOF — Fios de Sustentação / Bioestimulação (PDO)",
    category: "Harmonização Orofacial (HOF)",
    defaultTargetType: "face",
    requiresSurfaces: false,
    defaultPriceParticular: 1800,
    defaultPriceConvenio: 1500,
    defaultStatus: "planned",
    evolutionTemplate:
      "Assepsia rigorosa, marcação dos vetores de sustentação/malha dérmica, botões anestésicos locais e inserção subcutânea de fios de polidioxanona (PDO) conforme plano facial (registrar tipo, quantidade, lote e validade). Orientações pós-procedimento entregues.",
  },
  {
    id: "proc-hof-preenchimento",
    code: "87000036",
    name: "HOF — Preenchimento com Ácido Hialurônico (1 mL)",
    category: "Harmonização Orofacial (HOF)",
    defaultTargetType: "face",
    requiresSurfaces: false,
    defaultPriceParticular: 1500,
    defaultPriceConvenio: 1300,
    defaultStatus: "planned",
    evolutionTemplate:
      "Antissepsia facial, anestesia tópica/infiltrativa, preenchimento com ácido hialurônico por microcânula/agulha com aspiração prévia (registrar região, volume, marca, lote e validade). Modelagem suave e orientações pós-procedimento.",
  },

  // 9. Odontopediatria
  {
    id: "proc-pediatria-prevencao",
    code: "83000020",
    name: "Odontopediatria — Condicionamento + Profilaxia + Flúor",
    category: "Odontopediatria",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 220,
    defaultPriceConvenio: 120,
    defaultStatus: "completed",
    evolutionTemplate:
      "Manejo comportamental lúdico (técnica dizer-mostrar-fazer), evidenciação de placa, profilaxia infantil, aplicação tópica de flúor e orientação de escovação e dieta não cariogênica ao responsável.",
  },
  {
    id: "proc-selante-preventivo",
    code: "84000204",
    name: "Selante Dental Preventivo (Resinoso / Ionômero)",
    category: "Odontopediatria",
    defaultTargetType: "tooth",
    requiresSurfaces: true,
    defaultPriceParticular: 150,
    defaultPriceConvenio: 85,
    defaultStatus: "planned",
    evolutionTemplate:
      "Profilaxia da superfície oclusal com pedra-pomes, isolamento relativo, condicionamento ácido/pré-tratamento da superfície, aplicação de selante em fóssulas e fissuras, fotopolimerização e conferência oclusal.",
  },
  {
    id: "proc-exodontia-deciduo",
    code: "82000832",
    name: "Exodontia de Dente Decíduo (Infantil)",
    category: "Odontopediatria",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 190,
    defaultPriceConvenio: 100,
    defaultStatus: "planned",
    evolutionTemplate:
      "Condicionamento infantil, anestesia tópica seguida de infiltrativa local, remoção atraumática do dente decíduo, compressão com gaze estéril até hemostasia completa e orientações pós-operatórias aos pais.",
  },

  // 10. Radiologia & Laserterapia
  {
    id: "proc-laserterapia-sessao",
    code: "85500012",
    name: "Laserterapia Terapêutica (Sessão)",
    category: "Radiologia & Laserterapia",
    defaultTargetType: "mouth",
    requiresSurfaces: false,
    defaultPriceParticular: 180,
    defaultPriceConvenio: 100,
    defaultStatus: "completed",
    evolutionTemplate:
      "Uso de óculos de proteção clínica, assepsia local e aplicação de laser terapêutico de baixa potência (comprimento de onda vermelho/infravermelho, energia e pontos aplicados conforme protocolo de analgesia/reparação tecidual).",
  },
  {
    id: "proc-rx-periapical",
    code: "81000421",
    name: "Radiografia Periapical / Interproximal",
    category: "Radiologia & Laserterapia",
    defaultTargetType: "tooth",
    requiresSurfaces: false,
    defaultPriceParticular: 60,
    defaultPriceConvenio: 35,
    defaultStatus: "completed",
    evolutionTemplate:
      "Proteção radiológica com avental plumbífero e protetor de tireoide. Tomada radiográfica periapical/interproximal com posicionador e registro dos achados radiográficos no prontuário.",
  },
];

function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadProcedureCatalog(): ClinicalProcedureCatalogItem[] {
  const storage = getStorage();
  if (!storage) return DEFAULT_PROCEDURE_CATALOG;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROCEDURE_CATALOG;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_PROCEDURE_CATALOG;
    }
    return parsed as ClinicalProcedureCatalogItem[];
  } catch {
    return DEFAULT_PROCEDURE_CATALOG;
  }
}

export function saveProcedureCatalog(items: ClinicalProcedureCatalogItem[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota or storage errors in restricted contexts
  }
}

export function upsertCatalogProcedure(
  item: Omit<ClinicalProcedureCatalogItem, "id"> & { id?: string },
): ClinicalProcedureCatalogItem[] {
  const current = loadProcedureCatalog();
  const id = item.id?.trim() || `proc-custom-${Date.now()}`;
  const normalizedItem: ClinicalProcedureCatalogItem = {
    ...item,
    id,
    code: item.code.trim() || "CLIN-00",
    name: item.name.trim(),
    defaultPriceParticular: Math.max(0, Number(item.defaultPriceParticular) || 0),
    defaultPriceConvenio: Math.max(0, Number(item.defaultPriceConvenio) || 0),
    evolutionTemplate: item.evolutionTemplate.trim(),
    isCustom: item.isCustom ?? !DEFAULT_PROCEDURE_CATALOG.some((d) => d.id === id),
  };

  const exists = current.some((p) => p.id === id);
  const updated = exists
    ? current.map((p) => (p.id === id ? normalizedItem : p))
    : [normalizedItem, ...current];

  saveProcedureCatalog(updated);
  return updated;
}

export function deleteCatalogProcedure(id: string): ClinicalProcedureCatalogItem[] {
  const current = loadProcedureCatalog();
  const updated = current.filter((p) => p.id !== id);
  saveProcedureCatalog(updated);
  return updated;
}

export function resetProcedureCatalogToDefaults(): ClinicalProcedureCatalogItem[] {
  saveProcedureCatalog(DEFAULT_PROCEDURE_CATALOG);
  return DEFAULT_PROCEDURE_CATALOG;
}

export function filterProcedures(
  catalog: ClinicalProcedureCatalogItem[],
  filters: { query?: string; category?: string },
): ClinicalProcedureCatalogItem[] {
  const q = stripAccents((filters.query || "").trim());
  const cat = (filters.category || "").trim();

  return catalog.filter((proc) => {
    if (cat && cat !== "Todas" && proc.category !== cat) {
      return false;
    }
    if (!q) return true;
    const haystack = stripAccents(`${proc.name} ${proc.code} ${proc.category}`);
    return haystack.includes(q);
  });
}

export function getSuggestedProcedurePrice(
  proc: ClinicalProcedureCatalogItem,
  insurance?: string | null,
): number {
  const ins = (insurance || "").trim().toUpperCase();
  if (!ins || ins === "PARTICULAR") {
    return Number(proc.defaultPriceParticular) || 0;
  }
  return Number(proc.defaultPriceConvenio) || 0;
}

export function isToothNumber(num: number): boolean {
  return (num >= 11 && num <= 48) || (num >= 51 && num <= 85);
}

export function formatProcedureTarget(toothNumber: number, surfaces?: string[] | null): string {
  const region = REGION_OPTIONS.find((r) => r.code === toothNumber);
  if (region) {
    return region.label;
  }
  const cleanSurfaces = (surfaces || []).filter(Boolean);
  if (cleanSurfaces.length > 0) {
    return `Dente ${toothNumber} (${cleanSurfaces.join(", ")})`;
  }
  return `Dente ${toothNumber}`;
}

export function targetTypeToDefaultToothNumber(
  targetType: ProcedureTargetType,
  fallbackTooth?: number | null,
): number {
  switch (targetType) {
    case "mouth":
      return 0;
    case "arch_upper":
      return 1;
    case "arch_lower":
      return 2;
    case "face":
      return 3;
    case "sextant":
      return 4;
    case "tooth":
    default:
      return fallbackTooth && isToothNumber(fallbackTooth) ? fallbackTooth : 11;
  }
}

export function parseMoneyInput(val: string | number | null | undefined): number {
  if (typeof val === "number") {
    return isNaN(val) ? 0 : Math.max(0, val);
  }
  if (!val) return 0;
  const cleaned = String(val).replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!cleaned) return 0;

  // Se houver vírgula e ponto (ex: "1.250,00"), ponto é separador de milhar
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }
  if (cleaned.includes(",")) {
    const parsed = parseFloat(cleaned.replace(",", "."));
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

export function formatBRLValue(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildProcedureEvolutionText(params: {
  procedureName: string;
  catalogItem?: ClinicalProcedureCatalogItem | null;
  toothNumber: number;
  surfaces?: string[];
  materialOrShade?: string;
  anesthetic?: string;
  notes?: string;
  cost?: number | null;
}): string {
  const target = formatProcedureTarget(params.toothNumber, params.surfaces);
  const lines: string[] = [
    `Procedimento executado: ${params.procedureName}`,
    `Dente / Região: ${target}`,
  ];

  if (params.anesthetic?.trim()) {
    lines.push(`Anestésico / Técnica: ${params.anesthetic.trim()}`);
  }
  if (params.materialOrShade?.trim()) {
    lines.push(`Material / Cor / Lote: ${params.materialOrShade.trim()}`);
  }
  if (params.catalogItem?.evolutionTemplate?.trim()) {
    lines.push(`Descrição Clínica: ${params.catalogItem.evolutionTemplate.trim()}`);
  }
  if (params.notes?.trim()) {
    lines.push(`Observações da Sessão: ${params.notes.trim()}`);
  }
  if (params.cost !== null && params.cost !== undefined && Number(params.cost) > 0) {
    lines.push(`Valor de Referência: R$ ${formatBRLValue(Number(params.cost))}`);
  }

  return lines.join("\n");
}

export function calculateTreatmentPlanTotals(
  items: Array<{ cost?: number | null; status?: string }>,
  discountAmount: number = 0,
): {
  subtotal: number;
  discount: number;
  total: number;
  totalCount: number;
  plannedCount: number;
  inProgressCount: number;
  completedCount: number;
  plannedValue: number;
  completedValue: number;
  completionPercent: number;
} {
  let subtotal = 0;
  let plannedCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let plannedValue = 0;
  let completedValue = 0;

  for (const item of items) {
    const cost = Math.max(0, Number(item.cost) || 0);
    subtotal += cost;
    if (item.status === "completed") {
      completedCount++;
      completedValue += cost;
    } else if (item.status === "in_progress") {
      inProgressCount++;
      plannedValue += cost;
    } else {
      plannedCount++;
      plannedValue += cost;
    }
  }

  const discount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0));
  const total = Math.max(0, subtotal - discount);
  const totalCount = items.length;
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    subtotal,
    discount,
    total,
    totalCount,
    plannedCount,
    inProgressCount,
    completedCount,
    plannedValue,
    completedValue,
    completionPercent,
  };
}

export function formatBudgetRecordContent(params: {
  title?: string;
  items: TreatmentPlanItemInput[];
  discount?: number;
  paymentForm: string;
  status: string;
  insuranceTable?: string;
  notes?: string;
}): string {
  const totals = calculateTreatmentPlanTotals(params.items, params.discount || 0);
  const statusDisplay =
    params.status === "Aprovado"
      ? "Aprovado pelo Paciente"
      : params.status === "Executado"
        ? "Executado"
        : "Em Aberto";

  // IMPORTANTE: O primeiro valor "R$ ..." deve ser sempre o Valor Total do orçamento
  // para que parseOrcamentoInfo (src/lib/crc.ts) extraia o total corretamente.
  const lines: string[] = [
    `Valor Total: R$ ${formatBRLValue(totals.total)}`,
    `Status: ${statusDisplay}`,
    `Forma de Pagamento: ${params.paymentForm}`,
  ];

  if (params.insuranceTable?.trim()) {
    lines.push(`Tabela / Convênio: ${params.insuranceTable.trim()}`);
  }
  if (totals.discount > 0) {
    lines.push(
      `Subtotal: R$ ${formatBRLValue(totals.subtotal)} · Desconto: R$ ${formatBRLValue(totals.discount)}`,
    );
  }

  lines.push("");
  lines.push(`Procedimentos Planejados (${params.items.length}):`);

  params.items.forEach((item, index) => {
    const target = formatProcedureTarget(item.toothNumber, item.surfaces);
    const codePrefix = item.procedureCode ? `[${item.procedureCode}] ` : "";
    const noteSuffix = item.notes?.trim() ? ` (${item.notes.trim()})` : "";
    lines.push(
      `${index + 1}. ${codePrefix}${item.procedureName} — ${target} — R$ ${formatBRLValue(item.cost)}${noteSuffix}`,
    );
  });

  if (params.notes?.trim()) {
    lines.push("");
    lines.push(`Observações do Planejamento: ${params.notes.trim()}`);
  }

  return lines.join("\n");
}
